import re
import secrets
import smtplib
import unicodedata
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from hashlib import sha256

from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models import AdminLoginVerificationCode, Institution, User, UserRole
from app.schemas import (
    AdminLoginCodeOut,
    AdminLoginCodeRequest,
    AdminLoginIn,
    AuthOut,
    InstitutionRegisterIn,
    LoginIn,
    SocialLoginIn,
    UserCreate,
)
from app.services.stripe_connect import create_connect_account_for_institution

router = APIRouter()
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
SOCIAL_PROVIDER_NAMES = {
    "google": "Google 学生",
    "facebook": "Facebook 学生",
}
ADMIN_LOGIN_ROLES = {UserRole.super_admin, UserRole.institution_admin, UserRole.teacher}
ADMIN_LOGIN_CODE_TTL_SECONDS = 10 * 60


def make_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug or "institution"


def unique_institution_slug(db: Session, name: str) -> str:
    base_slug = make_slug(name)
    slug = base_slug
    index = 2
    while db.scalar(select(Institution).where(Institution.slug == slug)):
        slug = f"{base_slug}-{index}"
        index += 1
    return slug


def normalize_email(email: object) -> str:
    return str(email).strip().lower()


def verify_google_id_token(token: str) -> dict[str, object]:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google login is not configured")
    try:
        claims = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google token") from exc

    email = claims.get("email")
    if not email or not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google email is not verified")
    return claims


def global_email_exists(email: str, db: Session) -> bool:
    normalized_email = normalize_email(email)
    user_exists = db.scalar(select(User).where(func.lower(User.email) == normalized_email))
    institution_exists = db.scalar(
        select(Institution).where(func.lower(Institution.email) == normalized_email)
    )
    return bool(user_exists or institution_exists)


def hash_verification_code(email: str, code: str) -> str:
    return sha256(f"{email}:{code}".encode("utf-8")).hexdigest()


