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
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    Course,
    CourseCategory,
    CourseChapter,
    CourseStatus,
    Enrollment,
    Institution,
    LessonItem,
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
    AdminOverviewOut,
    AdminPasswordCodeOut,
    AdminPasswordUpdate,
    AdminProfileOut,
    AdminProfileUpdate,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    CourseCardOut,
    CourseCategoryCreate,
    CourseCategoryOut,
    CourseCategoryUpdate,
    CourseCreate,
    CourseDetailOut,
    CourseUpdate,
    GradeSubmissionIn,
    InstitutionOut,
    InstitutionUpdate,
    QuestionCreate,
    QuestionOut,
    QuestionUpdate,
    SubmissionOut,
    TeacherCreate,
    TeacherOut,
)

router = APIRouter()
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

CODE_QUESTION_TYPES = {QuestionType.coding.value, QuestionType.code_review.value}
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
    elif current_user.role == UserRole.institution_admin and current_user.institution_id:
        stmt = stmt.where(User.institution_id == current_user.institution_id)
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
    if current_user.role != UserRole.super_admin and current_user.institution_id:
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


def get_course_category_or_404(category_id: int, db: Session) -> CourseCategory:
    category = db.get(CourseCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Course category not found")
    return category


def validate_course_category_payload(
    parent_id: int | None,
    name: str,
    db: Session,
    category_id: int | None = None,
) -> None:
    normalized_name = name.strip()
    if not normalized_name:
        raise HTTPException(status_code=422, detail="Course category name is required")
    if parent_id is not None:
        if parent_id == category_id:
            raise HTTPException(status_code=422, detail="A category cannot be its own parent")
        parent = get_course_category_or_404(parent_id, db)
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail="Only two category levels are supported")
    if category_id is not None and parent_id is not None:
        has_children = db.scalar(
            select(func.count(CourseCategory.id)).where(CourseCategory.parent_id == category_id)
        )
        if has_children:
            raise HTTPException(status_code=422, detail="A parent category with children cannot become a subcategory")

    stmt = select(CourseCategory).where(
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
    if type_value not in CODE_QUESTION_TYPES:
        return
    institution = db.get(Institution, institution_id) if institution_id else None
    if not institution or institution.category != "it":
        raise HTTPException(
            status_code=422,
            detail="Coding and code review questions are only available for IT education institutions",
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
    active_subscriptions = (
        db.scalar(select(func.count(Subscription.id)).where(Subscription.status == "active")) or 0
    )
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
        monthly_recurring_revenue_eur=active_subscriptions * 39,
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
    return list(
        db.scalars(
            select(CourseCategory).order_by(
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
    name = payload.name.strip()
    validate_course_category_payload(payload.parent_id, name, db)
    category = CourseCategory(
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
    category = get_course_category_or_404(category_id, db)
    name = payload.name.strip()
    validate_course_category_payload(payload.parent_id, name, db, category_id)
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
    category = get_course_category_or_404(category_id, db)
    db.delete(category)
    db.commit()
    return {"id": category_id, "deleted": True}


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
    elif current_user.role == UserRole.institution_admin and current_user.institution_id:
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
    stmt = question_detail_stmt().order_by(Question.updated_at.desc())
    if current_user.role == UserRole.super_admin:
        stmt = stmt.where(Question.created_by_user_id == (created_by_user_id or current_user.id))
    else:
        stmt = stmt.where(Question.created_by_user_id == current_user.id)
    if current_user.role != UserRole.super_admin and current_user.institution_id:
        stmt = stmt.where(Question.institution_id == current_user.institution_id)
    if type:
        stmt = stmt.where(Question.type == type)
    if course_id:
        stmt = stmt.where(Question.course_id == course_id)
    return list(db.scalars(stmt))


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
    stmt = question_detail_stmt().where(Question.status == QuestionStatus.published)
    if current_user.role != UserRole.super_admin and current_user.institution_id:
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


@router.get("/grading", response_model=list[SubmissionOut])
def manual_grading_queue(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Submission]:
    ensure_admin(current_user)
    return list(
        db.scalars(
            select(Submission)
            .where(Submission.status == SubmissionStatus.pending_manual)
            .order_by(Submission.created_at.asc())
        )
    )


@router.patch("/submissions/{submission_id}/grade", response_model=SubmissionOut)
def grade_submission(
    submission_id: int,
    payload: GradeSubmissionIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Submission:
    ensure_admin(current_user)
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    submission.score = payload.score
    submission.feedback = payload.feedback
    submission.status = SubmissionStatus.manually_graded
    submission.grader_id = current_user.id
    db.commit()
    db.refresh(submission)
    return submission
