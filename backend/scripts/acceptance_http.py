"""End-to-end attendance acceptance test against the local development API.

Creates a uniquely named synthetic group and keeps its records for DB inspection.
Never use this script with production credentials or real student data.
"""

import csv
import io
import os
from uuid import uuid4

import httpx


BASE_URL = os.getenv("ACCEPTANCE_BASE_URL", "http://localhost:8000/api/v1")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "baam-demo")


def expect(response: httpx.Response, status: int, error_code: str | None = None) -> dict:
    assert response.status_code == status, (
        f"{response.request.method} {response.request.url.path}: "
        f"expected HTTP {status}, got {response.status_code}: {response.text}"
    )
    body = response.json()
    if error_code is not None:
        assert body["error"]["code"] == error_code, body
    return body


def main() -> None:
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        def login(name: str) -> tuple[dict[str, str], str]:
            body = expect(client.post("/auth/mock", json={"login": name, "password": DEMO_PASSWORD}), 200)
            return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["id"]

        teacher, _ = login("teacher.demo")
        anna, anna_id = login("student.anna")
        kirill, kirill_id = login("student.kirill")
        outsider, outsider_id = login("student.outsider")

        expect(client.get("/groups"), 401, "UNAUTHORIZED")
        expect(client.get("/groups", headers=anna), 403, "FORBIDDEN")

        group_name = f"Приёмка-{uuid4().hex[:12]}"
        group_id = expect(client.post("/groups", headers=teacher, json={"name": group_name}), 200)["id"]
        for student_id in (anna_id, kirill_id):
            expect(
                client.post(f"/groups/{group_id}/enrollments", headers=teacher, json={"student_id": student_id}),
                200,
            )
        students = expect(client.get(f"/groups/{group_id}/students", headers=teacher), 200)["items"]
        assert {item["id"] for item in students} == {anna_id, kirill_id}, students

        session_id = expect(
            client.post(f"/groups/{group_id}/sessions", headers=teacher, json={"title": "Приёмочное занятие"}),
            200,
        )["id"]
        qr = expect(client.post(f"/sessions/{session_id}/qr-token", headers=teacher), 200)["token"]
        context = expect(client.get("/check-in/context", headers=anna, params={"token": qr}), 200)
        assert context["status"] == "available", context
        outsider_context = expect(client.get("/check-in/context", headers=outsider, params={"token": qr}), 200)
        assert outsider_context["status"] == "not_enrolled", outsider_context

        expect(client.post("/check-ins", headers=anna, json={"qr_token": qr}), 200)
        expect(client.post("/check-ins", headers=anna, json={"qr_token": qr}), 409, "ALREADY_CHECKED_IN")
        expect(client.post("/check-ins", headers=outsider, json={"qr_token": qr}), 403, "STUDENT_NOT_ENROLLED")
        before = expect(client.get(f"/sessions/{session_id}/check-ins", headers=teacher), 200)
        assert before["present_count"] == 1 and before["student_count"] == 2, before

        fresh_qr = expect(client.post(f"/sessions/{session_id}/qr-token", headers=teacher), 200)["token"]
        closed = expect(client.post(f"/sessions/{session_id}/close", headers=teacher), 200)
        assert closed["status"] == "closed", closed
        expect(client.post("/check-ins", headers=kirill, json={"qr_token": fresh_qr}), 409, "SESSION_CLOSED")

        manual = {"student_id": kirill_id, "action": "add", "reason": "Студент без доступа к интернету"}
        after = expect(client.post(f"/sessions/{session_id}/check-ins/manual", headers=teacher, json=manual), 200)
        assert after["present_count"] == 2, after
        expect(client.post(f"/sessions/{session_id}/check-ins/manual", headers=teacher, json=manual), 409, "ALREADY_CHECKED_IN")
        outsider_manual = {**manual, "student_id": outsider_id}
        expect(
            client.post(f"/sessions/{session_id}/check-ins/manual", headers=teacher, json=outsider_manual),
            404,
            "STUDENT_NOT_ENROLLED",
        )

        stored = expect(client.get(f"/sessions/{session_id}/check-ins", headers=teacher), 200)
        assert stored["status"] == "closed" and stored["present_count"] == 2, stored
        assert {item["student_id"]: item["source"] for item in stored["items"]} == {
            anna_id: "qr", kirill_id: "manual",
        }, stored
        audit = expect(client.get(f"/sessions/{session_id}/audit", headers=teacher), 200)["items"]
        assert any(item["action"] == "manual_add" and item["subject_student_id"] == kirill_id for item in audit), audit

        exported = client.get(f"/sessions/{session_id}/export.csv", headers=teacher)
        assert exported.status_code == 200, exported.text
        rows = list(csv.DictReader(io.StringIO(exported.content.decode("utf-8-sig"))))
        assert {row["student_id"]: row["source"] for row in rows} == {anna_id: "qr", kirill_id: "manual"}, rows
        history = expect(client.get(f"/groups/{group_id}/sessions", headers=teacher), 200)["items"]
        assert any(item["id"] == session_id and item["present_count"] == 2 for item in history), history

        print("PASS: QR, duplicate/outsider protection, closed session, manual fallback, audit, CSV, history")
        print(f"group_id={group_id}")
        print(f"session_id={session_id}")


if __name__ == "__main__":
    main()
