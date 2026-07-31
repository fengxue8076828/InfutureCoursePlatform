import re
import secrets
import smtplib
import unicodedata
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from hashlib import sha256

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user
from app.api.routes.payments import sync_checkout_session_if_complete
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    ActivityRegistrationStatus,
    InstitutionActivity,
    Course,
    CourseCategory,
    CourseChapter,
    CourseStatus,
    Enrollment,
    Competition,
    CompetitionQuestion,
    CompetitionRegistration,
    CompetitionSubmission,
    ExamPaper,
    ExamPaperKind,
    ExamPaperQuestion,
    ExamPaperSourceType,
    ExamPaperStatus,
    ExamPaperSubmission,
    Institution,
    LessonItem,
    LessonItemType,
    LearningPath,
    LearningPathCourse,
    LearningPathStatus,
    ProgressRecord,
    Question,
    QuestionMedia,
    QuestionOption,
    QuestionStatus,
    QuestionType,
    Submission,
    Subscription,
    Teacher,
    AdminLoginVerificationCode,
    User,
    UserRole,
)
from app.models import SubmissionStatus
from app.schemas import (
    ActivityCreate,
    ActivityRegistrationOut,
    ActivityUpdate,
    AdminOverviewOut,
    AdminSubscriptionPaymentOut,
    AdminActivityOut,
    AdminGradingSubmissionOut,
    AdminPasswordCodeOut,
    AdminPasswordUpdate,
    AdminProfileOut,
    AdminProfileUpdate,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    CodeRunIn,
    CodeRunOut,
    CourseCardOut,
    CourseCategoryCreate,
    CourseCategoryOut,
    CourseCategoryUpdate,
    CourseCreate,
    CourseDetailOut,
    CourseUpdate,
    CompetitionCreate,
    CompetitionOut,
    CompetitionQuestionOut,
    ExamPaperCreate,
    ExamPaperOut,
    ExamPaperQuestionOut,
    ExamPaperSubmissionOut,
    ExamPaperUpdate,
    CompetitionRegistrationOut,
    CompetitionSubmissionOut,
    CompetitionUpdate,
    GradeSubmissionIn,
    InstitutionFinanceOut,
    InstitutionOut,
    InstitutionUpdate,
    LearningPathCreate,
    LearningPathCourseOut,
    LearningPathOut,
    LearningPathUpdate,
    QuestionCreate,
    QuestionOut,
    QuestionUpdate,
    SubmissionOut,
    StripeBalanceAmountOut,
    StripeConnectOnboardingOut,
    StripeDashboardLinkOut,
    StripeRequirementsOut,
    TeacherCreate,
    TeacherOut,
)
from app.services.subscriptions import stop_course_subscription_renewal_after_completion
from app.services.code_runner import run_python_code

router = APIRouter()
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

CODE_QUESTION_TYPES = {QuestionType.coding.value}
RETIRED_QUESTION_TYPES = {QuestionType.code_review.value}
MANAGER_ROLES = {UserRole.institution_admin, UserRole.super_admin}
MANAGED_USER_ROLES = {UserRole.teacher, UserRole.institution_admin, UserRole.super_admin}
QUESTION_STAFF_ROLES = {UserRole.teacher, UserRole.institution_admin, UserRole.super_admin}
COURSE_STAFF_ROLES = {UserRole.teacher, UserRole.institution_admin, UserRole.super_admin}
DEFAULT_TEACHER_AVATAR_URL = "/avatars/default-teacher.svg"
PASSWORD_CHANGE_CODE_TTL_SECONDS = 10 * 60

DIFFICULTY_LEVELS_BY_CATEGORY = {
    "language": ["A1", "A2", "B1", "B2", "C1", "C2"],
    "tutoring": [f"{grade}年级" for grade in range(1, 13)],
    "art": [f"{level}级" for level in range(1, 11)],
    "it": ["简单", "中等", "复杂", "极复杂"],
    "other": ["简单", "中等", "复杂", "极复杂"],
}


def ensure_admin(current_user: User) -> None:
    if current_user.role not in {UserRole.institution_admin, UserRole.super_admin}:
        raise HTTPException(status_code=403, detail="Admin role required")


def ensure_user_manager(current_user: User) -> None:
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="User management role required")


def ensure_question_staff(current_user: User) -> None:
    if current_user.role not in QUESTION_STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Question bank role required")


def ensure_course_staff(current_user: User) -> None:
    if current_user.role not in COURSE_STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Course management role required")


def ensure_super_admin(current_user: User) -> None:
    if current_user.role != UserRole.super_admin:
        raise HTTPException(status_code=403, detail="Super admin role required")


def ensure_own_question(question: Question, current_user: User) -> None:
    if question.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator can modify this question")


def get_admin_institution(current_user: User, db: Session) -> Institution | None:
    if current_user.institution_id:
        return db.get(Institution, current_user.institution_id)
    return db.scalar(select(Institution).order_by(Institution.id))


def get_current_institution_id_or_403(current_user: User) -> int:
    if current_user.institution_id:
        return current_user.institution_id
    raise HTTPException(status_code=403, detail="Institution context required")


PUBLISH_AGREEMENT_DETAIL = "Platform agreements must be accepted before publishing"


def institution_agreements_completed(institution: Institution) -> bool:
    return bool(
        institution.service_agreement_accepted
        and institution.gdpr_agreement_accepted
        and institution.fee_agreement_accepted
    )


def ensure_institution_can_publish(current_user: User, db: Session) -> Institution:
    institution = get_admin_institution(current_user, db)
    if not institution:
        raise HTTPException(status_code=403, detail="Institution context required")
    if not institution_agreements_completed(institution):
        raise HTTPException(status_code=403, detail=PUBLISH_AGREEMENT_DETAIL)
    return institution


def stripe_value(obj: object, key: str, default: object = None) -> object:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def get_stripe_client():
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    try:
        import stripe
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Stripe SDK is not installed") from exc
    stripe.api_key = settings.stripe_secret_key
    return stripe


def stripe_operation_failed(action: str, exc: Exception) -> HTTPException:
    message = str(exc).strip() or exc.__class__.__name__
    return HTTPException(status_code=502, detail=f"{action}: {message}")


def update_institution_stripe_state(institution: Institution, account: object) -> None:
    charges_enabled = bool(stripe_value(account, "charges_enabled", False))
    payouts_enabled = bool(stripe_value(account, "payouts_enabled", False))
    details_submitted = bool(stripe_value(account, "details_submitted", False))
    institution.stripe_charges_enabled = charges_enabled
    institution.stripe_payouts_enabled = payouts_enabled
    institution.stripe_details_submitted = details_submitted
    if details_submitted and institution.stripe_onboarding_completed_at is None:
        institution.stripe_onboarding_completed_at = datetime.now(timezone.utc)
    if institution.payout_mode == "platform":
        institution.verification_status = "approved" if charges_enabled else "pending"
    else:
        institution.verification_status = (
            "approved" if charges_enabled and payouts_enabled and details_submitted else "pending"
        )


def stripe_sequence_value(obj: object, key: str) -> list[str]:
    value = stripe_value(obj, key, [])
    if value is None:
        return []
    return [str(item) for item in list(value)]


def stripe_requirements_from_account(account: object | None) -> StripeRequirementsOut:
    if not account:
        return StripeRequirementsOut()
    requirements = stripe_value(account, "requirements")
    if not requirements:
        return StripeRequirementsOut()
    return StripeRequirementsOut(
        currently_due=stripe_sequence_value(requirements, "currently_due"),
        eventually_due=stripe_sequence_value(requirements, "eventually_due"),
        past_due=stripe_sequence_value(requirements, "past_due"),
        pending_verification=stripe_sequence_value(requirements, "pending_verification"),
        disabled_reason=stripe_value(requirements, "disabled_reason"),
    )


def stripe_balance_amounts(balance: object | None, key: str) -> list[StripeBalanceAmountOut]:
    values = stripe_value(balance, key, []) if balance else []
    amounts: list[StripeBalanceAmountOut] = []
    for item in list(values or []):
        raw_amount = stripe_value(item, "amount", 0) or 0
        currency = str(stripe_value(item, "currency", "eur") or "eur").upper()
        try:
            amount = int(raw_amount) / 100
        except (TypeError, ValueError):
            amount = 0
        amounts.append(StripeBalanceAmountOut(currency=currency, amount=amount))
    return amounts


def subscription_payment_to_out(
    subscription: Subscription,
    course: Course,
    student: User,
    institution: Institution,
) -> AdminSubscriptionPaymentOut:
    amount = float(subscription.amount_eur_monthly or 0)
    platform_fee_percent = 0.0 if institution.payout_mode == "platform" else float(subscription.platform_fee_percent or 15)
    net_amount = amount if institution.payout_mode == "platform" else amount * (1 - platform_fee_percent / 100)
    return AdminSubscriptionPaymentOut(
        id=subscription.id,
        course_title=course.title,
        student_name=student.full_name,
        student_email=student.email,
        status=subscription.status,
        amount_eur_monthly=round(amount, 2),
        platform_fee_percent=round(platform_fee_percent, 2),
        net_amount_eur_monthly=round(net_amount, 2),
        stripe_subscription_id=subscription.stripe_subscription_id,
        stripe_checkout_session_id=subscription.stripe_checkout_session_id,
        current_period_start=subscription.current_period_start,
        current_period_end=subscription.current_period_end,
        created_at=subscription.created_at,
    )


