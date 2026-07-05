from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.session import get_db
from app.models import (
    BlogPost,
    Course,
    CourseCategory,
    CourseChapter,
    CourseStatus,
    Enrollment,
    Institution,
    LessonItemType,
    ProgressRecord,
    Submission,
    Teacher,
    User,
    UserRole,
)
from app.schemas import (
    BlogPostOut,
    CourseCardOut,
    CourseCategoryOut,
    CourseDetailOut,
    InstitutionOut,
    StudentLeaderboardEntry,
    StudentLeaderboardOut,
    TeacherOut,
)

router = APIRouter()


def _aware_now() -> datetime:
    return datetime.now(timezone.utc)


def _speed_bonus(started_at: datetime | None, completed_at: datetime | None, max_bonus: int) -> int:
    if not started_at or not completed_at:
        return 0
    elapsed_days = max((completed_at - started_at).total_seconds() / 86400, 0)
    return max(0, round(max_bonus - elapsed_days * 3))


def _progress_points(record: ProgressRecord) -> int:
    item_type = record.lesson_item.item_type if record.lesson_item else None
    base_by_type = {
        LessonItemType.video: 18,
        LessonItemType.handout: 14,
        LessonItemType.exercise: 24,
        LessonItemType.quiz: 40,
    }
    base = base_by_type.get(item_type, 12)
    score_bonus = round(record.score or 0)
    speed_bonus = _speed_bonus(record.enrollment.started_at, record.completed_at, 24)
    return max(0, base + score_bonus + speed_bonus)


def _build_leaderboard_entry(
    *,
    rank: int,
    user: User,
    total_points: int,
    weekly_points: int,
    enrollments: list[Enrollment],
) -> StudentLeaderboardEntry:
    active_courses = len([enrollment for enrollment in enrollments if enrollment.status != "completed"])
    completed_courses = len([enrollment for enrollment in enrollments if enrollment.status == "completed"])
    average_progress = (
        round(sum(enrollment.progress_percent or 0 for enrollment in enrollments) / len(enrollments), 1)
        if enrollments
        else 0
    )
    return StudentLeaderboardEntry(
        rank=rank,
        student_id=user.id,
        student_name=user.full_name,
        avatar_url=user.avatar_url,
        total_points=total_points,
        weekly_points=weekly_points,
        completed_courses=completed_courses,
        active_courses=active_courses,
        average_progress=average_progress,
    )


@router.get("/institutions", response_model=list[InstitutionOut])
def list_institutions(db: Session = Depends(get_db)) -> list[Institution]:
    return list(db.scalars(select(Institution).order_by(Institution.name)))


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    rows = db.scalars(select(Course).where(Course.status == CourseStatus.published)).all()
    return {
        "categories": sorted({course.category for course in rows}),
        "levels": sorted({course.level for course in rows}),
        "institutions": sorted({course.institution.name for course in rows}),
    }


@router.get("/course-categories", response_model=list[CourseCategoryOut])
def list_course_categories(db: Session = Depends(get_db)) -> list[CourseCategory]:
    return list(
        db.scalars(
            select(CourseCategory)
            .where(CourseCategory.is_active.is_(True))
            .order_by(CourseCategory.parent_id.nullsfirst(), CourseCategory.position, CourseCategory.name)
        )
    )


@router.get("/courses", response_model=list[CourseCardOut])
def list_courses(
    category: str | None = Query(default=None),
    institution: str | None = Query(default=None),
    level: str | None = Query(default=None),
    hot: bool | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Course]:
    stmt = (
        select(Course)
        .where(Course.status == CourseStatus.published)
        .options(joinedload(Course.institution))
        .options(joinedload(Course.institution), joinedload(Course.teacher))
        .order_by(Course.is_hot.desc(), Course.students_count.desc())
    )
    if category:
        stmt = stmt.where(Course.category == category)
    if level:
        stmt = stmt.where(Course.level == level)
    if hot is not None:
        stmt = stmt.where(Course.is_hot == hot)
    if institution:
        stmt = stmt.join(Course.institution).where(Institution.slug == institution)
    return list(db.scalars(stmt))