def get_admin_login_user(payload: AdminLoginCodeRequest | AdminLoginIn, db: Session) -> User:
    user = db.scalar(select(User).where(func.lower(User.email) == normalize_email(payload.email)))
    if (
        not user
        or user.role not in ADMIN_LOGIN_ROLES
        or not user.is_active
        or not user.hashed_password
        or not pwd_context.verify(payload.password, user.hashed_password)
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return user


def issue_admin_login_code(email: str, db: Session) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.now(timezone.utc)
    db.add(
        AdminLoginVerificationCode(
            email=email,
            code_hash=hash_verification_code(email, code),
            expires_at=now + timedelta(seconds=ADMIN_LOGIN_CODE_TTL_SECONDS),
        )
    )
    db.commit()
    print(f"[admin-login-code] {email}: {code}")
    return code


def send_admin_login_code_email(email: str, code: str) -> bool:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        return False

    message = EmailMessage()
    message["Subject"] = "机构后台登录验证码"
    message["From"] = settings.smtp_from_email
    message["To"] = email
    message.set_content(
        "\n".join(
            [
                "您好，",
                "",
                f"您的机构后台登录验证码是：{code}",
                "验证码 10 分钟内有效，请勿转发给他人。",
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
        print(f"[admin-login-code-email-error] {email}: {exc}")
        return False
    return True


def verify_admin_login_code(email: str, code: str, db: Session) -> None:
    now = datetime.now(timezone.utc)
    record = db.scalar(
        select(AdminLoginVerificationCode)
        .where(
            AdminLoginVerificationCode.email == email,
            AdminLoginVerificationCode.used_at.is_(None),
            AdminLoginVerificationCode.expires_at >= now,
        )
        .order_by(AdminLoginVerificationCode.created_at.desc())
    )
    if not record or record.code_hash != hash_verification_code(email, code.strip()):
        raise HTTPException(status_code=401, detail="Invalid verification code")
    record.used_at = now
    db.commit()


@router.post("/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> AuthOut:
    email = normalize_email(payload.email)
    if global_email_exists(email, db):
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=email,
        full_name=payload.full_name,
        role=UserRole.student,
        hashed_password=pwd_context.hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthOut(access_token=f"demo-token-{user.id}", user=user)


@router.post(
    "/institution-register", response_model=AuthOut, status_code=status.HTTP_201_CREATED
)
def register_institution(payload: InstitutionRegisterIn, db: Session = Depends(get_db)) -> AuthOut:
    if not (
        payload.service_agreement_accepted
        and payload.gdpr_agreement_accepted
        and payload.fee_agreement_accepted
    ):
        raise HTTPException(status_code=422, detail="Platform agreements must be accepted")

    email = normalize_email(payload.email)
    if global_email_exists(email, db):
        raise HTTPException(status_code=409, detail="Email already registered")

    institution_exists = db.scalar(
        select(Institution).where(Institution.name == payload.institution_name)
    )
    if institution_exists:
        raise HTTPException(status_code=409, detail="Institution already registered")

    institution = Institution(
        name=payload.institution_name,
        slug=unique_institution_slug(db, payload.institution_name),
        logo_url=payload.logo_url or "/logos/euro-future.svg",
        category=payload.category,
        institution_type=payload.institution_type,
        payout_mode="partner",
        service_agreement_accepted=payload.service_agreement_accepted,
        gdpr_agreement_accepted=payload.gdpr_agreement_accepted,
        fee_agreement_accepted=payload.fee_agreement_accepted,
        agreements_accepted_at=datetime.now(timezone.utc),
        verification_status="unsubmitted" if payload.institution_type == "organization" else "not_required",
        region=payload.location,
        website=payload.website,
        phone=payload.phone,
        email=email,
        address=payload.location,
        contact_person=payload.contact_name,
        description=payload.description,
    )
    user = User(
        email=email,
        full_name=payload.contact_name,
        role=UserRole.super_admin,
        hashed_password=pwd_context.hash("888888"),
        institution=institution,
    )
    create_connect_account_for_institution(institution)
    db.add_all([institution, user])
    db.commit()
    db.refresh(user)
    return AuthOut(access_token=f"demo-token-{user.id}", user=user)


@router.post("/login", response_model=AuthOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> AuthOut:
    user = db.scalar(select(User).where(func.lower(User.email) == normalize_email(payload.email)))
    if not user or not user.hashed_password or not pwd_context.verify(
        payload.password, user.hashed_password
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthOut(access_token=f"demo-token-{user.id}", user=user)


@router.post("/admin-login-code", response_model=AdminLoginCodeOut)
def request_admin_login_code(
    payload: AdminLoginCodeRequest, db: Session = Depends(get_db)
) -> AdminLoginCodeOut:
    email = normalize_email(payload.email)
    get_admin_login_user(payload, db)
    code = issue_admin_login_code(email, db)
    email_sent = send_admin_login_code_email(email, code)
    return AdminLoginCodeOut(
        message=(
            "验证码已发送到该邮箱。"
            if email_sent
            else "当前未配置 SMTP 邮件服务，验证码会显示在页面并打印到 FastAPI 控制台。"
        ),
        expires_in_seconds=ADMIN_LOGIN_CODE_TTL_SECONDS,
        demo_code=None if email_sent else code,
    )


@router.post("/admin-login", response_model=AuthOut)
def admin_login(payload: AdminLoginIn, db: Session = Depends(get_db)) -> AuthOut:
    email = normalize_email(payload.email)
    user = get_admin_login_user(payload, db)
    verify_admin_login_code(email, payload.verification_code, db)
    return AuthOut(access_token=f"demo-token-{user.id}", user=user)


@router.post("/social-login", response_model=AuthOut)
def social_login(payload: SocialLoginIn, db: Session = Depends(get_db)) -> AuthOut:
    provider = payload.provider
    if provider == "google":
        if not payload.id_token:
            raise HTTPException(status_code=422, detail="Google id token is required")
        claims = verify_google_id_token(payload.id_token)
        email = normalize_email(claims["email"])
        full_name = str(claims.get("name") or payload.full_name or email.split("@")[0])
        avatar_url = str(claims.get("picture") or payload.avatar_url or "")
    else:
        email = normalize_email(payload.email) if payload.email else f"{provider}.student@example.com"
        full_name = payload.full_name or SOCIAL_PROVIDER_NAMES[provider]
        avatar_url = payload.avatar_url or ""

    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user and user.role != UserRole.student:
        raise HTTPException(status_code=409, detail="Email belongs to a non-student account")
    if user is None and db.scalar(select(Institution).where(func.lower(Institution.email) == email)):
        raise HTTPException(status_code=409, detail="Email already registered")

    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            role=UserRole.student,
            hashed_password=None,
            auth_provider=provider,
            avatar_url=avatar_url or None,
        )
        db.add(user)
    else:
        user.full_name = full_name
        user.auth_provider = provider
        if avatar_url:
            user.avatar_url = avatar_url
    db.commit()
    db.refresh(user)
    return AuthOut(access_token=f"demo-token-{user.id}", user=user)


@router.get("/social/{provider}/login-url")
def social_login_url(provider: str) -> dict[str, str]:
    if provider not in {"google", "facebook"}:
        raise HTTPException(status_code=404, detail="Unsupported social provider")
    return {
        "provider": provider,
        "url": f"https://auth.example.com/oauth/{provider}?client=hua-learn-global",
    }
