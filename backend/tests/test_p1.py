import csv
import io
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import issue_access_token
from app.models import AttendanceSession, TeacherGroup, User
from conftest import login


def test_manual_corrections_history_audit_export_and_stats(client):
    teacher = login(client, "teacher.demo")
    student = login(client, "student.anna")
    session_id = client.post("/api/v1/groups/group-ivt-21/sessions", headers=teacher, json={"title": "Алгебра"}).json()["id"]
    client.post(f"/api/v1/sessions/{session_id}/close", headers=teacher)
    correction_url = f"/api/v1/sessions/{session_id}/check-ins/manual"
    addition = client.post(correction_url, headers=teacher, json={
        "student_id": "student-anna", "action": "add", "attendance_status": "late", "reason": "Отметка по журналу",
    })
    assert addition.status_code == 200, addition.text
    assert addition.json()["items"][0]["attendance_status"] == "late"
    assert addition.json()["items"][0]["source"] == "manual"
    assert client.post(correction_url, headers=student, json={
        "student_id": "student-kirill", "action": "add", "reason": "Без права преподавателя",
    }).status_code == 403

    changed = client.post(correction_url, headers=teacher, json={
        "student_id": "student-anna", "action": "set_status", "attendance_status": "present", "reason": "Исправление по ведомости",
    })
    assert changed.status_code == 200
    assert changed.json()["items"][0]["attendance_status"] == "present"
    removed = client.post(correction_url, headers=teacher, json={
        "student_id": "student-anna", "action": "remove", "reason": "Ошибочная отметка",
    })
    assert removed.status_code == 200
    assert removed.json()["present_count"] == 0
    audit = client.get(f"/api/v1/sessions/{session_id}/audit", headers=teacher)
    assert audit.status_code == 200
    assert {event["action"] for event in audit.json()["items"]} >= {
        "session_created", "session_closed", "manual_add", "manual_set_status", "manual_remove",
    }

    exported = client.get(f"/api/v1/sessions/{session_id}/export.csv", headers=teacher)
    assert exported.status_code == 200
    assert exported.content.startswith(b"\xef\xbb\xbf")
    rows = list(csv.DictReader(io.StringIO(exported.content.decode("utf-8-sig"))))
    assert len(rows) == 2
    assert {row["status"] for row in rows} == {"absent"}
    history = client.get("/api/v1/groups/group-ivt-21/sessions", headers=teacher)
    assert history.json()["items"][0]["id"] == session_id
    stats = client.get("/api/v1/groups/group-ivt-21/stats", headers=teacher)
    assert stats.json()["closed_sessions_count"] == 1
    assert stats.json()["total_check_ins"] == 0


def test_import_csv_and_group_membership(client):
    teacher = login(client, "teacher.demo")
    group = client.post("/api/v1/groups", headers=teacher, json={"name": "НОВАЯ-1"})
    assert group.status_code == 200
    group_id = group.json()["id"]
    imported = client.post(
        f"/api/v1/groups/{group_id}/enrollments/import", headers=teacher,
        files={"file": ("students.csv", "max_user_id,display_name\n40001,Первый Студент\n40002,Второй Студент\n", "text/csv")},
    )
    assert imported.status_code == 200, imported.text
    assert imported.json() == {"imported": 2, "already_enrolled": 0}
    imported_again = client.post(
        f"/api/v1/groups/{group_id}/enrollments/import", headers=teacher,
        files={"file": ("students.csv", "max_user_id,display_name\n40001,Первый Студент\n40002,Второй Студент\n", "text/csv")},
    )
    assert imported_again.json() == {"imported": 0, "already_enrolled": 2}
    group_audit = client.get(f"/api/v1/groups/{group_id}/audit", headers=teacher)
    assert group_audit.status_code == 200
    assert any(item["action"] == "roster_import" for item in group_audit.json()["items"])
    members = client.get(f"/api/v1/groups/{group_id}/students", headers=teacher)
    assert members.status_code == 200
    assert len(members.json()["items"]) == 2
    invalid = client.post(
        f"/api/v1/groups/{group_id}/enrollments/import", headers=teacher,
        files={"file": ("bad.csv", "max_user_id,display_name\n50001,Новый\nnot-id,Ошибка\n", "text/csv")},
    )
    assert invalid.status_code == 422
    assert len(client.get(f"/api/v1/groups/{group_id}/students", headers=teacher).json()["items"]) == 2


def test_late_after_30_minutes(client, db_engine):
    teacher = login(client, "teacher.demo")
    student = login(client, "student.kirill")
    session_id = client.post("/api/v1/groups/group-ivt-21/sessions", headers=teacher, json={"title": "Поздняя отметка"}).json()["id"]
    with Session(db_engine) as db:
        session = db.get(AttendanceSession, session_id)
        session.started_at = datetime.now(timezone.utc) - timedelta(minutes=31)
        db.commit()
    token = client.post(f"/api/v1/sessions/{session_id}/qr-token", headers=teacher).json()["token"]
    response = client.post("/api/v1/check-ins", headers=student, json={"qr_token": token})
    assert response.status_code == 200
    checkins = client.get(f"/api/v1/sessions/{session_id}/check-ins", headers=teacher)
    assert checkins.json()["items"][0]["attendance_status"] == "late"


def test_other_teacher_cannot_read_or_correct_session(client, db_engine, settings):
    owner = login(client, "teacher.demo")
    session_id = client.post(
        "/api/v1/groups/group-ivt-21/sessions", headers=owner, json={"title": "Закрытое занятие"},
    ).json()["id"]
    client.post(f"/api/v1/sessions/{session_id}/close", headers=owner)

    with Session(db_engine) as db:
        other = User(id="teacher-other", max_user_id="30009", display_name="Другой преподаватель", role="teacher")
        db.add(other)
        db.add(TeacherGroup(teacher_id=other.id, group_id="group-pmi-22"))
        db.commit()
        foreign = {"Authorization": f"Bearer {issue_access_token(other, settings)}"}

    correction = client.post(
        f"/api/v1/sessions/{session_id}/check-ins/manual", headers=foreign,
        json={"student_id": "student-anna", "action": "add", "reason": "Попытка чужой правки"},
    )
    assert correction.status_code == 404
    assert correction.json()["error"]["code"] == "SESSION_NOT_FOUND"
    for path in (
        f"/api/v1/sessions/{session_id}",
        f"/api/v1/sessions/{session_id}/check-ins",
        f"/api/v1/sessions/{session_id}/audit",
        f"/api/v1/sessions/{session_id}/export.csv",
    ):
        assert client.get(path, headers=foreign).status_code == 404
    assert client.get(f"/api/v1/sessions/{session_id}/check-ins", headers=owner).json()["present_count"] == 0
