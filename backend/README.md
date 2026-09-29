# Backend QR-посещаемости

FastAPI, PostgreSQL, SQLAlchemy и Alembic. Backend проверяет личность MAX, роль и состав группы, выдаёт временные QR-токены и хранит результат посещаемости. P1 включает ручные исправления с аудитом, историю, CSV и статистику. Порог опоздания: 30 минут после начала занятия.

## Локальный запуск

Из корня репозитория:

```bash
cp .env.example .env
docker compose up --build
```

Frontend: `http://localhost:8080`; API и OpenAPI UI: `http://localhost:8000/api/v1/openapi.json` и `http://localhost:8000/docs`; проверка БД: `http://localhost:8000/healthz`. При старте backend применяет миграцию и загружает синтетические данные. Повторный запуск сохраняет PostgreSQL volume. Остановка: `docker compose down`.

В локальном compose frontend собирается с настоящим API (`VITE_USE_MOCK_API=false`), а backend разрешает тестовый вход. Учётные записи, совпадающие с frontend mock API:

| Логин | Роль | Группа |
| --- | --- | --- |
| `teacher.demo` | преподаватель | ИВТ-21 |
| `student.anna` | студент | ИВТ-21 |
| `student.kirill` | студент | ИВТ-21 |
| `student.outsider` | студент | ПМИ-22 |

Пароль только для локального демо указан в `.env.example`. Преподаватель открывает занятие, студент переходит по QR в отдельной вкладке и входит своим тестовым аккаунтом. Без зарегистрированного бота QR ведёт на локальный Mini App; для настоящего запуска в MAX требуется бот и публичный HTTPS.

## Подключение MAX