def build_institution_finance_out(
    institution: Institution,
    account: object | None,
    balance: object | None,
    payments: list[AdminSubscriptionPaymentOut],
) -> InstitutionFinanceOut:
    active_payments = [payment for payment in payments if payment.status in {"active", "trialing", "past_due"}]
    total_revenue = sum(payment.amount_eur_monthly for payment in active_payments)
    net_revenue = sum(payment.net_amount_eur_monthly for payment in active_payments)
    platform_fee = 0.0 if institution.payout_mode == "platform" else max(total_revenue - net_revenue, 0)
    return InstitutionFinanceOut(
        institution=InstitutionOut.model_validate(institution),
        account_mode=institution.payout_mode,
        stripe_connected=bool(get_settings().stripe_secret_key and (institution.payout_mode == "platform" or institution.stripe_account_id)),
        stripe_account_id=None if institution.payout_mode == "platform" else institution.stripe_account_id,
        charges_enabled=bool(institution.stripe_charges_enabled),
        payouts_enabled=bool(institution.stripe_payouts_enabled),
        details_submitted=bool(institution.stripe_details_submitted),
        verification_status=institution.verification_status,
        requirements=stripe_requirements_from_account(account),
        available_balance=stripe_balance_amounts(balance, "available"),
        pending_balance=stripe_balance_amounts(balance, "pending"),
        total_monthly_revenue_eur=round(total_revenue, 2),
        platform_fee_monthly_eur=round(platform_fee, 2),
        net_monthly_revenue_eur=round(net_revenue, 2),
        subscription_payments=payments,
    )


def admin_activity_to_out(activity: InstitutionActivity) -> AdminActivityOut:
    registrations = [
        ActivityRegistrationOut.model_validate(registration)
        for registration in sorted(activity.registrations, key=lambda item: item.created_at, reverse=True)
    ]
    return AdminActivityOut(
        id=activity.id,
        institution_id=activity.institution_id,
        institution_name=activity.institution.name if activity.institution else "",
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
        registrations_count=len(registrations),
        registrations=registrations,
        created_at=activity.created_at,
        updated_at=activity.updated_at,
    )


def get_activity_or_404(activity_id: int, current_user: User, db: Session) -> InstitutionActivity:
    institution_id = get_current_institution_id_or_403(current_user)
    activity = db.scalar(
        select(InstitutionActivity)
        .where(InstitutionActivity.id == activity_id, InstitutionActivity.institution_id == institution_id)
        .options(joinedload(InstitutionActivity.institution), selectinload(InstitutionActivity.registrations))
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


def normalize_activity_payload(data: dict) -> dict:
    mode = data.get("mode")
    mode_value = mode.value if hasattr(mode, "value") else str(mode)
    if mode_value == "online":
        data["location"] = None
    else:
        data["meeting_url"] = None
    return data


def normalize_email(value: object) -> str:
    return str(value).strip().lower()


def ensure_global_email_available(
    email: str,
    db: Session,
    *,
    exclude_user_id: int | None = None,
    exclude_institution_id: int | None = None,
) -> None:
    existing_user_stmt = select(User).where(func.lower(User.email) == email)
    if exclude_user_id is not None:
        existing_user_stmt = existing_user_stmt.where(User.id != exclude_user_id)
    if db.scalar(existing_user_stmt):
        raise HTTPException(status_code=409, detail="Email already exists")

    existing_institution_stmt = select(Institution).where(func.lower(Institution.email) == email)
    if exclude_institution_id is not None:
        existing_institution_stmt = existing_institution_stmt.where(
            Institution.id != exclude_institution_id
        )
    if db.scalar(existing_institution_stmt):
        raise HTTPException(status_code=409, detail="Email already exists")


def hash_password_change_code(email: str, code: str) -> str:
    return sha256(f"{email}:password-change:{code}".encode("utf-8")).hexdigest()


def issue_admin_password_change_code(user: User, db: Session) -> str:
    email = normalize_email(user.email)
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.now(timezone.utc)
    db.add(
        AdminLoginVerificationCode(
            email=email,
            code_hash=hash_password_change_code(email, code),
            expires_at=now + timedelta(seconds=PASSWORD_CHANGE_CODE_TTL_SECONDS),
        )
    )
    db.commit()
    print(f"[admin-password-change-code] {email}: {code}")
    return code


def send_admin_password_change_code_email(email: str, code: str) -> bool:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        return False

    message = EmailMessage()
    message["Subject"] = "Admin password change verification code"
    message["From"] = settings.smtp_from_email
    message["To"] = email
    message.set_content(
        "\n".join(
            [
                "Hello,",
                "",
                f"Your admin password change verification code is: {code}",
                "This code is valid for 10 minutes and can be used only once.",
                "If you did not request this change, please contact your institution administrator immediately.",
                "",
                "HuaLearn Global",
            ]
        )
    )

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except Exception as exc:
        print(f"[admin-password-change-email-error] {email}: {exc}")
        return False
    return True


def verify_admin_password_change_code(email: str, code: str, db: Session) -> None:
    normalized_email = normalize_email(email)
    now = datetime.now(timezone.utc)
    expected_hash = hash_password_change_code(normalized_email, code.strip())
    records = db.scalars(
        select(AdminLoginVerificationCode)
        .where(
            AdminLoginVerificationCode.email == normalized_email,
            AdminLoginVerificationCode.used_at.is_(None),
            AdminLoginVerificationCode.expires_at >= now,
        )
        .order_by(AdminLoginVerificationCode.created_at.desc())
    )
    for record in records:
        if record.code_hash == expected_hash:
            record.used_at = now
            db.commit()
            return
    raise HTTPException(status_code=401, detail="Invalid verification code")


def teacher_slug_for_user(user: User) -> str:
    return f"user-teacher-{user.id}"


def teacher_avatar_url_for_user(user: User) -> str:
    return user.avatar_url or DEFAULT_TEACHER_AVATAR_URL


def teacher_default_title_for_user(user: User) -> str:
    return "\u8d85\u7ea7\u7ba1\u7406\u5458" if user.role == UserRole.super_admin else "\u6388\u8bfe\u8001\u5e08"


def sync_teacher_from_user(user: User, institution: Institution, db: Session) -> Teacher:
    slug = teacher_slug_for_user(user)
    title = user.title or teacher_default_title_for_user(user)
    specialties = {
        "items": [title],
        "source_user_id": user.id,
        "email": user.email,
        "role": user.role.value,
    }
    teacher = db.scalar(select(Teacher).where(Teacher.slug == slug))
    if teacher is None:
        teacher = Teacher(
            name=user.full_name,
            slug=slug,
            title=title,
            bio=user.bio or "",
            avatar_url=teacher_avatar_url_for_user(user),
            region=user.region or institution.region or "Europe",
            institution_id=institution.id,
            specialties=specialties,
        )
        db.add(teacher)
    else:
        teacher.name = user.full_name
        teacher.title = title
        teacher.bio = user.bio or ""
        teacher.avatar_url = teacher_avatar_url_for_user(user)
        teacher.region = user.region or institution.region or "Europe"
        teacher.institution_id = institution.id
        teacher.specialties = specialties
    return teacher


def teacher_users_for_admin(current_user: User, db: Session) -> list[User]:
    teacher_visible_roles = [UserRole.teacher, UserRole.super_admin]
    stmt = select(User).where(User.is_active.is_(True), User.role.in_(teacher_visible_roles)).order_by(User.full_name)
    if current_user.role == UserRole.teacher:
        stmt = stmt.where(User.id == current_user.id)
    elif current_user.role in {UserRole.institution_admin, UserRole.super_admin}:
        institution_id = current_user.institution_id
        if institution_id is None and current_user.role == UserRole.super_admin:
            institution = get_admin_institution(current_user, db)
            institution_id = institution.id if institution else None
            if institution_id:
                current_user.institution_id = institution_id
                db.flush()
        if institution_id:
            stmt = stmt.where(User.institution_id == institution_id)
        else:
            stmt = stmt.where(User.id == current_user.id)
    elif current_user.role != UserRole.super_admin:
        stmt = stmt.where(User.role == UserRole.teacher)
    return list(db.scalars(stmt))


def sync_teacher_records_for_admin(current_user: User, db: Session) -> list[Teacher]:
    teachers: list[Teacher] = []
    for user in teacher_users_for_admin(current_user, db):
        institution = db.get(Institution, user.institution_id) if user.institution_id else None
        if institution is None and (
            current_user.role == UserRole.super_admin or user.id == current_user.id
        ):
            institution = get_admin_institution(current_user, db)
        if not institution:
            continue
        if user.institution_id is None:
            user.institution_id = institution.id
        teachers.append(sync_teacher_from_user(user, institution, db))
    db.commit()
    for teacher in teachers:
        db.refresh(teacher)
    return teachers


def sync_teacher_record_for_user(current_user: User, db: Session) -> Teacher:
    institution = get_admin_institution(current_user, db)
    if institution is None:
        raise HTTPException(status_code=403, detail="Institution is required")
    teacher = sync_teacher_from_user(current_user, institution, db)
    db.commit()
    db.refresh(teacher)
    return teacher


def question_creator_users_for_picker(current_user: User, db: Session) -> list[User]:
    creator_roles = [UserRole.teacher, UserRole.super_admin]
    stmt = select(User).where(User.is_active.is_(True), User.role.in_(creator_roles))
    if current_user.institution_id:
        creator_ids_for_institution = (
            select(Question.created_by_user_id)
            .where(
                Question.institution_id == current_user.institution_id,
                Question.created_by_user_id.is_not(None),
            )
            .distinct()
        )
        stmt = stmt.where(
            or_(
                User.institution_id == current_user.institution_id,
                User.id == current_user.id,
                User.id.in_(creator_ids_for_institution),
            )
        )
    return list(db.scalars(stmt.order_by(User.full_name)))


def difficulty_levels_for_category(category: str | None) -> list[str]:
    return DIFFICULTY_LEVELS_BY_CATEGORY.get(
        category or "other", DIFFICULTY_LEVELS_BY_CATEGORY["other"]
    )


def make_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug or "category"


def unique_course_category_slug(db: Session, name: str, category_id: int | None = None) -> str:
    base_slug = make_slug(name)
    slug = base_slug
    index = 2
    while True:
        stmt = select(CourseCategory).where(CourseCategory.slug == slug)
        if category_id is not None:
            stmt = stmt.where(CourseCategory.id != category_id)
        exists = db.scalar(stmt)
        if not exists:
            return slug
        slug = f"{base_slug}-{index}"
        index += 1


def unique_learning_path_slug(db: Session, title: str, institution_id: int, path_id: int | None = None) -> str:
    base_slug = make_slug(title)
    if base_slug == "category":
        base_slug = f"path-{institution_id}"
    slug = base_slug
    index = 2
    while True:
        stmt = select(LearningPath).where(LearningPath.slug == slug)
        if path_id is not None:
            stmt = stmt.where(LearningPath.id != path_id)
        exists = db.scalar(stmt)
        if not exists:
            return slug
        slug = f"{base_slug}-{index}"
        index += 1


def get_course_category_or_404(
    category_id: int, db: Session, institution_id: int | None = None
) -> CourseCategory:
    stmt = select(CourseCategory).where(CourseCategory.id == category_id)
    if institution_id is not None:
        stmt = stmt.where(CourseCategory.institution_id == institution_id)
    category = db.scalar(stmt)
    if not category:
        raise HTTPException(status_code=404, detail="Course category not found")
    return category


def validate_course_category_payload(
    parent_id: int | None,
    name: str,
    institution_id: int,
    db: Session,
    category_id: int | None = None,
) -> None:
    normalized_name = name.strip()
    if not normalized_name:
        raise HTTPException(status_code=422, detail="Course category name is required")
    if parent_id is not None:
        if parent_id == category_id:
            raise HTTPException(status_code=422, detail="A category cannot be its own parent")
        parent = get_course_category_or_404(parent_id, db, institution_id)
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail="Only two category levels are supported")
    if category_id is not None and parent_id is not None:
        has_children = db.scalar(
            select(func.count(CourseCategory.id)).where(CourseCategory.parent_id == category_id)
        )
        if has_children:
            raise HTTPException(status_code=422, detail="A parent category with children cannot become a subcategory")

    stmt = select(CourseCategory).where(
        CourseCategory.institution_id == institution_id,
        CourseCategory.name == normalized_name,
        CourseCategory.parent_id.is_(None) if parent_id is None else CourseCategory.parent_id == parent_id,
    )
    if category_id is not None:
        stmt = stmt.where(CourseCategory.id != category_id)
    if db.scalar(stmt):
        raise HTTPException(status_code=409, detail="Course category already exists under this parent")


