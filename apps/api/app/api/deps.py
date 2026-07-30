from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User


def user_id_from_authorization(authorization: str | None) -> int | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token_prefix = "demo-token-"
    if not token.startswith(token_prefix):
        return None
    raw_user_id = token[len(token_prefix) :]
    return int(raw_user_id) if raw_user_id.isdigit() else None


def get_current_user(
    db: Session = Depends(get_db),
    x_demo_user_id: int | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> User:
    user_id = x_demo_user_id or user_id_from_authorization(authorization)
    if user_id:
        user = db.get(User, user_id)
    else:
        user = db.scalar(select(User).order_by(User.id))

    if not user:
        raise HTTPException(status_code=401, detail="No demo user found. Seed the database first.")
    return user


def get_optional_current_user(
    db: Session = Depends(get_db),
    x_demo_user_id: int | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> User | None:
    user_id = x_demo_user_id or user_id_from_authorization(authorization)
    if not user_id:
        return None
    return db.get(User, user_id)
