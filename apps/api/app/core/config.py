from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "HuaLearn Global API"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/online_classroom"
    redis_url: str = "redis://localhost:6379/0"
    auto_seed: bool = True
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://infuture.world",
        "https://www.infuture.world",
    ]
    cors_origin_regex: str | None = (
        r"^https?://(localhost|127\.0\.0\.1|\[::1\]|"
        r"192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$"
    )
    upload_dir: str = "uploads"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_use_tls: bool = True
    google_client_id: str | None = None
    frontend_base_url: str = "http://localhost:3000"
    auth_secret_key: str | None = None
    auth_token_ttl_minutes: int = 60 * 24 * 30
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    openai_api_key: str | None = None
    openai_recommendation_model: str = "gpt-4.1-mini"
    ai_recommendation_enabled: bool = True
    ai_recommendation_limit: int = 24
    stripe_default_country: str = "HU"
    stripe_platform_fee_percent: float = 15.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
