import time

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.auth import router as auth_router
from app.jury import router as jury_router
from app.attendance import router as attendance_router
from app.p1 import router as p1_router
from app.database import get_db
from app.errors import AppError, app_error_handler, error_response, validation_error_handler
from app.observability import RateLimiter, configure_logging, rate_key


def create_app() -> FastAPI:
    settings = get_settings()
    logger = configure_logging()
    limiter = RateLimiter(settings.rate_limit_window_seconds, settings.rate_limit_requests)
    app = FastAPI(title="MAX QR Attendance API", version="0.1.0", openapi_url="/api/v1/openapi.json")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)

    @app.exception_handler(Exception)
    async def internal_error(_request: Request, error: Exception):
        logger.error("unhandled_error", extra={"error_type": type(error).__name__})
        return error_response("INTERNAL_ERROR", "Внутренняя ошибка сервера", 500)

    @app.middleware("http")
    async def request_middleware(request: Request, call_next):
        started = time.monotonic()
        key = rate_key(request)
        if key is not None and not limiter.allow(*key):
            response = error_response("RATE_LIMITED", "Слишком много запросов", 429)
        else:
            response = await call_next(request)
        logger.info(
            "http_request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round((time.monotonic() - started) * 1000),
            },
        )
        return response

    app.include_router(auth_router)
    app.include_router(jury_router)
    app.include_router(attendance_router)
    app.include_router(p1_router)

    @app.get("/healthz", tags=["system"])
    def healthz(db: Session = Depends(get_db)):
        try:
            db.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            raise AppError("INTERNAL_ERROR", "База данных недоступна", 503) from exc
        return {"status": "ok"}

    return app


app = create_app()
