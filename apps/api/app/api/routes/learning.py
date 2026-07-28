from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse
import zipfile
import xml.etree.ElementTree as ET

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user, get_optional_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    ChapterNote,
    CommunityAnswer,
    CommunityMessage,
    CommunityNoteShare,
    CommunityQuestion,
    CommunityReaction,
    Course,
    CourseChapter,
    CourseReview,
    CourseStatus,
    Enrollment,
    LessonItemType,
    LessonItem,
    ProgressRecord,
    Question,
    QuestionStatus,
    QuestionType,
    Submission,
    Subscription,
    StudentFollow,
    StudentPost,
    StudentPostComment,
    User,
    UserRole,
)
from app.models import SubmissionStatus
from app.schemas import (
    AuthOut,
    ChapterNoteIn,
    ChapterNoteOut,
    CodeRunIn,
    CodeRunOut,
    CommunityAnswerCreate,
    CommunityAnswerOut,
    CommunityHomeOut,
    CommunityMessageCreate,
    CommunityMessageOut,
    CommunityNoteShareCreate,
    CommunityNoteShareOut,
    CommunityQuestionCreate,
    CommunityQuestionOut,
    CommunityReferenceChapterOut,
    CommunityReferenceCourseOut,
    CommunityReferenceQuestionOut,
    CompleteItemIn,
    CourseCardOut,
    CourseDetailOut,
    CourseReviewIn,
    CourseReviewOut,
    DashboardOut,
    EnrollmentOut,
    LessonItemSubmissionStateOut,
    QuizSubmissionIn,
    QuizSubmissionOut,
    SubscribeCourseIn,
    SubscribeCourseOut,
    SubmissionIn,
    SubmissionOut,
    StudentLearningNoteOut,
    StudentPostCommentCreate,
    StudentPostCommentOut,
    StudentPostCreate,
    StudentPostOut,
    StudentProfileSummaryOut,
    StudentPublicProfileOut,
    StudentQuestionOut,
    StudentSocialHomeOut,
)
from app.services.code_runner import code_tests_for_question, run_python_code
from app.services.points import calculate_student_point_detail, load_student_with_point_data

router = APIRouter()


def stripe_value(obj: object, key: str, default: object = None) -> object:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def normalize_xml_text(value: str) -> str:
    return " ".join(value.split())


def xml_text_from_file(archive: zipfile.ZipFile, member_name: str, text_tag: str) -> str:
    try:
        root = ET.fromstring(archive.read(member_name))
    except (KeyError, ET.ParseError):
        return ""
    lines: list[str] = []
    for paragraph in root.iter():
        if not paragraph.tag.endswith("}p"):
            continue
        parts: list[str] = []
        for node in paragraph.iter():
            if node.tag.endswith(text_tag) and node.text:
                parts.append(node.text)
            elif node.tag.endswith("}tab"):
                parts.append("\t")
            elif node.tag.endswith("}br"):
                parts.append("\n")
        line = normalize_xml_text("".join(parts))
        if line:
            lines.append(line)
    return "\n".join(lines)


def extract_docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        return xml_text_from_file(archive, "word/document.xml", "}t")


def extract_pptx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        slide_names = sorted(
            name
            for name in archive.namelist()
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        )
        slides: list[str] = []
        for index, slide_name in enumerate(slide_names, start=1):
            slide_text = xml_text_from_file(archive, slide_name, "}t")
            if slide_text:
                slides.append(f"Slide {index}\n{slide_text}")
        return "\n\n".join(slides)


def extract_xlsx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        try:
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_root.iter():
                if item.tag.endswith("}si"):
                    text = "".join(node.text or "" for node in item.iter() if node.tag.endswith("}t"))
                    shared_strings.append(text)
        except (KeyError, ET.ParseError):
            shared_strings = []

        sheet_names = sorted(
            name
            for name in archive.namelist()
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
        )
        sheets: list[str] = []
        for index, sheet_name in enumerate(sheet_names, start=1):
            try:
                root = ET.fromstring(archive.read(sheet_name))
            except ET.ParseError:
                continue
            rows: list[str] = []
            for row in root.iter():
                if not row.tag.endswith("}row"):
                    continue
                cells: list[str] = []
                for cell in row:
                    if not cell.tag.endswith("}c"):
                        continue
                    cell_type = cell.attrib.get("t")
                    value_node = next((node for node in cell if node.tag.endswith("}v")), None)
                    value = value_node.text if value_node is not None and value_node.text else ""
                    if cell_type == "s" and value.isdigit():
                        value = shared_strings[int(value)] if int(value) < len(shared_strings) else value
                    if value:
                        cells.append(value)
                if cells:
                    rows.append("\t".join(cells))
            if rows:
                sheets.append(f"Sheet {index}\n" + "\n".join(rows))
        return "\n\n".join(sheets)


def resolve_uploaded_handout_path(url: str) -> Path:
    parsed = urlparse(url)
    path = unquote(parsed.path if parsed.scheme else url)
    marker = "/uploads/"
    if marker not in path:
        raise HTTPException(status_code=422, detail="Only uploaded handouts can be previewed")
    relative = path.split(marker, 1)[1].lstrip("/")
    if not relative.startswith("handout/"):
        raise HTTPException(status_code=422, detail="Only handout files can be previewed")
    upload_root = Path(get_settings().upload_dir).resolve()
    target_path = (upload_root / relative).resolve()
    try:
        target_path.relative_to(upload_root)
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid handout path") from None
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="Handout file not found")
    return target_path


@router.get("/handouts/preview")
def preview_handout(
    url: str,
    current_user: User = Depends(get_current_user),
) -> dict[str, str | bool]:
    path = resolve_uploaded_handout_path(url)
    suffix = path.suffix.lower()
    if suffix != ".md":
        return {
            "supported": False,
            "kind": suffix.lstrip(".") or "file",
            "content": "",
            "message": "讲义只支持 Markdown .md 文件。",
        }
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {
            "supported": False,
            "kind": suffix.lstrip(".") or "file",
            "content": "",
            "message": "讲义内容解析失败。",
        }

    return {
        "supported": True,
        "kind": "markdown",
        "content": content.strip() or "当前讲义文件为空。",
        "message": "",
    }


@router.get("/me/dashboard", response_model=DashboardOut)
def dashboard(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DashboardOut:
    enrollments = list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.user_id == current_user.id)
            .options(
                joinedload(Enrollment.course).joinedload(Course.institution),
                joinedload(Enrollment.course).joinedload(Course.teacher),
                joinedload(Enrollment.course).selectinload(Course.chapters).selectinload(CourseChapter.items),
                selectinload(Enrollment.progress_records),
            )
            .order_by(Enrollment.updated_at.desc())
        )
    )
    active = [enrollment for enrollment in enrollments if enrollment.status == "active"]
    completed = [enrollment for enrollment in enrollments if enrollment.status == "completed"]
    next_item = db.scalar(select(LessonItem).order_by(LessonItem.id))
    return DashboardOut(
        user=current_user,
        active_courses=[EnrollmentOut.model_validate(item) for item in active],
        completed_courses=[EnrollmentOut.model_validate(item) for item in completed],
        weekly_minutes=135,
        next_lesson_title=next_item.title if next_item else "寮€濮嬬涓€鑺傝",
    )


@router.get("/me/courses", response_model=list[EnrollmentOut])
def my_courses(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Enrollment]:
    enrollments = list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.user_id == current_user.id)
            .options(
                joinedload(Enrollment.course).joinedload(Course.institution),
                joinedload(Enrollment.course).joinedload(Course.teacher),
                joinedload(Enrollment.course).selectinload(Course.chapters).selectinload(CourseChapter.items),
                selectinload(Enrollment.progress_records),
            )
            .order_by(Enrollment.updated_at.desc())
        )
    )
    for enrollment in enrollments:
        update_enrollment_progress(db, enrollment)
    db.commit()
    return enrollments


def enrollment_options():
    return (
        joinedload(Enrollment.course).joinedload(Course.institution),
        joinedload(Enrollment.course).joinedload(Course.teacher),
        joinedload(Enrollment.course).selectinload(Course.chapters).selectinload(CourseChapter.items),
        selectinload(Enrollment.progress_records),
    )


def user_profile_summary(user: User, include_email: bool = False, community_points: int = 0) -> StudentProfileSummaryOut:
    return StudentProfileSummaryOut(
        id=user.id,
        email=user.email if include_email else None,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        region=user.region,
        community_points=community_points,
    )


def add_student_timeline_post(db: Session, user_id: int, content: str, course_id: int | None = None) -> None:
    db.add(StudentPost(user_id=user_id, course_id=course_id, content=content.strip(), visibility="public"))


def student_post_comment_out(comment: StudentPostComment) -> StudentPostCommentOut:
    return StudentPostCommentOut(
        id=comment.id,
        post_id=comment.post_id,
        user_id=comment.user_id,
        student_name=comment.user.full_name if comment.user else "Student",
        avatar_url=comment.user.avatar_url if comment.user else None,
        body=comment.body,
        created_at=comment.created_at,
    )


