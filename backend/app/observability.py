import hashlib
import json
import logging
import threading
import time
from collections import defaultdict, deque

from fastapi import Request


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {"level": record.levelname, "event": record.getMessage()}
        for key in ("method", "path", "status", "duration_ms", "error_type"):
            if hasattr(record, key):
                data[key] = getattr(record, key)
        return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def configure_logging() -> logging.Logger:
    logger = logging.getLogger("attendance")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


class RateLimiter:
    """Small single-process limiter for write/auth routes; use a shared store when scaling workers."""

    def __init__(self, window_seconds: int, requests: int):
        self.window_seconds = window_seconds
        self.requests = requests
        self.entries: dict[str, deque[float]] = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key: str, limit: int | None = None) -> bool:
        now = time.monotonic()
        cap = limit or self.requests
        with self.lock:
            hits = self.entries[key]
            while hits and hits[0] <= now - self.window_seconds:
                hits.popleft()
            if len(hits) >= cap:
                return False
            hits.append(now)
            if len(self.entries) > 10_000:
                self.entries = defaultdict(deque, {key: value for key, value in self.entries.items() if value and value[-1] > now - self.window_seconds})
            return True


def rate_key(request: Request) -> tuple[str, int | None] | None:
    path = request.url.path
    if request.method != "POST":
        return None
    if path in ("/api/v1/auth/max", "/api/v1/auth/mock"):
        return f"auth:{request.client.host if request.client else 'unknown'}", None
    if path == "/api/v1/check-ins" or path.endswith("/qr-token"):
        bearer = request.headers.get("authorization", "")
        digest = hashlib.sha256(bearer.encode()).hexdigest()
        return f"write:{path}:{digest}", 20
    if path.endswith("/enrollments/import"):
        bearer = request.headers.get("authorization", "")
        digest = hashlib.sha256(bearer.encode()).hexdigest()
        return f"import:{digest}", 5
    return None
