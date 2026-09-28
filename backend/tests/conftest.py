import os

os.environ.setdefault("JWT_SECRET", "test-only-secret-longer-than-thirty-two-characters")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import get_db
from app.main import create_app
from app.models import Base
from app.seed import seed_demo


@pytest.fixture
def db_engine():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        seed_demo(db)
    yield engine
    engine.dispose()


@pytest.fixture
def settings():
    return Settings(
        _env_file=None,
        jwt_secret="test-only-secret-longer-than-thirty-two-characters",
        enable_mock_auth=True,
        demo_password="baam-demo",
        max_bot_token="test-bot-token",
    )


@pytest.fixture
def client(db_engine, settings):
    factory = sessionmaker(bind=db_engine, expire_on_commit=False)

    def test_db():
        with factory() as db:
            yield db

    app = create_app()
    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient, name: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/mock", json={"login": name, "password": "baam-demo"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
