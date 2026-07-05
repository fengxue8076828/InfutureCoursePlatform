from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import CourseStatus, LessonItemType, QuestionStatus, QuestionType, SubmissionStatus, UserRole


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class InstitutionOut(OrmModel):
    id: int
    name: str
    slug: str
    logo_url: str
    category: str
    region: str
    website: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = None
    contact_person: str | None = None
    description: str


class InstitutionUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    logo_url: str = Field(min_length=1)
    region: str = Field(min_length=1, max_length=80)
    website: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=80)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    contact_person: str | None = Field(default=None, max_length=120)
    description: str = Field(min_length=10)


class CourseCategoryOut(OrmModel):
    id: int
    parent_id: int | None = None
    name: str
    slug: str
    position: int
    is_active: bool


class CourseCategoryCreate(BaseModel):
    parent_id: int | None = None
    name: str = Field(min_length=1, max_length=120)
    position: int = Field(default=0, ge=0)
    is_active: bool = True


class CourseCategoryUpdate(BaseModel):
    parent_id: int | None = None
    name: str = Field(min_length=1, max_length=120)
    position: int = Field(default=0, ge=0)
    is_active: bool = True


class TeacherOut(OrmModel):
    id: int
    name: str
    slug: str
    title: str
    bio: str
    avatar_url: str
    region: str
    specialties: dict[str, Any]
    institution: InstitutionOut | None = None


class CourseCardOut(OrmModel):
    id: int
    slug: str
    title: str
    subtitle: str
    category: str
    level: str
    price_eur_monthly: float
    hero_image_url: str
    is_hot: bool
    students_count: int
    status: CourseStatus
    institution: InstitutionOut
    teacher: TeacherOut


class LessonItemOut(OrmModel):
    id: int
    title: str
    item_type: LessonItemType
    content_url: str | None
    body: dict[str, Any]
    required_minutes: int
    position: int


class ChapterOut(OrmModel):
    id: int
    title: str
    summary: str
    position: int
    items: list[LessonItemOut] = []


class CourseDetailOut(CourseCardOut):
    description: str
    intro_video_url: str
    syllabus: dict[str, Any]
    tags: dict[str, Any]
    chapters: list[ChapterOut] = []


class BlogPostOut(OrmModel):
    id: int
    slug: str
    title: str
    excerpt: str
    cover_url: str
    content: str
    author_name: str
    created_at: datetime


class StudentLeaderboardEntry(BaseModel):
    rank: int
    student_id: int
    student_name: str
    avatar_url: str | None = None
    total_points: int
    weekly_points: int
    completed_courses: int
    active_courses: int
    average_progress: float


class StudentLeaderboardOut(BaseModel):
    total_points: list[StudentLeaderboardEntry]
    rising: list[StudentLeaderboardEntry]


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8)
    role: UserRole = UserRole.student


class InstitutionRegisterIn(BaseModel):
    institution_name: str = Field(min_length=2, max_length=160)
    category: str = Field(pattern="^(it|language|tutoring|art|other)$")
    logo_url: str | None = None
    contact_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=3, max_length=80)
    email: EmailStr
    location: str = Field(min_length=2, max_length=500)
    website: str | None = Field(default=None, max_length=500)
    description: str = Field(min_length=10)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AdminLoginCodeRequest(BaseModel):
    email: EmailStr
    password: str


class AdminLoginCodeOut(BaseModel):
    message: str
    expires_in_seconds: int
    demo_code: str | None = None


class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str
    verification_code: str = Field(min_length=4, max_length=12)


class SocialLoginIn(BaseModel):
    provider: str = Field(pattern="^(google|facebook)$")
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = None


class UserOut(OrmModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    avatar_url: str | None
    institution_id: int | None = None


class AdminUserOut(UserOut):
    title: str | None = None
    phone: str | None = None
    region: str | None = None
    bio: str | None = None
    is_active: bool = True


class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    role: UserRole
    title: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=80)
    bio: str | None = None


class AdminUserUpdate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    role: UserRole
    title: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=80)
    bio: str | None = None
    is_active: bool = True


class AdminProfileOut(UserOut):
    title: str | None = None
    phone: str | None = None
    region: str | None = None
    bio: str | None = None


class AdminProfileUpdate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    avatar_url: str | None = None
    title: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=80)
    bio: str | None = None


class AdminPasswordCodeOut(BaseModel):
    message: str
    expires_in_seconds: int
    demo_code: str | None = None


class AdminPasswordUpdate(BaseModel):
    verification_code: str = Field(min_length=4, max_length=12)
    new_password: str = Field(min_length=8, max_length=128)


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LessonProgressOut(OrmModel):
    lesson_item_id: int
    completed_at: datetime | None = None
    score: float | None = None


class EnrollmentOut(OrmModel):
    id: int
    status: str
    progress_percent: float
    progress_records: list[LessonProgressOut] = []
    course: CourseDetailOut


class DashboardOut(BaseModel):
    user: UserOut
    active_courses: list[EnrollmentOut]
    completed_courses: list[EnrollmentOut]
    weekly_minutes: int
    next_lesson_title: str


class CompleteItemIn(BaseModel):
    notes: str | None = None
    score: float | None = None


class ChapterNoteIn(BaseModel):
    content: str = ""
    enrollment_id: int | None = None


class ChapterNoteOut(OrmModel):
    id: int | None = None
    enrollment_id: int
    chapter_id: int
    content: str
    updated_at: datetime | None = None


class SubscribeCourseIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    region: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=80)


