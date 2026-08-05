import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models import User

_RUNTIME_AUTH_SECRET = secrets.token_urlsafe(48)


def auth_secret() -> str:
    return get_settings().auth_secret_key or _RUNTIME_AUTH_SECRET


def b64encode_json(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64decode_json(value: str) -> dict:
    padded = value + "=" * (-len(value) % 4)
    return json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))


def sign_token_payload(payload_part: str) -> str:
    digest = hmac.new(auth_secret().encode("utf-8"), payload_part.encode("ascii"), hashlib.sha256)
    return base64.urlsafe_b64encode(digest.digest()).decode("ascii").rstrip("=")


def create_access_token(user_id: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=get_settings().auth_token_ttl_minutes)
    payload_part = b64encode_json({"sub": user_id, "exp": int(expires_at.timestamp())})
    return f"infuture.{payload_part}.{sign_token_payload(payload_part)}"


def user_id_from_signed_token(token: str) -> int | None:
    prefix = "infuture."
    if not token.startswith(prefix):
        return None
    try:
        _, payload_part, signature = token.split(".", 2)
    except ValueError:
        return None
    expected_signature = sign_token_payload(payload_part)
    if not hmac.compare_digest(signature, expected_signature):
        return None
    try:
        payload = b64decode_json(payload_part)
    except (ValueError, json.JSONDecodeError):
        return None
    expires_at = payload.get("exp")
    if not isinstance(expires_at, int) or expires_at < int(datetime.now(timezone.utc).timestamp()):
        return None
    user_id = payload.get("sub")
    return user_id if isinstance(user_id, int) else None


def user_id_from_authorization(authorization: str | None) -> int | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return user_id_from_signed_token(token)


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    user_id = user_id_from_authorization(authorization)
    if user_id:
        user = db.get(User, user_id)
    else:
        user = None

    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def get_optional_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User | None:
    user_id = user_id_from_authorization(authorization)
    if not user_id:
        return None
    return db.get(User, user_id)
