from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import (
    ActivityMode,
    ActivityRegistrationStatus,
    CourseStatus,
    ExamPaperKind,
    ExamPaperSourceType,
    ExamPaperStatus,
    ExamSubmissionStatus,
    LessonItemType,
    LearningPathStatus,
    QuestionStatus,
    QuestionType,
    SubmissionStatus,
    UserRole,
)


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TagOut(OrmModel):
    id: int
    name: str
    institution_category: str
    institution_id: int | None = None
    is_preset: bool = False
    is_active: bool = True


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class InstitutionOut(OrmModel):
    id: int
    name: str
    slug: str
    logo_url: str
    category: str
    institution_type: str = "individual"
    payout_mode: str = "partner"
    service_agreement_accepted: bool = False
    gdpr_agreement_accepted: bool = False
    fee_agreement_accepted: bool = False
    agreements_accepted_at: datetime | None = None
    verification_status: str = "not_required"
    stripe_account_id: str | None = None
    stripe_legacy_account_id: str | None = None
    stripe_charges_enabled: bool = False
    stripe_payouts_enabled: bool = False
    stripe_details_submitted: bool = False
    stripe_onboarding_completed_at: datetime | None = None
    legal_company_name: str | None = None
    registration_country: str | None = None
    registered_address: str | None = None
    legal_representative: str | None = None
    founded_on: date | None = None
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


class StripeConnectOnboardingOut(BaseModel):
    url: str
    institution: InstitutionOut


class StripeDashboardLinkOut(BaseModel):
    url: str
    institution: InstitutionOut


class StripeBalanceAmountOut(BaseModel):
    currency: str
    amount: float


class StripeRequirementsOut(BaseModel):
    currently_due: list[str] = Field(default_factory=list)
    eventually_due: list[str] = Field(default_factory=list)
    past_due: list[str] = Field(default_factory=list)
    pending_verification: list[str] = Field(default_factory=list)
    disabled_reason: str | None = None


class AdminSubscriptionPaymentOut(BaseModel):
    id: int
    course_title: str
    student_name: str
    student_email: EmailStr
    status: str
    amount_eur_monthly: float
    platform_fee_percent: float
    net_amount_eur_monthly: float
    stripe_subscription_id: str | None = None
    stripe_checkout_session_id: str | None = None
    current_period_start: datetime
    current_period_end: datetime | None = None
    created_at: datetime


class InstitutionFinanceOut(BaseModel):
    institution: InstitutionOut
    account_mode: str
    stripe_connected: bool
    stripe_account_id: str | None = None
    stripe_account_type: str | None = None
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool
    verification_status: str
    requirements: StripeRequirementsOut
    available_balance: list[StripeBalanceAmountOut] = Field(default_factory=list)
    pending_balance: list[StripeBalanceAmountOut] = Field(default_factory=list)
    total_monthly_revenue_eur: float = 0
    platform_fee_monthly_eur: float = 0
    net_monthly_revenue_eur: float = 0
    subscription_payments: list[AdminSubscriptionPaymentOut] = Field(default_factory=list)


class ActivityRegistrationOut(OrmModel):
    id: int
    activity_id: int
    student_name: str
    student_email: EmailStr
    phone: str | None = None
    note: str | None = None
    created_at: datetime


class ActivityTeacherOut(BaseModel):
    id: int
    name: str
    title: str | None = None


class ActivityBase(BaseModel):
    title: str = Field(min_length=1, max_length=220)
    description: str = Field(min_length=1)
    cover_url: str = ""
    starts_at: datetime
    ends_at: datetime | None = None
    mode: ActivityMode = ActivityMode.online
    meeting_url: str | None = Field(default=None, max_length=1000)
    location: str | None = Field(default=None, max_length=500)
    audience: str | None = Field(default=None, max_length=300)
    registration_status: ActivityRegistrationStatus = ActivityRegistrationStatus.open
    capacity: int | None = Field(default=None, ge=1)
    teacher_id: int | None = None
    tag_ids: list[int] = Field(default_factory=list)


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(ActivityBase):
    pass


