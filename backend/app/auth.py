import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

import jwt
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.errors import AppError
from app.models import User
from app.schemas import ApiErrorBody, AuthOut, COMMON_ERROR_RESPONSES, MaxAuthIn, MockAuthIn, UserOut

router = APIRouter(
    prefix="/api/v1/auth", tags=["auth"],
    responses={**COMMON_ERROR_RESPONSES, 503: {"model": ApiErrorBody, "description": "MAX не настроен"}},
)
bearer = HTTPBearer(auto_error=False)
DEMO_LOGIN_IDS = {
    "teacher.demo": "teacher-elena",
    "student.anna": "student-anna",
    "student.kirill": "student-kirill",
    "student.outsider": "student-maria",
}


def parse_max_init_data(init_data: str, bot_token: str, max_age_seconds: int, clock_skew_seconds: int = 60) -> dict:
    if not bot_token:
        raise AppError("INTERNAL_ERROR", "Проверка MAX пока не настроена", 503)
    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
        data = dict(pairs)
        if len(data) != len(pairs) or len(data) < 3 or len(init_data) > 8192:
            raise ValueError("duplicate or missing fields")
        supplied_hash = data.pop("hash")
        if len(supplied_hash) != 64:
            raise ValueError("bad hash")
        canonical = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
        secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        expected_hash = hmac.new(secret, canonical.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(supplied_hash, expected_hash):
            raise ValueError("signature mismatch")
        auth_date = int(data["auth_date"])
        now = int(datetime.now(timezone.utc).timestamp())
        if auth_date > now + clock_skew_seconds or now - auth_date > max_age_seconds:
            raise AppError("INIT_DATA_EXPIRED", "Данные MAX устарели", 401)
        user = json.loads(data["user"])
        if not isinstance(user, dict) or not str(user.get("id", "")).isdigit() or len(str(user["id"])) > 64:
            raise ValueError("missing MAX user")
        return user
    except AppError:
        raise
    except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise AppError("INVALID_INIT_DATA", "Недействительные данные MAX", 401) from exc


def issue_access_token(user: User, settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user.id, "iat": now, "exp": now + timedelta(minutes=settings.access_token_minutes), "typ": "access"},
        settings.jwt_secret,
        algorithm="HS256",
    )


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError("UNAUTHORIZED", "Требуется вход", 401)
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"], options={"require": ["sub", "exp", "iat"]})
        if payload.get("typ") != "access" or not isinstance(payload["sub"], str):
            raise jwt.InvalidTokenError("invalid token type")
    except jwt.PyJWTError as exc:
        raise AppError("UNAUTHORIZED", "Сессия входа недействительна", 401) from exc
    user = db.get(User, payload["sub"])
    if user is None:
        raise AppError("UNAUTHORIZED", "Сессия входа недействительна", 401)
    return user


def require_teacher(user: User = Depends(current_user)) -> User:
    if user.role != "teacher":
        raise AppError("FORBIDDEN", "Недостаточно прав", 403)
    return user


def require_student(user: User = Depends(current_user)) -> User:
    if user.role != "student":
        raise AppError("FORBIDDEN", "Недостаточно прав", 403)
    return user


def auth_out(user: User, settings: Settings) -> AuthOut:
    return AuthOut(
        access_token=issue_access_token(user, settings),
        user=UserOut(id=user.id, max_user_id=user.max_user_id, display_name=user.display_name, role=user.role),
    )


@router.post("/max", response_model=AuthOut)
def auth_max(body: MaxAuthIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    max_user = parse_max_init_data(
        body.init_data,
        settings.max_bot_token,
        settings.max_init_data_max_age_seconds,
        settings.max_clock_skew_seconds,
    )
    max_user_id = str(max_user["id"])
    display_name = " ".join(str(max_user.get(part) or "").strip() for part in ("first_name", "last_name")).strip()
    display_name = display_name[:160] or f"MAX {max_user_id}"
    user = db.scalar(select(User).where(User.max_user_id == max_user_id))
    if user is None:
        user = User(max_user_id=max_user_id, display_name=display_name, role="student")
        db.add(user)
    else:
        user.display_name = display_name
    db.commit()
    return auth_out(user, settings)


@router.post("/mock", response_model=AuthOut)
def auth_mock(body: MockAuthIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    if not settings.enable_mock_auth:
        raise AppError("FORBIDDEN", "Тестовый вход отключён", 403)
    user_id = DEMO_LOGIN_IDS.get(body.login)
    if user_id is None or not hmac.compare_digest(body.password, settings.demo_password):
        raise AppError("UNAUTHORIZED", "Неверный логин или пароль", 401)
    user = db.get(User, user_id)
    if user is None:
        raise AppError("INTERNAL_ERROR", "Тестовые данные не загружены", 500)
    return auth_out(user, settings)
