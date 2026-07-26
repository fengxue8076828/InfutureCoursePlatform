from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    student = "student"
    teacher = "teacher"
    institution_admin = "institution_admin"
    super_admin = "super_admin"


class CourseStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class ActivityMode(str, enum.Enum):
    online = "online"
    offline = "offline"


class ActivityRegistrationStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class LearningPathStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class ExamPaperKind(str, enum.Enum):
    mock_exam = "mock_exam"
    competition = "competition"


class ExamPaperSourceType(str, enum.Enum):
    mock = "mock"
    past_paper = "past_paper"


class ExamPaperStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class ExamSubmissionStatus(str, enum.Enum):
    submitted = "submitted"
    pending_manual = "pending_manual"
    graded = "graded"


class LessonItemType(str, enum.Enum):
    video = "video"
    handout = "handout"
    exercise = "exercise"
    quiz = "quiz"


class QuestionType(str, enum.Enum):
    single_choice = "single_choice"
    multiple_choice = "multiple_choice"
    fill_blank = "fill_blank"
    coding = "coding"
    code_review = "code_review"
    true_false = "true_false"
    reading = "reading"
    listening = "listening"
    pronunciation = "pronunciation"
    writing = "writing"
    media_upload = "media_upload"


class QuestionStatus(str, enum.Enum):
    draft = "draft"
    saved = "saved"
    published = "published"


class SubmissionStatus(str, enum.Enum):
    auto_graded = "auto_graded"
    pending_manual = "pending_manual"
    manually_graded = "manually_graded"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Institution(Base, TimestampMixin):
    __tablename__ = "institutions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    logo_url: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), default="language", server_default="language", index=True)
    institution_type: Mapped[str] = mapped_column(
        String(32), default="individual", server_default="individual", index=True
    )
    service_agreement_accepted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    gdpr_agreement_accepted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    fee_agreement_accepted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    agreements_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_status: Mapped[str] = mapped_column(
        String(32), default="not_required", server_default="not_required", index=True
    )
    stripe_account_id: Mapped[str | None] = mapped_column(String(120), unique=True, index=True)
    stripe_charges_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    stripe_payouts_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    stripe_details_submitted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    stripe_onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    legal_company_name: Mapped[str | None] = mapped_column(String(200))
    registration_country: Mapped[str | None] = mapped_column(String(120))
    registered_address: Mapped[str | None] = mapped_column(String(500))
    legal_representative: Mapped[str | None] = mapped_column(String(120))
    founded_on: Mapped[date | None] = mapped_column(Date)
    region: Mapped[str] = mapped_column(String(80), default="Europe")
    website: Mapped[str | None] = mapped_column(String(500))
    phone: Mapped[str | None] = mapped_column(String(80))
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    address: Mapped[str | None] = mapped_column(String(500))
    contact_person: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)

    courses: Mapped[list["Course"]] = relationship(back_populates="institution")
    course_categories: Mapped[list["CourseCategory"]] = relationship(back_populates="institution")
    teachers: Mapped[list["Teacher"]] = relationship(back_populates="institution")
    admins: Mapped[list["User"]] = relationship(back_populates="institution")
    activities: Mapped[list["InstitutionActivity"]] = relationship(
        back_populates="institution", cascade="all, delete-orphan"
    )
    learning_paths: Mapped[list["LearningPath"]] = relationship(
        back_populates="institution", cascade="all, delete-orphan"
    )
    exam_papers: Mapped[list["ExamPaper"]] = relationship(
        back_populates="institution", cascade="all, delete-orphan"
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.student, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255))
    auth_provider: Mapped[str] = mapped_column(String(40), default="email")
    avatar_url: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(80))
    region: Mapped[str | None] = mapped_column(String(80))
    bio: Mapped[str | None] = mapped_column(Text)
    institution_id: Mapped[int | None] = mapped_column(ForeignKey("institutions.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    institution: Mapped[Institution | None] = relationship(back_populates="admins")
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="user")
    created_questions: Mapped[list["Question"]] = relationship(back_populates="creator")
    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="user", foreign_keys="Submission.user_id"
    )
    exam_submissions: Mapped[list["ExamPaperSubmission"]] = relationship(back_populates="user")


class AdminLoginVerificationCode(Base, TimestampMixin):
    __tablename__ = "admin_login_verification_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    code_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Teacher(Base, TimestampMixin):
    __tablename__ = "teachers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    bio: Mapped[str] = mapped_column(Text)
    avatar_url: Mapped[str] = mapped_column(Text)
    region: Mapped[str] = mapped_column(String(80), default="Europe")
    specialties: Mapped[dict] = mapped_column(JSONB, default=dict)
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id"))

    institution: Mapped[Institution] = relationship(back_populates="teachers")
    courses: Mapped[list["Course"]] = relationship(back_populates="teacher")