class AdminActivityOut(OrmModel):
    id: int
    institution_id: int
    institution_name: str
    teacher_id: int | None = None
    teacher: ActivityTeacherOut | None = None
    title: str
    description: str
    cover_url: str = ""
    starts_at: datetime
    ends_at: datetime | None = None
    mode: ActivityMode
    meeting_url: str | None = None
    location: str | None = None
    audience: str | None = None
    registration_status: ActivityRegistrationStatus
    capacity: int | None = None
    registrations_count: int = 0
    registrations: list[ActivityRegistrationOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    tag_list: list[TagOut] = Field(default_factory=list)


class PublicActivityOut(BaseModel):
    id: int
    institution_id: int
    institution_name: str
    institution_logo_url: str | None = None
    title: str
    description: str
    cover_url: str = ""
    starts_at: datetime
    ends_at: datetime | None = None
    mode: ActivityMode
    meeting_url: str | None = None
    location: str | None = None
    audience: str | None = None
    registration_status: ActivityRegistrationStatus
    capacity: int | None = None
    registrations_count: int = 0
    tag_list: list[TagOut] = Field(default_factory=list)


class PublicActivityHomeOut(BaseModel):
    latest: list[PublicActivityOut]
    popular: list[PublicActivityOut]
    activities: list[PublicActivityOut]


class PublicActivityRegistrationCreate(BaseModel):
    student_name: str = Field(min_length=1, max_length=120)
    student_email: EmailStr
    phone: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=500)


class PublicActivityRegistrationOut(OrmModel):
    id: int
    activity_id: int
    student_name: str
    student_email: EmailStr
    created_at: datetime


class CourseCategoryOut(OrmModel):
    id: int
    institution_id: int
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


class PublicTeacherCertificateOut(BaseModel):
    name: str = ""
    description: str = ""
    image_url: str = ""


class PublicTeacherProfileOut(BaseModel):
    highest_education: str = ""
    graduation_school: str = ""
    current_position: str = ""
    employment_history: str = ""
    teaching_years: str = ""
    professional_title: str = ""
    certificates: list[PublicTeacherCertificateOut] = Field(default_factory=list)


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
    teacher_profile: PublicTeacherProfileOut | None = None


class CourseLearningPathRefOut(BaseModel):
    id: int
    slug: str
    title: str
    position: int


class CourseCardOut(OrmModel):
    id: int
    slug: str
    title: str
    subtitle: str
    category: str
    level: str
    price_eur_monthly: float
    expected_duration_days: int = 30
    hero_image_url: str
    is_hot: bool
    students_count: int
    status: CourseStatus
    rating_average: float = 0.0
    rating_count: int = 0
    learning_paths: list[CourseLearningPathRefOut] = Field(default_factory=list)
    tag_list: list[TagOut] = Field(default_factory=list)
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


class LearningPathCourseOut(BaseModel):
    id: int
    position: int
    course: CourseCardOut


class LearningPathOut(BaseModel):
    id: int
    slug: str
    title: str
    subtitle: str
    description: str
    cover_url: str
    intro_video_url: str
    audience: str
    level: str
    status: LearningPathStatus
    institution: InstitutionOut
    course_count: int
    courses: list[LearningPathCourseOut] = Field(default_factory=list)
    tag_list: list[TagOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class LearningPathCreate(BaseModel):
    title: str = Field(min_length=1, max_length=220)
    subtitle: str = Field(default="", max_length=320)
    description: str = ""
    cover_url: str = Field(default="", max_length=500)
    intro_video_url: str = Field(default="", max_length=500)
    audience: str = Field(default="", max_length=260)
    level: str = Field(default="", max_length=80)
    status: LearningPathStatus = LearningPathStatus.draft
    course_ids: list[int] = Field(default_factory=list)


class LearningPathUpdate(LearningPathCreate):
    pass


class BlogPostOut(OrmModel):
    id: int
    slug: str
    title: str
    excerpt: str
    cover_url: str
    content: str
    author_name: str
    is_published: bool = False
    institution_id: int | None = None
    author_user_id: int | None = None
    created_at: datetime
    updated_at: datetime
    tag_list: list[TagOut] = Field(default_factory=list)


class AdminBlogPostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=220)
    excerpt: str = Field(default="", max_length=360)
    cover_url: str = Field(default="", max_length=500)
    content: str = ""
    is_published: bool = False
    tag_ids: list[int] = Field(default_factory=list)