class SubscribeCourseOut(BaseModel):
    auth: AuthOut
    enrollment: EnrollmentOut
    subscription_status: str


class QuestionOptionBase(BaseModel):
    label: str = Field(min_length=1, max_length=20)
    text: str = Field(min_length=1)
    is_correct: bool = False
    explanation: str | None = None
    position: int = 1


class QuestionOptionCreate(QuestionOptionBase):
    pass


class QuestionOptionOut(QuestionOptionBase, OrmModel):
    id: int


class QuestionMediaBase(BaseModel):
    media_type: str = Field(pattern="^(image|audio|video|handout)$")
    title: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=1)
    position: int = 1


class QuestionMediaCreate(QuestionMediaBase):
    pass


class QuestionMediaOut(QuestionMediaBase, OrmModel):
    id: int


class QuestionOut(OrmModel):
    id: int
    institution_id: int
    course_id: int | None
    created_by_user_id: int | None = None
    type: QuestionType
    prompt: str
    hint: str | None = None
    content: dict[str, Any]
    answer_key: dict[str, Any]
    skill_area: str
    difficulty: str
    points: int
    requires_manual_grading: bool
    status: QuestionStatus
    options: list[QuestionOptionOut] = []
    media_assets: list[QuestionMediaOut] = []
    created_at: datetime
    updated_at: datetime


class StudentQuestionOptionOut(OrmModel):
    id: int
    label: str
    text: str
    position: int


class StudentQuestionOut(OrmModel):
    id: int
    type: QuestionType
    prompt: str
    hint: str | None = None
    content: dict[str, Any]
    skill_area: str
    difficulty: str
    points: int
    requires_manual_grading: bool
    options: list[StudentQuestionOptionOut] = []
    media_assets: list[QuestionMediaOut] = []


class SubmissionIn(BaseModel):
    answer: dict[str, Any]
    enrollment_id: int | None = None


class QuizAnswerIn(BaseModel):
    question_id: int
    answer: dict[str, Any]


class QuizSubmissionIn(BaseModel):
    answers: list[QuizAnswerIn]
    enrollment_id: int | None = None


class SubmissionOut(OrmModel):
    id: int
    user_id: int
    question_id: int
    answer: dict[str, Any]
    score: float | None
    status: SubmissionStatus
    feedback: str | None
    created_at: datetime


class QuizSubmissionOut(BaseModel):
    status: str
    score: float
    total_score: float
    passed: bool
    submissions: list[SubmissionOut]


class LessonItemSubmissionStateOut(BaseModel):
    item_id: int
    enrollment_id: int
    score: float
    total_score: float
    passed: bool | None = None
    completed_at: datetime | None = None
    submissions: list[SubmissionOut]


class GradeSubmissionIn(BaseModel):
    score: float = Field(ge=0)
    feedback: str


class CourseCreate(BaseModel):
    title: str
    slug: str
    subtitle: str
    description: str
    category: str
    level: str
    hero_image_url: str
    intro_video_url: str
    institution_id: int
    teacher_id: int
    price_eur_monthly: float = 39


class LessonItemUpsert(BaseModel):
    id: int | None = None
    title: str = Field(min_length=1, max_length=180)
    item_type: LessonItemType
    content_url: str | None = None
    body: dict[str, Any] = Field(default_factory=dict)
    required_minutes: int = Field(default=0, ge=0)
    position: int = Field(default=1, ge=1)


class ChapterUpsert(BaseModel):
    id: int | None = None
    title: str = Field(min_length=1, max_length=180)
    summary: str = ""
    position: int = Field(default=1, ge=1)
    items: list[LessonItemUpsert] = Field(default_factory=list)


class CourseUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    subtitle: str | None = None
    description: str | None = None
    category: str | None = None
    level: str | None = None
    hero_image_url: str | None = None
    intro_video_url: str | None = None
    teacher_id: int | None = None
    price_eur_monthly: float | None = None
    status: CourseStatus | None = None
    chapters: list[ChapterUpsert] | None = None


class TeacherCreate(BaseModel):
    name: str
    slug: str
    title: str
    bio: str
    avatar_url: str
    institution_id: int
    region: str = "Europe"
    specialties: dict[str, Any] = Field(default_factory=dict)


class QuestionCreate(BaseModel):
    institution_id: int
    course_id: int | None = None
    type: QuestionType
    prompt: str
    hint: str = ""
    content: dict[str, Any] = Field(default_factory=dict)
    answer_key: dict[str, Any] = Field(default_factory=dict)
    skill_area: str
    difficulty: str = "A2"
    points: int = 10
    requires_manual_grading: bool = False
    status: QuestionStatus = QuestionStatus.saved
    options: list[QuestionOptionCreate] = Field(default_factory=list)
    media_assets: list[QuestionMediaCreate] = Field(default_factory=list)


class QuestionUpdate(BaseModel):
    institution_id: int | None = None
    course_id: int | None = None
    type: QuestionType | None = None
    prompt: str | None = None
    hint: str | None = None
    content: dict[str, Any] | None = None
    answer_key: dict[str, Any] | None = None
    skill_area: str | None = None
    difficulty: str | None = None
    points: int | None = None
    requires_manual_grading: bool | None = None
    status: QuestionStatus | None = None
    options: list[QuestionOptionCreate] | None = None
    media_assets: list[QuestionMediaCreate] | None = None


class AdminOverviewOut(BaseModel):
    total_courses: int
    active_subscriptions: int
    monthly_recurring_revenue_eur: float
    pending_manual_grading: int
    subscription_growth: list[dict[str, Any]]