class CourseCategory(Base, TimestampMixin):
    __tablename__ = "course_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_categories.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), index=True)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    parent: Mapped["CourseCategory | None"] = relationship(
        remote_side=lambda: [CourseCategory.id], back_populates="children"
    )
    children: Mapped[list["CourseCategory"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan", order_by="CourseCategory.position"
    )
    institution: Mapped[Institution] = relationship(back_populates="course_categories")
    exam_papers: Mapped[list["ExamPaper"]] = relationship(back_populates="category")


class Course(Base, TimestampMixin):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(180), index=True)
    subtitle: Mapped[str] = mapped_column(String(260))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(80), index=True)
    level: Mapped[str] = mapped_column(String(40), index=True)
    language: Mapped[str] = mapped_column(String(40), default="涓枃")
    price_eur_monthly: Mapped[float] = mapped_column(Numeric(8, 2), default=39.00)
    hero_image_url: Mapped[str] = mapped_column(String(500))
    intro_video_url: Mapped[str] = mapped_column(String(500))
    syllabus: Mapped[dict] = mapped_column(JSONB, default=dict)
    tags: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_hot: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    students_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[CourseStatus] = mapped_column(
        Enum(CourseStatus), default=CourseStatus.draft, server_default=CourseStatus.draft.value, index=True
    )
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"))

    institution: Mapped[Institution] = relationship(back_populates="courses")
    teacher: Mapped[Teacher] = relationship(back_populates="courses")
    chapters: Mapped[list["CourseChapter"]] = relationship(
        back_populates="course", cascade="all, delete-orphan", order_by="CourseChapter.position"
    )
    questions: Mapped[list["Question"]] = relationship(back_populates="course")
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="course")
    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="course")
    reviews: Mapped[list["CourseReview"]] = relationship(back_populates="course", cascade="all, delete-orphan")
    learning_path_links: Mapped[list["LearningPathCourse"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )


class LearningPath(Base, TimestampMixin):
    __tablename__ = "learning_paths"

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(220), index=True)
    subtitle: Mapped[str] = mapped_column(String(320), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    cover_url: Mapped[str] = mapped_column(String(500), default="")
    intro_video_url: Mapped[str] = mapped_column(String(500), default="")
    audience: Mapped[str] = mapped_column(String(260), default="")
    level: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[LearningPathStatus] = mapped_column(
        Enum(LearningPathStatus),
        default=LearningPathStatus.draft,
        server_default=LearningPathStatus.draft.value,
        index=True,
    )

    institution: Mapped[Institution] = relationship(back_populates="learning_paths")
    course_links: Mapped[list["LearningPathCourse"]] = relationship(
        back_populates="learning_path", cascade="all, delete-orphan", order_by="LearningPathCourse.position"
    )


class LearningPathCourse(Base, TimestampMixin):
    __tablename__ = "learning_path_courses"
    __table_args__ = (
        UniqueConstraint("learning_path_id", "course_id", name="uq_learning_path_course"),
        UniqueConstraint("learning_path_id", "position", name="uq_learning_path_course_position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    learning_path_id: Mapped[int] = mapped_column(ForeignKey("learning_paths.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=1)

    learning_path: Mapped[LearningPath] = relationship(back_populates="course_links")
    course: Mapped[Course] = relationship(back_populates="learning_path_links")


class ExamPaper(Base, TimestampMixin):
    __tablename__ = "exam_papers"

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("course_categories.id"), index=True)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(220), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    cover_url: Mapped[str] = mapped_column(String(500), default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    audience: Mapped[str] = mapped_column(String(260), default="")
    kind: Mapped[ExamPaperKind] = mapped_column(Enum(ExamPaperKind), index=True)
    source_type: Mapped[ExamPaperSourceType] = mapped_column(
        Enum(ExamPaperSourceType),
        default=ExamPaperSourceType.mock,
        server_default=ExamPaperSourceType.mock.value,
        index=True,
    )
    past_year: Mapped[int | None] = mapped_column(Integer)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    status: Mapped[ExamPaperStatus] = mapped_column(
        Enum(ExamPaperStatus),
        default=ExamPaperStatus.draft,
        server_default=ExamPaperStatus.draft.value,
        index=True,
    )
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    institution: Mapped[Institution] = relationship(back_populates="exam_papers")
    category: Mapped[CourseCategory | None] = relationship(back_populates="exam_papers")
    question_links: Mapped[list["ExamPaperQuestion"]] = relationship(
        back_populates="paper", cascade="all, delete-orphan", order_by="ExamPaperQuestion.position"
    )
    registrations: Mapped[list["CompetitionRegistration"]] = relationship(
        back_populates="paper", cascade="all, delete-orphan", order_by="CompetitionRegistration.created_at.desc()"
    )
    submissions: Mapped[list["ExamPaperSubmission"]] = relationship(
        back_populates="paper", cascade="all, delete-orphan", order_by="ExamPaperSubmission.submitted_at.desc()"
    )


class ExamPaperQuestion(Base, TimestampMixin):
    __tablename__ = "exam_paper_questions"
    __table_args__ = (
        UniqueConstraint("paper_id", "question_id", name="uq_exam_paper_question"),
        UniqueConstraint("paper_id", "position", name="uq_exam_paper_question_position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("exam_papers.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=1)
    points_override: Mapped[int | None] = mapped_column(Integer)

    paper: Mapped[ExamPaper] = relationship(back_populates="question_links")
    question: Mapped["Question"] = relationship()


class CompetitionRegistration(Base, TimestampMixin):
    __tablename__ = "competition_registrations"
    __table_args__ = (UniqueConstraint("paper_id", "student_email", name="uq_competition_registration_email"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("exam_papers.id", ondelete="CASCADE"), index=True)
    student_name: Mapped[str] = mapped_column(String(120))
    student_email: Mapped[str] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(80))
    note: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)

    paper: Mapped[ExamPaper] = relationship(back_populates="registrations")
    user: Mapped[User | None] = relationship()


class ExamPaperSubmission(Base, TimestampMixin):
    __tablename__ = "exam_paper_submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("exam_papers.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    student_name: Mapped[str] = mapped_column(String(120))
    student_email: Mapped[str] = mapped_column(String(255), index=True)
    answers: Mapped[dict] = mapped_column(JSONB, default=dict)
    score: Mapped[float] = mapped_column(Float, default=0)
    total_score: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[ExamSubmissionStatus] = mapped_column(
        Enum(ExamSubmissionStatus),
        default=ExamSubmissionStatus.submitted,
        server_default=ExamSubmissionStatus.submitted.value,
        index=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    paper: Mapped[ExamPaper] = relationship(back_populates="submissions")
    user: Mapped[User | None] = relationship(back_populates="exam_submissions")


class CourseChapter(Base, TimestampMixin):
    __tablename__ = "course_chapters"
    __table_args__ = (UniqueConstraint("course_id", "position", name="uq_chapter_course_position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(180))
    summary: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer)

    course: Mapped[Course] = relationship(back_populates="chapters")
    items: Mapped[list["LessonItem"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan", order_by="LessonItem.position"
    )


class LessonItem(Base, TimestampMixin):
    __tablename__ = "lesson_items"
    __table_args__ = (UniqueConstraint("chapter_id", "position", name="uq_item_chapter_position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    chapter_id: Mapped[int] = mapped_column(
        ForeignKey("course_chapters.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(180))
    item_type: Mapped[LessonItemType] = mapped_column(Enum(LessonItemType), index=True)
    content_url: Mapped[str | None] = mapped_column(String(500))
    body: Mapped[dict] = mapped_column(JSONB, default=dict)
    required_minutes: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[int] = mapped_column(Integer)

    chapter: Mapped[CourseChapter] = relationship(back_populates="items")
    progress_records: Mapped[list["ProgressRecord"]] = relationship(back_populates="lesson_item")


class Enrollment(Base, TimestampMixin):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("user_id", "course_id", name="uq_user_course_enrollment"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    status: Mapped[str] = mapped_column(String(40), default="active")
    current_item_id: Mapped[int | None] = mapped_column(ForeignKey("lesson_items.id"))
    progress_percent: Mapped[float] = mapped_column(Float, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="enrollments")
    course: Mapped[Course] = relationship(back_populates="enrollments")
    progress_records: Mapped[list["ProgressRecord"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )


class CourseReview(Base, TimestampMixin):
    __tablename__ = "course_reviews"
    __table_args__ = (UniqueConstraint("user_id", "course_id", name="uq_user_course_review"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    enrollment_id: Mapped[int | None] = mapped_column(ForeignKey("enrollments.id", ondelete="SET NULL"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")

    user: Mapped[User] = relationship()
    course: Mapped[Course] = relationship(back_populates="reviews")
    enrollment: Mapped[Enrollment | None] = relationship()


class ProgressRecord(Base, TimestampMixin):
    __tablename__ = "progress_records"
    __table_args__ = (
        UniqueConstraint("enrollment_id", "lesson_item_id", name="uq_enrollment_lesson_progress"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(ForeignKey("enrollments.id"), index=True)
    lesson_item_id: Mapped[int] = mapped_column(ForeignKey("lesson_items.id"), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)

    enrollment: Mapped[Enrollment] = relationship(back_populates="progress_records")
    lesson_item: Mapped[LessonItem] = relationship(back_populates="progress_records")


class ChapterNote(Base, TimestampMixin):
    __tablename__ = "chapter_notes"
    __table_args__ = (
        UniqueConstraint("enrollment_id", "chapter_id", name="uq_enrollment_chapter_note"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(ForeignKey("enrollments.id", ondelete="CASCADE"), index=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("course_chapters.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    content: Mapped[str] = mapped_column(Text, default="")

    enrollment: Mapped[Enrollment] = relationship()
    chapter: Mapped[CourseChapter] = relationship()
    user: Mapped[User] = relationship()


class Question(Base, TimestampMixin):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[QuestionType] = mapped_column(Enum(QuestionType), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    hint: Mapped[str | None] = mapped_column(Text)
    content: Mapped[dict] = mapped_column(JSONB, default=dict)
    answer_key: Mapped[dict] = mapped_column(JSONB, default=dict)
    skill_area: Mapped[str] = mapped_column(String(80), index=True)
    difficulty: Mapped[str] = mapped_column(String(40), default="A2")
    points: Mapped[int] = mapped_column(Integer, default=10)
    requires_manual_grading: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[QuestionStatus] = mapped_column(
        Enum(QuestionStatus), default=QuestionStatus.saved, server_default=QuestionStatus.saved.value, index=True
    )

    institution: Mapped[Institution] = relationship()
    course: Mapped[Course | None] = relationship(back_populates="questions")
    creator: Mapped[User | None] = relationship(back_populates="created_questions")
    options: Mapped[list["QuestionOption"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionOption.position",
    )
    media_assets: Mapped[list["QuestionMedia"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionMedia.position",
    )
    submissions: Mapped[list["Submission"]] = relationship(back_populates="question")


class QuestionOption(Base, TimestampMixin):
    __tablename__ = "question_options"
    __table_args__ = (UniqueConstraint("question_id", "position", name="uq_question_option_position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    explanation: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=1)

    question: Mapped[Question] = relationship(back_populates="options")


class QuestionMedia(Base, TimestampMixin):
    __tablename__ = "question_media"
    __table_args__ = (UniqueConstraint("question_id", "position", name="uq_question_media_position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    media_type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(160))
    url: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=1)

    question: Mapped[Question] = relationship(back_populates="media_assets")


class Submission(Base, TimestampMixin):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"), index=True)
    enrollment_id: Mapped[int | None] = mapped_column(ForeignKey("enrollments.id"))
    lesson_item_id: Mapped[int | None] = mapped_column(ForeignKey("lesson_items.id"), index=True)
    answer: Mapped[dict] = mapped_column(JSONB, default=dict)
    score: Mapped[float | None] = mapped_column(Float)
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus), default=SubmissionStatus.pending_manual, index=True
    )
    feedback: Mapped[str | None] = mapped_column(Text)
    grader_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    user: Mapped[User] = relationship(back_populates="submissions", foreign_keys=[user_id])
    question: Mapped[Question] = relationship(back_populates="submissions")
    enrollment: Mapped[Enrollment | None] = relationship()
    lesson_item: Mapped[LessonItem | None] = relationship()
    grader: Mapped[User | None] = relationship(foreign_keys=[grader_id])


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    amount_eur_monthly: Mapped[float] = mapped_column(Numeric(8, 2), default=39.00)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    current_period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payment_provider: Mapped[str] = mapped_column(String(80), default="stripe")
    stripe_checkout_session_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), index=True)
    platform_fee_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=15.00)

    course: Mapped[Course] = relationship(back_populates="subscriptions")


class StudentPost(Base, TimestampMixin):
    __tablename__ = "student_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    content: Mapped[str] = mapped_column(Text)
    image_urls: Mapped[list[str]] = mapped_column(JSONB, default=list)
    likes_count: Mapped[int] = mapped_column(Integer, default=0)
    visibility: Mapped[str] = mapped_column(String(40), default="public", index=True)

    user: Mapped[User] = relationship()
    course: Mapped[Course | None] = relationship()
    comments: Mapped[list["StudentPostComment"]] = relationship(
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="StudentPostComment.created_at",
    )


class StudentPostComment(Base, TimestampMixin):
    __tablename__ = "student_post_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("student_posts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)

    post: Mapped[StudentPost] = relationship(back_populates="comments")
    user: Mapped[User] = relationship()


class StudentFollow(Base, TimestampMixin):
    __tablename__ = "student_follows"
    __table_args__ = (UniqueConstraint("follower_id", "followee_id", name="uq_student_follow_pair"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    followee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    follower: Mapped[User] = relationship(foreign_keys=[follower_id])
    followee: Mapped[User] = relationship(foreign_keys=[followee_id])


class CommunityQuestion(Base, TimestampMixin):
    __tablename__ = "community_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(220), index=True)
    body: Mapped[str] = mapped_column(Text)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    chapter_id: Mapped[int | None] = mapped_column(ForeignKey("course_chapters.id", ondelete="SET NULL"), index=True)
    linked_question_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id", ondelete="SET NULL"), index=True)
    tags: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    user: Mapped[User] = relationship()
    course: Mapped[Course | None] = relationship()
    chapter: Mapped[CourseChapter | None] = relationship()
    linked_question: Mapped[Question | None] = relationship()
    answers: Mapped[list["CommunityAnswer"]] = relationship(
        back_populates="community_question", cascade="all, delete-orphan", order_by="CommunityAnswer.created_at"
    )


class CommunityAnswer(Base, TimestampMixin):
    __tablename__ = "community_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    community_question_id: Mapped[int] = mapped_column(
        ForeignKey("community_questions.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    is_best: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    likes_count: Mapped[int] = mapped_column(Integer, default=0)

    community_question: Mapped[CommunityQuestion] = relationship(back_populates="answers")
    user: Mapped[User] = relationship()


class CommunityNoteShare(Base, TimestampMixin):
    __tablename__ = "community_note_shares"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    chapter_note_id: Mapped[int | None] = mapped_column(ForeignKey("chapter_notes.id", ondelete="SET NULL"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(220), index=True)
    content: Mapped[str] = mapped_column(Text)
    likes_count: Mapped[int] = mapped_column(Integer, default=0)
    visibility: Mapped[str] = mapped_column(String(40), default="public", index=True)

    user: Mapped[User] = relationship()
    chapter_note: Mapped[ChapterNote | None] = relationship()
    course: Mapped[Course | None] = relationship()


class CommunityReaction(Base, TimestampMixin):
    __tablename__ = "community_reactions"
    __table_args__ = (UniqueConstraint("user_id", "target_type", "target_id", name="uq_community_reaction_target"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_type: Mapped[str] = mapped_column(String(40), index=True)
    target_id: Mapped[int] = mapped_column(Integer, index=True)

    user: Mapped[User] = relationship()


class CommunityMessage(Base, TimestampMixin):
    __tablename__ = "community_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sender: Mapped[User] = relationship(foreign_keys=[sender_id])
    receiver: Mapped[User] = relationship(foreign_keys=[receiver_id])


class InstitutionActivity(Base, TimestampMixin):
    __tablename__ = "institution_activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(220), index=True)
    description: Mapped[str] = mapped_column(Text)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mode: Mapped[ActivityMode] = mapped_column(Enum(ActivityMode), default=ActivityMode.online, index=True)
    meeting_url: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(500))
    audience: Mapped[str | None] = mapped_column(String(300))
    registration_status: Mapped[ActivityRegistrationStatus] = mapped_column(
        Enum(ActivityRegistrationStatus),
        default=ActivityRegistrationStatus.open,
        server_default=ActivityRegistrationStatus.open.value,
        index=True,
    )
    capacity: Mapped[int | None] = mapped_column(Integer)

    institution: Mapped[Institution] = relationship(back_populates="activities")
    registrations: Mapped[list["ActivityRegistration"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan", order_by="ActivityRegistration.created_at.desc()"
    )


class ActivityRegistration(Base, TimestampMixin):
    __tablename__ = "activity_registrations"
    __table_args__ = (UniqueConstraint("activity_id", "student_email", name="uq_activity_registration_email"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("institution_activities.id", ondelete="CASCADE"), index=True)
    student_name: Mapped[str] = mapped_column(String(120))
    student_email: Mapped[str] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(80))
    note: Mapped[str | None] = mapped_column(Text)

    activity: Mapped[InstitutionActivity] = relationship(back_populates="registrations")


class BlogPost(Base, TimestampMixin):
    __tablename__ = "blog_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(220))
    excerpt: Mapped[str] = mapped_column(String(360))
    cover_url: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    author_name: Mapped[str] = mapped_column(String(120))
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