@router.get("/courses/{slug}", response_model=CourseDetailOut)
def get_course(slug: str, db: Session = Depends(get_db)) -> Course:
    course = db.scalar(
        select(Course)
        .where(Course.slug == slug, Course.status == CourseStatus.published)
        .options(
            joinedload(Course.institution),
            joinedload(Course.teacher).joinedload(Teacher.institution),
            selectinload(Course.chapters).selectinload(CourseChapter.items),
        )
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.get("/teachers", response_model=list[TeacherOut])
def list_teachers(db: Session = Depends(get_db)) -> list[Teacher]:
    return list(
        db.scalars(
            select(Teacher).options(joinedload(Teacher.institution)).order_by(Teacher.name)
        )
    )


@router.get("/teachers/{slug}", response_model=TeacherOut)
def get_teacher(slug: str, db: Session = Depends(get_db)) -> Teacher:
    teacher = db.scalar(
        select(Teacher).where(Teacher.slug == slug).options(joinedload(Teacher.institution))
    )
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return teacher



@router.get("/leaderboard", response_model=StudentLeaderboardOut)
def get_student_leaderboard(db: Session = Depends(get_db)) -> StudentLeaderboardOut:
    week_start = _aware_now() - timedelta(days=7)
    students = list(
        db.scalars(
            select(User)
            .where(User.role == UserRole.student, User.is_active.is_(True))
            .options(
                selectinload(User.enrollments)
                .joinedload(Enrollment.course)
                .selectinload(Course.chapters)
                .selectinload(CourseChapter.items),
                selectinload(User.enrollments)
                .selectinload(Enrollment.progress_records)
                .joinedload(ProgressRecord.lesson_item),
                selectinload(User.submissions).joinedload(Submission.question),
            )
            .order_by(User.full_name)
        )
    )
    entries: list[StudentLeaderboardEntry] = []
    for student in students:
        total_points = 0
        weekly_points = 0
        for enrollment in student.enrollments:
            total_points += round((enrollment.progress_percent or 0) * 0.8)
            if enrollment.status == "completed":
                total_points += 160
            for record in enrollment.progress_records:
                if not record.completed_at:
                    continue
                points = _progress_points(record)
                total_points += points
                if record.completed_at >= week_start:
                    weekly_points += points
        for submission in student.submissions:
            if submission.score is None:
                continue
            points = round(max(submission.score, 0) * 2)
            total_points += points
            if submission.created_at and submission.created_at >= week_start:
                weekly_points += points
        if total_points > 0 or student.enrollments:
            entries.append(
                _build_leaderboard_entry(
                    rank=0,
                    user=student,
                    total_points=total_points,
                    weekly_points=weekly_points,
                    enrollments=student.enrollments,
                )
            )

    total_points = sorted(entries, key=lambda entry: (-entry.total_points, entry.student_name))[:8]
    rising = sorted(entries, key=lambda entry: (-entry.weekly_points, -entry.total_points, entry.student_name))[:8]
    return StudentLeaderboardOut(
        total_points=[
            entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(total_points)
        ],
        rising=[entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(rising)],
    )

@router.get("/blog", response_model=list[BlogPostOut])
def list_blog_posts(db: Session = Depends(get_db)) -> list[BlogPost]:
    return list(
        db.scalars(
            select(BlogPost)
            .where(BlogPost.is_published.is_(True))
            .order_by(BlogPost.created_at.desc())
        )
    )


@router.get("/blog/{slug}", response_model=BlogPostOut)
def get_blog_post(slug: str, db: Session = Depends(get_db)) -> BlogPost:
    post = db.scalar(select(BlogPost).where(BlogPost.slug == slug, BlogPost.is_published.is_(True)))
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return post