def post_out(post: StudentPost, current_user_id: int = 0, db: Session | None = None) -> StudentPostOut:
    comments = list(post.comments or [])
    return StudentPostOut(
        id=post.id,
        user_id=post.user_id,
        student_name=post.user.full_name if post.user else "Student",
        avatar_url=post.user.avatar_url if post.user else None,
        content=post.content,
        image_urls=list(post.image_urls or []),
        course_id=post.course_id,
        course_title=post.course.title if post.course else None,
        likes_count=int(post.likes_count or 0),
        liked_by_me=has_reaction(db, current_user_id, "post", post.id) if db is not None and current_user_id else False,
        comments_count=len(comments),
        comments=[student_post_comment_out(comment) for comment in comments],
        created_at=post.created_at,
    )


def load_enrollments_for_user(db: Session, user_id: int) -> list[Enrollment]:
    return list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.user_id == user_id)
            .options(*enrollment_options())
            .order_by(Enrollment.updated_at.desc())
        )
    )


def student_following_users(db: Session, user_id: int, limit: int = 12) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .join(StudentFollow, StudentFollow.followee_id == User.id)
            .where(StudentFollow.follower_id == user_id, User.role == UserRole.student, User.is_active.is_(True))
            .order_by(StudentFollow.created_at.desc())
            .limit(limit)
        )
    )


def student_follower_users(db: Session, user_id: int, limit: int = 12) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .join(StudentFollow, StudentFollow.follower_id == User.id)
            .where(StudentFollow.followee_id == user_id, User.role == UserRole.student, User.is_active.is_(True))
            .order_by(StudentFollow.created_at.desc())
            .limit(limit)
        )
    )


def student_follow_counts(db: Session, user_id: int) -> tuple[int, int]:
    following_count = (
        db.scalar(
            select(func.count())
            .select_from(StudentFollow)
            .join(User, User.id == StudentFollow.followee_id)
            .where(StudentFollow.follower_id == user_id, User.role == UserRole.student, User.is_active.is_(True))
        )
        or 0
    )
    followers_count = (
        db.scalar(
            select(func.count())
            .select_from(StudentFollow)
            .join(User, User.id == StudentFollow.follower_id)
            .where(StudentFollow.followee_id == user_id, User.role == UserRole.student, User.is_active.is_(True))
        )
        or 0
    )
    return int(following_count), int(followers_count)


def student_points_summary(user: User, enrollments: list[Enrollment], db: Session) -> tuple[int, int, object, list[str]]:
    week_start = datetime.utcnow() - timedelta(days=7)
    point_student = load_student_with_point_data(db, user.id) or user
    detail = calculate_student_point_detail(db, point_student, week_start)
    return int(detail["total_points"]), int(detail["weekly_points"]), detail["level"], list(detail["achievements"])

def active_and_completed(enrollments: list[Enrollment]) -> tuple[list[EnrollmentOut], list[EnrollmentOut]]:
    active = [EnrollmentOut.model_validate(enrollment) for enrollment in enrollments if enrollment.status == "active"]
    completed = [EnrollmentOut.model_validate(enrollment) for enrollment in enrollments if enrollment.status == "completed"]
    return active, completed


