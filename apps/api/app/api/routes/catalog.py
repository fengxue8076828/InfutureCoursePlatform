from datetime import timedelta, timezone

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.session import get_db
from app.models import (
    ActivityRegistration,
    ActivityRegistrationStatus,
    BlogPost,
    Competition,
    CompetitionQuestion,
    CompetitionRegistration,
    CompetitionSubmission,
    Course,
    CourseCategory,
    CourseChapter,
    CourseReview,
    CourseStatus,
    ExamPaper,
    ExamPaperKind,
    ExamPaperQuestion,
    ExamPaperStatus,
    ExamPaperSubmission,
    ExamSubmissionStatus,
    Institution,
    InstitutionActivity,
    LearningPath,
    LearningPathCourse,
    LearningPathStatus,
    Teacher,
    User,
    UserRole,
    Enrollment,
    ProgressRecord,
    Question,
    QuestionStatus,
    Submission,
)
from app.schemas import (
    BlogPostOut,
    CourseCardOut,
    CourseCategoryOut,
    CourseDetailOut,
    InstitutionOut,
    LearningPathCourseOut,
    LearningPathOut,
    PublicActivityHomeOut,
    PublicActivityOut,
    PublicActivityRegistrationCreate,
    PublicActivityRegistrationOut,
    PublicCompetitionRegistrationCreate,
    CompetitionRegistrationOut,
    CompetitionSubmissionOut,
    PublicExamPaperOut,
    PublicExamPaperQuestionOut,
    PublicCompetitionOut,
    PublicCompetitionQuestionOut,
    PublicExamSubmissionCreate,
    ExamPaperSubmissionOut,
    PublicInstitutionCardOut,
    PublicInstitutionDirectoryOut,
    PublicInstitutionProfileOut,
    StudentLeaderboardDetailOut,
    StudentLeaderboardOut,
    StudentQuestionOut,
    TeacherOut,
)
from app.services.points import aware_now, build_leaderboard_entry, calculate_student_point_detail, leaderboard_rows

router = APIRouter()


def attach_course_ratings(db: Session, courses: list[Course]) -> list[Course]:
    course_ids = [course.id for course in courses]
    if not course_ids:
        return courses
    rating_rows = db.execute(
        select(
            CourseReview.course_id,
            func.avg(CourseReview.rating),
            func.count(CourseReview.id),
        )
        .where(CourseReview.course_id.in_(course_ids))
        .group_by(CourseReview.course_id)
    ).all()
    ratings = {
        course_id: (round(float(average or 0), 1), int(count or 0))
        for course_id, average, count in rating_rows
    }
    for course in courses:
        average, count = ratings.get(course.id, (0.0, 0))
        setattr(course, "rating_average", average)
        setattr(course, "rating_count", count)
    return courses


def attach_course_learning_paths(db: Session, courses: list[Course]) -> list[Course]:
    if not courses:
        return courses
    course_ids = [course.id for course in courses]
    rows = db.execute(
        select(
            LearningPathCourse.course_id,
            LearningPath.id,
            LearningPath.slug,
            LearningPath.title,
            LearningPathCourse.position,
        )
        .join(LearningPath, LearningPath.id == LearningPathCourse.learning_path_id)
        .where(
            LearningPathCourse.course_id.in_(course_ids),
            LearningPath.status == LearningPathStatus.published,
        )
        .order_by(LearningPath.title, LearningPathCourse.position)
    ).all()
    paths_by_course: dict[int, list[dict[str, int | str]]] = {course_id: [] for course_id in course_ids}
    for course_id, path_id, slug, title, position in rows:
        paths_by_course.setdefault(course_id, []).append(
            {"id": path_id, "slug": slug, "title": title, "position": position}
        )
    for course in courses:
        setattr(course, "learning_paths", paths_by_course.get(course.id, []))
    return courses


def public_activity_to_out(activity: InstitutionActivity) -> PublicActivityOut:
    return PublicActivityOut(
        id=activity.id,
        institution_id=activity.institution_id,
        institution_name=activity.institution.name if activity.institution else "",
        institution_logo_url=activity.institution.logo_url if activity.institution else None,
        title=activity.title,
        description=activity.description,
        starts_at=activity.starts_at,
        ends_at=activity.ends_at,
        mode=activity.mode,
        meeting_url=activity.meeting_url,
        location=activity.location,
        audience=activity.audience,
        registration_status=activity.registration_status,
        capacity=activity.capacity,
        registrations_count=len(activity.registrations),
    )


