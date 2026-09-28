"""Run with TEST_POSTGRES_URL after applying the Alembic migration."""

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings
from app.database import get_db
from app.main import create_app
from app.models import CheckIn
from app.seed import seed_demo


@pytest.mark.skipif(not os.getenv("TEST_POSTGRES_URL"), reason="PostgreSQL integration URL not configured")
def test_parallel_check_in_creates_one_row():
    engine = create_engine(os.environ["TEST_POSTGRES_URL"], pool_pre_ping=True)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        seed_demo(db)

    settings = Settings(
        _env_file=None,
        database_url=os.environ["TEST_POSTGRES_URL"],
        jwt_secret="test-only-secret-longer-than-thirty-two-characters",
        enable_mock_auth=True,
        demo_password="baam-demo",
    )

    def test_db():
        with factory() as db:
            yield db

    app = create_app()
    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        teacher_token = client.post("/api/v1/auth/mock", json={"login": "teacher.demo", "password": "baam-demo"}).json()["access_token"]
        student_token = client.post("/api/v1/auth/mock", json={"login": "student.anna", "password": "baam-demo"}).json()["access_token"]
        teacher = {"Authorization": f"Bearer {teacher_token}"}
        student = {"Authorization": f"Bearer {student_token}"}
        session_id = client.post("/api/v1/groups/group-ivt-21/sessions", headers=teacher, json={"title": "Конкурентная отметка"}).json()["id"]
        token = client.post(f"/api/v1/sessions/{session_id}/qr-token", headers=teacher).json()["token"]
        barrier = Barrier(2)

        def send():
            barrier.wait(timeout=5)
            return client.post("/api/v1/check-ins", headers=student, json={"qr_token": token})

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(send)
            second = executor.submit(send)
            responses = (first.result(timeout=10), second.result(timeout=10))
        assert sorted(response.status_code for response in responses) == [200, 409]
        with Session(engine) as db:
            assert db.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.session_id == session_id)) == 1
    engine.dispose()