@router.get("/me/notes", response_model=list[StudentLearningNoteOut])
def my_learning_notes(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[StudentLearningNoteOut]:
    rows = db.execute(
        select(ChapterNote, Enrollment, Course, CourseChapter)
        .join(Enrollment, ChapterNote.enrollment_id == Enrollment.id)
        .join(Course, Enrollment.course_id == Course.id)
        .join(CourseChapter, ChapterNote.chapter_id == CourseChapter.id)
        .where(ChapterNote.user_id == current_user.id, ChapterNote.content != "")
        .order_by(Course.title, CourseChapter.position)
    ).all()
    return [
        StudentLearningNoteOut(
            id=note.id,
            enrollment_id=enrollment.id,
            course_id=course.id,
            course_slug=course.slug,
            course_title=course.title,
            course_image_url=course.hero_image_url,
            chapter_id=chapter.id,
            chapter_title=chapter.title,
            chapter_position=chapter.position,
            content=note.content,
            updated_at=note.updated_at,
        )
        for note, enrollment, course, chapter in rows
    ]


@router.get("/me/social-home", response_model=StudentSocialHomeOut)
def my_social_home(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> StudentSocialHomeOut:
    enrollments = load_enrollments_for_user(db, current_user.id)
    active_courses, completed_courses = active_and_completed(enrollments)
    enrolled_course_ids = [enrollment.course_id for enrollment in enrollments]
    recommended_stmt = (
        select(Course)
        .where(Course.status == CourseStatus.published)
        .options(joinedload(Course.institution), joinedload(Course.teacher))
        .order_by(Course.is_hot.desc(), Course.students_count.desc(), Course.updated_at.desc())
        .limit(4)
    )
    if enrolled_course_ids:
        recommended_stmt = recommended_stmt.where(Course.id.not_in(enrolled_course_ids))
    recommended_courses = [CourseCardOut.model_validate(course) for course in db.scalars(recommended_stmt)]
    posts = list(
        db.scalars(
            select(StudentPost)
            .where(StudentPost.user_id == current_user.id)
            .options(
                joinedload(StudentPost.user),
                joinedload(StudentPost.course),
                selectinload(StudentPost.comments).joinedload(StudentPostComment.user),
            )
            .order_by(StudentPost.created_at.desc())
            .limit(12)
        )
    )
    current_user_id = current_user.id
    question_load_options = (
        joinedload(CommunityQuestion.user),
        joinedload(CommunityQuestion.course),
        joinedload(CommunityQuestion.chapter),
        joinedload(CommunityQuestion.linked_question),
        selectinload(CommunityQuestion.answers).joinedload(CommunityAnswer.user),
    )
    questions = list(
        db.scalars(
            select(CommunityQuestion)
            .where(CommunityQuestion.user_id == current_user.id)
            .options(*question_load_options)
            .order_by(CommunityQuestion.created_at.desc())
            .limit(12)
        )
    )
    answer_activity = (
        select(
            CommunityAnswer.community_question_id.label("question_id"),
            func.max(CommunityAnswer.created_at).label("last_answered_at"),
        )
        .where(CommunityAnswer.user_id == current_user.id)
        .group_by(CommunityAnswer.community_question_id)
        .order_by(func.max(CommunityAnswer.created_at).desc())
        .limit(12)
        .subquery()
    )
    answered_questions = list(
        db.scalars(
            select(CommunityQuestion)
            .join(answer_activity, CommunityQuestion.id == answer_activity.c.question_id)
            .options(*question_load_options)
            .order_by(answer_activity.c.last_answered_at.desc())
        )
    )
    notes = list(
        db.scalars(
            select(CommunityNoteShare)
            .where(CommunityNoteShare.user_id == current_user.id, CommunityNoteShare.visibility == "public")
            .options(joinedload(CommunityNoteShare.user), joinedload(CommunityNoteShare.course))
            .order_by(CommunityNoteShare.created_at.desc())
            .limit(12)
        )
    )
    suggested_students = list(
        db.scalars(
            select(User)
            .where(User.role == UserRole.student, User.is_active.is_(True), User.id != current_user.id)
            .order_by(User.updated_at.desc())
            .limit(8)
        )
    )
    following_ids = list(
        db.scalars(select(StudentFollow.followee_id).where(StudentFollow.follower_id == current_user.id))
    )
    following_students = student_following_users(db, current_user.id)
    follower_students = student_follower_users(db, current_user.id)
    following_count, followers_count = student_follow_counts(db, current_user.id)
    total_points, weekly_points, level, achievements = student_points_summary(current_user, enrollments, db)
    return StudentSocialHomeOut(
        profile=user_profile_summary(current_user, include_email=True),
        active_courses=active_courses,
        completed_courses=completed_courses,
        recommended_courses=recommended_courses,
        total_points=total_points,
        weekly_points=weekly_points,
        level=level,
        achievements=achievements,
        posts=[post_out(post, current_user_id, db) for post in posts],
        suggested_students=[user_profile_summary(student) for student in suggested_students],
        following_ids=following_ids,
        following_students=[user_profile_summary(student, community_points=community_points_for_user(db, student.id)) for student in following_students],
        follower_students=[user_profile_summary(student, community_points=community_points_for_user(db, student.id)) for student in follower_students],
        following_count=following_count,
        followers_count=followers_count,
        questions=[community_question_out(question, current_user_id, db) for question in questions],
        answered_questions=[community_question_out(question, current_user_id, db) for question in answered_questions],
        notes=[community_note_out(note, current_user_id, db) for note in notes],
    )


@router.post("/me/posts", response_model=StudentPostOut, status_code=201)
def create_learning_post(
    payload: StudentPostCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudentPostOut:
    if payload.course_id is not None:
        enrollment = db.scalar(
            select(Enrollment).where(Enrollment.user_id == current_user.id, Enrollment.course_id == payload.course_id)
        )
        if not enrollment:
            raise HTTPException(status_code=403, detail="You can only post about enrolled courses")
    image_urls = [url.strip() for url in payload.image_urls if url.strip()][:9]
    post = StudentPost(
        user_id=current_user.id,
        course_id=payload.course_id,
        content=payload.content.strip(),
        image_urls=image_urls,
    )
    db.add(post)
    db.commit()
    post = db.scalar(
        select(StudentPost)
        .where(StudentPost.id == post.id)
        .options(
            joinedload(StudentPost.user),
            joinedload(StudentPost.course),
            selectinload(StudentPost.comments).joinedload(StudentPostComment.user),
        )
    )
    if not post:
        raise HTTPException(status_code=500, detail="Post was not created")
    return post_out(post, current_user.id, db)


@router.get("/students/{student_id}/profile", response_model=StudentPublicProfileOut)
def student_public_profile(
    student_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> StudentPublicProfileOut:
    student = db.scalar(select(User).where(User.id == student_id, User.role == UserRole.student, User.is_active.is_(True)))
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    enrollments = load_enrollments_for_user(db, student.id)
    active_courses, completed_courses = active_and_completed(enrollments)
    posts = list(
        db.scalars(
            select(StudentPost)
            .where(StudentPost.user_id == student.id, StudentPost.visibility == "public")
            .options(
                joinedload(StudentPost.user),
                joinedload(StudentPost.course),
                selectinload(StudentPost.comments).joinedload(StudentPostComment.user),
            )
            .order_by(StudentPost.created_at.desc())
            .limit(12)
        )
    )
    current_user_id = current_user.id if current_user else 0
    question_load_options = (
        joinedload(CommunityQuestion.user),
        joinedload(CommunityQuestion.course),
        joinedload(CommunityQuestion.chapter),
        joinedload(CommunityQuestion.linked_question),
        selectinload(CommunityQuestion.answers).joinedload(CommunityAnswer.user),
    )
    questions = list(
        db.scalars(
            select(CommunityQuestion)
            .where(CommunityQuestion.user_id == student.id)
            .options(*question_load_options)
            .order_by(CommunityQuestion.created_at.desc())
            .limit(12)
        )
    )
    answer_activity = (
        select(
            CommunityAnswer.community_question_id.label("question_id"),
            func.max(CommunityAnswer.created_at).label("last_answered_at"),
        )
        .where(CommunityAnswer.user_id == student.id)
        .group_by(CommunityAnswer.community_question_id)
        .order_by(func.max(CommunityAnswer.created_at).desc())
        .limit(12)
        .subquery()
    )
    answered_questions = list(
        db.scalars(
            select(CommunityQuestion)
            .join(answer_activity, CommunityQuestion.id == answer_activity.c.question_id)
            .options(*question_load_options)
            .order_by(answer_activity.c.last_answered_at.desc())
        )
    )
    notes = list(
        db.scalars(
            select(CommunityNoteShare)
            .where(CommunityNoteShare.user_id == student.id, CommunityNoteShare.visibility == "public")
            .options(joinedload(CommunityNoteShare.user), joinedload(CommunityNoteShare.course))
            .order_by(CommunityNoteShare.created_at.desc())
            .limit(12)
        )
    )
    following_students = student_following_users(db, student.id)
    follower_students = student_follower_users(db, student.id)
    following_count, followers_count = student_follow_counts(db, student.id)
    is_following = (
        db.scalar(
            select(StudentFollow).where(StudentFollow.follower_id == current_user.id, StudentFollow.followee_id == student.id)
        )
        is not None
        if current_user and current_user.role == UserRole.student
        else False
    )
    return StudentPublicProfileOut(
        profile=user_profile_summary(student),
        active_courses=active_courses,
        completed_courses=completed_courses,
        posts=[post_out(post, current_user_id, db) for post in posts],
        questions=[community_question_out(question, current_user_id, db) for question in questions],
        answered_questions=[community_question_out(question, current_user_id, db) for question in answered_questions],
        notes=[community_note_out(note, current_user_id, db) for note in notes],
        following_students=[user_profile_summary(student, community_points=community_points_for_user(db, student.id)) for student in following_students],
        follower_students=[user_profile_summary(student, community_points=community_points_for_user(db, student.id)) for student in follower_students],
        following_count=following_count,
        followers_count=followers_count,
        is_following=is_following,
    )


@router.post("/students/{student_id}/follow")
def follow_student(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    if student_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    student = db.scalar(select(User).where(User.id == student_id, User.role == UserRole.student, User.is_active.is_(True)))
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    follow = db.scalar(
        select(StudentFollow).where(StudentFollow.follower_id == current_user.id, StudentFollow.followee_id == student_id)
    )
    if not follow:
        db.add(StudentFollow(follower_id=current_user.id, followee_id=student_id))
        db.commit()
    return {"following": True}


@router.delete("/students/{student_id}/follow")
def unfollow_student(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    follow = db.scalar(
        select(StudentFollow).where(StudentFollow.follower_id == current_user.id, StudentFollow.followee_id == student_id)
    )
    if follow:
        db.delete(follow)
        db.commit()
    return {"following": False}


def ensure_student_user(current_user: User) -> None:
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Student role required")


def community_tags(raw: dict | None) -> list[str]:
    if not isinstance(raw, dict):
        return []
    items = raw.get("items", [])
    if not isinstance(items, list):
        return []
    return [str(item).strip() for item in items if str(item).strip()]


def has_reaction(db: Session, user_id: int, target_type: str, target_id: int) -> bool:
    return db.scalar(
        select(CommunityReaction).where(
            CommunityReaction.user_id == user_id,
            CommunityReaction.target_type == target_type,
            CommunityReaction.target_id == target_id,
        )
    ) is not None


def community_reaction_count(db: Session, target_type: str, target_id: int) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(CommunityReaction)
            .where(
                CommunityReaction.target_type == target_type,
                CommunityReaction.target_id == target_id,
            )
        )
        or 0
    )


def community_answer_out(answer: CommunityAnswer, current_user_id: int, db: Session) -> CommunityAnswerOut:
    student_level = None
    if answer.user:
        student_level = student_points_summary(answer.user, load_enrollments_for_user(db, answer.user_id), db)[2]
    return CommunityAnswerOut(
        id=answer.id,
        question_id=answer.community_question_id,
        user_id=answer.user_id,
        student_name=answer.user.full_name if answer.user else "Student",
        avatar_url=answer.user.avatar_url if answer.user else None,
        student_level=student_level,
        body=answer.body,
        likes_count=answer.likes_count,
        liked_by_me=has_reaction(db, current_user_id, "answer", answer.id),
        is_best=answer.is_best,
        created_at=answer.created_at,
    )


def linked_question_title(question: Question | None) -> str | None:
    if not question:
        return None
    prompt = (question.prompt or "").strip()
    return prompt[:100] + ("..." if len(prompt) > 100 else "")


def community_question_out(item: CommunityQuestion, current_user_id: int, db: Session) -> CommunityQuestionOut:
    answers = sorted(item.answers or [], key=lambda answer: answer.created_at or datetime.utcnow())
    return CommunityQuestionOut(
        id=item.id,
        user_id=item.user_id,
        student_name=item.user.full_name if item.user else "Student",
        avatar_url=item.user.avatar_url if item.user else None,
        title=item.title,
        body=item.body,
        course_id=item.course_id,
        course_title=item.course.title if item.course else None,
        chapter_id=item.chapter_id,
        chapter_title=item.chapter.title if item.chapter else None,
        linked_question_id=item.linked_question_id,
        linked_question_title=linked_question_title(item.linked_question),
        tags=community_tags(item.tags),
        is_resolved=item.is_resolved,
        likes_count=community_reaction_count(db, "question", item.id),
        liked_by_me=has_reaction(db, current_user_id, "question", item.id),
        answers_count=len(answers),
        answers=[community_answer_out(answer, current_user_id, db) for answer in answers],
        created_at=item.created_at,
    )


def community_note_out(note: CommunityNoteShare, current_user_id: int, db: Session) -> CommunityNoteShareOut:
    return CommunityNoteShareOut(
        id=note.id,
        user_id=note.user_id,
        student_name=note.user.full_name if note.user else "Student",
        avatar_url=note.user.avatar_url if note.user else None,
        chapter_note_id=note.chapter_note_id,
        title=note.title,
        content=note.content,
        course_id=note.course_id,
        course_title=note.course.title if note.course else None,
        likes_count=note.likes_count,
        liked_by_me=has_reaction(db, current_user_id, "note", note.id),
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def community_message_out(message: CommunityMessage) -> CommunityMessageOut:
    return CommunityMessageOut(
        id=message.id,
        sender_id=message.sender_id,
        sender_name=message.sender.full_name if message.sender else "Student",
        receiver_id=message.receiver_id,
        receiver_name=message.receiver.full_name if message.receiver else "Student",
        content=message.content,
        created_at=message.created_at,
    )


def community_reference_course(enrollment: Enrollment) -> CommunityReferenceCourseOut:
    course = enrollment.course
    chapters = sorted(course.chapters or [], key=lambda chapter: chapter.position)
    return CommunityReferenceCourseOut(
        id=course.id,
        title=course.title,
        slug=course.slug,
        chapters=[
            CommunityReferenceChapterOut(id=chapter.id, title=chapter.title, position=chapter.position)
            for chapter in chapters
        ],
    )


def community_points_for_user(db: Session, user_id: int) -> int:
    question_count = db.scalar(select(func.count()).select_from(CommunityQuestion).where(CommunityQuestion.user_id == user_id)) or 0
    answer_count = db.scalar(select(func.count()).select_from(CommunityAnswer).where(CommunityAnswer.user_id == user_id)) or 0
    note_count = db.scalar(select(func.count()).select_from(CommunityNoteShare).where(CommunityNoteShare.user_id == user_id)) or 0
    answer_likes = db.scalar(select(func.coalesce(func.sum(CommunityAnswer.likes_count), 0)).where(CommunityAnswer.user_id == user_id)) or 0
    note_likes = db.scalar(select(func.coalesce(func.sum(CommunityNoteShare.likes_count), 0)).where(CommunityNoteShare.user_id == user_id)) or 0
    return int(question_count) * 5 + int(answer_count) * 8 + int(note_count) * 6 + int(answer_likes + note_likes) * 2



def validate_community_course_reference(
    db: Session,
    current_user: User,
    course_id: int | None,
    chapter_id: int | None,
) -> None:
    if course_id is None and chapter_id is None:
        return
    if course_id is None:
        raise HTTPException(status_code=422, detail="Course is required when selecting a chapter")
    enrollment = db.scalar(
        select(Enrollment).where(Enrollment.user_id == current_user.id, Enrollment.course_id == course_id)
    )
    if not enrollment:
        raise HTTPException(status_code=403, detail="You can only reference enrolled courses")
    if chapter_id is not None:
        chapter = db.scalar(select(CourseChapter).where(CourseChapter.id == chapter_id, CourseChapter.course_id == course_id))
        if not chapter:
            raise HTTPException(status_code=422, detail="Chapter does not belong to selected course")


@router.get("/community", response_model=CommunityHomeOut)
def community_home(
    q: str | None = None,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> CommunityHomeOut:
    if current_user:
        ensure_student_user(current_user)
    current_user_id = current_user.id if current_user else 0
    search = (q or "").strip()
    pattern = f"%{search}%"

    def question_options():
        return (
            joinedload(CommunityQuestion.user),
            joinedload(CommunityQuestion.course),
            joinedload(CommunityQuestion.chapter),
            joinedload(CommunityQuestion.linked_question),
            selectinload(CommunityQuestion.answers).joinedload(CommunityAnswer.user),
        )

    question_stmt = select(CommunityQuestion).options(*question_options()).order_by(
        CommunityQuestion.updated_at.desc(), CommunityQuestion.created_at.desc()
    ).limit(36)
    if search:
        question_stmt = question_stmt.where(or_(CommunityQuestion.title.ilike(pattern), CommunityQuestion.body.ilike(pattern)))
    questions = list(db.scalars(question_stmt))
    questions = sorted(
        questions,
        key=lambda item: (len(item.answers or []), item.updated_at or item.created_at or datetime.utcnow()),
        reverse=True,
    )

    enrollments = load_enrollments_for_user(db, current_user.id) if current_user else []
    enrolled_course_ids = [enrollment.course_id for enrollment in enrollments]
    recommended_stmt = select(CommunityQuestion).options(*question_options())
    if current_user:
        recommended_stmt = recommended_stmt.where(CommunityQuestion.user_id != current_user.id)
    if search:
        recommended_stmt = recommended_stmt.where(or_(CommunityQuestion.title.ilike(pattern), CommunityQuestion.body.ilike(pattern)))
    elif current_user and enrolled_course_ids:
        recommended_stmt = recommended_stmt.where(
            or_(
                CommunityQuestion.course_id.in_(enrolled_course_ids),
                CommunityQuestion.course_id.is_(None),
                CommunityQuestion.linked_question_id.is_not(None),
            )
        )
    elif not current_user:
        recommended_stmt = recommended_stmt.where(CommunityQuestion.answers.any())
    recommended_questions = list(
        db.scalars(
            recommended_stmt.order_by(CommunityQuestion.updated_at.desc(), CommunityQuestion.created_at.desc()).limit(12)
        )
    )

    note_stmt = (
        select(CommunityNoteShare)
        .where(CommunityNoteShare.visibility == "public")
        .options(joinedload(CommunityNoteShare.user), joinedload(CommunityNoteShare.course))
        .order_by(CommunityNoteShare.likes_count.desc(), CommunityNoteShare.updated_at.desc(), CommunityNoteShare.created_at.desc())
        .limit(12)
    )
    if search:
        note_stmt = note_stmt.where(or_(CommunityNoteShare.title.ilike(pattern), CommunityNoteShare.content.ilike(pattern)))
    notes = list(db.scalars(note_stmt))

    student_stmt = select(User).where(User.role == UserRole.student, User.is_active.is_(True))
    if current_user:
        student_stmt = student_stmt.where(User.id != current_user.id)
    student_stmt = student_stmt.limit(40)
    if search:
        student_stmt = student_stmt.where(or_(User.full_name.ilike(pattern), User.bio.ilike(pattern), User.region.ilike(pattern)))
    students = list(db.scalars(student_stmt))

    def student_activity_score(student: User) -> int:
        community_points = community_points_for_user(db, student.id)
        follower_count = db.scalar(select(func.count(StudentFollow.id)).where(StudentFollow.followee_id == student.id)) or 0
        question_count = db.scalar(select(func.count(CommunityQuestion.id)).where(CommunityQuestion.user_id == student.id)) or 0
        answer_count = db.scalar(select(func.count(CommunityAnswer.id)).where(CommunityAnswer.user_id == student.id)) or 0
        note_count = db.scalar(select(func.count(CommunityNoteShare.id)).where(CommunityNoteShare.user_id == student.id)) or 0
        post_count = db.scalar(select(func.count(StudentPost.id)).where(StudentPost.user_id == student.id)) or 0
        return int(community_points + follower_count + question_count + answer_count + note_count + post_count)

    scored_students = [(student, student_activity_score(student)) for student in students]
    hot_students = [
        student
        for student, score in sorted(scored_students, key=lambda item: item[1], reverse=True)
        if score > 0
    ][:8]

    following_ids = list(db.scalars(select(StudentFollow.followee_id).where(StudentFollow.follower_id == current_user.id))) if current_user else []
    reference_questions = list(
        db.scalars(
            select(Question)
            .where(
                Question.status == QuestionStatus.published,
                Question.type != QuestionType.code_review,
            )
            .order_by(Question.updated_at.desc())
            .limit(80)
        )
    )
    recent_messages = (
        list(
            db.scalars(
                select(CommunityMessage)
                .where(or_(CommunityMessage.sender_id == current_user.id, CommunityMessage.receiver_id == current_user.id))
                .options(joinedload(CommunityMessage.sender), joinedload(CommunityMessage.receiver))
                .order_by(CommunityMessage.created_at.desc())
                .limit(10)
            )
        )
        if current_user
        else []
    )

    return CommunityHomeOut(
        questions=[community_question_out(question, current_user_id, db) for question in questions],
        recommended_questions=[community_question_out(question, current_user_id, db) for question in recommended_questions],
        notes=[community_note_out(note, current_user_id, db) for note in notes],
        students=[user_profile_summary(student, community_points=community_points_for_user(db, student.id)) for student in students],
        hot_students=[user_profile_summary(student, community_points=community_points_for_user(db, student.id)) for student in hot_students],
        following_ids=following_ids,
        my_courses=[community_reference_course(enrollment) for enrollment in enrollments],
        reference_questions=[
            CommunityReferenceQuestionOut(
                id=question.id,
                prompt=question.prompt,
                type=question.type,
                difficulty=question.difficulty,
                skill_area=question.skill_area,
            )
            for question in reference_questions
        ],
        recent_messages=[community_message_out(message) for message in recent_messages],
        community_points=community_points_for_user(db, current_user.id) if current_user else 0,
    )

@router.post("/community/questions", response_model=CommunityQuestionOut, status_code=201)
def create_community_question(
    payload: CommunityQuestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunityQuestionOut:
    ensure_student_user(current_user)
    validate_community_course_reference(db, current_user, payload.course_id, payload.chapter_id)
    if payload.linked_question_id is not None:
        linked_question = db.scalar(
            select(Question).where(
                Question.id == payload.linked_question_id,
                Question.status == QuestionStatus.published,
                Question.type != QuestionType.code_review,
            )
        )
        if not linked_question:
            raise HTTPException(status_code=404, detail="Linked question not found")
    item = CommunityQuestion(
        user_id=current_user.id,
        title=payload.title.strip(),
        body=payload.body.strip(),
        course_id=payload.course_id,
        chapter_id=payload.chapter_id,
        linked_question_id=payload.linked_question_id,
        tags={"items": [tag.strip() for tag in payload.tags if tag.strip()]},
    )
    db.add(item)
    add_student_timeline_post(db, current_user.id, f"\u6211\u53d1\u5e03\u4e86\u4e00\u4e2a\u95ee\u9898\uff1a{item.title}", item.course_id)
    db.commit()
    created = db.scalar(
        select(CommunityQuestion)
        .where(CommunityQuestion.id == item.id)
        .options(
            joinedload(CommunityQuestion.user),
            joinedload(CommunityQuestion.course),
            joinedload(CommunityQuestion.chapter),
            joinedload(CommunityQuestion.linked_question),
            selectinload(CommunityQuestion.answers).joinedload(CommunityAnswer.user),
        )
    )
    if not created:
        raise HTTPException(status_code=500, detail="Question was not created")
    return community_question_out(created, current_user.id, db)


@router.post("/community/questions/{question_id}/answers", response_model=CommunityAnswerOut, status_code=201)
def create_community_answer(
    question_id: int,
    payload: CommunityAnswerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunityAnswerOut:
    ensure_student_user(current_user)
    question = db.get(CommunityQuestion, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Community question not found")
    answer = CommunityAnswer(community_question_id=question_id, user_id=current_user.id, body=payload.body.strip())
    db.add(answer)
    add_student_timeline_post(db, current_user.id, f"\u6211\u56de\u7b54\u4e86\u4e00\u4e2a\u95ee\u9898\uff1a{question.title}", question.course_id)
    if question.user_id != current_user.id:
        add_student_timeline_post(db, question.user_id, f"{current_user.full_name} \u56de\u7b54\u4e86\u4f60\u7684\u95ee\u9898\uff1a{question.title}", question.course_id)
    db.commit()
    created = db.scalar(
        select(CommunityAnswer).where(CommunityAnswer.id == answer.id).options(joinedload(CommunityAnswer.user))
    )
    if not created:
        raise HTTPException(status_code=500, detail="Answer was not created")
    return community_answer_out(created, current_user.id, db)


@router.post("/community/notes", response_model=CommunityNoteShareOut, status_code=201)
def create_community_note(
    payload: CommunityNoteShareCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunityNoteShareOut:
    ensure_student_user(current_user)
    if payload.course_id is not None:
        validate_community_course_reference(db, current_user, payload.course_id, None)
    if payload.chapter_note_id is not None:
        note = db.scalar(
            select(ChapterNote).where(ChapterNote.id == payload.chapter_note_id, ChapterNote.user_id == current_user.id)
        )
        if not note:
            raise HTTPException(status_code=404, detail="Learning note not found")
    share = CommunityNoteShare(
        user_id=current_user.id,
        chapter_note_id=payload.chapter_note_id,
        course_id=payload.course_id,
        title=payload.title.strip(),
        content=payload.content.strip(),
    )
    db.add(share)
    db.commit()
    created = db.scalar(
        select(CommunityNoteShare)
        .where(CommunityNoteShare.id == share.id)
        .options(joinedload(CommunityNoteShare.user), joinedload(CommunityNoteShare.course))
    )
    if not created:
        raise HTTPException(status_code=500, detail="Note was not shared")
    return community_note_out(created, current_user.id, db)


def toggle_community_like(target_type: str, target_id: int, current_user: User, db: Session) -> dict[str, int | bool]:
    ensure_student_user(current_user)
    if target_type == "question":
        target = db.get(CommunityQuestion, target_id)
    elif target_type == "answer":
        target = db.get(CommunityAnswer, target_id)
    elif target_type == "note":
        target = db.get(CommunityNoteShare, target_id)
    elif target_type == "post":
        target = db.get(StudentPost, target_id)
    else:
        raise HTTPException(status_code=422, detail="Unsupported target type")
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    existing = db.scalar(
        select(CommunityReaction).where(
            CommunityReaction.user_id == current_user.id,
            CommunityReaction.target_type == target_type,
            CommunityReaction.target_id == target_id,
        )
    )
    if existing:
        db.delete(existing)
        if target_type != "question":
            target.likes_count = max(0, int(target.likes_count or 0) - 1)
        liked = False
    else:
        db.add(CommunityReaction(user_id=current_user.id, target_type=target_type, target_id=target_id))
        if target_type != "question":
            target.likes_count = int(target.likes_count or 0) + 1
        liked = True
        if target_type == "note":
            add_student_timeline_post(db, current_user.id, f"\u6211\u5173\u6ce8\u4e86\u4e00\u7bc7\u793e\u533a\u7b14\u8bb0\uff1a{target.title}", target.course_id)
    db.commit()
    likes_count = community_reaction_count(db, "question", target_id) if target_type == "question" else int(target.likes_count or 0)
    return {"liked": liked, "likes_count": likes_count}


@router.post("/community/questions/{question_id}/like")
def like_community_question(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    return toggle_community_like("question", question_id, current_user, db)


@router.post("/community/answers/{answer_id}/like")
def like_community_answer(
    answer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    return toggle_community_like("answer", answer_id, current_user, db)


@router.post("/community/notes/{note_id}/like")
def like_community_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    return toggle_community_like("note", note_id, current_user, db)


@router.post("/posts/{post_id}/like")
def like_student_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    return toggle_community_like("post", post_id, current_user, db)


@router.post("/posts/{post_id}/comments", response_model=StudentPostCommentOut, status_code=201)
def create_student_post_comment(
    post_id: int,
    payload: StudentPostCommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudentPostCommentOut:
    ensure_student_user(current_user)
    post = db.scalar(select(StudentPost).where(StudentPost.id == post_id, StudentPost.visibility == "public"))
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comment = StudentPostComment(post_id=post_id, user_id=current_user.id, body=payload.body.strip())
    db.add(comment)
    db.commit()
    created = db.scalar(
        select(StudentPostComment)
        .where(StudentPostComment.id == comment.id)
        .options(joinedload(StudentPostComment.user))
    )
    if not created:
        raise HTTPException(status_code=500, detail="Comment was not created")
    return student_post_comment_out(created)


@router.post("/community/messages", response_model=CommunityMessageOut, status_code=201)
def send_community_message(
    payload: CommunityMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunityMessageOut:
    ensure_student_user(current_user)
    if payload.receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    receiver = db.scalar(select(User).where(User.id == payload.receiver_id, User.role == UserRole.student, User.is_active.is_(True)))
    if not receiver:
        raise HTTPException(status_code=404, detail="Student not found")
    follow = db.scalar(
        select(StudentFollow).where(StudentFollow.follower_id == current_user.id, StudentFollow.followee_id == receiver.id)
    )
    if not follow:
        raise HTTPException(status_code=403, detail="Follow this student before sending a message")
    message = CommunityMessage(sender_id=current_user.id, receiver_id=receiver.id, content=payload.content.strip())
    db.add(message)
    db.commit()
    created = db.scalar(
        select(CommunityMessage)
        .where(CommunityMessage.id == message.id)
        .options(joinedload(CommunityMessage.sender), joinedload(CommunityMessage.receiver))
    )
    if not created:
        raise HTTPException(status_code=500, detail="Message was not created")
    return community_message_out(created)

@router.post("/courses/{slug}/subscribe", response_model=SubscribeCourseOut, status_code=201)
def subscribe_course(
    slug: str,
    payload: SubscribeCourseIn,
    x_demo_user_id: int | None = Header(default=None),
    db: Session = Depends(get_db),
) -> SubscribeCourseOut:
    course = db.scalar(
        select(Course)
        .where(Course.slug == slug, Course.status == CourseStatus.published)
        .options(
            joinedload(Course.institution),
            joinedload(Course.teacher),
            selectinload(Course.chapters).selectinload(CourseChapter.items),
        )
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    user: User | None = db.get(User, x_demo_user_id) if x_demo_user_id else None
    if user and user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Please subscribe with a student account")

    normalized_email = str(payload.email).strip().lower()
    if user is None:
        user = db.scalar(select(User).where(User.email == normalized_email))
        if user and user.role != UserRole.student:
            raise HTTPException(status_code=409, detail="Email belongs to a non-student account")

    if user is None:
        user = User(
            email=normalized_email,
            full_name=payload.full_name.strip(),
            role=UserRole.student,
            hashed_password=None,
            auth_provider="subscription",
            region=payload.region,
            phone=payload.phone,
        )
        db.add(user)
        db.flush()
    else:
        user.full_name = payload.full_name.strip() or user.full_name
        user.region = payload.region or user.region
        user.phone = payload.phone or user.phone

    enrollment = db.scalar(
        select(Enrollment)
        .where(Enrollment.user_id == user.id, Enrollment.course_id == course.id)
        .options(
            joinedload(Enrollment.course).joinedload(Course.institution),
            joinedload(Enrollment.course).joinedload(Course.teacher),
            joinedload(Enrollment.course).selectinload(Course.chapters).selectinload(CourseChapter.items),
        )
    )
    active_subscription = db.scalar(
        select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.course_id == course.id,
            Subscription.status == "active",
        )
    )
    if enrollment and active_subscription:
        db.commit()
        return SubscribeCourseOut(
            auth=AuthOut(access_token=f"demo-token-{user.id}", user=user),
            enrollment=EnrollmentOut.model_validate(enrollment),
            subscription_status=active_subscription.status,
        )

    settings = get_settings()
    if not settings.stripe_secret_key:
        db.rollback()
        raise HTTPException(status_code=503, detail="Stripe payment is not configured")
    institution = course.institution
    if not institution:
        db.rollback()
        raise HTTPException(status_code=409, detail="Course institution is not configured")
    platform_owned = institution.payout_mode == "platform"
    if not platform_owned and (not institution.stripe_account_id or not institution.stripe_charges_enabled):
        db.rollback()
        raise HTTPException(status_code=409, detail="Institution Stripe onboarding is not complete")

    frontend_base_url = settings.frontend_base_url.rstrip("/")
    try:
        import stripe

        stripe.api_key = settings.stripe_secret_key
        subscription_data = {
            "metadata": {
                "user_id": str(user.id),
                "course_id": str(course.id),
                "course_slug": course.slug,
                "institution_id": str(institution.id),
                "payout_mode": institution.payout_mode,
            },
        }
        platform_fee_percent = 100.0 if platform_owned else settings.stripe_platform_fee_percent
        if not platform_owned:
            subscription_data["application_fee_percent"] = settings.stripe_platform_fee_percent
            subscription_data["transfer_data"] = {"destination": institution.stripe_account_id}

        checkout_session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=user.email,
            client_reference_id=str(user.id),
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "unit_amount": 3900,
                        "recurring": {"interval": "month"},
                        "product_data": {
                            "name": course.title,
                            "description": course.subtitle or institution.name,
                        },
                    },
                    "quantity": 1,
                }
            ],
            metadata={
                "user_id": str(user.id),
                "course_id": str(course.id),
                "course_slug": course.slug,
                "institution_id": str(institution.id),
                "payout_mode": institution.payout_mode,
            },
            subscription_data=subscription_data,
            success_url=f"{frontend_base_url}/learn?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_base_url}/courses/{course.slug}?payment=cancelled",
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Stripe checkout creation failed: {exc}") from exc

    checkout_session_id = str(stripe_value(checkout_session, "id", ""))
    pending_subscription = db.scalar(
        select(Subscription).where(Subscription.stripe_checkout_session_id == checkout_session_id)
    )
    if pending_subscription is None:
        pending_subscription = Subscription(
            user_id=user.id,
            course_id=course.id,
            amount_eur_monthly=39,
            status="pending",
            current_period_start=datetime.utcnow(),
            current_period_end=None,
            payment_provider="stripe",
            stripe_checkout_session_id=checkout_session_id,
            stripe_customer_id=str(stripe_value(checkout_session, "customer", "") or "") or None,
            platform_fee_percent=platform_fee_percent,
        )
        db.add(pending_subscription)

    db.commit()
    db.refresh(user)

    return SubscribeCourseOut(
        auth=AuthOut(access_token=f"demo-token-{user.id}", user=user),
        enrollment=None,
        subscription_status="checkout_required",
        checkout_url=str(stripe_value(checkout_session, "url", "") or ""),
        checkout_session_id=checkout_session_id,
    )


@router.get("/courses/{slug}", response_model=CourseDetailOut)
def learning_course(
    slug: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Course:
    course = db.scalar(
        select(Course)
        .where(Course.slug == slug)
        .options(
            joinedload(Course.institution),
            joinedload(Course.teacher),
            selectinload(Course.chapters).selectinload(CourseChapter.items),
        )
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    enrollment = db.scalar(
        select(Enrollment).where(Enrollment.user_id == current_user.id, Enrollment.course_id == course.id)
    )
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")
    return course


def course_and_enrollment_for_review(
    slug: str,
    current_user: User,
    db: Session,
    enrollment_id: int | None = None,
) -> tuple[Course, Enrollment]:
    course = db.scalar(select(Course).where(Course.slug == slug))
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    stmt = select(Enrollment).where(Enrollment.user_id == current_user.id, Enrollment.course_id == course.id)
    if enrollment_id is not None:
        stmt = stmt.where(Enrollment.id == enrollment_id)
    enrollment = db.scalar(stmt)
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")
    return course, enrollment


@router.get("/courses/{slug}/review", response_model=CourseReviewOut)
def get_course_review(
    slug: str,
    enrollment_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CourseReviewOut:
    course, enrollment = course_and_enrollment_for_review(slug, current_user, db, enrollment_id)
    review = db.scalar(
        select(CourseReview).where(CourseReview.user_id == current_user.id, CourseReview.course_id == course.id)
    )
    if not review:
        return CourseReviewOut(course_id=course.id, enrollment_id=enrollment.id)
    return CourseReviewOut(
        id=review.id,
        course_id=review.course_id,
        enrollment_id=review.enrollment_id,
        rating=review.rating,
        comment=review.comment or "",
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.put("/courses/{slug}/review", response_model=CourseReviewOut)
def upsert_course_review(
    slug: str,
    payload: CourseReviewIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CourseReviewOut:
    course, enrollment = course_and_enrollment_for_review(slug, current_user, db, payload.enrollment_id)
    review = db.scalar(
        select(CourseReview).where(CourseReview.user_id == current_user.id, CourseReview.course_id == course.id)
    )
    if not review:
        review = CourseReview(user_id=current_user.id, course_id=course.id, enrollment_id=enrollment.id)
        db.add(review)
    review.enrollment_id = enrollment.id
    review.rating = payload.rating
    review.comment = payload.comment.strip()
    db.commit()
    db.refresh(review)
    return CourseReviewOut(
        id=review.id,
        course_id=review.course_id,
        enrollment_id=review.enrollment_id,
        rating=review.rating,
        comment=review.comment or "",
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def get_student_chapter(
    chapter_id: int,
    current_user: User,
    db: Session,
    enrollment_id: int | None = None,
) -> tuple[CourseChapter, Enrollment]:
    chapter = db.get(CourseChapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    enrollment_stmt = select(Enrollment).where(
        Enrollment.user_id == current_user.id,
        Enrollment.course_id == chapter.course_id,
    )
    if enrollment_id is not None:
        enrollment_stmt = enrollment_stmt.where(Enrollment.id == enrollment_id)
    enrollment = db.scalar(enrollment_stmt)
    if not enrollment:
        raise HTTPException(status_code=403, detail="No enrollment for this chapter")
    return chapter, enrollment


@router.get("/chapters/{chapter_id}/notes", response_model=ChapterNoteOut)
def get_chapter_note(
    chapter_id: int,
    enrollment_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChapterNoteOut:
    chapter, enrollment = get_student_chapter(chapter_id, current_user, db, enrollment_id)
    note = db.scalar(
        select(ChapterNote).where(
            ChapterNote.enrollment_id == enrollment.id,
            ChapterNote.chapter_id == chapter.id,
            ChapterNote.user_id == current_user.id,
        )
    )
    if not note:
        return ChapterNoteOut(
            id=None,
            enrollment_id=enrollment.id,
            chapter_id=chapter.id,
            content="",
            updated_at=None,
        )
    return ChapterNoteOut.model_validate(note)


@router.patch("/chapters/{chapter_id}/notes", response_model=ChapterNoteOut)
def save_chapter_note(
    chapter_id: int,
    payload: ChapterNoteIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChapterNote:
    chapter, enrollment = get_student_chapter(chapter_id, current_user, db, payload.enrollment_id)
    note = db.scalar(
        select(ChapterNote).where(
            ChapterNote.enrollment_id == enrollment.id,
            ChapterNote.chapter_id == chapter.id,
            ChapterNote.user_id == current_user.id,
        )
    )
    if not note:
        note = ChapterNote(enrollment_id=enrollment.id, chapter_id=chapter.id, user_id=current_user.id)
        db.add(note)
    note.content = payload.content
    db.commit()
    db.refresh(note)
    return note


@router.post("/items/{item_id}/complete")
def complete_item(
    item_id: int,
    payload: CompleteItemIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, float | str]:
    item = db.scalar(
        select(LessonItem)
        .where(LessonItem.id == item_id)
        .options(joinedload(LessonItem.chapter))
    )
    if not item:
        raise HTTPException(status_code=404, detail="Lesson item not found")

    enrollment = db.scalar(
        select(Enrollment)
        .where(Enrollment.user_id == current_user.id, Enrollment.course_id == item.chapter.course_id)
    )
    if not enrollment:
        raise HTTPException(status_code=403, detail="No enrollment for this lesson")
    if enrollment.status == "completed":
        return {"status": "completed", "progress_percent": 100.0}

    progress = db.scalar(
        select(ProgressRecord).where(
            ProgressRecord.enrollment_id == enrollment.id,
            ProgressRecord.lesson_item_id == item.id,
        )
    )
    if not progress:
        progress = ProgressRecord(enrollment_id=enrollment.id, lesson_item_id=item.id)
        db.add(progress)
    progress.completed_at = datetime.utcnow()
    progress.notes = payload.notes
    progress.score = payload.score

    update_enrollment_progress(db, enrollment)
    db.commit()
    return {"status": "completed", "progress_percent": enrollment.progress_percent}


@router.get("/questions", response_model=list[StudentQuestionOut])
def list_questions(
    course_id: int | None = None,
    ids: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
) -> list[Question]:
    stmt = (
        select(Question)
        .where(
            Question.status == QuestionStatus.published,
            Question.type != QuestionType.code_review,
        )
        .options(joinedload(Question.institution), selectinload(Question.options), selectinload(Question.media_assets))
        .order_by(Question.created_at.desc())
    )
    if course_id:
        stmt = stmt.where(Question.course_id == course_id)
    if ids:
        question_ids = [
            int(question_id)
            for question_id in ids.split(",")
            if question_id.strip().isdigit()
        ]
        if not question_ids:
            return []
        stmt = stmt.where(Question.id.in_(question_ids))
    if type:
        stmt = stmt.where(Question.type == type)
    return list(db.scalars(stmt))


@router.post("/questions/{question_id}/run-code", response_model=CodeRunOut)
def run_question_code(
    question_id: int,
    payload: CodeRunIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if payload.language.lower() not in {"python", "py"}:
        raise HTTPException(status_code=422, detail="Only Python code execution is supported")

    question = db.get(Question, question_id)
    if not question or question.status != QuestionStatus.published or question.type != QuestionType.coding:
        raise HTTPException(status_code=404, detail="Coding question not found")

    if payload.lesson_item_id is not None:
        item, _enrollment = get_student_lesson_item(payload.lesson_item_id, current_user, db, payload.enrollment_id)
        if item.item_type not in {LessonItemType.exercise, LessonItemType.quiz}:
            raise HTTPException(status_code=400, detail="Lesson item has no question submissions")
        if question.id not in item_question_ids(item):
            raise HTTPException(status_code=400, detail="Question does not belong to this lesson item")

    tests = code_tests_for_question(question.content, question.answer_key)
    return run_python_code(payload.code, tests)


def normalize_answer_value(value: object) -> object:
    if isinstance(value, str):
        return value.strip().casefold()
    return value


def normalize_answer_list(value: object) -> list[object]:
    if isinstance(value, list):
        return [normalize_answer_value(item) for item in value]
    if value is None:
        return []
    return [normalize_answer_value(value)]


def submitted_answer_values(answer_payload: dict) -> list[object]:
    if isinstance(answer_payload.get("answers"), list):
        return normalize_answer_list(answer_payload.get("answers"))
    return normalize_answer_list(answer_payload.get("answer"))


def expected_answer_values(answer_key: dict) -> list[object]:
    if isinstance(answer_key.get("answers"), list):
        return normalize_answer_list(answer_key.get("answers"))
    return normalize_answer_list(answer_key.get("answer"))


def auto_grade_score(question: Question, answer_payload: dict) -> int:
    answer_key = question.answer_key or {}

    if question.type == QuestionType.coding:
        submitted_code = answer_payload.get("answer")
        if not isinstance(submitted_code, str) or not submitted_code.strip():
            return 0
        tests = code_tests_for_question(question.content, answer_key)
        result = run_python_code(submitted_code, tests)
        if tests:
            return question.points if result.get("ok") and result.get("passed") else 0
        expected_output = answer_key.get("expected_output")
        if isinstance(expected_output, str) and expected_output.strip():
            return question.points if result.get("stdout", "").strip() == expected_output.strip() else 0
        return 0

    if question.type == QuestionType.fill_blank:
        expected = expected_answer_values(answer_key)
        submitted = submitted_answer_values(answer_payload)
        return question.points if expected and submitted == expected else 0

    if question.type == QuestionType.multiple_choice:
        expected = expected_answer_values(answer_key)
        submitted = submitted_answer_values(answer_payload)
        return question.points if expected and set(submitted) == set(expected) and len(submitted) == len(expected) else 0

    expected = normalize_answer_value(answer_key.get("answer"))
    submitted = normalize_answer_value(answer_payload.get("answer"))
    return question.points if expected is not None and submitted == expected else 0


def item_question_ids(item: LessonItem) -> list[int]:
    return [
        int(question_id)
        for question_id in (item.body or {}).get("question_ids", [])
        if isinstance(question_id, int)
    ]


def get_student_lesson_item(
    item_id: int,
    current_user: User,
    db: Session,
    enrollment_id: int | None = None,
) -> tuple[LessonItem, Enrollment]:
    item = db.scalar(
        select(LessonItem)
        .where(LessonItem.id == item_id)
        .options(joinedload(LessonItem.chapter))
    )
    if not item:
        raise HTTPException(status_code=404, detail="Lesson item not found")

    enrollment_stmt = select(Enrollment).where(
        Enrollment.user_id == current_user.id,
        Enrollment.course_id == item.chapter.course_id,
    )
    if enrollment_id is not None:
        enrollment_stmt = enrollment_stmt.where(Enrollment.id == enrollment_id)
    enrollment = db.scalar(enrollment_stmt)
    if not enrollment:
        raise HTTPException(status_code=403, detail="No enrollment for this lesson")
    return item, enrollment


def update_enrollment_progress(db: Session, enrollment: Enrollment) -> None:
    total_items = db.scalar(
        select(func.count(LessonItem.id))
        .join(LessonItem.chapter)
        .where(LessonItem.chapter.has(course_id=enrollment.course_id))
    )
    completed_items = db.scalar(
        select(func.count(ProgressRecord.id)).where(
            ProgressRecord.enrollment_id == enrollment.id,
            ProgressRecord.completed_at.is_not(None),
        )
    )
    enrollment.progress_percent = round((completed_items or 0) / max(total_items or 1, 1) * 100, 1)
    enrollment.status = "completed" if enrollment.progress_percent >= 100 else "active"


def latest_submission_by_question_id(
    db: Session,
    user_id: int,
    enrollment_id: int,
    lesson_item_id: int,
) -> dict[int, Submission]:
    submissions = list(
        db.scalars(
            select(Submission)
            .where(
                Submission.user_id == user_id,
                Submission.enrollment_id == enrollment_id,
                Submission.lesson_item_id == lesson_item_id,
            )
            .order_by(Submission.question_id, Submission.created_at.desc(), Submission.id.desc())
        )
    )
    latest_by_question_id: dict[int, Submission] = {}
    for submission in submissions:
        if submission.question_id not in latest_by_question_id:
            latest_by_question_id[submission.question_id] = submission
    return latest_by_question_id


def update_quiz_progress_from_submissions(db: Session, item: LessonItem, enrollment: Enrollment) -> dict[str, float | int | bool | None | str]:
    configured_question_ids = item_question_ids(item)
    if not configured_question_ids:
        return {"status": "empty", "score": 0.0, "total_score": 0.0, "passed": None, "pending_manual_count": 0}

    questions = list(
        db.scalars(
            select(Question).where(
                Question.id.in_(configured_question_ids),
                Question.status == QuestionStatus.published,
                Question.type != QuestionType.code_review,
            )
        )
    )
    question_by_id = {question.id: question for question in questions}
    latest_submissions = latest_submission_by_question_id(db, enrollment.user_id, enrollment.id, item.id)
    relevant_submissions = [
        latest_submissions[question_id]
        for question_id in configured_question_ids
        if question_id in question_by_id and question_id in latest_submissions
    ]
    pending_manual_count = sum(
        1 for submission in relevant_submissions if submission.status == SubmissionStatus.pending_manual
    )
    score_total = sum(float(submission.score or 0) for submission in relevant_submissions)
    total_score = sum(float(question.points or 0) for question in questions)

    progress = db.scalar(
        select(ProgressRecord).where(
            ProgressRecord.enrollment_id == enrollment.id,
            ProgressRecord.lesson_item_id == item.id,
        )
    )
    passed: bool | None
    status: str
    if pending_manual_count:
        passed = None
        status = "pending_manual"
        if progress:
            db.delete(progress)
    else:
        passed = total_score > 0 and score_total / total_score >= 0.8
        status = "passed" if passed else "failed"
        if passed:
            if not progress:
                progress = ProgressRecord(enrollment_id=enrollment.id, lesson_item_id=item.id)
                db.add(progress)
            progress.completed_at = datetime.utcnow()
            progress.notes = None
            progress.score = score_total
        elif progress:
            db.delete(progress)
    update_enrollment_progress(db, enrollment)
    return {
        "status": status,
        "score": score_total,
        "total_score": total_score,
        "passed": passed,
        "pending_manual_count": pending_manual_count,
    }


def latest_submissions_for_item(
    db: Session,
    user_id: int,
    enrollment_id: int,
    lesson_item_id: int,
    question_ids: list[int],
) -> list[Submission]:
    if not question_ids:
        return []

    submissions = list(
        db.scalars(
            select(Submission)
            .where(
                Submission.user_id == user_id,
                Submission.enrollment_id == enrollment_id,
                Submission.lesson_item_id == lesson_item_id,
                Submission.question_id.in_(question_ids),
            )
            .order_by(Submission.question_id, Submission.created_at.desc(), Submission.id.desc())
        )
    )
    latest_by_question_id: dict[int, Submission] = {}
    for submission in submissions:
        if submission.question_id not in latest_by_question_id:
            latest_by_question_id[submission.question_id] = submission
    return [latest_by_question_id[question_id] for question_id in question_ids if question_id in latest_by_question_id]


@router.get("/items/{item_id}/submissions", response_model=LessonItemSubmissionStateOut)
def item_submission_state(
    item_id: int,
    enrollment_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LessonItemSubmissionStateOut:
    item, enrollment = get_student_lesson_item(item_id, current_user, db, enrollment_id)
    if item.item_type not in {LessonItemType.exercise, LessonItemType.quiz}:
        raise HTTPException(status_code=400, detail="Lesson item has no question submissions")

    configured_question_ids = item_question_ids(item)
    questions = list(
        db.scalars(
            select(Question).where(
                Question.id.in_(configured_question_ids),
                Question.status == QuestionStatus.published,
                Question.type != QuestionType.code_review,
            )
        )
    )
    question_by_id = {question.id: question for question in questions}
    published_question_ids = [question_id for question_id in configured_question_ids if question_id in question_by_id]
    submissions = latest_submissions_for_item(db, current_user.id, enrollment.id, item.id, published_question_ids)
    score = sum(float(submission.score or 0) for submission in submissions)
    total_score = sum(float(question_by_id[question_id].points or 0) for question_id in published_question_ids)
    pending_manual_count = sum(
        1 for submission in submissions if submission.status == SubmissionStatus.pending_manual
    )
    progress = db.scalar(
        select(ProgressRecord).where(
            ProgressRecord.enrollment_id == enrollment.id,
            ProgressRecord.lesson_item_id == item.id,
        )
    )
    passed = None
    if item.item_type == LessonItemType.quiz and submissions:
        passed = None if pending_manual_count else total_score > 0 and score / total_score >= 0.8

    return LessonItemSubmissionStateOut(
        item_id=item.id,
        enrollment_id=enrollment.id,
        score=score,
        total_score=total_score,
        passed=passed,
        pending_manual_count=pending_manual_count,
        completed_at=progress.completed_at if progress else None,
        submissions=[SubmissionOut.model_validate(submission) for submission in submissions],
    )


@router.delete("/items/{item_id}/submissions")
def reset_item_submissions(
    item_id: int,
    enrollment_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    item, enrollment = get_student_lesson_item(item_id, current_user, db, enrollment_id)
    if item.item_type not in {LessonItemType.exercise, LessonItemType.quiz}:
        raise HTTPException(status_code=400, detail="Lesson item has no question submissions")
    if enrollment.status == "completed":
        raise HTTPException(status_code=409, detail="Course is completed; submissions are read-only")

    configured_question_ids = item_question_ids(item)
    if configured_question_ids:
        db.execute(
            delete(Submission).where(
                Submission.user_id == current_user.id,
                Submission.enrollment_id == enrollment.id,
                Submission.lesson_item_id == item.id,
                Submission.question_id.in_(configured_question_ids),
            )
        )
    progress = db.scalar(
        select(ProgressRecord).where(
            ProgressRecord.enrollment_id == enrollment.id,
            ProgressRecord.lesson_item_id == item.id,
        )
    )
    if progress:
        db.delete(progress)
    update_enrollment_progress(db, enrollment)
    db.commit()
    return {"status": "reset"}


@router.post("/questions/{question_id}/submit", response_model=SubmissionOut)
def submit_answer(
    question_id: int,
    payload: SubmissionIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Submission:
    question = db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.status != QuestionStatus.published:
        raise HTTPException(status_code=404, detail="Question not found")

    enrollment_id = payload.enrollment_id
    lesson_item_id = payload.lesson_item_id
    if lesson_item_id is not None:
        item, enrollment = get_student_lesson_item(lesson_item_id, current_user, db, enrollment_id)
        if item.item_type not in {LessonItemType.exercise, LessonItemType.quiz}:
            raise HTTPException(status_code=400, detail="Lesson item has no question submissions")
        if question.id not in item_question_ids(item):
            raise HTTPException(status_code=400, detail="Question does not belong to this lesson item")
        if enrollment.status == "completed":
            raise HTTPException(status_code=409, detail="Course is completed; submissions are read-only")
        enrollment_id = enrollment.id

    score = None
    status = SubmissionStatus.pending_manual
    feedback = None
    if not question.requires_manual_grading:
        score = auto_grade_score(question, payload.answer)
        status = SubmissionStatus.auto_graded
        feedback = "鑷姩鍒ゅ嵎瀹屾垚"

    submission = Submission(
        user_id=current_user.id,
        question_id=question.id,
        enrollment_id=enrollment_id,
        lesson_item_id=lesson_item_id,
        answer=payload.answer,
        score=score,
        status=status,
        feedback=feedback,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


@router.post("/items/{item_id}/submit-quiz", response_model=QuizSubmissionOut)
def submit_quiz_paper(
    item_id: int,
    payload: QuizSubmissionIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizSubmissionOut:
    item = db.scalar(
        select(LessonItem)
        .where(LessonItem.id == item_id)
        .options(joinedload(LessonItem.chapter))
    )
    if not item:
        raise HTTPException(status_code=404, detail="Lesson item not found")
    if item.item_type != LessonItemType.quiz:
        raise HTTPException(status_code=400, detail="Lesson item is not a quiz")

    enrollment_stmt = select(Enrollment).where(
        Enrollment.user_id == current_user.id,
        Enrollment.course_id == item.chapter.course_id,
    )
    if payload.enrollment_id is not None:
        enrollment_stmt = enrollment_stmt.where(Enrollment.id == payload.enrollment_id)
    enrollment = db.scalar(enrollment_stmt)
    if not enrollment:
        raise HTTPException(status_code=403, detail="No enrollment for this lesson")
    if enrollment.status == "completed":
        raise HTTPException(status_code=409, detail="Course is completed; submissions are read-only")

    configured_question_ids = [
        int(question_id)
        for question_id in (item.body or {}).get("question_ids", [])
        if isinstance(question_id, int)
    ]
    if not configured_question_ids:
        raise HTTPException(status_code=400, detail="Quiz has no questions")

    answers_by_question_id = {answer.question_id: answer.answer for answer in payload.answers}
    questions = list(
        db.scalars(
            select(Question)
            .where(
                Question.id.in_(configured_question_ids),
                Question.status == QuestionStatus.published,
                Question.type != QuestionType.code_review,
            )
        )
    )
    question_by_id = {question.id: question for question in questions}
    published_question_ids = set(question_by_id)
    missing_question_ids = [
        question_id
        for question_id in configured_question_ids
        if question_id in published_question_ids and question_id not in answers_by_question_id
    ]
    unexpected_question_ids = [
        question_id
        for question_id in answers_by_question_id
        if question_id not in published_question_ids
    ]
    if missing_question_ids:
        raise HTTPException(status_code=400, detail="Quiz answers are incomplete")
    if unexpected_question_ids:
        raise HTTPException(status_code=400, detail="Quiz answer contains invalid question")

    submissions: list[Submission] = []
    for question_id in configured_question_ids:
        question = question_by_id.get(question_id)
        if not question:
            continue

        score = None
        status = SubmissionStatus.pending_manual
        feedback = None
        if not question.requires_manual_grading:
            score = auto_grade_score(question, answers_by_question_id[question.id])
            status = SubmissionStatus.auto_graded
            feedback = "鑷姩鍒ゅ嵎瀹屾垚"

        submission = Submission(
            user_id=current_user.id,
            question_id=question.id,
            enrollment_id=enrollment.id,
            lesson_item_id=item.id,
            answer=answers_by_question_id[question.id],
            score=score,
            status=status,
            feedback=feedback,
        )
        db.add(submission)
        submissions.append(submission)

    db.flush()
    quiz_state = update_quiz_progress_from_submissions(db, item, enrollment)

    db.commit()
    for submission in submissions:
        db.refresh(submission)

    return QuizSubmissionOut(
        status=str(quiz_state["status"]),
        score=float(quiz_state["score"]),
        total_score=float(quiz_state["total_score"]),
        passed=quiz_state["passed"] if isinstance(quiz_state["passed"], bool) else None,
        pending_manual_count=int(quiz_state["pending_manual_count"]),
        submissions=[SubmissionOut.model_validate(submission) for submission in submissions],
    )



