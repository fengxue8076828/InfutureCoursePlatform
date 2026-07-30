from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.db.session import get_db
from app.models import Course, CourseChapter, Subscription, User
from app.services.subscriptions import activate_course_subscription

router = APIRouter()


def stripe_value(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def timestamp_to_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        return datetime.utcfromtimestamp(int(value))
    except (TypeError, ValueError, OSError):
        return None


def get_stripe_client():
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe payment is not configured")
    import stripe

    stripe.api_key = settings.stripe_secret_key
    return stripe


def checkout_metadata(session: Any) -> dict[str, str]:
    metadata = stripe_value(session, "metadata") or {}
    if not isinstance(metadata, dict):
        metadata = dict(metadata)
    return {str(key): str(value) for key, value in metadata.items()}


def retrieve_checkout_session(session_id: str) -> Any:
    stripe = get_stripe_client()
    return stripe.checkout.Session.retrieve(session_id)


def retrieve_subscription(subscription_id: str) -> Any:
    stripe = get_stripe_client()
    return stripe.Subscription.retrieve(subscription_id)


def stripe_object_id(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        return value
    value_id = stripe_value(value, "id")
    return str(value_id) if value_id else str(value)


def load_course_for_subscription(db: Session, course_id: int) -> Course | None:
    return db.scalar(
        select(Course)
        .where(Course.id == course_id)
        .options(
            selectinload(Course.institution),
            selectinload(Course.chapters).selectinload(CourseChapter.items),
        )
    )


def activate_subscription_from_metadata(
    db: Session,
    metadata: dict[str, str],
    *,
    stripe_checkout_session_id: str | None = None,
    stripe_subscription_id: str | None = None,
    stripe_customer_id: str | None = None,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
) -> Subscription | None:
    user_id = metadata.get("user_id")
    course_id = metadata.get("course_id")
    if not user_id or not course_id:
        return None

    try:
        user = db.get(User, int(user_id))
        course = load_course_for_subscription(db, int(course_id))
    except ValueError:
        return None
    if not user or not course:
        return None

    settings = get_settings()
    platform_fee_percent = (
        100.0
        if course.institution and course.institution.payout_mode == "platform"
        else settings.stripe_platform_fee_percent
    )
    try:
        amount_eur_monthly = round(float(metadata.get("course_price_eur_monthly") or course.price_eur_monthly or 39), 2)
    except (TypeError, ValueError):
        amount_eur_monthly = round(float(course.price_eur_monthly or 39), 2)

    _, subscription, _ = activate_course_subscription(
        db,
        user=user,
        course=course,
        amount_eur_monthly=amount_eur_monthly,
        payment_provider="stripe",
        current_period_start=period_start,
        current_period_end=period_end,
        stripe_checkout_session_id=stripe_checkout_session_id,
        stripe_subscription_id=stripe_subscription_id,
        stripe_customer_id=stripe_customer_id,
        platform_fee_percent=platform_fee_percent,
    )
    return subscription


def handle_checkout_session_completed(session: Any, db: Session) -> Subscription | None:
    metadata = checkout_metadata(session)
    checkout_session_id = stripe_object_id(stripe_value(session, "id"))
    subscription_value = stripe_value(session, "subscription")
    stripe_subscription_id = stripe_object_id(subscription_value)
    stripe_customer_id = stripe_object_id(stripe_value(session, "customer"))
    period_start = None
    period_end = None

    subscription_obj = None if isinstance(subscription_value, str) else subscription_value
    if stripe_subscription_id:
        try:
            subscription_obj = subscription_obj or retrieve_subscription(stripe_subscription_id)
            period_start = timestamp_to_datetime(stripe_value(subscription_obj, "current_period_start"))
            period_end = timestamp_to_datetime(stripe_value(subscription_obj, "current_period_end"))
            stripe_customer_id = stripe_object_id(stripe_value(subscription_obj, "customer")) or stripe_customer_id
            if not metadata.get("user_id") or not metadata.get("course_id"):
                metadata = checkout_metadata(subscription_obj)
        except Exception as exc:
            print(f"[stripe-subscription-retrieve-error] subscription={stripe_subscription_id}: {exc}")

    return activate_subscription_from_metadata(
        db,
        metadata,
        stripe_checkout_session_id=checkout_session_id,
        stripe_subscription_id=stripe_subscription_id,
        stripe_customer_id=stripe_customer_id,
        period_start=period_start,
        period_end=period_end,
    )


def sync_checkout_session_if_complete(session_or_id: Any, db: Session) -> Subscription | None:
    session = retrieve_checkout_session(session_or_id) if isinstance(session_or_id, str) else session_or_id
    session_id = str(stripe_value(session, "id", "") or "")
    if not session_id:
        return None

    subscription = db.scalar(
        select(Subscription).where(Subscription.stripe_checkout_session_id == session_id)
    )
    checkout_status = str(stripe_value(session, "status", "") or "")
    payment_status = str(stripe_value(session, "payment_status", "") or "")
    if checkout_status != "complete" and payment_status not in {"paid", "no_payment_required"}:
        return subscription

    return handle_checkout_session_completed(session, db) or db.scalar(
        select(Subscription).where(Subscription.stripe_checkout_session_id == session_id)
    )


def handle_subscription_changed(subscription_obj: Any, db: Session) -> None:
    stripe_subscription_id = stripe_object_id(stripe_value(subscription_obj, "id"))
    if not stripe_subscription_id:
        return

    stripe_status = str(stripe_value(subscription_obj, "status", ""))
    stripe_customer_id = stripe_object_id(stripe_value(subscription_obj, "customer"))
    period_start = timestamp_to_datetime(stripe_value(subscription_obj, "current_period_start"))
    period_end = timestamp_to_datetime(stripe_value(subscription_obj, "current_period_end"))
    if stripe_status in {"active", "trialing"}:
        subscription = activate_subscription_from_metadata(
            db,
            checkout_metadata(subscription_obj),
            stripe_subscription_id=stripe_subscription_id,
            stripe_customer_id=stripe_customer_id,
            period_start=period_start,
            period_end=period_end,
        )
        if subscription:
            return

    subscription = db.scalar(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
    )
    if not subscription:
        return

    if stripe_status in {"active", "trialing"}:
        subscription.status = "active"
    elif stripe_status in {"canceled", "unpaid", "incomplete_expired"}:
        subscription.status = "canceled"
    elif stripe_status in {"past_due", "incomplete"}:
        subscription.status = "past_due"
    else:
        subscription.status = stripe_status or subscription.status
    subscription.current_period_start = period_start or subscription.current_period_start
    subscription.current_period_end = period_end or subscription.current_period_end
    if stripe_customer_id:
        subscription.stripe_customer_id = stripe_customer_id


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, bool]:
    settings = get_settings()
    payload = await request.body()
    signature = request.headers.get("stripe-signature")

    if settings.stripe_webhook_secret:
        stripe = get_stripe_client()
        try:
            event = stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature") from exc
    else:
        try:
            event = json.loads(payload.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid Stripe webhook payload") from exc

    event_type = stripe_value(event, "type", "")
    data = stripe_value(event, "data", {}) or {}
    event_object = stripe_value(data, "object", {})

    if event_type == "checkout.session.completed":
        handle_checkout_session_completed(event_object, db)
    elif event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
        handle_subscription_changed(event_object, db)

    db.commit()
    return {"received": True}