def public_learning_path_to_out(path: LearningPath) -> LearningPathOut:
    links = [
        link
        for link in sorted(path.course_links, key=lambda item: item.position)
        if link.course and link.course.status == CourseStatus.published
    ]
    return LearningPathOut(
        id=path.id,
        slug=path.slug,
        title=path.title,
        subtitle=path.subtitle,
        description=path.description,
        cover_url=path.cover_url,
        intro_video_url=path.intro_video_url,
        audience=path.audience,
        level=path.level,
        status=path.status,
        institution=InstitutionOut.model_validate(path.institution),
        course_count=len(links),
        courses=[
            LearningPathCourseOut(
                id=link.id,
                position=link.position,
                course=CourseCardOut.model_validate(link.course),
            )
            for link in links
        ],
        created_at=path.created_at,
        updated_at=path.updated_at,
    )


def public_learning_path_stmt():
    return select(LearningPath).options(
        joinedload(LearningPath.institution),
        selectinload(LearningPath.course_links)
        .joinedload(LearningPathCourse.course)
        .joinedload(Course.institution),
        selectinload(LearningPath.course_links)
        .joinedload(LearningPathCourse.course)
        .joinedload(Course.teacher)
        .joinedload(Teacher.institution),
    )


def public_exam_paper_stmt():
    return select(ExamPaper).options(
        joinedload(ExamPaper.institution),
        joinedload(ExamPaper.category),
        selectinload(ExamPaper.registrations),
        selectinload(ExamPaper.question_links)
        .joinedload(ExamPaperQuestion.question)
        .selectinload(Question.options),
        selectinload(ExamPaper.question_links)
        .joinedload(ExamPaperQuestion.question)
        .selectinload(Question.media_assets),
    )


def public_exam_paper_to_out(paper: ExamPaper, include_questions: bool = False) -> PublicExamPaperOut:
    links = sorted(paper.question_links, key=lambda link: link.position)
    return PublicExamPaperOut(
        id=paper.id,
        institution_id=paper.institution_id,
        slug=paper.slug,
        title=paper.title,
        description=paper.description,
        cover_url=paper.cover_url,
        instructions=paper.instructions,
        audience=paper.audience,
        kind=paper.kind,
        source_type=paper.source_type,
        past_year=paper.past_year,
        duration_minutes=paper.duration_minutes,
        status=paper.status,
        starts_at=paper.starts_at,
        ends_at=paper.ends_at,
        institution=InstitutionOut.model_validate(paper.institution),
        category=CourseCategoryOut.model_validate(paper.category) if paper.category else None,
        questions_count=len(links),
        registrations_count=len(paper.registrations),
        questions=[
            PublicExamPaperQuestionOut(
                id=link.id,
                position=link.position,
                points=link.points_override if link.points_override is not None else link.question.points,
                question=StudentQuestionOut.model_validate(link.question),
            )
            for link in links
            if include_questions and link.question
        ],
    )


def public_competition_stmt():
    return select(Competition).options(
        joinedload(Competition.institution),
        joinedload(Competition.category),
        selectinload(Competition.registrations),
        selectinload(Competition.question_links)
        .joinedload(CompetitionQuestion.question)
        .selectinload(Question.options),
        selectinload(Competition.question_links)
        .joinedload(CompetitionQuestion.question)
        .selectinload(Question.media_assets),
    )


def public_competition_to_out(competition: Competition, include_questions: bool = False) -> PublicCompetitionOut:
    links = sorted(competition.question_links, key=lambda link: link.position)
    return PublicCompetitionOut(
        id=competition.id,
        institution_id=competition.institution_id,
        slug=competition.slug,
        title=competition.title,
        description=competition.description,
        cover_url=competition.cover_url,
        instructions=competition.instructions,
        audience=competition.audience,
        difficulty=competition.difficulty,
        prizes=competition.prizes or [],
        duration_minutes=competition.duration_minutes,
        status=competition.status,
        starts_at=competition.starts_at,
        ends_at=competition.ends_at,
        institution=InstitutionOut.model_validate(competition.institution),
        category=CourseCategoryOut.model_validate(competition.category) if competition.category else None,
        questions_count=len(links),
        registrations_count=len(competition.registrations),
        questions=[
            PublicCompetitionQuestionOut(
                id=link.id,
                position=link.position,
                points=link.points_override if link.points_override is not None else link.question.points,
                question=StudentQuestionOut.model_validate(link.question),
            )
            for link in links
            if include_questions and link.question
        ],
    )


