from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User


def get_current_user(
    db: Session = Depends(get_db), x_demo_user_id: int | None = Header(default=None)
) -> User:
    if x_demo_user_id:
        user = db.get(User, x_demo_user_id)
    else:
        user = db.scalar(select(User).order_by(User.id))

    if not user:
        raise HTTPException(status_code=401, detail="No demo user found. Seed the database first.")
    return user
