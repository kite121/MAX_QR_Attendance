"""Exercise the local compose API, including two simultaneous check-ins."""

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import httpx


def main() -> None:
    base = os.getenv("SMOKE_BASE_URL", "http://localhost:8080/api/v1")
    password = os.getenv("DEMO_PASSWORD", "baam-demo")

    def login(name: str) -> dict[str, str]:
        response = httpx.post(f"{base}/auth/mock", json={"login": name, "password": password}, timeout=5)
        response.raise_for_status()
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    teacher = login("teacher.demo")
    student = login("student.kirill")
    created = httpx.post(
        f"{base}/groups/group-ivt-21/sessions", headers=teacher,
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


if __name__ == "__main__":
    main()
