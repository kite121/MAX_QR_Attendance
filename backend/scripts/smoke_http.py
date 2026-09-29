"""Exercise the local compose API, including two simultaneous check-ins."""

import argparse
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import httpx


def main(base: str) -> None:
    password = os.getenv("DEMO_PASSWORD", "baam-demo")

    def login(name: str) -> tuple[dict[str, str], str]:
        response = httpx.post(f"{base}/auth/mock", json={"login": name, "password": password}, timeout=5)
        response.raise_for_status()
        body = response.json()
        return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["id"]

    teacher, _ = login("teacher.demo")
    student, student_id = login("student.kirill")
    group = httpx.post(
        f"{base}/groups", headers=teacher,
        json={"name": f"Параллельная-проверка-{uuid4().hex[:12]}"}, timeout=5,
    )
    group.raise_for_status()
    group_id = group.json()["id"]
    enrolled = httpx.post(
        f"{base}/groups/{group_id}/enrollments", headers=teacher,
        json={"student_id": student_id}, timeout=5,
    )
    enrolled.raise_for_status()
    created = httpx.post(
        f"{base}/groups/{group_id}/sessions", headers=teacher,
        json={"title": "Parallel smoke test"}, timeout=5,
    )
    created.raise_for_status()
    session_id = created.json()["id"]
    qr = httpx.post(f"{base}/sessions/{session_id}/qr-token", headers=teacher, timeout=5)
    qr.raise_for_status()
    token = qr.json()["token"]
    barrier = Barrier(2)

    def check_in() -> httpx.Response:
        barrier.wait(timeout=5)
        return httpx.post(f"{base}/check-ins", headers=student, json={"qr_token": token}, timeout=5)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(check_in)
        second = pool.submit(check_in)
        responses = (first.result(timeout=10), second.result(timeout=10))
    codes = sorted(response.status_code for response in responses)
    assert codes == [200, 409], codes
    result = httpx.get(f"{base}/sessions/{session_id}/check-ins", headers=teacher, timeout=5)
    result.raise_for_status()
    assert result.json()["present_count"] == 1, result.json()
    print("parallel_check_in: one 200, one 409, one stored row")
    print(f"session_id={session_id}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("SMOKE_BASE_URL", "http://localhost:8080/api/v1"))
    main(parser.parse_args().base_url)