class AdminBlogPostUpdate(AdminBlogPostCreate):
    pass


class AdminBlogPostOut(BlogPostOut):
    pass


class StudentPointLevelOut(BaseModel):
    index: int
    name: str
    icon: str
    min_points: int
    next_level_points: int | None = None
    progress_percent: float


class StudentLeaderboardEntry(BaseModel):
    rank: int
    student_id: int
    student_name: str
    avatar_url: str | None = None
    total_points: int
    weekly_points: int
    course_points: int = 0
    community_points: int = 0
    competition_points: int = 0
    follower_points: int = 0
    followers_count: int = 0
    completed_courses: int
    active_courses: int
    average_progress: float
    level: StudentPointLevelOut


class StudentLeaderboardOut(BaseModel):
    total_points: list[StudentLeaderboardEntry]
    rising: list[StudentLeaderboardEntry]
    course_points: list[StudentLeaderboardEntry] = Field(default_factory=list)
    community_points: list[StudentLeaderboardEntry] = Field(default_factory=list)
    competition_points: list[StudentLeaderboardEntry] = Field(default_factory=list)
    followers: list[StudentLeaderboardEntry] = Field(default_factory=list)


class StudentPointEvent(BaseModel):
    label: str
    source: str
    points: int
    occurred_at: datetime | None = None
    course_title: str | None = None
    detail: str | None = None


class StudentCoursePointBreakdown(BaseModel):
    course_id: int
    course_slug: str
    course_title: str
    status: str
    progress_percent: float
    progress_points: int
    activity_points: int
    assessment_points: int
    note_points: int = 0
    completion_bonus: int
    total_points: int


class StudentLeaderboardDetailOut(BaseModel):
    student: StudentLeaderboardEntry
    total_rank: int | None = None
    rising_rank: int | None = None
    course_breakdown: list[StudentCoursePointBreakdown]
    recent_events: list[StudentPointEvent]


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8)
    role: UserRole = UserRole.student


class InstitutionRegisterIn(BaseModel):
    institution_name: str = Field(min_length=2, max_length=160)
    category: str = Field(pattern="^(it|language|tutoring|art|other)$")
    institution_type: str = Field(default="individual", pattern="^(individual|organization)$")
    service_agreement_accepted: bool = False
    gdpr_agreement_accepted: bool = False
    fee_agreement_accepted: bool = False
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
    id_token: str | None = None


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

class AdminTeacherCertificate(BaseModel):
    name: str = Field(default="", max_length=200)
    description: str = ""
    image_url: str = Field(default="", max_length=2000)


class AdminTeacherProfile(BaseModel):
    highest_education: str = Field(default="", max_length=160)
    graduation_school: str = Field(default="", max_length=200)
    current_position: str = Field(default="", max_length=160)
    employment_history: str = ""
    teaching_years: str = Field(default="", max_length=80)
    professional_title: str = Field(default="", max_length=160)
    certificates: list[AdminTeacherCertificate] = Field(default_factory=list)

    @field_validator("certificates", mode="before")
    @classmethod
    def normalize_certificates(cls, value: Any) -> list[dict[str, str]]:
        if not isinstance(value, list):
            return []
        certificates: list[dict[str, str]] = []
        for item in value:
            if isinstance(item, str):
                name = item.strip()
                if name:
                    certificates.append({"name": name, "description": "", "image_url": ""})
                continue
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("title") or "").strip()
            description = str(item.get("description") or "").strip()
            image_url = str(item.get("image_url") or item.get("imageUrl") or item.get("url") or "").strip()
            if name or description or image_url:
                certificates.append({"name": name, "description": description, "image_url": image_url})
        return certificates

