from functools import lru_cache
import re

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://attendance:attendance@localhost:5432/attendance"
    jwt_secret: str = ""
    access_token_minutes: int = Field(default=30, ge=1, le=1440)
    max_bot_token: str = ""
    max_bot_name: str = ""
    max_init_data_max_age_seconds: int = Field(default=3600, ge=60)
    max_clock_skew_seconds: int = Field(default=60, ge=0)
    qr_ttl_seconds: int = Field(default=10, ge=1, le=512)
    late_after_minutes: int = Field(default=30, ge=0)
    enable_mock_auth: bool = False
    demo_password: str = ""
    demo_teacher_max_user_id: str = "10001"
    bootstrap_teacher_max_user_id: str = ""
    bootstrap_teacher_name: str = "Тестовый преподаватель"
    bootstrap_group_name: str = "Тестовая группа"
    dev_mini_app_url: str = "http://localhost:5173/student/check-in"
    cors_origins: str = "http://localhost:5173"
    rate_limit_window_seconds: int = Field(default=60, ge=1)
    rate_limit_requests: int = Field(default=120, ge=1)

    @model_validator(mode="after")
    def validate_secrets(self) -> "Settings":
        if len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 characters")
        if self.enable_mock_auth and not self.demo_password:
            raise ValueError("DEMO_PASSWORD is required when mock authentication is enabled")
        if self.environment == "production" and self.enable_mock_auth:
            raise ValueError("Mock authentication cannot be enabled in production")
        if self.environment == "production" and self.jwt_secret.startswith("local-development-secret"):
            raise ValueError("Replace the local JWT secret before production deployment")
        if self.environment == "production" and "local-attendance-password" in self.database_url:
            raise ValueError("Replace the local database password before production deployment")
        if self.environment == "production" and (not self.max_bot_token or not self.max_bot_name):
            raise ValueError("MAX_BOT_TOKEN and MAX_BOT_NAME are required in production")
        if self.max_bot_name and not re.fullmatch(r"[A-Za-z0-9_]+", self.max_bot_name):
            raise ValueError("MAX_BOT_NAME must be a bot username, not a URL")
        if self.bootstrap_teacher_max_user_id and not re.fullmatch(r"[0-9]{1,20}", self.bootstrap_teacher_max_user_id):
            raise ValueError("BOOTSTRAP_TEACHER_MAX_USER_ID must be a numeric MAX ID")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
