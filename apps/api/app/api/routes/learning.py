from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse
import zipfile
import xml.etree.ElementTree as ET

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    ChapterNote,
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
    User,
    UserRole,
)
from app.models import SubmissionStatus
from app.schemas import (
    AuthOut,
    ChapterNoteIn,
    ChapterNoteOut,
    CompleteItemIn,
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
    StudentQuestionOut,
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
        next_lesson_title=next_item.title if next_item else "开始第一节课",
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
        .options(selectinload(Question.options), selectinload(Question.media_assets))
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
        feedback = "自动判卷完成"

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
            feedback = "自动判卷完成"

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
