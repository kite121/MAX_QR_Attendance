import hashlib
import hmac
import json
from datetime import datetime, timezone
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bootstrap import bootstrap_teacher
from app.models import CheckIn, Group, QrToken, TeacherGroup, User
from conftest import login


def signed_init_data(bot_token: str, user_id: int, auth_date: int) -> str:
    pairs = {
        "auth_date": str(auth_date),
        "query_id": "test-query",
        "user": json.dumps({"id": user_id, "first_name": "Тест", "last_name": "Студент"}, ensure_ascii=False, separators=(",", ":")),
    }
    canonical = "\n".join(f"{key}={value}" for key, value in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(secret, canonical.encode(), hashlib.sha256).hexdigest()
    return urlencode(pairs)


def test_max_init_data_signature_and_freshness(client):
    now = int(datetime.now(timezone.utc).timestamp())
    init_data = signed_init_data("test-bot-token", 30001, now)
    response = client.post("/api/v1/auth/max", json={"init_data": init_data})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "student"
    assert response.json()["user"]["max_user_id"] == "30001"

    tampered = init_data.replace("30001", "30002")
    response = client.post("/api/v1/auth/max", json={"init_data": tampered})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_INIT_DATA"

    duplicated = client.post("/api/v1/auth/max", json={"init_data": init_data + "&hash=0"})
    assert duplicated.status_code == 401
    assert duplicated.json()["error"]["code"] == "INVALID_INIT_DATA"

    stale = signed_init_data("test-bot-token", 30001, now - 3601)
    response = client.post("/api/v1/auth/max", json={"init_data": stale})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INIT_DATA_EXPIRED"


def test_signed_max_users_follow_full_path(client):
    now = int(datetime.now(timezone.utc).timestamp())
    teacher_auth = client.post("/api/v1/auth/max", json={"init_data": signed_init_data("test-bot-token", 10001, now)})
    student_auth = client.post("/api/v1/auth/max", json={"init_data": signed_init_data("test-bot-token", 20001, now)})
    assert teacher_auth.status_code == 200
    assert teacher_auth.json()["user"]["role"] == "teacher"
    teacher = {"Authorization": f"Bearer {teacher_auth.json()['access_token']}"}
    student = {"Authorization": f"Bearer {student_auth.json()['access_token']}"}
    session = client.post("/api/v1/groups/group-ivt-21/sessions", headers=teacher, json={"title": "MAX сценарий"})
    assert session.status_code == 200
    qr = client.post(f"/api/v1/sessions/{session.json()['id']}/qr-token", headers=teacher)
    assert qr.status_code == 200
    result = client.post("/api/v1/check-ins", headers=student, json={"qr_token": qr.json()["token"]})
    assert result.status_code == 200


def test_teacher_student_flow_and_guards(client, db_engine):
    teacher = login(client, "teacher.demo")
    anna = login(client, "student.anna")
    outsider = login(client, "student.outsider")
    groups = client.get("/api/v1/groups", headers=teacher)
    assert groups.status_code == 200
    assert groups.json()["items"] == [{"id": "group-ivt-21", "name": "ИВТ-21", "student_count": 2}]
    assert client.get("/api/v1/groups", headers=anna).status_code == 403

    created = client.post("/api/v1/groups/group-ivt-21/sessions", headers=teacher, json={"title": "Математика"})
    assert created.status_code == 200, created.text
    session_id = created.json()["id"]
    resumed = client.get("/api/v1/groups/group-ivt-21/sessions/active", headers=teacher)
    assert resumed.json()["id"] == session_id

    qr = client.post(f"/api/v1/sessions/{session_id}/qr-token", headers=teacher)
    assert qr.status_code == 200, qr.text
    token = qr.json()["token"]
    with Session(db_engine) as db:
        stored = db.scalar(select(QrToken).where(QrToken.session_id == session_id))
        assert stored.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert token not in stored.token_hash

    context = client.get("/api/v1/check-in/context", headers=anna, params={"token": token})
    assert context.status_code == 200
    assert context.json()["status"] == "available"
    foreign = client.get("/api/v1/check-in/context", headers=outsider, params={"token": token})
    assert foreign.json()["status"] == "not_enrolled"
    denied = client.post("/api/v1/check-ins", headers=outsider, json={"qr_token": token})
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "STUDENT_NOT_ENROLLED"

    success = client.post("/api/v1/check-ins", headers=anna, json={"qr_token": token})
    assert success.status_code == 200, success.text
    again = client.post("/api/v1/check-ins", headers=anna, json={"qr_token": token})
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_CHECKED_IN"
    recovered = client.get("/api/v1/check-in/context", headers=anna, params={"token": token})
    assert recovered.status_code == 200
    assert recovered.json()["status"] == "already_checked_in"
    with Session(db_engine) as db:
        assert len(db.scalars(select(CheckIn).where(CheckIn.session_id == session_id)).all()) == 1

    result = client.get(f"/api/v1/sessions/{session_id}/check-ins", headers=teacher)
    assert result.json()["present_count"] == 1
    assert result.json()["student_count"] == 2
    closed = client.post(f"/api/v1/sessions/{session_id}/close", headers=teacher)
    assert closed.json()["status"] == "closed"
    kirill = login(client, "student.kirill")
    rejected = client.post("/api/v1/check-ins", headers=kirill, json={"qr_token": token})
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "SESSION_CLOSED"
    assert client.get(f"/api/v1/sessions/{session_id}/check-ins", headers=teacher).json()["present_count"] == 1


def test_expired_qr_and_role_isolation(client, db_engine):
    teacher = login(client, "teacher.demo")
    student = login(client, "student.anna")
    session_id = client.post("/api/v1/groups/group-ivt-21/sessions", headers=teacher, json={"title": "Физика"}).json()["id"]
    token = client.post(f"/api/v1/sessions/{session_id}/qr-token", headers=teacher).json()["token"]
    with Session(db_engine) as db:
        qr = db.scalar(select(QrToken).where(QrToken.session_id == session_id))
        qr.expires_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        db.commit()
    assert client.get("/api/v1/check-in/context", headers=student, params={"token": token}).json()["status"] == "expired"
    response = client.post("/api/v1/check-ins", headers=student, json={"qr_token": token})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "QR_TOKEN_EXPIRED"
    assert client.post(f"/api/v1/sessions/{session_id}/qr-token", headers=student).status_code == 403


def test_operator_bootstrap_creates_real_teacher(db_engine):
    with Session(db_engine) as db:
        bootstrap_teacher(db, "30009", "Новый преподаватель", "Тест-2026")
        bootstrap_teacher(db, "30009", "Новый преподаватель", "Тест-2026")
        teacher = db.scalar(select(User).where(User.max_user_id == "30009"))
        group = db.scalar(select(Group).where(Group.name == "Тест-2026"))
        assert teacher.role == "teacher"
        assert db.get(TeacherGroup, (teacher.id, group.id)) is not None


def test_imported_max_account_can_check_in_and_unlisted_account_cannot(client):
    teacher = login(client, "teacher.demo")
    group = client.post("/api/v1/groups", headers=teacher, json={"name": "Тестовая MAX-группа"})
    assert group.status_code == 200
    group_id = group.json()["id"]
    imported = client.post(
        f"/api/v1/groups/{group_id}/enrollments/import", headers=teacher,
        files={"file": ("roster.csv", "max_user_id,display_name\n40001,Тестовый студент\n", "text/csv")},
    )
    assert imported.status_code == 200
    assert imported.json()["imported"] == 1

    now = int(datetime.now(timezone.utc).timestamp())
    enrolled_auth = client.post(
        "/api/v1/auth/max", json={"init_data": signed_init_data("test-bot-token", 40001, now)},
    )
    unlisted_auth = client.post(
        "/api/v1/auth/max", json={"init_data": signed_init_data("test-bot-token", 40002, now)},
    )
    assert enrolled_auth.status_code == 200
    assert unlisted_auth.status_code == 200
    enrolled = {"Authorization": f"Bearer {enrolled_auth.json()['access_token']}"}
    unlisted = {"Authorization": f"Bearer {unlisted_auth.json()['access_token']}"}

    session = client.post(
        f"/api/v1/groups/{group_id}/sessions", headers=teacher, json={"title": "Демо MAX"},
    )
    assert session.status_code == 200
    qr = client.post(f"/api/v1/sessions/{session.json()['id']}/qr-token", headers=teacher).json()["token"]
    assert client.get("/api/v1/check-in/context", headers=enrolled, params={"token": qr}).json()["status"] == "available"
    assert client.get("/api/v1/check-in/context", headers=unlisted, params={"token": qr}).json()["status"] == "not_enrolled"
    assert client.post("/api/v1/check-ins", headers=enrolled, json={"qr_token": qr}).status_code == 200
    denied = client.post("/api/v1/check-ins", headers=unlisted, json={"qr_token": qr})
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "STUDENT_NOT_ENROLLED"