def validate_question_difficulty(
    institution_id: int | None,
    difficulty: str | None,
    db: Session,
) -> None:
    if not difficulty:
        return
    institution = db.get(Institution, institution_id) if institution_id else None
    allowed = difficulty_levels_for_category(institution.category if institution else None)
    if difficulty not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Difficulty '{difficulty}' is not allowed for this institution category",
        )


def validate_question_type_for_institution(
    institution_id: int | None,
    question_type: QuestionType | str | None,
    db: Session,
) -> None:
    if not question_type:
        return
    type_value = question_type.value if isinstance(question_type, QuestionType) else question_type
    if type_value in RETIRED_QUESTION_TYPES:
        raise HTTPException(status_code=422, detail="Code review questions are no longer supported")
    if type_value not in CODE_QUESTION_TYPES:
        return
    institution = db.get(Institution, institution_id) if institution_id else None
    if not institution or institution.category != "it":
        raise HTTPException(
            status_code=422,
            detail="Coding questions are only available for IT education institutions",
        )


def question_detail_stmt():
    return select(Question).options(
        selectinload(Question.options),
        selectinload(Question.media_assets),
    )


def get_question_or_404(question_id: int, db: Session) -> Question:
    question = db.scalar(question_detail_stmt().where(Question.id == question_id))
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


def course_detail_stmt():
    return select(Course).options(
        joinedload(Course.institution),
        joinedload(Course.teacher).joinedload(Teacher.institution),
        selectinload(Course.chapters).selectinload(CourseChapter.items),
    )


def get_course_or_404(course_id: int, current_user: User, db: Session) -> Course:
    course = db.scalar(course_detail_stmt().where(Course.id == course_id))
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current_user.role == UserRole.institution_admin and current_user.institution_id:
        if course.institution_id != current_user.institution_id:
            raise HTTPException(status_code=403, detail="Course belongs to another institution")
    if current_user.role == UserRole.teacher:
        teacher = sync_teacher_record_for_user(current_user, db)
        if course.teacher_id != teacher.id:
            raise HTTPException(status_code=403, detail="Course belongs to another teacher")
    return course


def ensure_current_teacher_owns_course(course: Course, current_user: User, db: Session) -> None:
    if current_user.role not in {UserRole.teacher, UserRole.super_admin}:
        return
    teacher = sync_teacher_record_for_user(current_user, db)
    if course.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Only the assigned teacher can modify this course")


def learning_path_detail_stmt():
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


def learning_path_to_out(path: LearningPath) -> LearningPathOut:
    links = sorted(path.course_links, key=lambda link: link.position)
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
            if link.course
        ],
        created_at=path.created_at,
        updated_at=path.updated_at,
    )


def get_learning_path_or_404(path_id: int, current_user: User, db: Session) -> LearningPath:
    institution_id = get_current_institution_id_or_403(current_user)
    path = db.scalar(
        learning_path_detail_stmt().where(
            LearningPath.id == path_id,
            LearningPath.institution_id == institution_id,
            LearningPath.status != LearningPathStatus.archived,
        )
    )
    if not path:
        raise HTTPException(status_code=404, detail="Learning path not found")
    return path


def normalize_course_ids(course_ids: list[int]) -> list[int]:
    seen: set[int] = set()
    normalized: list[int] = []
    for course_id in course_ids:
        if course_id not in seen:
            normalized.append(course_id)
            seen.add(course_id)
    return normalized


def validate_learning_path_courses(
    course_ids: list[int], current_user: User, db: Session
) -> list[int]:
    normalized_ids = normalize_course_ids(course_ids)
    if not normalized_ids:
        return []
    institution_id = get_current_institution_id_or_403(current_user)
    stmt = select(Course).where(
        Course.id.in_(normalized_ids),
        Course.institution_id == institution_id,
        Course.status != CourseStatus.archived,
    )
    existing_courses = list(db.scalars(stmt))
    existing_course_ids = {course.id for course in existing_courses}
    missing_ids = [course_id for course_id in normalized_ids if course_id not in existing_course_ids]
    if missing_ids:
        raise HTTPException(status_code=422, detail="部分课程不属于当前机构或已经不存在，不能加入学习路径")
    return normalized_ids


def sync_learning_path_courses(path: LearningPath, course_ids: list[int], db: Session) -> None:
    path.course_links.clear()
    if path.id is not None:
        db.flush()
    for index, course_id in enumerate(course_ids, start=1):
        path.course_links.append(LearningPathCourse(course_id=course_id, position=index))


def unique_exam_paper_slug(db: Session, title: str, institution_id: int, paper_id: int | None = None) -> str:
    base_slug = make_slug(title)
    if base_slug == "category":
        base_slug = f"paper-{institution_id}"
    slug = base_slug
    index = 2
    while True:
        stmt = select(ExamPaper).where(ExamPaper.slug == slug)
        if paper_id is not None:
            stmt = stmt.where(ExamPaper.id != paper_id)
        exists = db.scalar(stmt)
        if not exists:
            return slug
        slug = f"{base_slug}-{index}"
        index += 1


def exam_paper_detail_stmt():
    return select(ExamPaper).options(
        joinedload(ExamPaper.institution),
        joinedload(ExamPaper.category),
        selectinload(ExamPaper.question_links)
        .joinedload(ExamPaperQuestion.question)
        .selectinload(Question.options),
        selectinload(ExamPaper.question_links)
        .joinedload(ExamPaperQuestion.question)
        .selectinload(Question.media_assets),
        selectinload(ExamPaper.registrations),
        selectinload(ExamPaper.submissions),
    )


def exam_paper_to_out(paper: ExamPaper) -> ExamPaperOut:
    links = sorted(paper.question_links, key=lambda link: link.position)
    registrations = sorted(paper.registrations, key=lambda item: item.created_at, reverse=True)
    submissions = sorted(paper.submissions, key=lambda item: item.submitted_at, reverse=True)
    return ExamPaperOut(
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
        registrations_count=len(registrations),
        submissions_count=len(submissions),
        questions=[
            ExamPaperQuestionOut(
                id=link.id,
                position=link.position,
                points=link.points_override if link.points_override is not None else link.question.points,
                question=QuestionOut.model_validate(link.question),
            )
            for link in links
            if link.question
        ],
        registrations=[CompetitionRegistrationOut.model_validate(registration) for registration in registrations],
        submissions=[ExamPaperSubmissionOut.model_validate(submission) for submission in submissions],
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )


