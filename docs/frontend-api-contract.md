# Frontend ↔ Backend API contract

Базовый префикс: `/api/v1`. Все защищённые запросы передают `Authorization: Bearer <access_token>`.

## Авторизация

- `POST /auth/max` с `{ "init_data": "..." }`.
- `POST /auth/mock` с `{ "login": "...", "password": "..." }` — только dev/demo.
- Оба endpoint возвращают `access_token`, `token_type: "bearer"` и пользователя с `id`, `max_user_id`, `display_name`, `role`.
- Роль определяет backend. Access token frontend хранит только в памяти.

## Преподаватель

- `GET /groups` — объект `{ items }`; группе нужны `id`, `name`, `student_count`.
- `POST /groups/{group_id}/sessions` с `{ "title": "..." }` — новая сессия.
- `POST /sessions/{session_id}/qr-token` — строка `deep_link`, непрозрачный `token`, `expires_at`.
- `GET /sessions/{session_id}/check-ins` — статус сессии, `present_count`, `student_count`, список отметившихся.
- `POST /sessions/{session_id}/close` — закрытие сессии. Получение check-ins остаётся доступно после закрытия.

Frontend запрашивает новый QR раз в 5 секунд. Каждый QR-токен действует 10 секунд. Список отметившихся обновляется polling-запросом раз в секунду.

## Студент

- `GET /check-in/context?token=<qr-token>` — занятие, группа, преподаватель, срок QR и бизнес-статус.
- `POST /check-ins` с `{ "qr_token": "..." }` — подтверждение присутствия.

Поддерживаемые статусы контекста: `available`, `expired`, `session_closed`, `not_enrolled`, `already_checked_in`.

## Формат ошибки

```json
{
  "error": {
    "code": "QR_TOKEN_EXPIRED",
    "message": "Срок действия QR-кода истёк",
    "details": null
  }
}
```

Frontend принимает решения по стабильному полю `error.code`. Поддерживаемые коды:

- `INVALID_INIT_DATA`, `INIT_DATA_EXPIRED`, `UNAUTHORIZED`, `FORBIDDEN`;
- `GROUP_NOT_FOUND`, `SESSION_NOT_FOUND`, `SESSION_CLOSED`;
- `QR_TOKEN_INVALID`, `QR_TOKEN_EXPIRED`;
- `STUDENT_NOT_ENROLLED`, `ALREADY_CHECKED_IN`;
- `VALIDATION_ERROR`, `INTERNAL_ERROR`.

HTTP-статусы: `400` для невалидного/просроченного QR, `401` для недействительной авторизации, `403` для недостаточных прав, `404` для отсутствующих ресурсов, `409` для конфликта состояния, `422` для невалидного тела и `500` для внутренней ошибки.