class AdminProfileOut(UserOut):
    title: str | None = None
    phone: str | None = None
    region: str | None = None
    bio: str | None = None
    teacher_profile: AdminTeacherProfile = Field(default_factory=AdminTeacherProfile)


class AdminProfileUpdate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    avatar_url: str | None = None
    title: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=80)
    bio: str | None = None
    teacher_profile: AdminTeacherProfile = Field(default_factory=AdminTeacherProfile)


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
    completed_at: datetime | None = None
    progress_records: list[LessonProgressOut] = []
    course: CourseDetailOut


class DashboardOut(BaseModel):
    user: UserOut
    active_courses: list[EnrollmentOut]
    completed_courses: list[EnrollmentOut]
    weekly_minutes: int
    next_lesson_title: str


class CourseReviewIn(BaseModel):
    enrollment_id: int | None = None
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class CourseReviewOut(BaseModel):
    id: int | None = None
    course_id: int
    enrollment_id: int | None = None
    rating: int | None = None
    comment: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StudentProfileSummaryOut(BaseModel):
    id: int
    email: EmailStr | None = None
    full_name: str
    avatar_url: str | None = None
    bio: str | None = None
    region: str | None = None
    community_points: int = 0


class StudentProfileUpdateIn(BaseModel):
    avatar_url: str | None = Field(default=None, max_length=1000)
    bio: str | None = Field(default=None, max_length=800)


class StudentLearningNoteOut(BaseModel):
    id: int
    enrollment_id: int
    course_id: int
    course_slug: str
    course_title: str
    course_image_url: str | None = None
    chapter_id: int
    chapter_title: str
    chapter_position: int
    content: str
    updated_at: datetime | None = None


class StudentPostCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1200)
    course_id: int | None = None
    image_urls: list[str] = Field(default_factory=list, max_length=9)


class StudentPostCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=800)


class StudentPostCommentOut(BaseModel):
    id: int
    post_id: int
    user_id: int
    student_name: str
    avatar_url: str | None = None
    body: str
    created_at: datetime


class StudentPostOut(BaseModel):
    id: int
    user_id: int
    student_name: str
    avatar_url: str | None = None
    content: str
    image_urls: list[str] = Field(default_factory=list)
    course_id: int | None = None
    course_title: str | None = None
    likes_count: int = 0
    liked_by_me: bool = False
    comments_count: int = 0
    comments: list[StudentPostCommentOut] = Field(default_factory=list)
    created_at: datetime


class StudentSocialHomeOut(BaseModel):
    profile: StudentProfileSummaryOut
    active_courses: list[EnrollmentOut]
    completed_courses: list[EnrollmentOut]
    recommended_courses: list[CourseCardOut]
    total_points: int
    weekly_points: int
    level: StudentPointLevelOut
    achievements: list[str]
    posts: list[StudentPostOut]
    suggested_students: list[StudentProfileSummaryOut]
    following_ids: list[int]
    following_students: list[StudentProfileSummaryOut] = []
    follower_students: list[StudentProfileSummaryOut] = []
    following_count: int = 0
    followers_count: int = 0
    questions: list["CommunityQuestionOut"] = []
    answered_questions: list["CommunityQuestionOut"] = []
    notes: list["CommunityNoteShareOut"] = []


class StudentPublicProfileOut(BaseModel):
    profile: StudentProfileSummaryOut
    active_courses: list[EnrollmentOut]
    completed_courses: list[EnrollmentOut]
    posts: list[StudentPostOut]
    questions: list["CommunityQuestionOut"] = []
    answered_questions: list["CommunityQuestionOut"] = []
    notes: list["CommunityNoteShareOut"] = []
    following_students: list[StudentProfileSummaryOut] = []
    follower_students: list[StudentProfileSummaryOut] = []
    following_count: int = 0
    followers_count: int = 0
    is_following: bool


class CommunityReferenceChapterOut(BaseModel):
    id: int
    title: str
    position: int


class CommunityReferenceCourseOut(BaseModel):
    id: int
    title: str
    slug: str
    chapters: list[CommunityReferenceChapterOut] = []


