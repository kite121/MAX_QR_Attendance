# Frontend ↔ Backend API contract

Базовый префикс: `/api/v1`. Все защищённые запросы передают `Authorization: Bearer <access_token>`.

## Авторизация

- `POST /auth/max` с `{ "init_data": "..." }`.
- `POST /auth/mock` с `{ "login": "...", "password": "..." }` — только dev/demo; публичная сборка frontend исключает этот вызов и тестовые аккаунты из bundle.
- Оба endpoint возвращают `access_token`, `token_type: "bearer"` и пользователя с `id`, `max_user_id`, `display_name`, `role`.
- Роль определяет backend. Access token frontend хранит только в памяти.
- `POST /jury/role` с `{ "token": "код из PDF", "role": "teacher|student" }` доступен только после входа через MAX. Backend сверяет отдельный `JURY_ADMIN_TOKEN`, создаёт синтетическую группу `JURY_GROUP_NAME` при первом обращении, назначает роль и возвращает новый `access_token` и пользователя. Код передаётся в теле POST, не в URL; неверный код даёт `403`.

## Преподаватель

- `GET /groups` — объект `{ items }`; группе нужны `id`, `name`, `student_count`.
- `POST /groups` с `{ "name": "..." }` — создание тестовой группы преподавателем; `GET /groups/{group_id}/students` и `POST /groups/{group_id}/enrollments` с `{ "student_id": "..." }` доступны только преподавателю этой группы.
- `POST /groups/{group_id}/sessions` с `{ "title": "..." }` — новая сессия.
- `GET /groups/{group_id}/sessions/active` и `GET /sessions/{session_id}` — повторное открытие активной сессии или получение сессии по ID. Повторный `POST /groups/{group_id}/sessions` возвращает уже активную сессию группы.
- `POST /sessions/{session_id}/qr-token` — строка `deep_link`, непрозрачный `token`, `expires_at`.
- `GET /sessions/{session_id}/check-ins` — статус сессии, `present_count`, `student_count`, список отметившихся.
- `POST /sessions/{session_id}/close` — закрытие сессии. Получение check-ins остаётся доступно после закрытия.

Frontend запрашивает новый QR раз в 5 секунд. Каждый QR-токен действует 10 секунд. Список отметившихся обновляется polling-запросом раз в секунду.
Сервер хранит только SHA-256 хеш QR-токена. Когда задан `MAX_BOT_NAME`, `deep_link` имеет вид `https://max.ru/<botName>?startapp=<token>`; без него локальный URL Mini App.

## Студент

- `GET /check-in/context?token=<qr-token>` — занятие, группа, преподаватель, срок QR и бизнес-статус.
- `POST /check-ins` с `{ "qr_token": "..." }` — подтверждение присутствия.

Поддерживаемые статусы контекста: `available`, `expired`, `session_closed`, `not_enrolled`, `already_checked_in`.
После 30 минут от `started_at` новая отметка получает `attendance_status: "late"`, до этого — `"present"`. Элементы списка дополнительно содержат `attendance_status` и `source` (`qr` или `manual`); существующий frontend может игнорировать эти поля.

## P1 API преподавателя

- `POST /sessions/{session_id}/check-ins/manual` с `{ "student_id": "...", "action": "add|remove|set_status", "attendance_status": "present|late", "reason": "..." }`. Для `set_status` поле `attendance_status` обязательно; причина обязательна всегда. Работает и после закрытия занятия, возвращает обновлённый список.
- `GET /sessions/{session_id}/audit` и `GET /groups/{group_id}/audit` — журнал действий и ручных исправлений.
- `GET /groups/{group_id}/sessions?limit=50&offset=0` — история занятий.
- `GET /sessions/{session_id}/export.csv` — CSV итогов, включая отсутствующих. Кодировка UTF-8 с BOM.
- `POST /groups/{group_id}/enrollments/import` — multipart-файл `file` в CSV-формате с заголовками `max_user_id,display_name`; UTF-8/BOM, запятая или точка с запятой, до 1000 строк/200 КБ; возвращает `imported` и `already_enrolled`. Одиночное добавление в интерфейсе использует этот же endpoint, отправляя CSV из одной строки.
- `GET /groups/{group_id}/stats` — сводные количества сессий и отметок, средний процент посещаемости.

Все операции доступны только преподавателю соответствующей группы. Frontend вызывает ручные корректировки, историю, CSV-экспорт и импорт, аудит группы/занятия и статистику. Backend валидирует CSV целиком до записи, добавляет участников идемпотентно и создаёт запись аудита `roster_import`.

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
- `RATE_LIMITED` для `429`.

HTTP-статусы: `400` для невалидного/просроченного QR, `401` для недействительной авторизации, `403` для недостаточных прав, `404` для отсутствующих ресурсов, `409` для конфликта состояния, `422` для невалидного тела, `429` для превышения лимита, `500` для внутренней ошибки и `503` для ещё не настроенной проверки MAX.
