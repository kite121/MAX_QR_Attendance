import hashlib
import hmac
import json
from datetime import datetime, timezone
from urllib.parse import urlencode

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import AuditEvent, Enrollment, Group, TeacherGroup, User

JURY_TOKEN = "jury-test-token-that-is-at-least-thirty-two-characters"


def max_headers(client, max_user_id: int) -> dict[str, str]:
    pairs = {
        "auth_date": str(int(datetime.now(timezone.utc).timestamp())),
        "query_id": "jury-test",
        "user": json.dumps({"id": max_user_id, "first_name": "Жюри"}, ensure_ascii=False, separators=(",", ":")),
    }
    canonical = "\n".join(f"{key}={value}" for key, value in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", b"test-bot-token", hashlib.sha256).digest()
    pairs["hash"] = hmac.new(secret, canonical.encode(), hashlib.sha256).hexdigest()
    response = client.post("/api/v1/auth/max", json={"init_data": urlencode(pairs)})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def choose_role(client, headers: dict[str, str], role: str, token: str = JURY_TOKEN):
    return client.post("/api/v1/jury/role", headers=headers, json={"token": token, "role": role})


def test_jury_access_requires_signed_account_and_separate_token(client, settings, db_engine):
    settings.jury_admin_token = JURY_TOKEN
    headers = max_headers(client, 70001)

    assert choose_role(client, {}, "teacher").status_code == 401
    assert choose_role(client, headers, "teacher", "wrong").status_code == 403
    assert choose_role(client, headers, "teacher", "test-bot-token").status_code == 403
    with Session(db_engine) as db:
        assert db.scalar(select(Group).where(Group.name == settings.jury_group_name)) is None

    settings.jury_admin_token = ""
    assert choose_role(client, headers, "teacher").status_code == 403
    with Session(db_engine) as db:
        user = db.scalar(select(User).where(User.max_user_id == "70001"))
        assert user.role == "student"


def test_jury_can_assign_roles_and_complete_qr_flow(client, settings, db_engine):
    settings.jury_admin_token = JURY_TOKEN
    teacher = max_headers(client, 70011)
    student = max_headers(client, 70012)

    promoted = choose_role(client, teacher, "teacher")
    enrolled = choose_role(client, student, "student")
    assert promoted.status_code == enrolled.status_code == 200
    assert promoted.json()["user"]["role"] == "teacher"
    assert enrolled.json()["user"]["role"] == "student"
    assert JURY_TOKEN not in promoted.text

    groups = client.get("/api/v1/groups", headers=teacher)
    assert groups.status_code == 200
    assert [item["name"] for item in groups.json()["items"]] == [settings.jury_group_name]
    group_id = groups.json()["items"][0]["id"]
    assert groups.json()["items"][0]["student_count"] == 1

    session = client.post(f"/api/v1/groups/{group_id}/sessions", headers=teacher, json={"title": "Тест жюри"})
    assert session.status_code == 200, session.text
    session_id = session.json()["id"]
    qr = client.post(f"/api/v1/sessions/{session_id}/qr-token", headers=teacher)
    assert qr.status_code == 200, qr.text
    check_in = client.post("/api/v1/check-ins", headers=student, json={"qr_token": qr.json()["token"]})
    assert check_in.status_code == 200, check_in.text
    attendance = client.get(f"/api/v1/sessions/{session_id}/check-ins", headers=teacher)
    assert attendance.status_code == 200
    assert attendance.json()["present_count"] == 1

    with Session(db_engine) as db:
        group = db.get(Group, group_id)
        teacher_user = db.scalar(select(User).where(User.max_user_id == "70011"))
        student_user = db.scalar(select(User).where(User.max_user_id == "70012"))
        assert group.name == settings.jury_group_name
        assert db.get(TeacherGroup, (teacher_user.id, group_id)) is not None
        assert db.get(Enrollment, (student_user.id, group_id)) is not None
        assert db.scalar(select(AuditEvent).where(AuditEvent.action == "jury_role_selected")) is not None

    assert choose_role(client, teacher, "teacher").status_code == 200
    assert choose_role(client, student, "student").status_code == 200
    with Session(db_engine) as db:
        assert len(db.scalars(select(TeacherGroup).where(TeacherGroup.group_id == group_id)).all()) == 1
        assert len(db.scalars(select(Enrollment).where(Enrollment.group_id == group_id)).all()) == 1


def test_jury_role_can_be_switched_and_persists_after_relogin(client, settings):
    settings.jury_admin_token = JURY_TOKEN
    headers = max_headers(client, 70021)
    assert choose_role(client, headers, "teacher").status_code == 200
    assert choose_role(client, headers, "student").json()["user"]["role"] == "student"
    assert client.get("/api/v1/groups", headers=headers).status_code == 403
    assert choose_role(client, headers, "teacher").json()["user"]["role"] == "teacher"
    refreshed = max_headers(client, 70021)
    assert client.get("/api/v1/groups", headers=refreshed).status_code == 200


def test_jury_token_must_be_strong():
    with pytest.raises(ValidationError, match="JURY_ADMIN_TOKEN"):
        Settings(
            _env_file=None,
            jwt_secret="test-only-secret-longer-than-thirty-two-characters",
            jury_admin_token="too-short",
        )
