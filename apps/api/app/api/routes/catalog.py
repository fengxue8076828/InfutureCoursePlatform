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
    StudentCoursePointBreakdown,
    StudentLeaderboardDetailOut,
    StudentLeaderboardEntry,
    StudentLeaderboardOut,
    StudentPointEvent,
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



def _load_students_with_point_data(db: Session) -> list[User]:
    return list(
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


def _submission_points(submission: Submission) -> int:
    if submission.score is None:
        return 0
    return round(max(submission.score, 0) * 2)


def _build_point_event(
    *,
    label: str,
    source: str,
    points: int,
    occurred_at: datetime | None = None,
    course_title: str | None = None,
    detail: str | None = None,
) -> StudentPointEvent:
    return StudentPointEvent(
        label=label,
        source=source,
        points=points,
        occurred_at=occurred_at,
        course_title=course_title,
        detail=detail,
    )


def _calculate_student_point_detail(student: User, week_start: datetime) -> dict:
    total_points = 0
    weekly_points = 0
    course_breakdown: list[StudentCoursePointBreakdown] = []
    recent_events: list[StudentPointEvent] = []
    submissions_by_enrollment: dict[int | None, list[Submission]] = {}
    for submission in student.submissions:
        submissions_by_enrollment.setdefault(submission.enrollment_id, []).append(submission)

    handled_submission_ids: set[int] = set()
    for enrollment in student.enrollments:
        course = enrollment.course
        progress_points = round((enrollment.progress_percent or 0) * 0.8)
        activity_points = 0
        assessment_points = 0
        completion_bonus = 160 if enrollment.status == "completed" else 0

        if progress_points:
            recent_events.append(
                _build_point_event(
                    label="??????",
                    source="progress",
                    points=progress_points,
                    occurred_at=enrollment.updated_at,
                    course_title=course.title if course else None,
                    detail=f"???? {round(enrollment.progress_percent or 0, 1)}%",
                )
            )

        if completion_bonus:
            recent_events.append(
                _build_point_event(
                    label="??????",
                    source="completion",
                    points=completion_bonus,
                    occurred_at=enrollment.updated_at,
                    course_title=course.title if course else None,
                    detail="???????",
                )
            )

        for record in enrollment.progress_records:
            if not record.completed_at:
                continue
            points = _progress_points(record)
            activity_points += points
            if record.completed_at >= week_start:
                weekly_points += points
            item = record.lesson_item
            item_title = item.title if item else "????"
            recent_events.append(
                _build_point_event(
                    label=f"??{item_title}",
                    source=item.item_type.value if item else "lesson",
                    points=points,
                    occurred_at=record.completed_at,
                    course_title=course.title if course else None,
                    detail=f"?????? {round(record.score or 0, 1)}" if record.score is not None else None,
                )
            )

        for submission in submissions_by_enrollment.get(enrollment.id, []):
            handled_submission_ids.add(submission.id)
            points = _submission_points(submission)
            if not points:
                continue
            assessment_points += points
            if submission.created_at and submission.created_at >= week_start:
                weekly_points += points
            question_title = submission.question.prompt if submission.question else "????"
            recent_events.append(
                _build_point_event(
                    label="??????",
                    source="assessment",
                    points=points,
                    occurred_at=submission.created_at,
                    course_title=course.title if course else None,
                    detail=question_title[:80],
                )
            )

        course_total = progress_points + activity_points + assessment_points + completion_bonus
        total_points += course_total
        if course:
            course_breakdown.append(
                StudentCoursePointBreakdown(
                    course_id=course.id,
                    course_slug=course.slug,
                    course_title=course.title,
                    status=enrollment.status,
                    progress_percent=round(enrollment.progress_percent or 0, 1),
                    progress_points=progress_points,
                    activity_points=activity_points,
                    assessment_points=assessment_points,
                    completion_bonus=completion_bonus,
                    total_points=course_total,
                )
            )

    for submission in student.submissions:
        if submission.id in handled_submission_ids:
            continue
        points = _submission_points(submission)
        if not points:
            continue
        total_points += points
        if submission.created_at and submission.created_at >= week_start:
            weekly_points += points
        question_title = submission.question.prompt if submission.question else "????"
        recent_events.append(
            _build_point_event(
                label="??????",
                source="assessment",
                points=points,
                occurred_at=submission.created_at,
                detail=question_title[:80],
            )
        )

    recent_events.sort(key=lambda event: event.occurred_at.timestamp() if event.occurred_at else 0, reverse=True)
    course_breakdown.sort(key=lambda item: item.total_points, reverse=True)
    return {
        "total_points": total_points,
        "weekly_points": weekly_points,
        "course_breakdown": course_breakdown,
        "recent_events": recent_events[:16],
    }


def _leaderboard_rows(db: Session) -> list[tuple[User, dict, StudentLeaderboardEntry]]:
    week_start = _aware_now() - timedelta(days=7)
    rows: list[tuple[User, dict, StudentLeaderboardEntry]] = []
    for student in _load_students_with_point_data(db):
        detail = _calculate_student_point_detail(student, week_start)
        if detail["total_points"] > 0 or student.enrollments:
            rows.append(
                (
                    student,
                    detail,
                    _build_leaderboard_entry(
                        rank=0,
                        user=student,
                        total_points=detail["total_points"],
                        weekly_points=detail["weekly_points"],
                        enrollments=list(student.enrollments),
                    ),
                )
            )
    return rows


@router.get("/leaderboard", response_model=StudentLeaderboardOut)
def get_student_leaderboard(db: Session = Depends(get_db)) -> StudentLeaderboardOut:
    rows = _leaderboard_rows(db)
    total_points = sorted((entry for _, _, entry in rows), key=lambda entry: (-entry.total_points, entry.student_name))[:8]
    rising = sorted(
        (entry for _, _, entry in rows),
        key=lambda entry: (-entry.weekly_points, -entry.total_points, entry.student_name),
    )[:8]
    return StudentLeaderboardOut(
        total_points=[entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(total_points)],
        rising=[entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(rising)],
    )


@router.get("/leaderboard/{student_id}", response_model=StudentLeaderboardDetailOut)
def get_student_leaderboard_detail(student_id: int, db: Session = Depends(get_db)) -> StudentLeaderboardDetailOut:
    rows = _leaderboard_rows(db)
    total_sorted = sorted(rows, key=lambda row: (-row[2].total_points, row[2].student_name))
    rising_sorted = sorted(rows, key=lambda row: (-row[2].weekly_points, -row[2].total_points, row[2].student_name))
    total_rank_by_id = {entry.student_id: index + 1 for index, (_, _, entry) in enumerate(total_sorted)}
    rising_rank_by_id = {entry.student_id: index + 1 for index, (_, _, entry) in enumerate(rising_sorted)}

    target = next((row for row in rows if row[0].id == student_id), None)
    if target is None:
        student = db.scalar(select(User).where(User.id == student_id, User.role == UserRole.student, User.is_active.is_(True)))
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        week_start = _aware_now() - timedelta(days=7)
        detail = _calculate_student_point_detail(student, week_start)
        entry = _build_leaderboard_entry(
            rank=0,
            user=student,
            total_points=detail["total_points"],
            weekly_points=detail["weekly_points"],
            enrollments=list(student.enrollments),
        )
    else:
        student, detail, entry = target

    total_rank = total_rank_by_id.get(student_id)
    rising_rank = rising_rank_by_id.get(student_id)
    return StudentLeaderboardDetailOut(
        student=entry.model_copy(update={"rank": total_rank or 0}),
        total_rank=total_rank,
        rising_rank=rising_rank,
        course_breakdown=detail["course_breakdown"],
        recent_events=detail["recent_events"],
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