1. Зарегистрируйте бота на [платформе MAX для партнёров](https://dev.max.ru/docs/webapps/introduction) и привяжите к нему HTTPS-адрес Mini App.
2. Укажите `MAX_BOT_TOKEN` и `MAX_BOT_NAME` через секреты окружения сервера. Нужен именно токен бота, которым MAX подписывает `initData`; иной выданный API-ключ может не подходить. Не записывайте токен в Git, примеры запросов или логи.
3. Укажите `BOOTSTRAP_TEACHER_MAX_USER_ID` — MAX ID первого тестового преподавателя, а также `BOOTSTRAP_TEACHER_NAME` и `BOOTSTRAP_GROUP_NAME`. При старте backend идемпотентно создаст преподавателя и привяжет группу. Если сервер уже создавал этого пользователя как студента, роль будет повышена только операторской командой bootstrap. Для студентов используйте CSV-импорт или привязку к группе. Обычный вход нового подписанного MAX-пользователя создаёт студента без группы.
4. Для публичной установки задайте `ENVIRONMENT=production`, отдельный случайный `JWT_SECRET` длиной от 32 символов, `ENABLE_MOCK_AUTH=false`, `CORS_ORIGINS` и HTTPS reverse proxy. В production конфигурация без имени и токена бота не запустится.

Подпись `initData` проверяется по [алгоритму MAX](https://dev.max.ru/docs/webapps/validation) `HMAC-SHA256(HMAC-SHA256("WebAppData", BOT_TOKEN), launch_params)` с проверкой `auth_date` (по умолчанию один час). Клиентский `initDataUnsafe` не используется для удостоверения личности. Диплинк QR в MAX имеет вид `https://max.ru/<botName>?startapp=<token>`.

## Основные API

Префикс `/api/v1`, защищённые запросы используют `Authorization: Bearer <access_token>`. Совместимые с текущим frontend пути: `/auth/max`, `/auth/mock`, `/groups`, `/groups/{id}/sessions`, `/sessions/{id}/qr-token`, `/check-in/context`, `/check-ins`, `/sessions/{id}/check-ins`, `/sessions/{id}/close`. Дополнительно P0 предоставляет создание группы, список/привязку студентов и получение активной сессии. P1: ручная правка, история, аудит, CSV и статистика. Полные поля, примеры и коды ответов находятся в [`../docs/frontend-api-contract.md`](../docs/frontend-api-contract.md) и [`../docs/openapi.json`](../docs/openapi.json).

QR-токен случайный, действует 10 секунд; в БД хранится только SHA-256 хеш. Клиент получает новый QR каждые 5 секунд, поэтому токены могут перекрываться по сроку. Отметка и закрытие сериализуются блокировкой строки сессии в PostgreSQL; уникальное ограничение `(session_id, student_id)` блокирует дубли. Проверка ролей и принадлежности к группе выполняется на каждом защищённом пути. Лимит запросов для входа и операций записи работает в памяти одного процесса; перед масштабированием на несколько workers его нужно перенести в общий стор.

Импорт CSV: UTF-8 или UTF-8 BOM, заголовки `max_user_id,display_name`, разделитель запятая либо точка с запятой, не более 1000 строк и 200 КБ. Файл обрабатывается атомарно. Экспорт содержит всех студентов группы, включая отсутствующих, и UTF-8 BOM для табличных редакторов. Ручная правка требует причину и фиксируется в `audit_events`.

## Проверка без Docker

Нужны Python 3.12 и PostgreSQL. Из `backend/`:

```bash
cp ../.env.example .env
python -m venv .venv
.venv/Scripts/python -m pip install -e '.[test]'
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m app.seed
.venv/Scripts/python -m app.bootstrap
.venv/Scripts/uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
.venv/Scripts/pytest -q
```

На Linux/macOS используйте `.venv/bin/`. Конфигурация читается из переменных окружения или локального `.env`. При изменении API обновите статический OpenAPI командой `python scripts/export_openapi.py` из `backend/`.
Для проверки двух одновременных HTTP-отметок на запущенном compose выполните `.venv/Scripts/python scripts/smoke_http.py`.

## Приёмка с проверкой записи в PostgreSQL

Запустите локальный compose с `ENABLE_MOCK_AUTH=true`, затем из корня репозитория:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\acceptance_http.py
```

Нужен `httpx` из тестовых зависимостей (`pip install -e '.[test]'` в `backend/`). Если пароль демо-пользователей в `.env` изменён, перед запуском задайте такой же `DEMO_PASSWORD` в терминале. Сценарий создаёт новую синтетическую группу с уникальным именем, зачисляет Анну и Кирилла через **текущий тестовый API преподавателя**, проверяет QR-отметку, запрет повторной отметки и постороннего студента, закрытие занятия, ручную отметку после закрытия, аудит, CSV и историю. На успех выводится `PASS` и идентификаторы `group_id`/`session_id`. Тестовые записи намеренно остаются в PostgreSQL для просмотра; существующие группы и занятия сценарий не меняет. На публичном сервере его не запускайте.

Подставьте напечатанный `session_id` в запрос ниже и выполните из корня репозитория. Ожидаемый результат: `closed|2|1|1` — закрытое занятие, всего две отметки, одна через QR и одна вручную.

```powershell
docker compose exec -T db psql -U attendance -d attendance -At -c "SELECT s.status, COUNT(c.id), COUNT(*) FILTER (WHERE c.source='qr'), COUNT(*) FILTER (WHERE c.source='manual') FROM attendance_sessions s LEFT JOIN check_ins c ON c.session_id=s.id WHERE s.id='<session_id>' GROUP BY s.status;"
```

Это прямое чтение таблиц БД, независимое от ответа API. Учтите, что `GET /api/v1/groups` в Swagger требует JWT нашего приложения: сначала вызовите `/api/v1/auth/mock`, затем кнопку Authorize и передайте полученный `access_token`. Токен бота MAX для локальной приёмки не нужен.

## Данные и ограничения

В репозитории только синтетические имена и тестовые идентификаторы. Телефоны, IP и сами QR-токены в БД не сохраняются; access token браузер хранит в памяти. HTTP-журнал содержит метод, путь без query string, статус и время ответа; access-log Uvicorn выключен, чтобы QR из query string не попадал в него.

Тестовый PostgreSQL volume после демонстрации удаляет оператор; `docker compose down -v` **безвозвратно удаляет локальные данные**. Реальные данные студентов не загружайте до согласования сроков хранения, процедуры удаления, прав доступа и политики обработки с организацией. Публичная эксплуатация требует отдельной проверки соблюдения 152-ФЗ, резервного копирования и внешнего HTTPS. Автоматическое удаление старых записей и распределённый rate limiting в прототип не входят.