def normalized_text(value: object) -> str:
    return str(value or "").strip().lower()


def selected_labels(answer: object) -> set[str]:
    if isinstance(answer, dict):
        raw_value = answer.get("labels") or answer.get("selected_labels") or answer.get("selected") or answer.get("answer")
    else:
        raw_value = answer
    if raw_value is None:
        return set()
    if isinstance(raw_value, list):
        return {normalized_text(item) for item in raw_value if normalized_text(item)}
    return {normalized_text(raw_value)} if normalized_text(raw_value) else set()


def text_answers(answer: object) -> list[str]:
    if isinstance(answer, dict):
        raw_value = answer.get("answers") or answer.get("blanks") or answer.get("answer") or answer.get("text")
    else:
        raw_value = answer
    if raw_value is None:
        return []
    if isinstance(raw_value, list):
        return [normalized_text(item) for item in raw_value]
    return [normalized_text(raw_value)]


def is_question_correct(question, answer: object) -> bool:
    if question.type.value == "single_choice":
        correct = normalized_text(question.answer_key.get("answer"))
        return bool(correct) and selected_labels(answer) == {correct}
    if question.type.value == "multiple_choice":
        correct = {normalized_text(item) for item in question.answer_key.get("answers", []) if normalized_text(item)}
        return bool(correct) and selected_labels(answer) == correct
    if question.type.value == "fill_blank":
        correct = [normalized_text(item) for item in question.answer_key.get("answers", []) if normalized_text(item)]
        submitted = [item for item in text_answers(answer) if item]
        return bool(correct) and submitted == correct
    if question.type.value == "true_false":
        correct = normalized_text(question.answer_key.get("answer"))
        return bool(correct) and normalized_text(answer.get("answer") if isinstance(answer, dict) else answer) == correct
    return False


def score_question_links(question_links: list, answers: dict) -> tuple[float, float, ExamSubmissionStatus]:
    score = 0.0
    total_score = 0.0
    has_manual = False
    for link in sorted(question_links, key=lambda item: item.position):
        question = link.question
        if not question:
            continue
        points = float(link.points_override if link.points_override is not None else question.points)
        total_score += points
        answer = answers.get(str(question.id), answers.get(question.id))
        if question.requires_manual_grading:
            has_manual = True
            continue
        if is_question_correct(question, answer):
            score += points
    status = ExamSubmissionStatus.pending_manual if has_manual else ExamSubmissionStatus.graded
    return score, total_score, status


def score_exam_submission(paper: ExamPaper, answers: dict) -> tuple[float, float, ExamSubmissionStatus]:
    return score_question_links(list(paper.question_links), answers)


def score_competition_submission(competition: Competition, answers: dict) -> tuple[float, float, ExamSubmissionStatus]:
    return score_question_links(list(competition.question_links), answers)


