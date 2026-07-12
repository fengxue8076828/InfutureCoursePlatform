from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.session import get_db
from app.models import BlogPost, Course, CourseCategory, CourseChapter, CourseStatus, Institution, Teacher, User, UserRole, Enrollment, ProgressRecord, Submission
from app.schemas import BlogPostOut, CourseCardOut, CourseCategoryOut, CourseDetailOut, InstitutionOut, StudentLeaderboardDetailOut, StudentLeaderboardOut, TeacherOut
from app.services.points import aware_now, build_leaderboard_entry, calculate_student_point_detail, leaderboard_rows

router = APIRouter()


@router.get("/institutions", response_model=list[InstitutionOut])
def list_institutions(db: Session = Depends(get_db)) -> list[Institution]:
    return list(db.scalars(select(Institution).order_by(Institution.name)))


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    rows = db.scalars(
        select(Course)
        .where(Course.status == CourseStatus.published)
        .options(joinedload(Course.institution))
    ).all()
    return {
        "categories": sorted({course.category for course in rows if course.category}),
        "levels": sorted({course.level for course in rows if course.level}),
        "institutions": sorted({course.institution.name for course in rows if course.institution}),
    }


@router.get("/course-categories", response_model=list[CourseCategoryOut])
def list_course_categories(db: Session = Depends(get_db)) -> list[CourseCategory]:
    return list(
        db.scalars(
            select(CourseCategory)
            .where(CourseCategory.is_active.is_(True), CourseCategory.institution_id.is_not(None))
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
        .options(joinedload(Course.institution), joinedload(Course.teacher).joinedload(Teacher.institution))
        .order_by(Course.is_hot.desc(), Course.students_count.desc(), Course.updated_at.desc())
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
    return list(db.scalars(select(Teacher).options(joinedload(Teacher.institution)).order_by(Teacher.name)))


@router.get("/teachers/{slug}", response_model=TeacherOut)
def get_teacher(slug: str, db: Session = Depends(get_db)) -> Teacher:
    teacher = db.scalar(select(Teacher).where(Teacher.slug == slug).options(joinedload(Teacher.institution)))
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return teacher


@router.get("/leaderboard", response_model=StudentLeaderboardOut)
def get_student_leaderboard(db: Session = Depends(get_db)) -> StudentLeaderboardOut:
    rows = leaderboard_rows(db)
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
    rows = leaderboard_rows(db)
    total_sorted = sorted(rows, key=lambda row: (-row[2].total_points, row[2].student_name))
    rising_sorted = sorted(rows, key=lambda row: (-row[2].weekly_points, -row[2].total_points, row[2].student_name))
    total_rank_by_id = {entry.student_id: index + 1 for index, (_, _, entry) in enumerate(total_sorted)}
    rising_rank_by_id = {entry.student_id: index + 1 for index, (_, _, entry) in enumerate(rising_sorted)}

    target = next((row for row in rows if row[0].id == student_id), None)
    if target is None:
        student = db.scalar(
            select(User)
            .where(User.id == student_id, User.role == UserRole.student, User.is_active.is_(True))
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
        )
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        week_start = aware_now() - timedelta(days=7)
        detail = calculate_student_point_detail(db, student, week_start)
        entry = build_leaderboard_entry(rank=0, user=student, detail=detail, enrollments=list(student.enrollments))
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