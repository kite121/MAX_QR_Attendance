from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int, details=None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def error_response(code: str, message: str, status_code: int, details=None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


async def app_error_handler(_request: Request, error: AppError) -> JSONResponse:
    return error_response(error.code, error.message, error.status_code, error.details)


async def validation_error_handler(_request: Request, _error: RequestValidationError) -> JSONResponse:
    return error_response("VALIDATION_ERROR", "Некорректные данные запроса", 422)