def get_public_exam_paper_or_404(slug: str, kind: ExamPaperKind, db: Session) -> ExamPaper:
    paper = db.scalar(
        public_exam_paper_stmt().where(
            ExamPaper.slug == slug,
            ExamPaper.kind == kind,
            ExamPaper.status == ExamPaperStatus.published,
        )
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Exam paper not found")
    return paper


def get_public_competition_or_404(slug: str, db: Session) -> Competition:
    competition = db.scalar(
        public_competition_stmt().where(
            Competition.slug == slug,
            Competition.status == ExamPaperStatus.published,
        )
    )
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    return competition


def institution_directory_stmt():
    return select(Institution).options(
        selectinload(Institution.courses),
        selectinload(Institution.teachers),
        selectinload(Institution.activities),
        selectinload(Institution.learning_paths),
        selectinload(Institution.exam_papers),
        selectinload(Institution.competitions),
    )


def public_institution_card_to_out(institution: Institution) -> PublicInstitutionCardOut:
    courses = [course for course in institution.courses if course.status == CourseStatus.published]
    learning_paths = [path for path in institution.learning_paths if path.status == LearningPathStatus.published]
    exam_papers = [paper for paper in institution.exam_papers if paper.status == ExamPaperStatus.published]
    competitions = [competition for competition in institution.competitions if competition.status == ExamPaperStatus.published]
    students_count = sum(course.students_count for course in courses)
    resources_count = len(courses) + len(learning_paths) + len(exam_papers) + len(competitions) + len(institution.activities)
    rating = min(5.0, 4.2 + min(0.45, students_count / 1000) + min(0.25, resources_count * 0.025))
    return PublicInstitutionCardOut(
        institution=InstitutionOut.model_validate(institution),
        rating=round(rating, 1),
        students_count=students_count,
        courses_count=len(courses),
        teachers_count=len(institution.teachers),
        resources_count=resources_count,
        created_at=institution.created_at,
    )


@router.get("/institutions", response_model=list[InstitutionOut])
def list_institutions(db: Session = Depends(get_db)) -> list[Institution]:
    return list(db.scalars(select(Institution).order_by(Institution.name)))


@router.get("/institutions/directory", response_model=PublicInstitutionDirectoryOut)
def list_institution_directory(
    query: str | None = Query(default=None),
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> PublicInstitutionDirectoryOut:
    institutions = list(db.scalars(institution_directory_stmt().order_by(Institution.created_at.desc())).unique())
    cards = [public_institution_card_to_out(institution) for institution in institutions]
    if category:
        cards = [card for card in cards if card.institution.category == category]
    if query and query.strip():
        keyword = query.strip().lower()
        cards = [
            card
            for card in cards
            if keyword
            in " ".join(
                [
                    card.institution.name,
                    card.institution.description,
                    card.institution.region,
                    card.institution.category,
                ]
            ).lower()
        ]
    return PublicInstitutionDirectoryOut(
        institutions=cards,
        top_rated=sorted(cards, key=lambda card: (-card.rating, -card.resources_count))[:8],
        newest=sorted(cards, key=lambda card: card.created_at, reverse=True)[:8],
        most_students=sorted(cards, key=lambda card: (-card.students_count, -card.courses_count))[:8],
        categories=sorted({card.institution.category for card in cards if card.institution.category}),
    )


@router.get("/institutions/{slug}", response_model=PublicInstitutionProfileOut)
def get_institution_profile(slug: str, db: Session = Depends(get_db)) -> PublicInstitutionProfileOut:
    institution = db.scalar(institution_directory_stmt().where(Institution.slug == slug))
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")

    courses = list(
        db.scalars(
            select(Course)
            .where(Course.institution_id == institution.id, Course.status == CourseStatus.published)
            .options(joinedload(Course.institution), joinedload(Course.teacher).joinedload(Teacher.institution))
            .order_by(Course.updated_at.desc())
        )
    )
    teachers = list(
        db.scalars(
            select(Teacher)
            .where(Teacher.institution_id == institution.id)
            .options(joinedload(Teacher.institution))
            .order_by(Teacher.updated_at.desc())
        )
    )
    categories = list(
        db.scalars(
            select(CourseCategory)
            .where(CourseCategory.institution_id == institution.id, CourseCategory.is_active.is_(True))
            .order_by(CourseCategory.parent_id.nullsfirst(), CourseCategory.position, CourseCategory.name)
        )
    )
    activities = list(
        db.scalars(
            select(InstitutionActivity)
            .where(InstitutionActivity.institution_id == institution.id)
            .options(joinedload(InstitutionActivity.institution), selectinload(InstitutionActivity.registrations))
            .order_by(InstitutionActivity.starts_at.desc())
        )
    )
    learning_paths = list(
        db.scalars(
            public_learning_path_stmt().where(
                LearningPath.institution_id == institution.id,
                LearningPath.status == LearningPathStatus.published,
            )
        ).unique()
    )
    mock_exams = list(
        db.scalars(
            public_exam_paper_stmt()
            .where(
                ExamPaper.institution_id == institution.id,
                ExamPaper.status == ExamPaperStatus.published,
                ExamPaper.kind == ExamPaperKind.mock_exam,
            )
            .order_by(ExamPaper.updated_at.desc())
        ).unique()
    )
    competitions = list(
        db.scalars(
            public_competition_stmt()
            .where(
                Competition.institution_id == institution.id,
                Competition.status == ExamPaperStatus.published,
            )
            .order_by(Competition.updated_at.desc())
        ).unique()
    )
    question_count = db.scalar(
        select(func.count(Question.id)).where(
            Question.institution_id == institution.id,
            Question.status == QuestionStatus.published,
        )
    ) or 0

    return PublicInstitutionProfileOut(
        summary=public_institution_card_to_out(institution),
        categories=[CourseCategoryOut.model_validate(category_item) for category_item in categories],
        teachers=[TeacherOut.model_validate(teacher) for teacher in teachers],
        courses=[CourseCardOut.model_validate(course) for course in courses],
        learning_paths=[public_learning_path_to_out(path) for path in learning_paths],
        activities=[public_activity_to_out(activity) for activity in activities],
        mock_exams=[public_exam_paper_to_out(paper) for paper in mock_exams],
        competitions=[public_competition_to_out(competition) for competition in competitions],
        question_count=question_count,
    )


@router.get("/activities", response_model=PublicActivityHomeOut)
def list_public_activities(db: Session = Depends(get_db)) -> PublicActivityHomeOut:
    activities = list(
        db.scalars(
            select(InstitutionActivity)
            .options(joinedload(InstitutionActivity.institution), selectinload(InstitutionActivity.registrations))
            .order_by(InstitutionActivity.starts_at.desc(), InstitutionActivity.updated_at.desc())
        )
    )
    latest = activities[:6]
    popular = sorted(activities, key=lambda activity: (-len(activity.registrations), activity.starts_at))[:6]
    return PublicActivityHomeOut(
        latest=[public_activity_to_out(activity) for activity in latest],
        popular=[public_activity_to_out(activity) for activity in popular],
        activities=[public_activity_to_out(activity) for activity in activities],
    )


@router.post("/activities/{activity_id}/register", response_model=PublicActivityRegistrationOut)
def register_public_activity(
    activity_id: int,
    payload: PublicActivityRegistrationCreate,
    db: Session = Depends(get_db),
) -> ActivityRegistration:
    activity = db.scalar(
        select(InstitutionActivity)
        .where(InstitutionActivity.id == activity_id)
        .options(selectinload(InstitutionActivity.registrations))
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.registration_status != ActivityRegistrationStatus.open:
        raise HTTPException(status_code=422, detail="Activity registration is closed")
    if activity.capacity is not None and len(activity.registrations) >= activity.capacity:
        raise HTTPException(status_code=422, detail="Activity is full")

    email = str(payload.student_email).strip().lower()
    existing = db.scalar(
        select(ActivityRegistration).where(
            ActivityRegistration.activity_id == activity.id,
            ActivityRegistration.student_email == email,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="This email has already registered")

    registration = ActivityRegistration(
        activity_id=activity.id,
        student_name=payload.student_name.strip(),
        student_email=email,
        phone=payload.phone.strip() if payload.phone else None,
        note=payload.note.strip() if payload.note else None,
    )
    db.add(registration)
    db.commit()
    db.refresh(registration)
    return registration


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


@router.get("/learning-paths", response_model=list[LearningPathOut])
def list_learning_paths(
    query: str | None = Query(default=None),
    institution: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[LearningPathOut]:
    stmt = (
        public_learning_path_stmt()
        .where(LearningPath.status == LearningPathStatus.published)
        .order_by(LearningPath.updated_at.desc())
    )
    if query and query.strip():
        like_query = f"%{query.strip()}%"
        stmt = stmt.where(
            LearningPath.title.ilike(like_query)
            | LearningPath.subtitle.ilike(like_query)
            | LearningPath.description.ilike(like_query)
            | LearningPath.audience.ilike(like_query)
        )
    if institution:
        stmt = stmt.join(LearningPath.institution).where(Institution.slug == institution)
    return [public_learning_path_to_out(path) for path in db.scalars(stmt).unique()]


@router.get("/learning-paths/{slug}", response_model=LearningPathOut)
def get_learning_path(slug: str, db: Session = Depends(get_db)) -> LearningPathOut:
    path = db.scalar(
        public_learning_path_stmt().where(
            LearningPath.slug == slug,
            LearningPath.status == LearningPathStatus.published,
        )
    )
    if not path:
        raise HTTPException(status_code=404, detail="Learning path not found")
    return public_learning_path_to_out(path)


def normalize_started_at(started_at):
    value = started_at or aware_now()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value


def list_public_exam_papers(
    kind: ExamPaperKind,
    query: str | None,
    category_id: int | None,
    db: Session,
) -> list[PublicExamPaperOut]:
    stmt = (
        public_exam_paper_stmt()
        .where(ExamPaper.kind == kind, ExamPaper.status == ExamPaperStatus.published)
        .order_by(ExamPaper.updated_at.desc())
    )
    if category_id:
        stmt = stmt.where(ExamPaper.category_id == category_id)
    if query and query.strip():
        like_query = f"%{query.strip()}%"
        stmt = stmt.where(
            ExamPaper.title.ilike(like_query)
            | ExamPaper.description.ilike(like_query)
            | ExamPaper.audience.ilike(like_query)
        )
    return [public_exam_paper_to_out(paper) for paper in db.scalars(stmt).unique()]


def submit_public_exam_paper(
    paper: ExamPaper,
    payload: PublicExamSubmissionCreate,
    db: Session,
) -> ExamPaperSubmission:
    email = str(payload.student_email).strip().lower()
    now = aware_now()
    started_at = normalize_started_at(payload.started_at)
    if paper.kind == ExamPaperKind.competition:
        if not paper.starts_at or not paper.ends_at or now < paper.starts_at or now > paper.ends_at:
            raise HTTPException(status_code=422, detail="Competition is not open for submission")
        registration = db.scalar(
            select(CompetitionRegistration).where(
                CompetitionRegistration.paper_id == paper.id,
                CompetitionRegistration.student_email == email,
            )
        )
        if not registration:
            raise HTTPException(status_code=403, detail="Competition registration is required")
    elif now > started_at + timedelta(minutes=paper.duration_minutes, seconds=30):
        raise HTTPException(status_code=422, detail="Submission time has expired")

    score, total_score, status = score_exam_submission(paper, payload.answers)
    user = db.scalar(select(User).where(User.email == email))
    submission = ExamPaperSubmission(
        paper_id=paper.id,
        user_id=user.id if user else None,
        student_name=payload.student_name.strip(),
        student_email=email,
        answers=payload.answers,
        score=score,
        total_score=total_score,
        status=status,
        started_at=started_at,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


def list_public_competitions(
    query: str | None,
    category_id: int | None,
    db: Session,
) -> list[PublicCompetitionOut]:
    stmt = (
        public_competition_stmt()
        .where(Competition.status == ExamPaperStatus.published)
        .order_by(Competition.updated_at.desc())
    )
    if category_id:
        stmt = stmt.where(Competition.category_id == category_id)
    if query and query.strip():
        like_query = f"%{query.strip()}%"
        stmt = stmt.where(
            Competition.title.ilike(like_query)
            | Competition.description.ilike(like_query)
            | Competition.audience.ilike(like_query)
            | Competition.difficulty.ilike(like_query)
        )
    return [public_competition_to_out(competition) for competition in db.scalars(stmt).unique()]


def get_public_competition_or_404(slug: str, db: Session) -> Competition:
    competition = db.scalar(
        public_competition_stmt().where(
            Competition.slug == slug,
            Competition.status == ExamPaperStatus.published,
        )
    )
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    return competition


def submit_public_competition(
    competition: Competition,
    payload: PublicExamSubmissionCreate,
    db: Session,
) -> CompetitionSubmission:
    email = str(payload.student_email).strip().lower()
    now = aware_now()
    started_at = normalize_started_at(payload.started_at)
    if not competition.starts_at or not competition.ends_at or now < competition.starts_at or now > competition.ends_at:
        raise HTTPException(status_code=422, detail="Competition is not open for submission")
    registration = db.scalar(
        select(CompetitionRegistration).where(
            CompetitionRegistration.competition_id == competition.id,
            CompetitionRegistration.student_email == email,
        )
    )
    if not registration:
        raise HTTPException(status_code=403, detail="Competition registration is required")

    score, total_score, status = score_competition_submission(competition, payload.answers)
    user = db.scalar(select(User).where(User.email == email))
    submission = CompetitionSubmission(
        competition_id=competition.id,
        user_id=user.id if user else None,
        student_name=payload.student_name.strip(),
        student_email=email,
        answers=payload.answers,
        score=score,
        total_score=total_score,
        status=status,
        started_at=started_at,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


@router.get("/mock-exams", response_model=list[PublicExamPaperOut])
def list_mock_exams(
    query: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[PublicExamPaperOut]:
    return list_public_exam_papers(ExamPaperKind.mock_exam, query, category_id, db)


@router.get("/mock-exams/{slug}", response_model=PublicExamPaperOut)
def get_mock_exam(slug: str, db: Session = Depends(get_db)) -> PublicExamPaperOut:
    paper = get_public_exam_paper_or_404(slug, ExamPaperKind.mock_exam, db)
    return public_exam_paper_to_out(paper, include_questions=True)


@router.post("/mock-exams/{slug}/submit", response_model=ExamPaperSubmissionOut)
def submit_mock_exam(
    slug: str,
    payload: PublicExamSubmissionCreate,
    db: Session = Depends(get_db),
) -> ExamPaperSubmission:
    paper = get_public_exam_paper_or_404(slug, ExamPaperKind.mock_exam, db)
    return submit_public_exam_paper(paper, payload, db)


@router.get("/competitions", response_model=list[PublicCompetitionOut])
def list_competitions(
    query: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[PublicCompetitionOut]:
    return list_public_competitions(query, category_id, db)


@router.get("/competitions/{slug}", response_model=PublicCompetitionOut)
def get_competition(slug: str, db: Session = Depends(get_db)) -> PublicCompetitionOut:
    competition = get_public_competition_or_404(slug, db)
    return public_competition_to_out(competition, include_questions=True)


@router.post("/competitions/{slug}/register", response_model=CompetitionRegistrationOut)
def register_competition(
    slug: str,
    payload: PublicCompetitionRegistrationCreate,
    db: Session = Depends(get_db),
) -> CompetitionRegistration:
    competition = get_public_competition_or_404(slug, db)
    now = aware_now()
    if competition.starts_at and now >= competition.starts_at:
        raise HTTPException(status_code=422, detail="Competition registration is closed")
    email = str(payload.student_email).strip().lower()
    existing = db.scalar(
        select(CompetitionRegistration).where(
            CompetitionRegistration.competition_id == competition.id,
            CompetitionRegistration.student_email == email,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="This email has already registered")
    user = db.scalar(select(User).where(User.email == email))
    registration = CompetitionRegistration(
        paper_id=None,
        competition_id=competition.id,
        user_id=user.id if user else None,
        student_name=payload.student_name.strip(),
        student_email=email,
        phone=payload.phone.strip() if payload.phone else None,
        note=payload.note.strip() if payload.note else None,
    )
    db.add(registration)
    db.commit()
    db.refresh(registration)
    return registration


@router.post("/competitions/{slug}/submit", response_model=CompetitionSubmissionOut)
def submit_competition(
    slug: str,
    payload: PublicExamSubmissionCreate,
    db: Session = Depends(get_db),
) -> CompetitionSubmission:
    competition = get_public_competition_or_404(slug, db)
    return submit_public_competition(competition, payload, db)


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
    courses = list(db.scalars(stmt))
    courses = attach_course_ratings(db, courses)
    return attach_course_learning_paths(db, courses)


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
    attach_course_ratings(db, [course])
    attach_course_learning_paths(db, [course])
    return course


@router.get("/teachers", response_model=list[TeacherOut])
def list_teachers(db: Session = Depends(get_db)) -> list[Teacher]:
    return list(db.scalars(select(Teacher).options(joinedload(Teacher.institution)).order_by(Teacher.name)))


@router.get("/teachers/{identifier}", response_model=TeacherOut)
def get_teacher(identifier: str, db: Session = Depends(get_db)) -> Teacher:
    stmt = select(Teacher).options(joinedload(Teacher.institution))
    teacher = db.scalar(stmt.where(Teacher.slug == identifier))
    if teacher is None and identifier.isdigit():
        teacher = db.scalar(stmt.where(Teacher.id == int(identifier)))
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
    course_points = sorted(
        (entry for _, _, entry in rows),
        key=lambda entry: (-entry.course_points, -entry.total_points, entry.student_name),
    )[:8]
    community_points = sorted(
        (entry for _, _, entry in rows),
        key=lambda entry: (-entry.community_points, -entry.total_points, entry.student_name),
    )[:8]
    competition_points = sorted(
        (entry for _, _, entry in rows),
        key=lambda entry: (-entry.competition_points, -entry.total_points, entry.student_name),
    )[:8]
    followers = sorted(
        (entry for _, _, entry in rows),
        key=lambda entry: (-entry.followers_count, -entry.follower_points, -entry.total_points, entry.student_name),
    )[:8]
    return StudentLeaderboardOut(
        total_points=[entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(total_points)],
        rising=[entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(rising)],
        course_points=[entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(course_points)],
        community_points=[entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(community_points)],
        competition_points=[entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(competition_points)],
        followers=[entry.model_copy(update={"rank": index + 1}) for index, entry in enumerate(followers)],
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
                selectinload(User.exam_submissions).joinedload(ExamPaperSubmission.paper),
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
