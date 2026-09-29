# QR-отметка — frontend

Mini App для отметки посещаемости на React, TypeScript и Vite. Интерфейс построен на MAX UI, получает данные запуска через MAX Bridge и использует TanStack Query для серверного состояния.

## Требования

- Node.js 22.12 или новее.
- npm 10 или новее.

## Локальный запуск

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

По умолчанию `.env.example` включает локальный mock API. Он позволяет пройти весь путь преподавателя и студента без запущенного backend.

Тестовые пользователи:

- `teacher.demo` / `baam-demo` — Елена Соколова, преподаватель ИВТ-21;
- `student.anna` / `baam-demo` — Анна Смирнова, студент ИВТ-21;
- `student.kirill` / `baam-demo` — Кирилл Волков, студент ИВТ-21;
- `student.outsider` / `baam-demo` — Мария Орлова, студент ПМИ-22 для проверки ошибки принадлежности к группе.

Mock-данные занятий хранятся в `localStorage`, чтобы преподаватель и студент могли работать в разных вкладках. Access token всегда хранится только в памяти приложения и пропадает при перезагрузке.

## Переменные окружения

```dotenv
VITE_API_URL=http://localhost:8000/api/v1
VITE_USE_MOCK_API=true
```

- `VITE_API_URL` — базовый URL REST API.
- `VITE_USE_MOCK_API=true` — встроенный mock API для локальной разработки.
- Для интеграции с backend установите `VITE_USE_MOCK_API=false`.
- Demo-вход и mock API доступны только в dev-сервере или явно выбранном режиме `demo`. Обычная production-сборка игнорирует `VITE_USE_MOCK_API=true` и исключает тестовые аккаунты из клиентского кода.

## Публичная и demo-сборки

`npm run build` создаёт публичную сборку в `dist`: вход только через MAX. При запуске вне MAX показывается инструкция открытия приложения; после ошибки связи вход можно повторить с актуальными данными Bridge. Без заданного `VITE_API_URL` публичная сборка обращается к `/api/v1` на своём origin.

`npm run build:demo` создаёт отдельную сборку в `dist-demo` с тестовым входом. Используйте её только локально; `VITE_USE_MOCK_API=false` подключает demo-вход к настоящему dev-backend.

Docker по умолчанию собирает публичную версию. Для локальных интеграционных проверок задайте `FRONTEND_BUILD_MODE=demo`; перед публичным запуском оставьте `FRONTEND_BUILD_MODE=production` и отключите mock-авторизацию на backend согласно общему checklist.

## Команды

```bash
npm run dev          # локальный сервер
npm run build        # typecheck и production-сборка
npm run build:demo   # явная demo-сборка в dist-demo
npm run check:production # проверка отсутствия demo-кода в dist
npm run test         # unit и контрактные тесты
npm run test:e2e     # браузерный тест с настоящим backend
npm run test:watch   # тесты в watch-режиме
npm run lint         # ESLint
npm run format       # исправить форматирование Prettier
npm run format:check # проверить форматирование
```

## Возможности

Преподаватель:

1. Входит через MAX или dev-only mock-вход.
2. Выбирает группу, просматривает состав, добавляет студента по MAX ID или импортирует список из CSV.
3. Восстанавливает активное занятие либо запускает новое.
4. Показывает автоматически обновляемый QR и видит live-список с polling раз в секунду.
5. Различает обычные, поздние и ручные отметки, при необходимости корректирует их с обязательной причиной.
6. Закрывает занятие, открывает сохранённые результаты из истории и скачивает CSV.
7. Видит сводную статистику посещаемости и аудит группы.

Студент:

1. Открывает Mini App через `start_param` из QR.
2. После успешного входа автоматически отправляет отметку без дополнительной кнопки.
3. Получает экран успеха только после ответа backend.
4. Для повторной отметки, просроченного QR, закрытой сессии и чужой группы получает отдельное состояние; сетевой запрос можно повторить.

## Браузерная интеграционная проверка

Тесты проверяют путь студент → настоящий backend → список преподавателя, идемпотентный и ошибочный импорт, корректировки закрытого занятия, обновлённые CSV, историю, сетевой повтор, дубликат, чужую группу и реальное истечение QR. Отдельные тесты публичной сборки проверяют отсутствие demo-входа и повтор MAX-авторизации с синтетическим Bridge/ответами API.

```bash
# из корня репозитория
docker compose -p maxqr-frontend-test --env-file .env.acceptance.example up --build --wait

# из frontend; при первом запуске установите Chromium Playwright
npx playwright install chromium
npm run build
npm run check:production
E2E_BASE_URL=http://127.0.0.1:18080 E2E_API_URL=http://127.0.0.1:18000/api/v1 npm run test:e2e

# после проверки из корня; данные БД остаются в томе
docker compose -p maxqr-frontend-test --env-file .env.acceptance.example down
```

Переопределить адреса можно через `E2E_BASE_URL` и `E2E_API_URL`. Для уже установленного Chrome поддерживается `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
Playwright сам запускает preview production-сборки на порту 4173. Для внешнего preview задайте `E2E_PRODUCTION_BASE_URL`. Проекты можно запускать отдельно: `npm run test:e2e -- --project=production` или `--project=demo-backend`.

Проверка также включает импорт CSV, статистику и аудит, работающие через P1 endpoints реального backend.

GitHub workflow `Frontend checks` запускает форматирование, ESLint, unit-тесты, типизацию, production build, проверку bundle и браузерные тесты с отдельным синтетическим Compose-стеком.

## MAX

MAX Bridge подключён официальным CDN-скриптом в `index.html`. Клиент передаёт неизменённую строку `window.WebApp.initData` в `/auth/max`; `initDataUnsafe` используется только для чтения `start_param` и никогда не подтверждает личность.

В production frontend не содержит bot token. Токен бота и проверка подписи `initData` относятся к backend и секретам окружения.

## Структура

```text
src/
├── app/          # query keys и настройки приложения
├── config/       # переменные окружения
├── features/     # auth, teacher и student сценарии
├── pages/        # страницы ролей
├── routes/       # маршрутизация и role guard
├── shared/api/   # REST-клиент, типы и mock API
├── shared/lib/   # MAX Bridge и общие функции
└── shared/ui/    # общие UI-компоненты
```

Согласованный контракт перечислен в [`../docs/frontend-api-contract.md`](../docs/frontend-api-contract.md).
