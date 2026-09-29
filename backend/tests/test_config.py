import pytest
from pydantic import ValidationError

from app.config import DEFAULT_DATABASE_URL, Settings


def test_production_rejects_mock_login():
    with pytest.raises(ValidationError, match="Mock authentication cannot be enabled"):
        Settings(
            _env_file=None,
            environment="production",
            database_url="postgresql+psycopg://attendance:private-password@db:5432/attendance",
            jwt_secret="test-only-secret-longer-than-thirty-two-characters",
            max_bot_token="test-bot-token",
            max_bot_name="test_bot",
            enable_mock_auth=True,
            demo_password="demo-only",
        )


def test_production_requires_bot_identity():
    with pytest.raises(ValidationError, match="MAX_BOT_TOKEN and MAX_BOT_NAME are required"):
        Settings(
            _env_file=None,
            environment="production",
            database_url="postgresql+psycopg://attendance:private-password@db:5432/attendance",
            jwt_secret="test-only-secret-longer-than-thirty-two-characters",
            enable_mock_auth=False,
        )


def test_environment_typo_cannot_bypass_production_guards():
    with pytest.raises(ValidationError, match="environment"):
        Settings(_env_file=None, environment="prod")


def test_production_rejects_default_database_credentials():
    with pytest.raises(ValidationError, match="Replace the local database password"):
        Settings(
            _env_file=None,
            environment="production",
            database_url=DEFAULT_DATABASE_URL,
            jwt_secret="test-only-secret-longer-than-thirty-two-characters",
            max_bot_token="test-bot-token",
            max_bot_name="test_bot",
        )


def test_mock_login_is_unusable_when_disabled(client, settings):
    settings.enable_mock_auth = False
    response = client.post("/api/v1/auth/mock", json={"login": "teacher.demo", "password": "baam-demo"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
