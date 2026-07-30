from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Course, CourseChapter, Enrollment, LessonItem, Subscription, User


def first_course_item(course: Course) -> LessonItem | None:
    return next(
        (
            item
            for chapter in sorted(course.chapters, key=lambda chapter: chapter.position)
            for item in sorted(chapter.items, key=lambda lesson_item: lesson_item.position)
        ),
        None,
    )


def activate_course_subscription(
    db: Session,
    *,
    user: User,
    course: Course,
    amount_eur_monthly: float,
    payment_provider: str = "stripe",
    current_period_start: datetime | None = None,
    current_period_end: datetime | None = None,
    stripe_checkout_session_id: str | None = None,
    stripe_subscription_id: str | None = None,
    stripe_customer_id: str | None = None,
    platform_fee_percent: float = 15.0,
) -> tuple[Enrollment, Subscription, bool]:
    enrollment = db.scalar(select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course.id))
    created_enrollment = enrollment is None
    if enrollment is None:
        first_item = first_course_item(course)
        enrollment = Enrollment(
            user_id=user.id,
            course_id=course.id,
            status="active",
            current_item_id=first_item.id if first_item else None,
            progress_percent=0,
        )
        db.add(enrollment)
    else:
        enrollment.status = "active"

    subscription = None
    if stripe_subscription_id:
        subscription = db.scalar(
            select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
        )
    if subscription is None and stripe_checkout_session_id:
        subscription = db.scalar(
            select(Subscription).where(Subscription.stripe_checkout_session_id == stripe_checkout_session_id)
        )
    if subscription is None:
        subscription = db.scalar(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.course_id == course.id,
                Subscription.status == "active",
            )
        )
    if subscription is None:
        subscription = db.scalar(
            select(Subscription)
            .where(
                Subscription.user_id == user.id,
                Subscription.course_id == course.id,
                Subscription.status.in_(("pending", "past_due")),
            )
            .order_by(Subscription.created_at.desc())
        )
    if subscription is None:
        subscription = Subscription(
            user_id=user.id,
            course_id=course.id,
            amount_eur_monthly=amount_eur_monthly,
            status="active",
            current_period_start=current_period_start or datetime.utcnow(),
            current_period_end=current_period_end,
            payment_provider=payment_provider,
            stripe_checkout_session_id=stripe_checkout_session_id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_customer_id=stripe_customer_id,
            platform_fee_percent=platform_fee_percent,
        )
        db.add(subscription)
    else:
        subscription.status = "active"
        subscription.amount_eur_monthly = amount_eur_monthly
        subscription.payment_provider = payment_provider
        subscription.current_period_start = current_period_start or subscription.current_period_start
        subscription.current_period_end = current_period_end or subscription.current_period_end
        subscription.stripe_checkout_session_id = stripe_checkout_session_id or subscription.stripe_checkout_session_id
        subscription.stripe_subscription_id = stripe_subscription_id or subscription.stripe_subscription_id
        subscription.stripe_customer_id = stripe_customer_id or subscription.stripe_customer_id
        subscription.platform_fee_percent = platform_fee_percent

    if created_enrollment:
        course.students_count = (course.students_count or 0) + 1

    return enrollment, subscription, created_enrollment