def get_exam_paper_or_404(paper_id: int, current_user: User, db: Session) -> ExamPaper:
    institution_id = get_current_institution_id_or_403(current_user)
    paper = db.scalar(
        exam_paper_detail_stmt().where(
            ExamPaper.id == paper_id,
            ExamPaper.institution_id == institution_id,
            ExamPaper.status != ExamPaperStatus.archived,
        )
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Exam paper not found")
    return paper


def validate_exam_category(category_id: int | None, institution_id: int, db: Session) -> int | None:
    if category_id is None:
        return None
    category = db.scalar(
        select(CourseCategory).where(CourseCategory.id == category_id, CourseCategory.institution_id == institution_id)
    )
    if not category:
        raise HTTPException(status_code=422, detail="Course category does not belong to this institution")
    return category.id


def normalize_exam_question_inputs(question_inputs: list) -> list:
    seen: set[int] = set()
    normalized: list = []
    for question_input in question_inputs:
        if question_input.question_id in seen:
            continue
        seen.add(question_input.question_id)
        normalized.append(question_input)
    return normalized


def validate_exam_questions(question_inputs: list, institution_id: int, db: Session) -> list:
    normalized = normalize_exam_question_inputs(question_inputs)
    if not normalized:
        return []
    question_ids = [question_input.question_id for question_input in normalized]
    questions = list(
        db.scalars(
            select(Question).where(
                Question.id.in_(question_ids),
                Question.institution_id == institution_id,
                Question.status == QuestionStatus.published,
                Question.type != QuestionType.code_review,
            )
        )
    )
    existing_ids = {question.id for question in questions}
    missing_ids = [question_id for question_id in question_ids if question_id not in existing_ids]
    if missing_ids:
        raise HTTPException(status_code=422, detail="Some selected questions are not available")
    return normalized


def normalize_exam_paper_payload(payload: ExamPaperCreate | ExamPaperUpdate, institution_id: int, db: Session) -> dict:
    data = payload.model_dump(exclude={"questions"})
    if data.get("kind") == ExamPaperKind.competition:
        raise HTTPException(status_code=422, detail="Use /admin/competitions for competitions")
    data["title"] = data["title"].strip()
    data["description"] = data.get("description", "").strip()
    data["cover_url"] = data.get("cover_url", "").strip()
    data["instructions"] = data.get("instructions", "").strip()
    data["audience"] = data.get("audience", "").strip()
    data["category_id"] = validate_exam_category(data.get("category_id"), institution_id, db)

    if data["source_type"] == ExamPaperSourceType.past_paper and not data.get("past_year"):
        raise HTTPException(status_code=422, detail="Past paper year is required")
    if data["source_type"] == ExamPaperSourceType.mock:
        data["past_year"] = None

    data["starts_at"] = None
    data["ends_at"] = None

    if data["status"] == ExamPaperStatus.published and not payload.questions:
        raise HTTPException(status_code=422, detail="Published papers must include at least one question")
    return data


def sync_exam_paper_questions(paper: ExamPaper, question_inputs: list, db: Session) -> None:
    paper.question_links.clear()
    if paper.id is not None:
        db.flush()
    for index, question_input in enumerate(question_inputs, start=1):
        paper.question_links.append(
            ExamPaperQuestion(
                question_id=question_input.question_id,
                position=index,
                points_override=question_input.points_override,
            )
        )


def unique_competition_slug(db: Session, title: str, institution_id: int, competition_id: int | None = None) -> str:
    base_slug = make_slug(title)
    if base_slug == "category":
        base_slug = f"competition-{institution_id}"
    slug = base_slug
    index = 2
    while True:
        stmt = select(Competition).where(Competition.slug == slug)
        if competition_id is not None:
            stmt = stmt.where(Competition.id != competition_id)
        exists = db.scalar(stmt)
        if not exists:
            return slug
        slug = f"{base_slug}-{index}"
        index += 1


def competition_detail_stmt():
    return select(Competition).options(
        joinedload(Competition.institution),
        joinedload(Competition.category),
        selectinload(Competition.question_links)
        .joinedload(CompetitionQuestion.question)
        .selectinload(Question.options),
        selectinload(Competition.question_links)
        .joinedload(CompetitionQuestion.question)
        .selectinload(Question.media_assets),
        selectinload(Competition.registrations),
        selectinload(Competition.submissions),
    )


def competition_to_out(competition: Competition) -> CompetitionOut:
    links = sorted(competition.question_links, key=lambda link: link.position)
    registrations = sorted(competition.registrations, key=lambda item: item.created_at, reverse=True)
    submissions = sorted(competition.submissions, key=lambda item: item.submitted_at, reverse=True)
    return CompetitionOut(
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
        registrations_count=len(registrations),
        submissions_count=len(submissions),
        questions=[
            CompetitionQuestionOut(
                id=link.id,
                position=link.position,
                points=link.points_override if link.points_override is not None else link.question.points,
                question=QuestionOut.model_validate(link.question),
            )
            for link in links
            if link.question
        ],
        registrations=[CompetitionRegistrationOut.model_validate(registration) for registration in registrations],
        submissions=[CompetitionSubmissionOut.model_validate(submission) for submission in submissions],
        created_at=competition.created_at,
        updated_at=competition.updated_at,
    )


def get_competition_or_404(competition_id: int, current_user: User, db: Session) -> Competition:
    institution_id = get_current_institution_id_or_403(current_user)
    competition = db.scalar(
        competition_detail_stmt().where(
            Competition.id == competition_id,
            Competition.institution_id == institution_id,
            Competition.status != ExamPaperStatus.archived,
        )
    )
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    return competition


def validate_competition_difficulty(difficulty: str | None, institution_id: int, db: Session) -> str:
    institution = db.get(Institution, institution_id)
    levels = difficulty_levels_for_category(institution.category if institution else None)
    value = (difficulty or "").strip() or levels[0]
    if value not in levels:
        raise HTTPException(status_code=422, detail="Competition difficulty is not valid for this institution")
    return value


def normalize_competition_prizes(prizes: list) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    seen_ranks: set[int] = set()
    for index, prize in enumerate(prizes or [], start=1):
        data = prize.model_dump() if hasattr(prize, "model_dump") else dict(prize)
        rank = int(data.get("rank") or index)
        description = str(data.get("description") or "").strip()
        prize_type = str(data.get("prize_type") or "item").strip() or "item"
        if rank < 1 or rank in seen_ranks or not description:
            continue
        seen_ranks.add(rank)
        normalized.append(
            {
                "rank": rank,
                "prize_type": prize_type[:40],
                "description": description[:500],
            }
        )
    return sorted(normalized, key=lambda item: int(item["rank"]))


def normalize_competition_payload(payload: CompetitionCreate | CompetitionUpdate, institution_id: int, db: Session) -> dict:
    data = payload.model_dump(exclude={"questions"})
    data["title"] = data["title"].strip()
    data["description"] = data.get("description", "").strip()
    data["cover_url"] = data.get("cover_url", "").strip()
    data["instructions"] = data.get("instructions", "").strip()
    data["audience"] = data.get("audience", "").strip()
    data["category_id"] = validate_exam_category(data.get("category_id"), institution_id, db)
    data["difficulty"] = validate_competition_difficulty(data.get("difficulty"), institution_id, db)
    data["prizes"] = normalize_competition_prizes(data.get("prizes") or [])
    if not data.get("starts_at") or not data.get("ends_at"):
        raise HTTPException(status_code=422, detail="Competition start and end time are required")
    if data["ends_at"] <= data["starts_at"]:
        raise HTTPException(status_code=422, detail="Competition end time must be after start time")
    if data["status"] == ExamPaperStatus.published and not payload.questions:
        raise HTTPException(status_code=422, detail="Published competitions must include at least one question")
    return data


def sync_competition_questions(competition: Competition, question_inputs: list, db: Session) -> None:
    competition.question_links.clear()
    if competition.id is not None:
        db.flush()
    for index, question_input in enumerate(question_inputs, start=1):
        competition.question_links.append(
            CompetitionQuestion(
                question_id=question_input.question_id,
                position=index,
                points_override=question_input.points_override,
            )
        )


def sync_question_children(
    question: Question,
    options: list | None,
    media_assets: list | None,
    db: Session,
) -> None:
    if options is not None:
        question.options.clear()
        if question.id is not None:
            db.flush()
        for index, option in enumerate(options, start=1):
            data = option.model_dump()
            data["position"] = data.get("position") or index
            question.options.append(QuestionOption(**data))

    if media_assets is not None:
        question.media_assets.clear()
        if question.id is not None:
            db.flush()
        for index, media in enumerate(media_assets, start=1):
            data = media.model_dump()
            data["position"] = data.get("position") or index
            question.media_assets.append(QuestionMedia(**data))


def detach_lesson_item_references(item_ids: list[int], db: Session) -> None:
    if not item_ids:
        return
    db.execute(
        update(Enrollment)
        .where(Enrollment.current_item_id.in_(item_ids))
        .values(current_item_id=None)
    )
    db.execute(delete(ProgressRecord).where(ProgressRecord.lesson_item_id.in_(item_ids)))
    db.execute(delete(Submission).where(Submission.lesson_item_id.in_(item_ids)))


def sync_chapter_items(chapter: CourseChapter, items: list, db: Session) -> None:
    existing_items = {item.id: item for item in chapter.items if item.id is not None}
    incoming_existing_ids = {
        item_payload.id for item_payload in items if item_payload.id in existing_items
    }

    removed_items = [
        item
        for item in list(chapter.items)
        if item.id is not None and item.id not in incoming_existing_ids
    ]
    detach_lesson_item_references([item.id for item in removed_items if item.id is not None], db)
    for item in removed_items:
        chapter.items.remove(item)
        db.delete(item)
    if removed_items:
        db.flush()

    retained_items = [
        existing_items[item_payload.id]
        for item_payload in items
        if item_payload.id in existing_items
    ]
    if retained_items:
        max_position = max([item.position or 0 for item in list(chapter.items)] + [len(items)])
        for offset, item in enumerate(retained_items, start=1):
            item.position = max_position + offset
        db.flush()

    for item_index, item_payload in enumerate(items, start=1):
        item = existing_items.get(item_payload.id) if item_payload.id else None
        if item is None:
            item = LessonItem()
            chapter.items.append(item)

        item_data = item_payload.model_dump(exclude={"id"})
        item_data["position"] = item_index
        for field, value in item_data.items():
            setattr(item, field, value)


def sync_course_chapters(course: Course, chapters: list, db: Session) -> None:
    existing_chapters = {chapter.id: chapter for chapter in course.chapters if chapter.id is not None}
    incoming_existing_ids = {
        chapter_payload.id for chapter_payload in chapters if chapter_payload.id in existing_chapters
    }

    removed_chapters = [
        chapter
        for chapter in list(course.chapters)
        if chapter.id is not None and chapter.id not in incoming_existing_ids
    ]
    for chapter in removed_chapters:
        detach_lesson_item_references(
            [item.id for item in chapter.items if item.id is not None],
            db,
        )
        course.chapters.remove(chapter)
        db.delete(chapter)
    if removed_chapters:
        db.flush()

    retained_chapters = [
        existing_chapters[chapter_payload.id]
        for chapter_payload in chapters
        if chapter_payload.id in existing_chapters
    ]
    if retained_chapters:
        max_position = max([chapter.position or 0 for chapter in list(course.chapters)] + [len(chapters)])
        for offset, chapter in enumerate(retained_chapters, start=1):
            chapter.position = max_position + offset
        db.flush()

    for chapter_index, chapter_payload in enumerate(chapters, start=1):
        chapter = existing_chapters.get(chapter_payload.id) if chapter_payload.id else None
        if chapter is None:
            chapter = CourseChapter()
            course.chapters.append(chapter)

        chapter_data = chapter_payload.model_dump(exclude={"id", "items"})
        chapter_data["position"] = chapter_index
        for field, value in chapter_data.items():
            setattr(chapter, field, value)
        sync_chapter_items(chapter, chapter_payload.items, db)

@router.get("/profile", response_model=AdminProfileOut)
def admin_profile(current_user: User = Depends(get_current_user)) -> User:
    ensure_admin(current_user)
    return current_user


@router.put("/profile", response_model=AdminProfileOut)
def update_admin_profile(
    payload: AdminProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    ensure_admin(current_user)
    if normalize_email(payload.email) != normalize_email(current_user.email):
        raise HTTPException(status_code=422, detail="Profile email cannot be changed")

    current_user.full_name = payload.full_name
    current_user.avatar_url = payload.avatar_url
    current_user.title = payload.title
    current_user.phone = payload.phone
    current_user.region = payload.region
    current_user.bio = payload.bio
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/profile/password-code", response_model=AdminPasswordCodeOut)
def request_admin_password_change_code(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminPasswordCodeOut:
    ensure_admin(current_user)
    if not current_user.hashed_password:
        raise HTTPException(status_code=422, detail="Password login is not enabled for this account")
    email = normalize_email(current_user.email)
    code = issue_admin_password_change_code(current_user, db)
    email_sent = send_admin_password_change_code_email(email, code)
    return AdminPasswordCodeOut(
        message=(
            "Verification code sent to the account email."
            if email_sent
            else "SMTP is not configured. The verification code is shown on the page and printed in the FastAPI console."
        ),
        expires_in_seconds=PASSWORD_CHANGE_CODE_TTL_SECONDS,
        demo_code=None if email_sent else code,
    )


@router.post("/profile/password", response_model=AdminProfileOut)
def update_admin_password(
    payload: AdminPasswordUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    ensure_admin(current_user)
    verify_admin_password_change_code(current_user.email, payload.verification_code, db)
    current_user.hashed_password = pwd_context.hash(payload.new_password)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/users", response_model=list[AdminUserOut])
def admin_users(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[User]:
    ensure_user_manager(current_user)
    stmt = select(User).where(User.role.in_(MANAGED_USER_ROLES)).order_by(User.updated_at.desc())
    if current_user.role == UserRole.institution_admin and current_user.institution_id:
        stmt = stmt.where(User.institution_id == current_user.institution_id)
    return list(db.scalars(stmt))


@router.post("/users", response_model=AdminUserOut, status_code=201)
def create_admin_user(
    payload: AdminUserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    ensure_user_manager(current_user)
    if payload.role not in MANAGED_USER_ROLES:
        raise HTTPException(status_code=422, detail="Unsupported user role")
    if current_user.role == UserRole.institution_admin and payload.role == UserRole.super_admin:
        raise HTTPException(status_code=403, detail="Institution admins cannot create super admins")
    email = normalize_email(payload.email)
    ensure_global_email_available(email, db)

    institution = get_admin_institution(current_user, db)
    user = User(
        email=email,
        full_name=payload.full_name,
        role=payload.role,
        hashed_password=pwd_context.hash("888888"),
        institution_id=institution.id if institution else None,
        title=payload.title,
        phone=payload.phone,
        region=payload.region,
        bio=payload.bio,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=AdminUserOut)
def update_admin_user(
    user_id: int,
    payload: AdminUserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    ensure_user_manager(current_user)
    user = db.get(User, user_id)
    if not user or user.role not in MANAGED_USER_ROLES:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role == UserRole.institution_admin:
        if user.institution_id != current_user.institution_id:
            raise HTTPException(status_code=403, detail="User belongs to another institution")
        if payload.role == UserRole.super_admin:
            raise HTTPException(status_code=403, detail="Institution admins cannot assign super admin")
    # Personal identity fields are edited only from the user's own profile.
    user.role = payload.role
    user.title = payload.title
    user.region = payload.region
    user.bio = payload.bio
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_admin_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    ensure_user_manager(current_user)
    if user_id == current_user.id:
        raise HTTPException(status_code=422, detail="You cannot delete your own account")
    user = db.get(User, user_id)
    if not user or user.role not in MANAGED_USER_ROLES:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role == UserRole.institution_admin and user.institution_id != current_user.institution_id:
        raise HTTPException(status_code=403, detail="User belongs to another institution")
    db.delete(user)
    db.commit()
    return {"id": user_id, "deleted": True}


@router.get("/overview", response_model=AdminOverviewOut)
def overview(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AdminOverviewOut:
    ensure_admin(current_user)
    total_courses = db.scalar(select(func.count(Course.id))) or 0
    active_subscription_rows = list(db.scalars(select(Subscription).where(Subscription.status == "active")))
    active_subscriptions = len(active_subscription_rows)
    pending_manual = (
        db.scalar(
            select(func.count(Submission.id)).where(
                Submission.status == SubmissionStatus.pending_manual
            )
        )
        or 0
    )
    return AdminOverviewOut(
        total_courses=total_courses,
        active_subscriptions=active_subscriptions,
        monthly_recurring_revenue_eur=round(sum(float(subscription.amount_eur_monthly or 0) for subscription in active_subscription_rows), 2),
        pending_manual_grading=pending_manual,
        subscription_growth=[
            {"month": "2026-02", "subscriptions": 42},
            {"month": "2026-03", "subscriptions": 58},
            {"month": "2026-04", "subscriptions": 76},
            {"month": "2026-05", "subscriptions": 94},
            {"month": "2026-06", "subscriptions": active_subscriptions},
        ],
    )


@router.get("/institution", response_model=InstitutionOut)
def admin_institution(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Institution:
    ensure_admin(current_user)
    institution = get_admin_institution(current_user, db)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    return institution


@router.put("/institution", response_model=InstitutionOut)
def update_admin_institution(
    payload: InstitutionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Institution:
    ensure_admin(current_user)
    institution = get_admin_institution(current_user, db)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    if payload.name != institution.name:
        existing = db.scalar(select(Institution).where(Institution.name == payload.name, Institution.id != institution.id))
        if existing:
            raise HTTPException(status_code=409, detail="Institution name already exists")

    payload_data = payload.model_dump()
    email = normalize_email(payload.email) if payload.email else None
    if email and email != normalize_email(institution.email):
        ensure_global_email_available(email, db, exclude_institution_id=institution.id)
    payload_data["email"] = email

    for field, value in payload_data.items():
        setattr(institution, field, value)
    db.commit()
    db.refresh(institution)
    return institution


@router.get("/institution/finance", response_model=InstitutionFinanceOut)
def admin_institution_finance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InstitutionFinanceOut:
    ensure_admin(current_user)
    institution = get_admin_institution(current_user, db)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")

    account = None
    balance = None
    settings = get_settings()
    if settings.stripe_secret_key:
        try:
            stripe = get_stripe_client()
            if institution.payout_mode == "platform":
                account = stripe.Account.retrieve()
                balance = stripe.Balance.retrieve()
            elif institution.stripe_account_id:
                account = stripe.Account.retrieve(institution.stripe_account_id)
                balance = stripe.Balance.retrieve(stripe_account=institution.stripe_account_id)
            if account:
                update_institution_stripe_state(institution, account)
                db.commit()
                db.refresh(institution)
        except Exception as exc:
            print(f"[stripe-finance-sync-error] institution={institution.id}: {exc}")

        pending_subscriptions = list(
            db.scalars(
                select(Subscription)
                .join(Course, Subscription.course_id == Course.id)
                .where(
                    Course.institution_id == institution.id,
                    Subscription.status == "pending",
                    Subscription.stripe_checkout_session_id.is_not(None),
                )
            )
        )
        for subscription in pending_subscriptions:
            try:
                sync_checkout_session_if_complete(subscription.stripe_checkout_session_id or "", db)
            except Exception as exc:
                print(f"[stripe-subscription-sync-error] subscription={subscription.id}: {exc}")
        if pending_subscriptions:
            db.commit()

    rows = db.execute(
        select(Subscription, Course, User)
        .join(Course, Subscription.course_id == Course.id)
        .join(User, Subscription.user_id == User.id)
        .where(Course.institution_id == institution.id)
        .order_by(Subscription.created_at.desc())
    ).all()
    payments = [subscription_payment_to_out(subscription, course, student, institution) for subscription, course, student in rows]
    return build_institution_finance_out(institution, account, balance, payments)


@router.post("/institution/stripe/connect", response_model=StripeConnectOnboardingOut)
def start_stripe_connect_onboarding(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StripeConnectOnboardingOut:
    ensure_admin(current_user)
    institution = get_admin_institution(current_user, db)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    if not institution_agreements_completed(institution):
        raise HTTPException(status_code=403, detail=PUBLISH_AGREEMENT_DETAIL)

    stripe = get_stripe_client()
    settings = get_settings()
    if institution.payout_mode == "platform":
        try:
            account = stripe.Account.retrieve()
            update_institution_stripe_state(institution, account)
            db.commit()
            db.refresh(institution)
        except Exception as exc:
            print(f"[stripe-platform-account-sync-error] institution={institution.id}: {exc}")
        return StripeConnectOnboardingOut(url="https://dashboard.stripe.com/settings/account", institution=institution)

    try:
        if institution.stripe_account_id:
            account = stripe.Account.retrieve(institution.stripe_account_id)
        else:
            account = stripe.Account.create(
                type="express",
                country=settings.stripe_default_country,
                email=institution.email,
                business_type="company" if institution.institution_type == "organization" else "individual",
                capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
                metadata={"institution_id": str(institution.id)},
            )
            account_id = stripe_value(account, "id")
            if not account_id:
                raise RuntimeError("Stripe did not return a connected account id")
            institution.stripe_account_id = str(account_id)

        update_institution_stripe_state(institution, account)
        db.commit()
        db.refresh(institution)

        frontend_url = settings.frontend_base_url.rstrip("/")
        account_link = stripe.AccountLink.create(
            account=institution.stripe_account_id,
            refresh_url=f"{frontend_url}/admin?module=institution&stripe=refresh",
            return_url=f"{frontend_url}/admin?module=institution&stripe=return",
            type="account_onboarding",
        )
        url = stripe_value(account_link, "url", "")
        if not url:
            raise RuntimeError("Stripe did not return an onboarding URL")
    except Exception as exc:
        db.rollback()
        raise stripe_operation_failed("Stripe Connect onboarding failed", exc) from exc

    return StripeConnectOnboardingOut(url=str(url), institution=institution)


@router.post("/institution/stripe/login-link", response_model=StripeDashboardLinkOut)
def create_stripe_dashboard_login_link(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StripeDashboardLinkOut:
    ensure_admin(current_user)
    institution = get_admin_institution(current_user, db)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    stripe = get_stripe_client()
    if institution.payout_mode == "platform":
        try:
            account = stripe.Account.retrieve()
            update_institution_stripe_state(institution, account)
            db.commit()
            db.refresh(institution)
        except Exception as exc:
            print(f"[stripe-platform-login-sync-error] institution={institution.id}: {exc}")
        return StripeDashboardLinkOut(url="https://dashboard.stripe.com", institution=institution)
    try:
        if not institution.stripe_account_id:
            raise HTTPException(status_code=409, detail="Stripe account is not connected")
        account = stripe.Account.retrieve(institution.stripe_account_id)
        update_institution_stripe_state(institution, account)
        try:
            login_link = stripe.Account.create_login_link(institution.stripe_account_id)
        except AttributeError:
            login_link = stripe.LoginLink.create(account=institution.stripe_account_id)
        db.commit()
        db.refresh(institution)
        url = stripe_value(login_link, "url", "")
        if not url:
            raise RuntimeError("Stripe did not return a dashboard login URL")
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise stripe_operation_failed("Stripe dashboard login link failed", exc) from exc

    return StripeDashboardLinkOut(url=str(url), institution=institution)


@router.post("/institution/stripe/sync", response_model=InstitutionOut)
def sync_stripe_connect_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Institution:
    ensure_admin(current_user)
    institution = get_admin_institution(current_user, db)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    if institution.payout_mode != "platform" and not institution.stripe_account_id:
        return institution
    stripe = get_stripe_client()
    try:
        account = stripe.Account.retrieve() if institution.payout_mode == "platform" else stripe.Account.retrieve(institution.stripe_account_id)
        update_institution_stripe_state(institution, account)
        db.commit()
        db.refresh(institution)
    except Exception as exc:
        db.rollback()
        raise stripe_operation_failed("Stripe status sync failed", exc) from exc
    return institution


@router.get("/activities", response_model=list[AdminActivityOut])
def admin_activities(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[AdminActivityOut]:
    ensure_admin(current_user)
    institution_id = get_current_institution_id_or_403(current_user)
    activities = db.scalars(
        select(InstitutionActivity)
        .where(InstitutionActivity.institution_id == institution_id)
        .options(joinedload(InstitutionActivity.institution), selectinload(InstitutionActivity.registrations))
        .order_by(InstitutionActivity.starts_at.desc(), InstitutionActivity.updated_at.desc())
    ).all()
    return [admin_activity_to_out(activity) for activity in activities]


@router.post("/activities", response_model=AdminActivityOut, status_code=201)
def create_activity(
    payload: ActivityCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminActivityOut:
    ensure_admin(current_user)
    ensure_institution_can_publish(current_user, db)
    institution_id = get_current_institution_id_or_403(current_user)
    data = normalize_activity_payload(payload.model_dump())
    activity = InstitutionActivity(institution_id=institution_id, **data)
    db.add(activity)
    db.commit()
    return admin_activity_to_out(get_activity_or_404(activity.id, current_user, db))


@router.put("/activities/{activity_id}", response_model=AdminActivityOut)
def update_activity(
    activity_id: int,
    payload: ActivityUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminActivityOut:
    ensure_admin(current_user)
    ensure_institution_can_publish(current_user, db)
    activity = get_activity_or_404(activity_id, current_user, db)
    data = normalize_activity_payload(payload.model_dump())
    for field, value in data.items():
        setattr(activity, field, value)
    db.commit()
    return admin_activity_to_out(get_activity_or_404(activity.id, current_user, db))


@router.delete("/activities/{activity_id}")
def delete_activity(
    activity_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    ensure_admin(current_user)
    activity = get_activity_or_404(activity_id, current_user, db)
    db.delete(activity)
    db.commit()
    return {"id": activity_id, "deleted": True}


@router.get("/difficulty-levels")
def admin_difficulty_levels(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict[str, object]:
    ensure_question_staff(current_user)
    institution = get_admin_institution(current_user, db)
    category = institution.category if institution else "other"
    return {"category": category, "levels": difficulty_levels_for_category(category)}


@router.get("/course-categories", response_model=list[CourseCategoryOut])
def admin_course_categories(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[CourseCategory]:
    ensure_course_staff(current_user)
    institution_id = get_current_institution_id_or_403(current_user)
    return list(
        db.scalars(
            select(CourseCategory).where(CourseCategory.institution_id == institution_id).order_by(
                CourseCategory.parent_id.nullsfirst(), CourseCategory.position, CourseCategory.name
            )
        )
    )


@router.post("/course-categories", response_model=CourseCategoryOut, status_code=201)
def create_course_category(
    payload: CourseCategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CourseCategory:
    ensure_super_admin(current_user)
    institution_id = get_current_institution_id_or_403(current_user)
    name = payload.name.strip()
    validate_course_category_payload(payload.parent_id, name, institution_id, db)
    category = CourseCategory(
        institution_id=institution_id,
        parent_id=payload.parent_id,
        name=name,
        slug=unique_course_category_slug(db, name),
        position=payload.position,
        is_active=payload.is_active,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/course-categories/{category_id}", response_model=CourseCategoryOut)
def update_course_category(
    category_id: int,
    payload: CourseCategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CourseCategory:
    ensure_super_admin(current_user)
    institution_id = get_current_institution_id_or_403(current_user)
    category = get_course_category_or_404(category_id, db, institution_id)
    name = payload.name.strip()
    validate_course_category_payload(payload.parent_id, name, institution_id, db, category_id)
    category.parent_id = payload.parent_id
    category.name = name
    category.slug = unique_course_category_slug(db, name, category.id)
    category.position = payload.position
    category.is_active = payload.is_active
    db.commit()
    db.refresh(category)
    return category


@router.delete("/course-categories/{category_id}")
def delete_course_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    ensure_super_admin(current_user)
    institution_id = get_current_institution_id_or_403(current_user)
    category = get_course_category_or_404(category_id, db, institution_id)
    db.delete(category)
    db.commit()
    return {"id": category_id, "deleted": True}


@router.get("/learning-paths", response_model=list[LearningPathOut])
def admin_learning_paths(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[LearningPathOut]:
    ensure_course_staff(current_user)
    institution_id = get_current_institution_id_or_403(current_user)
    stmt = (
        learning_path_detail_stmt()
        .where(LearningPath.institution_id == institution_id, LearningPath.status != LearningPathStatus.archived)
        .order_by(LearningPath.updated_at.desc())
    )
    return [learning_path_to_out(path) for path in db.scalars(stmt).unique()]


@router.get("/learning-path-course-options", response_model=list[CourseCardOut])
def admin_learning_path_course_options(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Course]:
    ensure_course_staff(current_user)
    institution_id = get_current_institution_id_or_403(current_user)
    stmt = (
        select(Course)
        .options(joinedload(Course.institution), joinedload(Course.teacher))
        .where(Course.institution_id == institution_id, Course.status != CourseStatus.archived)
        .order_by(Course.updated_at.desc())
    )
    return list(db.scalars(stmt))


@router.post("/learning-paths", response_model=LearningPathOut, status_code=201)
def create_learning_path(
    payload: LearningPathCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LearningPathOut:
    ensure_course_staff(current_user)
    if payload.status == LearningPathStatus.published:
        ensure_institution_can_publish(current_user, db)
    institution_id = get_current_institution_id_or_403(current_user)
    course_ids = validate_learning_path_courses(payload.course_ids, current_user, db)
    path = LearningPath(
        institution_id=institution_id,
        slug=unique_learning_path_slug(db, payload.title, institution_id),
        title=payload.title.strip(),
        subtitle=payload.subtitle.strip(),
        description=payload.description.strip(),
        cover_url=payload.cover_url.strip(),
        intro_video_url=payload.intro_video_url.strip(),
        audience=payload.audience.strip(),
        level=payload.level.strip(),
        status=payload.status,
    )
    db.add(path)
    sync_learning_path_courses(path, course_ids, db)
    db.commit()
    return learning_path_to_out(get_learning_path_or_404(path.id, current_user, db))


@router.put("/learning-paths/{path_id}", response_model=LearningPathOut)
def update_learning_path(
    path_id: int,
    payload: LearningPathUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LearningPathOut:
    ensure_course_staff(current_user)
    if payload.status == LearningPathStatus.published:
        ensure_institution_can_publish(current_user, db)
    path = get_learning_path_or_404(path_id, current_user, db)
    course_ids = validate_learning_path_courses(payload.course_ids, current_user, db)
    path.title = payload.title.strip()
    path.slug = unique_learning_path_slug(db, path.title, path.institution_id, path.id)
    path.subtitle = payload.subtitle.strip()
    path.description = payload.description.strip()
    path.cover_url = payload.cover_url.strip()
    path.intro_video_url = payload.intro_video_url.strip()
    path.audience = payload.audience.strip()
    path.level = payload.level.strip()
    path.status = payload.status
    sync_learning_path_courses(path, course_ids, db)
    db.commit()
    return learning_path_to_out(get_learning_path_or_404(path.id, current_user, db))


@router.delete("/learning-paths/{path_id}")
def delete_learning_path(
    path_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    ensure_course_staff(current_user)
    path = get_learning_path_or_404(path_id, current_user, db)
    db.delete(path)
    db.commit()
    return {"id": path_id, "deleted": True}


@router.get("/exam-papers", response_model=list[ExamPaperOut])
def admin_exam_papers(
    kind: ExamPaperKind | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ExamPaperOut]:
    ensure_course_staff(current_user)
    if kind == ExamPaperKind.competition:
        return []
    institution_id = get_current_institution_id_or_403(current_user)
    stmt = (
        exam_paper_detail_stmt()
        .where(ExamPaper.institution_id == institution_id, ExamPaper.status != ExamPaperStatus.archived)
        .order_by(ExamPaper.updated_at.desc())
    )
    if kind is not None:
        stmt = stmt.where(ExamPaper.kind == kind)
    else:
        stmt = stmt.where(ExamPaper.kind != ExamPaperKind.competition)
    return [exam_paper_to_out(paper) for paper in db.scalars(stmt).unique()]


@router.post("/exam-papers", response_model=ExamPaperOut, status_code=201)
def create_exam_paper(
    payload: ExamPaperCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExamPaperOut:
    ensure_course_staff(current_user)
    if payload.status == ExamPaperStatus.published:
        ensure_institution_can_publish(current_user, db)
    institution_id = get_current_institution_id_or_403(current_user)
    data = normalize_exam_paper_payload(payload, institution_id, db)
    question_inputs = validate_exam_questions(payload.questions, institution_id, db)
    paper = ExamPaper(
        institution_id=institution_id,
        slug=unique_exam_paper_slug(db, data["title"], institution_id),
        **data,
    )
    db.add(paper)
    sync_exam_paper_questions(paper, question_inputs, db)
    db.commit()
    return exam_paper_to_out(get_exam_paper_or_404(paper.id, current_user, db))


@router.put("/exam-papers/{paper_id}", response_model=ExamPaperOut)
def update_exam_paper(
    paper_id: int,
    payload: ExamPaperUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExamPaperOut:
    ensure_course_staff(current_user)
    if payload.status == ExamPaperStatus.published:
        ensure_institution_can_publish(current_user, db)
    institution_id = get_current_institution_id_or_403(current_user)
    paper = get_exam_paper_or_404(paper_id, current_user, db)
    data = normalize_exam_paper_payload(payload, institution_id, db)
    question_inputs = validate_exam_questions(payload.questions, institution_id, db)
    for field, value in data.items():
        setattr(paper, field, value)
    paper.slug = unique_exam_paper_slug(db, paper.title, institution_id, paper.id)
    sync_exam_paper_questions(paper, question_inputs, db)
    db.commit()
    return exam_paper_to_out(get_exam_paper_or_404(paper.id, current_user, db))


@router.delete("/exam-papers/{paper_id}")
def delete_exam_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    ensure_course_staff(current_user)
    paper = get_exam_paper_or_404(paper_id, current_user, db)
    db.delete(paper)
    db.commit()
    return {"id": paper_id, "deleted": True}


@router.get("/competitions", response_model=list[CompetitionOut])
def admin_competitions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CompetitionOut]:
    ensure_course_staff(current_user)
    institution_id = get_current_institution_id_or_403(current_user)
    stmt = (
        competition_detail_stmt()
        .where(Competition.institution_id == institution_id, Competition.status != ExamPaperStatus.archived)
        .order_by(Competition.updated_at.desc())
    )
    return [competition_to_out(competition) for competition in db.scalars(stmt).unique()]


@router.post("/competitions", response_model=CompetitionOut, status_code=201)
def create_competition(
    payload: CompetitionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompetitionOut:
    ensure_course_staff(current_user)
    if payload.status == ExamPaperStatus.published:
        ensure_institution_can_publish(current_user, db)
    institution_id = get_current_institution_id_or_403(current_user)
    data = normalize_competition_payload(payload, institution_id, db)
    question_inputs = validate_exam_questions(payload.questions, institution_id, db)
    competition = Competition(
        institution_id=institution_id,
        slug=unique_competition_slug(db, data["title"], institution_id),
        **data,
    )
    db.add(competition)
    sync_competition_questions(competition, question_inputs, db)
    db.commit()
    return competition_to_out(get_competition_or_404(competition.id, current_user, db))


@router.put("/competitions/{competition_id}", response_model=CompetitionOut)
def update_competition(
    competition_id: int,
    payload: CompetitionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompetitionOut:
    ensure_course_staff(current_user)
    if payload.status == ExamPaperStatus.published:
        ensure_institution_can_publish(current_user, db)
    institution_id = get_current_institution_id_or_403(current_user)
    competition = get_competition_or_404(competition_id, current_user, db)
    data = normalize_competition_payload(payload, institution_id, db)
    question_inputs = validate_exam_questions(payload.questions, institution_id, db)
    for field, value in data.items():
        setattr(competition, field, value)
    competition.slug = unique_competition_slug(db, competition.title, institution_id, competition.id)
    sync_competition_questions(competition, question_inputs, db)
    db.commit()
    return competition_to_out(get_competition_or_404(competition.id, current_user, db))


@router.delete("/competitions/{competition_id}")
def delete_competition(
    competition_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int | bool]:
    ensure_course_staff(current_user)
    competition = get_competition_or_404(competition_id, current_user, db)
    db.delete(competition)
    db.commit()
    return {"id": competition_id, "deleted": True}


@router.get("/courses", response_model=list[CourseCardOut])
def admin_courses(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Course]:
    ensure_course_staff(current_user)
    stmt = (
        select(Course)
        .options(joinedload(Course.institution), joinedload(Course.teacher))
        .where(Course.status != CourseStatus.archived)
        .order_by(Course.updated_at.desc())
    )
    if current_user.role == UserRole.teacher:
        teacher = sync_teacher_record_for_user(current_user, db)
        stmt = stmt.where(Course.teacher_id == teacher.id)
    elif current_user.institution_id:
        stmt = stmt.where(Course.institution_id == current_user.institution_id)
    return list(db.scalars(stmt))


@router.get("/courses/{course_id}", response_model=CourseDetailOut)
def admin_course_detail(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Course:
    ensure_course_staff(current_user)
    return get_course_or_404(course_id, current_user, db)


@router.post("/courses", response_model=CourseCardOut)
def create_course(
    payload: CourseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Course:
    ensure_course_staff(current_user)
    data = payload.model_dump()
    if current_user.role in {UserRole.teacher, UserRole.super_admin}:
        teacher = sync_teacher_record_for_user(current_user, db)
        data["teacher_id"] = teacher.id
        data["institution_id"] = teacher.institution_id
    elif current_user.role == UserRole.institution_admin and current_user.institution_id:
        if data["institution_id"] != current_user.institution_id:
            raise HTTPException(status_code=403, detail="Course belongs to another institution")
        teacher = db.get(Teacher, data["teacher_id"])
        if not teacher or teacher.institution_id != current_user.institution_id:
            raise HTTPException(status_code=403, detail="Teacher belongs to another institution")
    course = Course(**data, status=CourseStatus.draft)
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.put("/courses/{course_id}", response_model=CourseDetailOut)
def update_course(
    course_id: int,
    payload: CourseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Course:
    ensure_course_staff(current_user)
    course = get_course_or_404(course_id, current_user, db)
    data = payload.model_dump(exclude_unset=True, exclude={"chapters"})
    if data.get("status") == CourseStatus.published:
        ensure_institution_can_publish(current_user, db)
    ensure_current_teacher_owns_course(course, current_user, db)
    if current_user.role in {UserRole.teacher, UserRole.super_admin}:
        data.pop("teacher_id", None)
    elif (
        current_user.role == UserRole.institution_admin
        and current_user.institution_id
        and data.get("teacher_id") is not None
    ):
        teacher = db.get(Teacher, data["teacher_id"])
        if not teacher or teacher.institution_id != current_user.institution_id:
            raise HTTPException(status_code=403, detail="Teacher belongs to another institution")
    for field, value in data.items():
        setattr(course, field, value)
    if "chapters" in payload.model_fields_set:
        sync_course_chapters(course, payload.chapters or [], db)
    db.commit()
    return get_course_or_404(course.id, current_user, db)


@router.delete("/courses/{course_id}")
def delete_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool | int | str]:
    ensure_course_staff(current_user)
    course = get_course_or_404(course_id, current_user, db)
    ensure_current_teacher_owns_course(course, current_user, db)
    enrollment_count = (
        db.scalar(select(func.count(Enrollment.id)).where(Enrollment.course_id == course.id)) or 0
    )
    subscription_count = (
        db.scalar(select(func.count(Subscription.id)).where(Subscription.course_id == course.id)) or 0
    )
    if enrollment_count or subscription_count:
        course.status = CourseStatus.archived
        db.commit()
        return {"id": course.id, "deleted": False, "archived": True}

    for question in course.questions:
        question.course_id = None
    db.delete(course)
    db.commit()
    return {"id": course_id, "deleted": True, "archived": False}


@router.get("/teachers", response_model=list[TeacherOut])
def admin_teachers(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Teacher]:
    ensure_course_staff(current_user)
    synced_teachers = sync_teacher_records_for_admin(current_user, db)
    if not synced_teachers:
        return []
    teacher_ids = [teacher.id for teacher in synced_teachers]
    return list(
        db.scalars(
            select(Teacher)
            .options(joinedload(Teacher.institution))
            .where(Teacher.id.in_(teacher_ids))
            .order_by(Teacher.name)
        )
    )


@router.post("/teachers", response_model=TeacherOut)
def create_teacher(
    payload: TeacherCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Teacher:
    ensure_admin(current_user)
    teacher = Teacher(**payload.model_dump())
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


@router.get("/questions", response_model=list[QuestionOut])
def admin_questions(
    type: str | None = None,
    course_id: int | None = None,
    created_by_user_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Question]:
    ensure_question_staff(current_user)
    stmt = question_detail_stmt().where(Question.type != QuestionType.code_review).order_by(Question.updated_at.desc())
    if current_user.role == UserRole.super_admin:
        stmt = stmt.where(Question.created_by_user_id == (created_by_user_id or current_user.id))
    else:
        stmt = stmt.where(Question.created_by_user_id == current_user.id)
    if current_user.role != UserRole.super_admin and current_user.institution_id:
        stmt = stmt.where(Question.institution_id == current_user.institution_id)
    elif current_user.role == UserRole.super_admin and current_user.institution_id:
        stmt = stmt.where(Question.institution_id == current_user.institution_id)
    if type:
        stmt = stmt.where(Question.type == type)
    if course_id:
        stmt = stmt.where(Question.course_id == course_id)
    return list(db.scalars(stmt))


@router.post("/code/run", response_model=CodeRunOut)
def run_admin_code(
    payload: CodeRunIn,
    current_user: User = Depends(get_current_user),
) -> dict:
    ensure_question_staff(current_user)
    if payload.language.lower() not in {"python", "py"}:
        raise HTTPException(status_code=422, detail="Only Python code execution is supported")
    return run_python_code(payload.code, payload.tests)


@router.get("/question-creators", response_model=list[AdminUserOut])
def admin_question_creators(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[User]:
    ensure_question_staff(current_user)
    return question_creator_users_for_picker(current_user, db)


@router.get("/question-pool", response_model=list[QuestionOut])
def admin_question_pool(
    type: str | None = None,
    created_by_user_id: int | None = None,
    query: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Question]:
    ensure_question_staff(current_user)
    stmt = question_detail_stmt().where(
        Question.status == QuestionStatus.published,
        Question.type != QuestionType.code_review,
    )
    if current_user.institution_id:
        stmt = stmt.where(Question.institution_id == current_user.institution_id)
    if created_by_user_id:
        stmt = stmt.where(Question.created_by_user_id == created_by_user_id)
    if type:
        stmt = stmt.where(Question.type == type)
    if query:
        like_query = f"%{query.strip()}%"
        if query.strip():
            stmt = stmt.where(
                or_(
                    Question.prompt.ilike(like_query),
                    Question.skill_area.ilike(like_query),
                    Question.difficulty.ilike(like_query),
                )
            )
    return list(db.scalars(stmt.order_by(Question.updated_at.desc())))


@router.get("/questions/{question_id}", response_model=QuestionOut)
def admin_question_detail(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Question:
    ensure_question_staff(current_user)
    question = get_question_or_404(question_id, db)
    if current_user.role != UserRole.super_admin and question.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Question belongs to another creator")
    return question


@router.post("/questions", response_model=QuestionOut)
def create_question(
    payload: QuestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Question:
    ensure_question_staff(current_user)
    if payload.status == QuestionStatus.published:
        ensure_institution_can_publish(current_user, db)
    data = payload.model_dump(exclude={"options", "media_assets"})
    if current_user.institution_id:
        data["institution_id"] = current_user.institution_id
    data["created_by_user_id"] = current_user.id
    validate_question_type_for_institution(data.get("institution_id"), data.get("type"), db)
    validate_question_difficulty(data.get("institution_id"), data.get("difficulty"), db)
    question = Question(**data)
    db.add(question)
    sync_question_children(question, payload.options, payload.media_assets, db)
    db.commit()
    return get_question_or_404(question.id, db)


@router.patch("/questions/{question_id}", response_model=QuestionOut)
def update_question(
    question_id: int,
    payload: QuestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Question:
    ensure_question_staff(current_user)
    question = get_question_or_404(question_id, db)
    ensure_own_question(question, current_user)
    data = payload.model_dump(exclude_unset=True, exclude={"options", "media_assets"})
    if current_user.institution_id:
        data.pop("institution_id", None)
    data.pop("created_by_user_id", None)
    final_institution_id = data.get("institution_id", question.institution_id)
    final_difficulty = data.get("difficulty", question.difficulty)
    final_type = data.get("type", question.type)
    if data.get("status", question.status) == QuestionStatus.published:
        ensure_institution_can_publish(current_user, db)
    validate_question_type_for_institution(final_institution_id, final_type, db)
    validate_question_difficulty(final_institution_id, final_difficulty, db)
    for field, value in data.items():
        setattr(question, field, value)
    sync_question_children(
        question,
        payload.options if "options" in payload.model_fields_set else None,
        payload.media_assets if "media_assets" in payload.model_fields_set else None,
        db,
    )
    db.commit()
    return get_question_or_404(question.id, db)


@router.post("/questions/{question_id}/publish", response_model=QuestionOut)
def publish_question(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Question:
    ensure_question_staff(current_user)
    question = get_question_or_404(question_id, db)
    ensure_own_question(question, current_user)
    ensure_institution_can_publish(current_user, db)
    question.status = QuestionStatus.published
    db.commit()
    return get_question_or_404(question.id, db)


@router.delete("/questions/{question_id}", status_code=204)
def delete_question(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    ensure_question_staff(current_user)
    question = get_question_or_404(question_id, db)
    ensure_own_question(question, current_user)
    db.delete(question)
    db.commit()


@router.get("/subscriptions")
def admin_subscriptions(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[dict]:
    ensure_admin(current_user)
    rows = db.execute(
        select(Subscription, Course.title)
        .join(Course, Subscription.course_id == Course.id)
        .order_by(Subscription.created_at.desc())
    ).all()
    return [
        {
            "id": subscription.id,
            "course_title": title,
            "user_id": subscription.user_id,
            "amount_eur_monthly": float(subscription.amount_eur_monthly),
            "status": subscription.status,
        }
        for subscription, title in rows
    ]


def manual_grading_base_stmt(current_user: User, db: Session):
    stmt = (
        select(Submission)
        .where(Submission.status == SubmissionStatus.pending_manual)
        .options(
            joinedload(Submission.user),
            joinedload(Submission.enrollment).joinedload(Enrollment.course),
            joinedload(Submission.lesson_item),
            selectinload(Submission.question).joinedload(Question.institution),
            selectinload(Submission.question).selectinload(Question.options),
            selectinload(Submission.question).selectinload(Question.media_assets),
        )
    )
    if current_user.institution_id:
        stmt = stmt.where(Submission.question.has(Question.institution_id == current_user.institution_id))
    if current_user.role == UserRole.teacher:
        teacher = sync_teacher_record_for_user(current_user, db)
        stmt = stmt.where(Submission.enrollment.has(Enrollment.course.has(Course.teacher_id == teacher.id)))
    return stmt


@router.get("/grading", response_model=list[AdminGradingSubmissionOut])
def manual_grading_queue(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Submission]:
    ensure_question_staff(current_user)
    return list(
        db.scalars(
            manual_grading_base_stmt(current_user, db).order_by(Submission.created_at.asc())
        )
    )


def grading_lesson_item_question_ids(item: LessonItem) -> list[int]:
    return [
        int(question_id)
        for question_id in (item.body or {}).get("question_ids", [])
        if isinstance(question_id, int)
    ]


def recalculate_enrollment_progress(db: Session, enrollment: Enrollment) -> None:
    previous_status = enrollment.status
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
    if enrollment.status == "completed" and previous_status != "completed":
        stop_course_subscription_renewal_after_completion(db, enrollment)


def recalculate_quiz_progress_after_grading(db: Session, item: LessonItem, enrollment: Enrollment) -> None:
    question_ids = grading_lesson_item_question_ids(item)
    if not question_ids:
        return

    questions = list(
        db.scalars(
            select(Question).where(
                Question.id.in_(question_ids),
                Question.status == QuestionStatus.published,
                Question.type != QuestionType.code_review,
            )
        )
    )
    question_by_id = {question.id: question for question in questions}
    submissions = list(
        db.scalars(
            select(Submission)
            .where(
                Submission.user_id == enrollment.user_id,
                Submission.enrollment_id == enrollment.id,
                Submission.lesson_item_id == item.id,
                Submission.question_id.in_(list(question_by_id)),
            )
            .order_by(Submission.question_id, Submission.created_at.desc(), Submission.id.desc())
        )
    )
    latest_by_question_id: dict[int, Submission] = {}
    for submission in submissions:
        if submission.question_id not in latest_by_question_id:
            latest_by_question_id[submission.question_id] = submission

    latest_submissions = [
        latest_by_question_id[question_id]
        for question_id in question_ids
        if question_id in question_by_id and question_id in latest_by_question_id
    ]
    if any(submission.status == SubmissionStatus.pending_manual for submission in latest_submissions):
        return

    total_score = sum(float(question.points or 0) for question in questions)
    earned_score = sum(float(submission.score or 0) for submission in latest_submissions)
    passed = total_score > 0 and earned_score / total_score >= 0.8
    progress = db.scalar(
        select(ProgressRecord).where(
            ProgressRecord.enrollment_id == enrollment.id,
            ProgressRecord.lesson_item_id == item.id,
        )
    )
    if passed:
        if not progress:
            progress = ProgressRecord(enrollment_id=enrollment.id, lesson_item_id=item.id)
            db.add(progress)
        progress.completed_at = datetime.utcnow()
        progress.notes = None
        progress.score = earned_score
    elif progress:
        db.delete(progress)
    recalculate_enrollment_progress(db, enrollment)


@router.patch("/submissions/{submission_id}/grade", response_model=SubmissionOut)
def grade_submission(
    submission_id: int,
    payload: GradeSubmissionIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Submission:
    ensure_question_staff(current_user)
    submission = db.scalar(
        manual_grading_base_stmt(current_user, db).where(Submission.id == submission_id)
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    submission.score = payload.score
    submission.feedback = payload.feedback
    submission.status = SubmissionStatus.manually_graded
    submission.grader_id = current_user.id
    if submission.lesson_item and submission.enrollment and submission.lesson_item.item_type == LessonItemType.quiz:
        db.flush()
        recalculate_quiz_progress_after_grading(db, submission.lesson_item, submission.enrollment)
    db.commit()
    db.refresh(submission)
    return submission
