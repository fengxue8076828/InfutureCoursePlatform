from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings
from app.models import Institution


def stripe_value(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


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


def stripe_account_display_name(institution: Institution) -> str:
    name = (institution.name or institution.slug or f"Institution {institution.id}").strip()
    return name[:80] or f"Institution {institution.id}"


def stripe_account_profile_payload(institution: Institution) -> dict[str, object]:
    display_name = stripe_account_display_name(institution)
    business_profile: dict[str, object] = {"name": display_name}
    website = str(institution.website or "").strip()
    if website.startswith(("http://", "https://")):
        business_profile["url"] = website
    return {
        "business_profile": business_profile,
        "settings": {"dashboard": {"display_name": display_name}},
    }


def stripe_account_create_payload(institution: Institution) -> dict[str, object]:
    """Build the payload for a Stripe Standard connected account."""
    settings = get_settings()
    return {
        "type": "standard",
        "country": settings.stripe_default_country,
        "email": institution.email,
        "business_type": "company" if institution.institution_type == "organization" else "individual",
        "capabilities": {
            "card_payments": {"requested": True},
            "transfers": {"requested": True},
        },
        "metadata": {
            "institution_slug": institution.slug,
            "institution_id": str(institution.id or ""),
        },
        **stripe_account_profile_payload(institution),
    }


def create_connect_account_for_institution(institution: Institution) -> str | None:
    """Create a Stripe Standard account for a partner institution if possible.

    This is intentionally non-blocking for registration callers: missing Stripe
    config or a transient Stripe failure should not prevent account creation in
    our own system. The finance center can retry account creation later.
    """
    settings = get_settings()
    if institution.payout_mode == "platform" or institution.stripe_account_id or not settings.stripe_secret_key:
        return institution.stripe_account_id

    try:
        import stripe

        stripe.api_key = settings.stripe_secret_key
        account = stripe.Account.create(**stripe_account_create_payload(institution))
    except Exception:
        return None

    account_id = stripe_value(account, "id")
    if account_id:
        institution.stripe_account_id = str(account_id)
        update_institution_stripe_state(institution, account)
    return institution.stripe_account_id
