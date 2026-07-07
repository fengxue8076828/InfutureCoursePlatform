from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse
import zipfile
import xml.etree.ElementTree as ET

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user
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
    User,
    UserRole,
)
from app.models import SubmissionStatus
from app.schemas import (
    AuthOut,
    ChapterNoteIn,
    ChapterNoteOut,
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
    StudentPostCreate,
    StudentPostOut,
    StudentProfileSummaryOut,
    StudentPublicProfileOut,
    StudentQuestionOut,
    StudentSocialHomeOut,
)

router = APIRouter()


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
    return list(
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


def post_out(post: StudentPost) -> StudentPostOut:
    return StudentPostOut(
        id=post.id,
        user_id=post.user_id,
        student_name=post.user.full_name if post.user else "Student",
        avatar_url=post.user.avatar_url if post.user else None,
        content=post.content,
        course_id=post.course_id,
        course_title=post.course.title if post.course else None,
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


def student_points_summary(user: User, enrollments: list[Enrollment], db: Session) -> tuple[int, int, list[str]]:
    week_start = datetime.utcnow() - timedelta(days=7)
    submissions = list(db.scalars(select(Submission).where(Submission.user_id == user.id)))
    assessment_points = sum(int(submission.score or 0) for submission in submissions)
    weekly_points = sum(int(submission.score or 0) for submission in submissions if submission.created_at and submission.created_at >= week_start)
    progress_points = sum(round(float(enrollment.progress_percent or 0) * 0.8) for enrollment in enrollments)
    completion_bonus = sum(80 for enrollment in enrollments if enrollment.status == "completed")
    total_points = assessment_points + progress_points + completion_bonus
    achievements: list[str] = []
    if enrollments:
        achievements.append("\u5df2\u5f00\u542f\u4e2a\u4eba\u5b66\u4e60\u65c5\u7a0b")
    if any(float(enrollment.progress_percent or 0) >= 50 for enrollment in enrollments):
        achievements.append("\u8bfe\u7a0b\u8fdb\u5ea6\u7a81\u7834 50%")
    if any(enrollment.status == "completed" for enrollment in enrollments):
        achievements.append("\u5b8c\u6210\u4e00\u95e8\u8bfe\u7a0b")
    if assessment_points > 0:
        achievements.append("\u5b8c\u6210\u9898\u5e93\u7ec3\u4e60")
    if not achievements:
        achievements.append("\u51c6\u5907\u5f00\u59cb\u5b66\u4e60")
    return total_points, weekly_points, achievements


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
            .options(joinedload(StudentPost.user), joinedload(StudentPost.course))
            .order_by(StudentPost.created_at.desc())
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
    total_points, weekly_points, achievements = student_points_summary(current_user, enrollments, db)
    return StudentSocialHomeOut(
        profile=user_profile_summary(current_user, include_email=True),
        active_courses=active_courses,
        completed_courses=completed_courses,
        recommended_courses=recommended_courses,
        total_points=total_points,
        weekly_points=weekly_points,
        achievements=achievements,
        posts=[post_out(post) for post in posts],
        suggested_students=[user_profile_summary(student) for student in suggested_students],
        following_ids=following_ids,
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
    post = StudentPost(user_id=current_user.id, course_id=payload.course_id, content=payload.content.strip())
    db.add(post)
    db.commit()
    post = db.scalar(
        select(StudentPost)
        .where(StudentPost.id == post.id)
        .options(joinedload(StudentPost.user), joinedload(StudentPost.course))
    )
    if not post:
        raise HTTPException(status_code=500, detail="Post was not created")
    return post_out(post)


@router.get("/students/{student_id}/profile", response_model=StudentPublicProfileOut)
def student_public_profile(
    student_id: int,
    current_user: User = Depends(get_current_user),
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
            .options(joinedload(StudentPost.user), joinedload(StudentPost.course))
            .order_by(StudentPost.created_at.desc())
            .limit(12)
        )
    )
    is_following = db.scalar(
        select(StudentFollow).where(StudentFollow.follower_id == current_user.id, StudentFollow.followee_id == student.id)
    ) is not None
    return StudentPublicProfileOut(
        profile=user_profile_summary(student),
        active_courses=active_courses,
        completed_courses=completed_courses,
        posts=[post_out(post) for post in posts],
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


def community_answer_out(answer: CommunityAnswer, current_user_id: int, db: Session) -> CommunityAnswerOut:
    return CommunityAnswerOut(
        id=answer.id,
        question_id=answer.community_question_id,
        user_id=answer.user_id,
        student_name=answer.user.full_name if answer.user else "Student",
        avatar_url=answer.user.avatar_url if answer.user else None,
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



def ensure_community_demo_data(db: Session, current_user: User) -> None:
    question_count = db.scalar(select(func.count()).select_from(CommunityQuestion)) or 0
    note_count = db.scalar(select(func.count()).select_from(CommunityNoteShare)) or 0
    if question_count and note_count:
        return

    demo_profiles = [
        ("community.anna@example.com", "\u5b89\u5a1c", "Europe", "\u559c\u6b22\u8bed\u8a00\u5b66\u4e60\u548c\u5199\u4f5c\u5206\u4eab\u3002"),
        ("community.ming@example.com", "\u660e\u660e", "Asia", "\u6b63\u5728\u5237\u9898\u548c\u6574\u7406\u7b14\u8bb0\u3002"),
        ("community.sofia@example.com", "Sofia", "Europe", "\u559c\u6b22\u628a\u590d\u6742\u95ee\u9898\u8bb2\u6e05\u695a\u3002"),
    ]
    demo_users: list[User] = []
    for email, name, region, bio in demo_profiles:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                full_name=name,
                role=UserRole.student,
                hashed_password=None,
                auth_provider="community_demo",
                region=region,
                bio=bio,
                is_active=True,
            )
            db.add(user)
            db.flush()
        demo_users.append(user)

    enrollments = load_enrollments_for_user(db, current_user.id)
    first_course = enrollments[0].course if enrollments else None
    first_chapter = (first_course.chapters or [None])[0] if first_course and first_course.chapters else None

    if not question_count:
        questions = [
            CommunityQuestion(
                user_id=demo_users[0].id,
                title="\u5199\u4f5c\u91cc\u600e\u4e48\u8ba9\u53e5\u5b50\u66f4\u81ea\u7136\uff1f",
                body="\u6211\u5199\u82f1\u6587\u6bb5\u843d\u65f6\uff0c\u603b\u611f\u89c9\u53e5\u5b50\u50cf\u662f\u76f4\u8bd1\u3002\u5927\u5bb6\u6709\u6ca1\u6709\u68c0\u67e5\u53e5\u5b50\u81ea\u7136\u5ea6\u7684\u65b9\u6cd5\uff1f",
                tags={"items": ["\u5199\u4f5c", "A1", "\u8bed\u8a00"]},
            ),
            CommunityQuestion(
                user_id=demo_users[1].id,
                title="\u505a\u591a\u9009\u9898\u65f6\u5e94\u8be5\u5148\u6392\u9664\u8fd8\u662f\u5148\u627e\u5173\u952e\u8bcd\uff1f",
                body="\u6709\u4e9b\u9009\u9879\u770b\u8d77\u6765\u90fd\u5bf9\uff0c\u60f3\u542c\u542c\u5927\u5bb6\u7684\u505a\u9898\u987a\u5e8f\u3002",
                tags={"items": ["\u7b54\u9898\u6280\u5de7", "\u591a\u9009\u9898"]},
            ),
            CommunityQuestion(
                user_id=current_user.id,
                title="\u8fd9\u4e00\u7ae0\u7684\u91cd\u70b9\u5e94\u8be5\u600e\u4e48\u590d\u4e60\uff1f",
                body="\u6211\u60f3\u628a\u7ae0\u8282\u7b14\u8bb0\u6574\u7406\u6210\u590d\u4e60\u6e05\u5355\uff0c\u4f46\u4e0d\u77e5\u9053\u5148\u6293\u54ea\u4e9b\u70b9\u3002",
                course_id=first_course.id if first_course else None,
                chapter_id=first_chapter.id if first_chapter else None,
                tags={"items": ["\u590d\u4e60", "\u7ae0\u8282\u7b14\u8bb0"]},
            ),
        ]
        db.add_all(questions)
        db.flush()
        db.add_all([
            CommunityAnswer(community_question_id=questions[0].id, user_id=demo_users[2].id, body="\u53ef\u4ee5\u5148\u628a\u4e2d\u6587\u610f\u601d\u6539\u6210\u82f1\u6587\u5e38\u89c1\u642d\u914d\uff0c\u518d\u8bfb\u4e00\u904d\u770b\u8fde\u8d2f\u6027\u3002", likes_count=4),
            CommunityAnswer(community_question_id=questions[1].id, user_id=demo_users[0].id, body="\u6211\u4f1a\u5148\u6807\u51fa\u9898\u5e72\u7684\u9650\u5b9a\u8bcd\uff0c\u518d\u6392\u9664\u7edd\u5bf9\u5316\u7684\u9009\u9879\u3002", likes_count=3),
            CommunityAnswer(community_question_id=questions[2].id, user_id=demo_users[1].id, body="\u5148\u5217\u51fa\u672c\u7ae0\u4e09\u4e2a\u6838\u5fc3\u95ee\u9898\uff0c\u518d\u7528\u7ec3\u4e60\u9898\u53bb\u68c0\u67e5\u3002", likes_count=5),
        ])

    if not note_count:
        db.add_all([
            CommunityNoteShare(user_id=demo_users[0].id, title="A1 \u5199\u4f5c\u590d\u4e60\u6e05\u5355", content="1. \u5148\u770b\u9898\u76ee\u8981\u6c42\n2. \u5199\u51fa\u4e3b\u8c13\u5bbe\n3. \u52a0\u4e00\u4e2a\u539f\u56e0\u6216\u4f8b\u5b50", likes_count=8),
            CommunityNoteShare(user_id=demo_users[1].id, title="\u591a\u9009\u9898\u6392\u9664\u6cd5", content="\u4e0d\u786e\u5b9a\u65f6\u5148\u770b\u9650\u5b9a\u8bcd\uff0c\u518d\u6bd4\u8f83\u9009\u9879\u95f4\u7684\u8303\u56f4\u5dee\u5f02\u3002", likes_count=6),
            CommunityNoteShare(user_id=demo_users[2].id, title="\u542c\u8bfe\u7b14\u8bb0\u600e\u4e48\u8bb0", content="\u7528\u95ee\u9898\u5f0f\u7b14\u8bb0\uff1a\u8fd9\u8282\u8bfe\u89e3\u51b3\u4ec0\u4e48\uff1f\u6211\u8fd8\u5361\u5728\u54ea\u91cc\uff1f", likes_count=5),
        ])

    if demo_users and not db.scalar(select(StudentFollow).where(StudentFollow.follower_id == current_user.id, StudentFollow.followee_id == demo_users[0].id)):
        db.add(StudentFollow(follower_id=current_user.id, followee_id=demo_users[0].id))
    db.commit()

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunityHomeOut:
    ensure_student_user(current_user)
    ensure_community_demo_data(db, current_user)
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

    enrollments = load_enrollments_for_user(db, current_user.id)
    enrolled_course_ids = [enrollment.course_id for enrollment in enrollments]
    recommended_stmt = select(CommunityQuestion).where(CommunityQuestion.user_id != current_user.id).options(*question_options())
    if search:
        recommended_stmt = recommended_stmt.where(or_(CommunityQuestion.title.ilike(pattern), CommunityQuestion.body.ilike(pattern)))
    elif enrolled_course_ids:
        recommended_stmt = recommended_stmt.where(
            or_(
                CommunityQuestion.course_id.in_(enrolled_course_ids),
                CommunityQuestion.course_id.is_(None),
                CommunityQuestion.linked_question_id.is_not(None),
            )
        )
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

    student_stmt = select(User).where(User.role == UserRole.student, User.is_active.is_(True), User.id != current_user.id).limit(40)
    if search:
        student_stmt = student_stmt.where(or_(User.full_name.ilike(pattern), User.bio.ilike(pattern), User.region.ilike(pattern)))
    students = list(db.scalars(student_stmt))
    hot_students = sorted(students, key=lambda student: community_points_for_user(db, student.id), reverse=True)[:8]

    following_ids = list(db.scalars(select(StudentFollow.followee_id).where(StudentFollow.follower_id == current_user.id)))
    reference_questions = list(
        db.scalars(
            select(Question)
            .where(Question.status == QuestionStatus.published)
            .order_by(Question.updated_at.desc())
            .limit(80)
        )
    )
    recent_messages = list(
        db.scalars(
            select(CommunityMessage)
            .where(or_(CommunityMessage.sender_id == current_user.id, CommunityMessage.receiver_id == current_user.id))
            .options(joinedload(CommunityMessage.sender), joinedload(CommunityMessage.receiver))
            .order_by(CommunityMessage.created_at.desc())
            .limit(10)
        )
    )

    return CommunityHomeOut(
        questions=[community_question_out(question, current_user.id, db) for question in questions],
        recommended_questions=[community_question_out(question, current_user.id, db) for question in recommended_questions],
        notes=[community_note_out(note, current_user.id, db) for note in notes],
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
        community_points=community_points_for_user(db, current_user.id),
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
            select(Question).where(Question.id == payload.linked_question_id, Question.status == QuestionStatus.published)
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
    if target_type == "answer":
        target = db.get(CommunityAnswer, target_id)
    elif target_type == "note":
        target = db.get(CommunityNoteShare, target_id)
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
        target.likes_count = max(0, int(target.likes_count or 0) - 1)
        liked = False
    else:
        db.add(CommunityReaction(user_id=current_user.id, target_type=target_type, target_id=target_id))
        target.likes_count = int(target.likes_count or 0) + 1
        liked = True
        if target_type == "note":
            add_student_timeline_post(db, current_user.id, f"\u6211\u5173\u6ce8\u4e86\u4e00\u7bc7\u793e\u533a\u7b14\u8bb0\uff1a{target.title}", target.course_id)
    db.commit()
    return {"liked": liked, "likes_count": int(target.likes_count or 0)}


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

    if user is None:
        user = db.scalar(select(User).where(User.email == payload.email))
        if user and user.role != UserRole.student:
            raise HTTPException(status_code=409, detail="Email belongs to a non-student account")

    if user is None:
        user = User(
            email=str(payload.email),
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
        select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course.id)
    )
    created_enrollment = enrollment is None
    if enrollment is None:
        first_item = next(
            (
                item
                for chapter in sorted(course.chapters, key=lambda chapter: chapter.position)
                for item in sorted(chapter.items, key=lambda lesson_item: lesson_item.position)
            ),
            None,
        )
        enrollment = Enrollment(
            user_id=user.id,
            course_id=course.id,
            status="active",
            current_item_id=first_item.id if first_item else None,
            progress_percent=0,
        )
        db.add(enrollment)
    else:
        enrollment.status = "active"

    subscription = db.scalar(
        select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.course_id == course.id,
            Subscription.status == "active",
        )
    )
    if subscription is None:
        subscription = Subscription(
            user_id=user.id,
            course_id=course.id,
            amount_eur_monthly=39,
            status="active",
            current_period_end=datetime.utcnow() + timedelta(days=30),
            payment_provider="simulated",
        )
        db.add(subscription)

    if created_enrollment:
        course.students_count = (course.students_count or 0) + 1

    db.commit()
    db.refresh(user)
    db.refresh(enrollment)
    db.refresh(subscription)

    enrollment = db.scalar(
        select(Enrollment)
        .where(Enrollment.id == enrollment.id)
        .options(
            joinedload(Enrollment.course).joinedload(Course.institution),
            joinedload(Enrollment.course).joinedload(Course.teacher),
            joinedload(Enrollment.course).selectinload(Course.chapters).selectinload(CourseChapter.items),
        )
    )
    if not enrollment:
        raise HTTPException(status_code=500, detail="Enrollment was not created")

    return SubscribeCourseOut(
        auth=AuthOut(access_token=f"demo-token-{user.id}", user=user),
        enrollment=EnrollmentOut.model_validate(enrollment),
        subscription_status=subscription.status,
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
    if enrollment.progress_percent >= 100:
        enrollment.status = "completed"

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
        .where(Question.status == QuestionStatus.published)
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


def latest_submissions_for_item(
    db: Session,
    user_id: int,
    enrollment_id: int,
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
            )
        )
    )
    question_by_id = {question.id: question for question in questions}
    published_question_ids = [question_id for question_id in configured_question_ids if question_id in question_by_id]
    submissions = latest_submissions_for_item(db, current_user.id, enrollment.id, published_question_ids)
    score = sum(float(submission.score or 0) for submission in submissions)
    total_score = sum(float(question_by_id[question_id].points or 0) for question_id in published_question_ids)
    progress = db.scalar(
        select(ProgressRecord).where(
            ProgressRecord.enrollment_id == enrollment.id,
            ProgressRecord.lesson_item_id == item.id,
        )
    )
    passed = None
    if item.item_type == LessonItemType.quiz and submissions:
        passed = total_score > 0 and score / total_score >= 0.8

    return LessonItemSubmissionStateOut(
        item_id=item.id,
        enrollment_id=enrollment.id,
        score=score,
        total_score=total_score,
        passed=passed,
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

    configured_question_ids = item_question_ids(item)
    if configured_question_ids:
        db.execute(
            delete(Submission).where(
                Submission.user_id == current_user.id,
                Submission.enrollment_id == enrollment.id,
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
        enrollment_id=payload.enrollment_id,
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

    score_total = 0.0
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
            score_total += float(score)
            status = SubmissionStatus.auto_graded
            feedback = "鑷姩鍒ゅ嵎瀹屾垚"

        submission = Submission(
            user_id=current_user.id,
            question_id=question.id,
            enrollment_id=enrollment.id,
            answer=answers_by_question_id[question.id],
            score=score,
            status=status,
            feedback=feedback,
        )
        db.add(submission)
        submissions.append(submission)

    total_score = sum(float(question.points or 0) for question in questions)
    passed = total_score > 0 and score_total / total_score >= 0.8
    if passed:
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
        progress.notes = None
        progress.score = score_total

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
        if enrollment.progress_percent >= 100:
            enrollment.status = "completed"

    db.commit()
    for submission in submissions:
        db.refresh(submission)

    return QuizSubmissionOut(
        status="passed" if passed else "failed",
        score=score_total,
        total_score=total_score,
        passed=passed,
        submissions=[SubmissionOut.model_validate(submission) for submission in submissions],
    )



