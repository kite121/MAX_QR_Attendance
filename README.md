# MAX QR Attendance

Сервис для учёта посещаемости в университете через бота и Mini App в MAX. Преподаватель запускает занятие и показывает временный QR-код; студент открывает его в MAX и отмечается; преподаватель получает итоговый список.

Frontend P0 и backend P0/P1 реализованы. Локально их можно проверить вместе через Docker Compose; реальные MAX-проверки потребуют зарегистрированного бота, его токена и HTTPS-адреса Mini App.

## Команда

| Участник | Основная зона ответственности |
| --- | --- |
| Данил | продуктовая целостность, сроки, приёмка, документация, демонстрация и сдача |
| Рома | исследование проблемы, продукт, пилот, поддержка UX и backend |
| Никита | UI/UX, frontend и клиентская интеграция с MAX |
| Амир | backend, база данных, безопасность и Docker |

## Структура

```text
.
├── backend/                 # FastAPI, интеграция с ботом, модели и тесты
│   ├── app/                 # код сервиса
│   └── tests/               # автоматические проверки
├── frontend/                # React + TypeScript + Vite Mini App
│   └── src/                 # код интерфейса
├── docs/                    # архитектура и решения команды
├── output/pdf/              # исходники LaTeX и PDF планов спринтов
├── .github/                 # шаблон pull request
├── .gitignore
├── CONTRIBUTING.md          # правила веток, коммитов и ревью
└── README.md
```

Для локального запуска скопируйте `.env.example` в `.env` и выполните `docker compose up --build`. Mini App будет на `http://localhost:8080`, API — на `http://localhost:8000`, OpenAPI UI — на `http://localhost:8000/docs`. Инструкции backend находятся в [`backend/README.md`](backend/README.md), frontend — в [`frontend/README.md`](frontend/README.md). Секреты и реальные данные студентов в репозиторий не помещаем.

## Рабочий сценарий MVP

1. Преподаватель выбирает группу и запускает сессию посещаемости.
2. Mini App показывает динамический QR-код.
3. Студент открывает ссылку в MAX и подтверждает присутствие.
4. Backend проверяет пользователя, группу, сессию и срок действия токена.
5. Преподаватель видит список, закрывает сессию и получает результат.

## Документы

- [Архитектура и границы компонентов](docs/architecture.md)
- [Контракт Frontend ↔ Backend](docs/frontend-api-contract.md)
- [Правила работы с ветками и pull request](CONTRIBUTING.md)
- [Общий план проекта](output/pdf/plan_proekta_qr_attendance.pdf)
- [Спринт 1](output/pdf/sprint_1_problem_ux_foundation.pdf) · [Спринт 2](output/pdf/sprint_2_vertical_mvp.pdf) · [Спринт 3](output/pdf/sprint_3_stability_security.pdf) · [Спринт 4](output/pdf/sprint_4_release_submission.pdf)
