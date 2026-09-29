# QR-отметка — frontend

Mini App для отметки посещаемости на React, TypeScript и Vite. Интерфейс построен на MAX UI, получает данные запуска через MAX Bridge и использует TanStack Query для серверного состояния.

## Требования

- Node.js 22.12 или новее.
- npm 10 или новее.

## Локальный запуск

```bash
cd frontend
cp .env.example .env
npm install
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

## Команды

```bash
npm run dev          # локальный сервер
npm run build        # typecheck и production-сборка
npm run test         # unit и контрактные тесты
npm run test:e2e     # браузерный тест с настоящим backend
npm run test:watch   # тесты в watch-режиме
npm run lint         # ESLint
npm run format       # исправить форматирование Prettier
npm run format:check # проверить форматирование
```

## Сценарии P0

Преподаватель:

1. Входит через MAX или dev-only mock-вход.
2. Выбирает группу, просматривает состав и добавляет студента по MAX ID.
3. Восстанавливает активное занятие либо запускает новое.
4. Показывает автоматически обновляемый QR и видит live-список с polling раз в секунду.
5. Различает обычные, поздние и ручные отметки, при необходимости корректирует их с обязательной причиной.
6. Закрывает занятие, открывает сохранённые результаты из истории и скачивает CSV.

Студент:

1. Открывает Mini App через `start_param` из QR.
2. После успешного входа автоматически отправляет отметку без дополнительной кнопки.
3. Получает экран успеха только после ответа backend.
4. Для повторной отметки, просроченного QR, закрытой сессии и чужой группы получает отдельное состояние; сетевой запрос можно повторить.

## Браузерная интеграционная проверка

Тест запускает две изолированные браузерные сессии и проверяет путь студент → настоящий backend → список преподавателя.

```bash
# из корня репозитория
docker compose up --build -d

# из frontend; при первом запуске установите Chromium Playwright
npx playwright install chromium
npm run test:e2e
```

Переопределить адреса можно через `E2E_BASE_URL` и `E2E_API_URL`. Для уже установленного Chrome поддерживается `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Ручное добавление по MAX ID уже реализовано в mock API. До синхронизации backend-контракта этот запрос закономерно вернёт ошибку в режиме настоящего API; требуемое дополнение описано в контракте.

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
