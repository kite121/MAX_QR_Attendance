# baam max — frontend

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
npm run test:watch   # тесты в watch-режиме
npm run lint         # ESLint
npm run format       # исправить форматирование Prettier
npm run format:check # проверить форматирование
```

## Сценарии P0

Преподаватель:

1. Входит через MAX или dev-only mock-вход.
2. Выбирает группу и вводит название занятия.
3. Запускает сессию и показывает автоматически обновляемый QR.
4. Видит live-список и счётчик отметившихся с polling раз в секунду.
5. Подтверждает завершение и получает итоговый список.

Студент:

1. Открывает Mini App через `start_param` из QR.
2. Проверяет занятие, группу и преподавателя.
3. Подтверждает присутствие и получает экран успеха.
4. Для повторной отметки, просроченного QR, закрытой сессии и чужой группы получает отдельное состояние.

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