class CommunityReferenceQuestionOut(BaseModel):
    id: int
    prompt: str
    type: QuestionType
    difficulty: str
    skill_area: str


class CommunityQuestionCreate(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    body: str = Field(min_length=2, max_length=3000)
    course_id: int | None = None
    chapter_id: int | None = None
    linked_question_id: int | None = None
    tags: list[str] = []


class CommunityAnswerCreate(BaseModel):
    body: str = Field(min_length=1, max_length=3000)


class CommunityNoteShareCreate(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    content: str = Field(min_length=2, max_length=6000)
    course_id: int | None = None
    chapter_note_id: int | None = None


class CommunityMessageCreate(BaseModel):
    receiver_id: int
    content: str = Field(min_length=1, max_length=1000)


class CommunityAnswerOut(BaseModel):
    id: int
    question_id: int
    user_id: int
    student_name: str
    avatar_url: str | None = None
    student_level: StudentPointLevelOut | None = None
    body: str
    likes_count: int
    liked_by_me: bool = False
    is_best: bool = False
    created_at: datetime


class CommunityQuestionOut(BaseModel):
    id: int
    user_id: int
    student_name: str
    avatar_url: str | None = None
    title: str
    body: str
    course_id: int | None = None
    course_title: str | None = None
    chapter_id: int | None = None
    chapter_title: str | None = None
    linked_question_id: int | None = None
    linked_question_title: str | None = None
    tags: list[str] = []
    is_resolved: bool
    likes_count: int = 0
    liked_by_me: bool = False
    answers_count: int
    answers: list[CommunityAnswerOut] = []
    created_at: datetime


class CommunityNoteShareOut(BaseModel):
    id: int
    user_id: int
    student_name: str
    avatar_url: str | None = None
    chapter_note_id: int | None = None
    title: str
    content: str
    course_id: int | None = None
    course_title: str | None = None
    likes_count: int
    liked_by_me: bool = False
    created_at: datetime
    updated_at: datetime | None = None


class CommunityMessageOut(BaseModel):
    id: int
    sender_id: int
    sender_name: str
    receiver_id: int
    receiver_name: str
    content: str
    created_at: datetime


class CommunityHomeOut(BaseModel):
    questions: list[CommunityQuestionOut]
    recommended_questions: list[CommunityQuestionOut] = []
    notes: list[CommunityNoteShareOut]
    students: list[StudentProfileSummaryOut]
    hot_students: list[StudentProfileSummaryOut] = []
    following_ids: list[int]
    my_courses: list[CommunityReferenceCourseOut]
    reference_questions: list[CommunityReferenceQuestionOut]
    recent_messages: list[CommunityMessageOut]
    community_points: int


StudentSocialHomeOut.model_rebuild()
StudentPublicProfileOut.model_rebuild()


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
    enrollment: EnrollmentOut | None = None
    subscription_status: str
    checkout_url: str | None = None
    checkout_session_id: str | None = None


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
    is_public: bool = True
    status: QuestionStatus
    options: list[QuestionOptionOut] = []
    media_assets: list[QuestionMediaOut] = []
    created_at: datetime
    updated_at: datetime
    tag_list: list[TagOut] = Field(default_factory=list)


class StudentQuestionOptionOut(OrmModel):
    id: int
    label: str
    text: str
    position: int


class StudentQuestionOut(OrmModel):
    id: int
    institution_id: int
    type: QuestionType
    prompt: str
    hint: str | None = None
    content: dict[str, Any]
    skill_area: str
    difficulty: str
    points: int
    requires_manual_grading: bool
    is_public: bool = True
    institution: InstitutionOut | None = None
    options: list[StudentQuestionOptionOut] = []
    media_assets: list[QuestionMediaOut] = []
    tag_list: list[TagOut] = Field(default_factory=list)


class ExamPaperQuestionInput(BaseModel):
    question_id: int
    points_override: int | None = Field(default=None, ge=0)


class ExamPaperBase(BaseModel):
    title: str = Field(min_length=1, max_length=220)
    description: str = ""
    cover_url: str = Field(default="", max_length=500)
    instructions: str = ""
    audience: str = Field(default="", max_length=260)
    kind: ExamPaperKind
    source_type: ExamPaperSourceType = ExamPaperSourceType.mock
    past_year: int | None = Field(default=None, ge=1900, le=2200)
    duration_minutes: int = Field(default=60, ge=1, le=600)
    status: ExamPaperStatus = ExamPaperStatus.draft
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    category_id: int | None = None
    tag_ids: list[int] = Field(default_factory=list)


class ExamPaperCreate(ExamPaperBase):
    questions: list[ExamPaperQuestionInput] = Field(default_factory=list)


class ExamPaperUpdate(ExamPaperCreate):
    pass


class CompetitionPrize(BaseModel):
    rank: int = Field(ge=1, le=100)
    prize_type: str = Field(default="item", max_length=40)
    description: str = Field(default="", max_length=500)


class CompetitionBase(BaseModel):
    title: str = Field(min_length=1, max_length=220)
    description: str = ""
    cover_url: str = Field(default="", max_length=500)
    instructions: str = ""
    audience: str = Field(default="", max_length=260)
    difficulty: str = Field(default="", max_length=80)
    prizes: list[CompetitionPrize] = Field(default_factory=list)
    duration_minutes: int = Field(default=60, ge=1, le=600)
    status: ExamPaperStatus = ExamPaperStatus.draft
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    category_id: int | None = None
    tag_ids: list[int] = Field(default_factory=list)


class CompetitionCreate(CompetitionBase):
    questions: list[ExamPaperQuestionInput] = Field(default_factory=list)


class CompetitionUpdate(CompetitionCreate):
    pass


class ExamPaperQuestionOut(BaseModel):
    id: int
    position: int
    points: int
    question: QuestionOut


class CompetitionQuestionOut(ExamPaperQuestionOut):
    pass


class PublicExamPaperQuestionOut(BaseModel):
    id: int
    position: int
    points: int
    question: StudentQuestionOut


class PublicCompetitionQuestionOut(PublicExamPaperQuestionOut):
    pass


class CompetitionRegistrationOut(OrmModel):
    id: int
    paper_id: int | None = None
    competition_id: int | None = None
    student_name: str
    student_email: EmailStr
    phone: str | None = None
    note: str | None = None
    user_id: int | None = None
    created_at: datetime


class ExamPaperSubmissionOut(OrmModel):
    id: int
    paper_id: int
    student_name: str
    student_email: EmailStr
    answers: dict[str, Any]
    score: float
    total_score: float
    status: ExamSubmissionStatus
    started_at: datetime | None = None
    submitted_at: datetime


class CompetitionSubmissionOut(OrmModel):
    id: int
    competition_id: int
    student_name: str
    student_email: EmailStr
    answers: dict[str, Any]
    score: float
    total_score: float
    status: ExamSubmissionStatus
    started_at: datetime | None = None
    submitted_at: datetime


class ExamPaperOut(BaseModel):
    id: int
    institution_id: int
    slug: str
    title: str
    description: str
    cover_url: str
    instructions: str
    audience: str
    kind: ExamPaperKind
    source_type: ExamPaperSourceType
    past_year: int | None = None
    duration_minutes: int
    status: ExamPaperStatus
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    institution: InstitutionOut
    category: CourseCategoryOut | None = None
    questions_count: int = 0
    registrations_count: int = 0
    submissions_count: int = 0
    questions: list[ExamPaperQuestionOut] = Field(default_factory=list)
    registrations: list[CompetitionRegistrationOut] = Field(default_factory=list)
    submissions: list[ExamPaperSubmissionOut] = Field(default_factory=list)
    tag_list: list[TagOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class CompetitionOut(BaseModel):
    id: int
    institution_id: int
    slug: str
    title: str
    description: str
    cover_url: str
    instructions: str
    audience: str
    kind: ExamPaperKind = ExamPaperKind.competition
    difficulty: str = ""
    prizes: list[CompetitionPrize] = Field(default_factory=list)
    duration_minutes: int
    status: ExamPaperStatus
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    institution: InstitutionOut
    category: CourseCategoryOut | None = None
    questions_count: int = 0
    registrations_count: int = 0
    submissions_count: int = 0
    questions: list[CompetitionQuestionOut] = Field(default_factory=list)
    registrations: list[CompetitionRegistrationOut] = Field(default_factory=list)
    submissions: list[CompetitionSubmissionOut] = Field(default_factory=list)
    tag_list: list[TagOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PublicExamPaperOut(BaseModel):
    id: int
    institution_id: int
    slug: str
    title: str
    description: str
    cover_url: str
    instructions: str
    audience: str
    kind: ExamPaperKind
    source_type: ExamPaperSourceType
    past_year: int | None = None
    duration_minutes: int
    status: ExamPaperStatus
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    institution: InstitutionOut
    category: CourseCategoryOut | None = None
    questions_count: int = 0
    registrations_count: int = 0
    questions: list[PublicExamPaperQuestionOut] = Field(default_factory=list)
    tag_list: list[TagOut] = Field(default_factory=list)


class PublicCompetitionOut(BaseModel):
    id: int
    institution_id: int
    slug: str
    title: str
    description: str
    cover_url: str
    instructions: str
    audience: str
    kind: ExamPaperKind = ExamPaperKind.competition
    difficulty: str = ""
    prizes: list[CompetitionPrize] = Field(default_factory=list)
    duration_minutes: int
    status: ExamPaperStatus
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    institution: InstitutionOut
    category: CourseCategoryOut | None = None
    questions_count: int = 0
    registrations_count: int = 0
    questions: list[PublicCompetitionQuestionOut] = Field(default_factory=list)
    tag_list: list[TagOut] = Field(default_factory=list)


class PublicInstitutionCardOut(BaseModel):
    institution: InstitutionOut
    rating: float
    students_count: int
    courses_count: int
    teachers_count: int
    resources_count: int
    created_at: datetime


class PublicInstitutionDirectoryOut(BaseModel):
    institutions: list[PublicInstitutionCardOut]
    top_rated: list[PublicInstitutionCardOut]
    newest: list[PublicInstitutionCardOut]
    most_students: list[PublicInstitutionCardOut]
    categories: list[str]


class PublicInstitutionProfileOut(BaseModel):
    summary: PublicInstitutionCardOut
    categories: list[CourseCategoryOut]
    teachers: list[TeacherOut]
    courses: list[CourseCardOut]
    learning_paths: list[LearningPathOut]
    activities: list[PublicActivityOut]
    mock_exams: list[PublicExamPaperOut]
    competitions: list[PublicCompetitionOut]
    question_count: int


class PublicCompetitionRegistrationCreate(BaseModel):
    student_name: str = Field(min_length=1, max_length=120)
    student_email: EmailStr
    phone: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=500)


class PublicExamSubmissionCreate(BaseModel):
    student_name: str = Field(min_length=1, max_length=120)
    student_email: EmailStr
    answers: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None


class SubmissionIn(BaseModel):
    answer: dict[str, Any]
    enrollment_id: int | None = None
    lesson_item_id: int | None = None


class CodeRunIn(BaseModel):
    code: str = Field(min_length=1, max_length=20_000)
    tests: list[str] = Field(default_factory=list, max_length=30)
    language: str = "python"
    enrollment_id: int | None = None
    lesson_item_id: int | None = None


class CodeRunTestOut(BaseModel):
    test: str
    passed: bool
    message: str = ""


class CodeRunOut(BaseModel):
    ok: bool
    passed: bool
    stdout: str = ""
    stderr: str = ""
    error: str | None = None
    tests: list[CodeRunTestOut] = []
    duration_ms: int


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
    lesson_item_id: int | None = None
    answer: dict[str, Any]
    score: float | None
    status: SubmissionStatus
    feedback: str | None
    created_at: datetime


class GradingUserOut(OrmModel):
    id: int
    full_name: str
    email: EmailStr


class GradingCourseOut(OrmModel):
    id: int
    title: str
    category: str
    level: str


class GradingEnrollmentOut(OrmModel):
    id: int
    course: GradingCourseOut


class GradingLessonItemOut(OrmModel):
    id: int
    title: str
    item_type: LessonItemType
    position: int


class AdminGradingSubmissionOut(SubmissionOut):
    question: StudentQuestionOut
    user: GradingUserOut
    enrollment: GradingEnrollmentOut | None = None
    lesson_item: GradingLessonItemOut | None = None


class QuizSubmissionOut(BaseModel):
    status: str
    score: float
    total_score: float
    passed: bool | None = None
    pending_manual_count: int = 0
    submissions: list[SubmissionOut]


class LessonItemSubmissionStateOut(BaseModel):
    item_id: int
    enrollment_id: int
    score: float
    total_score: float
    passed: bool | None = None
    pending_manual_count: int = 0
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
    price_eur_monthly: float = Field(default=39, gt=0, le=9999)
    expected_duration_days: int = Field(default=30, ge=1, le=3650)
    tag_ids: list[int] = Field(default_factory=list)


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
    price_eur_monthly: float | None = Field(default=None, gt=0, le=9999)
    expected_duration_days: int | None = Field(default=None, ge=1, le=3650)
    status: CourseStatus | None = None
    chapters: list[ChapterUpsert] | None = None
    tag_ids: list[int] | None = None


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
    is_public: bool = True
    status: QuestionStatus = QuestionStatus.saved
    options: list[QuestionOptionCreate] = Field(default_factory=list)
    media_assets: list[QuestionMediaCreate] = Field(default_factory=list)
    tag_ids: list[int] = Field(default_factory=list)


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
    is_public: bool | None = None
    status: QuestionStatus | None = None
    options: list[QuestionOptionCreate] | None = None
    media_assets: list[QuestionMediaCreate] | None = None
    tag_ids: list[int] | None = None


class AdminMetricChangeOut(BaseModel):
    current: int
    previous: int
    growth_percent: float


class AdminCourseRankingOut(BaseModel):
    course_id: int
    title: str
    category: str = ""
    level: str = ""
    teacher_name: str = ""
    value: float
    secondary_value: float | None = None
    label: str = ""


class AdminOverviewOut(BaseModel):
    total_courses: int
    active_subscriptions: int
    monthly_recurring_revenue_eur: float
    pending_manual_grading: int
    subscription_growth: list[dict[str, Any]] = Field(default_factory=list)
    total_subscriptions: int = 0
    monthly_subscription_growth: AdminMetricChangeOut = Field(
        default_factory=lambda: AdminMetricChangeOut(current=0, previous=0, growth_percent=0)
    )
    weekly_subscription_growth: AdminMetricChangeOut = Field(
        default_factory=lambda: AdminMetricChangeOut(current=0, previous=0, growth_percent=0)
    )
    total_revenue_eur: float = 0
    current_month_revenue_eur: float = 0
    average_monthly_learning_minutes: float = 0
    on_time_completion_rate: float = 0
    average_cancellation_rate: float = 0
    published_courses: int = 0
    draft_courses: int = 0
    total_questions: int = 0
    total_teachers: int = 0
    total_exam_papers: int = 0
    total_competitions: int = 0
    pending_cancellations: int = 0
    subscription_rankings: list[AdminCourseRankingOut] = Field(default_factory=list)
    revenue_rankings: list[AdminCourseRankingOut] = Field(default_factory=list)
    monthly_growth_rankings: list[AdminCourseRankingOut] = Field(default_factory=list)
    satisfaction_rankings: list[AdminCourseRankingOut] = Field(default_factory=list)


class SubscriptionCancellationRequestCreate(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class SubscriptionCancellationReview(BaseModel):
    admin_note: str = Field(default="", max_length=2000)


class SubscriptionCancellationRequestOut(BaseModel):
    id: int
    subscription_id: int
    course_id: int
    course_title: str
    student_name: str
    student_email: str
    reason: str
    status: str
    admin_note: str = ""
    created_at: datetime
    reviewed_at: datetime | None = None
