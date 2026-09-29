# Развёртывание MVP на Ubuntu 24.04

Это руководство для `app.qr-otmetka.ru` и `compose.production.yaml`. Оно не подтверждает, что проект уже установлен на VDS. Команды выполняются из каталога репозитория на сервере. Сначала смержите ветку подготовки деплоя в `main` и используйте один зафиксированный коммит для всей приёмки.

## Что подготовить

| Значение | Где взять | Куда записать |
| --- | --- | --- |
| IP сервера | Панель VDS | Только для SSH и сверки DNS; в Git и `.env.production` не нужен |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` | Приватный `.env.production` |
| `JWT_SECRET` | Отдельный `openssl rand -hex 32` | Приватный `.env.production` |
| `MAX_BOT_TOKEN` | Токен вашего бота в MAX, который проходит `GET /me` | Приватный `.env.production`; никогда не во frontend |
| `MAX_BOT_NAME` | Username бота без `@` | `.env.production`; сейчас `t349_hakaton_max_bot` |
| `BOOTSTRAP_TEACHER_MAX_USER_ID` | ID **человека** из подтверждённого backend входа MAX | Оставить пустым сначала; затем заполнить в `.env.production` |
| URL Mini App | Домен с действующим HTTPS | Настройки бота на платформе MAX: `https://app.qr-otmetka.ru` |

`GET /me` возвращает ID **бота** и не подходит для `BOOTSTRAP_TEACHER_MAX_USER_ID`. Бот не обязан получать сообщения или иметь Webhook: приложение использует токен для проверки подписи `initData`.

Не пересылайте токен бота, пароли, полный `initData` и JWT в чат или Git. Имя и MAX ID тестового пользователя также не нужно публиковать. Для БД генерируйте пароль из шестнадцатеричных символов: Compose вставляет его в URL подключения, где `@`, `:`, `/`, `?`, `#`, `%` без кодирования опасны.

## 1. Проверить хост

Подключитесь по SSH через доступ, выданный владельцем VDS. До установки проверьте, что A-запись `app.qr-otmetka.ru` указывает на этот VDS, а порты 80 и 443 доступны извне. На самом сервере посмотрите `sudo ss -lntp`: если 80/443 уже заняты, сначала выясните каким сервисом. Не останавливайте неизвестный сервис вслепую.

Создайте отдельного пользователя для развёртывания и настройте вход по SSH-ключу. Прежде чем отключать вход root/по паролю, проверьте новый SSH-сеанс. Держите открытым существующий сеанс на случай ошибки. Не открывайте наружу 5432, 8000 или 8080; production Compose публикует только 80/443 у Caddy. Если на хосте включён UFW, разрешите SSH **до** включения правил, затем 80/tcp и 443/tcp. Docker предупреждает, что опубликованные порты контейнеров могут обходить правила UFW, поэтому проверяйте именно `docker compose ... config` и фактические порты.

Установите Docker Engine и Compose plugin по [официальной инструкции для Ubuntu 24.04](https://docs.docker.com/engine/install/ubuntu/) через apt-репозиторий Docker, не через `get.docker.com`. Проверьте:

```bash
sudo docker version
sudo docker compose version
sudo systemctl is-enabled docker
```

## 2. Получить код

Если репозиторий публичный, используйте HTTPS-ссылку в `git clone`. Если он закрытый, настройте на VDS read-only [GitHub deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) для `kite121/MAX_QR_Attendance`: создайте отдельный SSH-ключ на VDS, добавьте только его публичную часть в **Settings → Deploy keys** репозитория без разрешения записи и настройте SSH использовать приватную часть при обращении к GitHub. Проверьте `ssh -T git@github.com` под пользователем развёртывания. Не помещайте personal access token в URL `git clone` и не пересылайте приватный ключ. Пример после настройки доступа:

```bash
sudo mkdir -p /opt/maxqr
sudo chown "$USER:$USER" /opt/maxqr
git clone https://github.com/kite121/MAX_QR_Attendance.git /opt/maxqr
cd /opt/maxqr
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

Для закрытого репозитория замените URL в `git clone` на `git@github.com:kite121/MAX_QR_Attendance.git` после настройки ключа. Если у пользователя уже есть собственный каталог проекта, используйте его вместо `/opt/maxqr`. Для обновлений сохраняйте тот же каталог и то же имя Compose-проекта `maxqr`, иначе можно случайно создать новый том БД.

## 3. Создать приватную конфигурацию

Из корня репозитория на VDS:

```bash
umask 077
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 24
openssl rand -hex 32
nano .env.production
```

Вставьте результаты двух генераций в **разные** поля `POSTGRES_PASSWORD` и `JWT_SECRET`; заполните `MAX_BOT_TOKEN` и проверьте `MAX_BOT_NAME`. Оставьте `BOOTSTRAP_TEACHER_MAX_USER_ID=` пустым для первого входа. Задайте синтетические `BOOTSTRAP_TEACHER_NAME` и `BOOTSTRAP_GROUP_NAME`. Не записывайте в файл SSH-пароль сервера. Убедитесь, что секреты не попали в терминальную историю или снимки экрана.

Проверьте синтаксис без вывода конфигурации с секретами:

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml config --quiet
```

Этот production Compose жёстко устанавливает `ENVIRONMENT=production`, `ENABLE_MOCK_AUTH=false`, production-сборку frontend и CORS для `https://app.qr-otmetka.ru`. Пустые обязательные секреты вызывают ошибку до запуска. `BOOTSTRAP_TEACHER_MAX_USER_ID` пока может быть пустым.

## 4. Собрать и запустить

```bash
time sudo docker compose --env-file .env.production -f compose.production.yaml build
sudo docker compose --env-file .env.production -f compose.production.yaml up -d --wait
sudo docker compose --env-file .env.production -f compose.production.yaml ps
```

Ожидаются запущенные `db`, `backend`, `frontend`, `caddy`; первые три имеют healthcheck. Данные PostgreSQL и сертификаты Caddy лежат в постоянных Docker volumes. Caddy автоматически получает и продлевает сертификат, если DNS верен и входящие 80/443 достигают этого сервера. Не используйте `down -v` — это удаляет данные.

Проверки с **другого** устройства:

```bash
curl -fsS https://app.qr-otmetka.ru/healthz
curl -fsS -o /dev/null -w '%{http_code}\n' https://app.qr-otmetka.ru/api/v1/openapi.json
curl -sSI http://app.qr-otmetka.ru/healthz
```

Ожидается `{"status":"ok"}`, затем `HTTP 200`, затем перенаправление HTTP на HTTPS. Не обходите ошибку сертификата ключом `-k`: исправьте DNS, время сервера, доступность 80/443 или конфигурацию Caddy. Для диагностики используйте `sudo docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 caddy backend` и не публикуйте логи целиком. Доступность `/healthz` не подтверждает работу внутри MAX.

## 5. Подключить MAX и назначить первого преподавателя

После успешной HTTPS-проверки в платформе MAX откройте **Чат-боты → ваш бот → ⋮ → Настройки**, впишите URL Mini App `https://app.qr-otmetka.ru`, выберите кнопку запуска и сохраните. Это отдельная настройка MAX; просто `MAX_BOT_NAME` на сервере её не заменяет.

Откройте Mini App через бот своим единственным аккаунтом MAX. При первом входе он будет студентом без группы — это ожидаемо. Backend проверит подпись `initData` и создаст пользователя. Чтобы прочитать именно подтверждённый сервером ID, на VDS выполните локально:

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  psql -U attendance -d attendance -c \
  "SELECT max_user_id, display_name, role FROM users WHERE max_user_id IS NOT NULL ORDER BY created_at DESC LIMIT 5;"
```

Сверьте имя и время первого входа; если в таблице несколько аккаунтов, не угадывайте нужный ID. Не публикуйте вывод. Впишите свой числовой `max_user_id` в `BOOTSTRAP_TEACHER_MAX_USER_ID` приватного `.env.production`, затем примените только конфигурацию backend:

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml up -d --no-deps --force-recreate backend
sudo docker compose --env-file .env.production -f compose.production.yaml ps
```

Снова откройте Mini App через MAX: аккаунт должен получить роль преподавателя и увидеть тестовую группу. Используйте ID человека из этой таблицы, **не** `user_id` бота из `/me`. На этом этапе с одним аккаунтом можно проверить вход и действия преподавателя, но нельзя заявлять, что путь отдельного студента внутри MAX пройден.

## 6. Приёмка и сохранность

Когда появится второй согласованный тестовый аккаунт MAX, добавьте его числовой ID в группу через преподавательский интерфейс (CSV или одиночное добавление). Проверьте QR → автоматическую отметку → список → закрытие → историю → ручную правку с причиной → CSV. Повторный QR не должен создать вторую запись. Проверьте MAX Mobile и MAX Web; десятисекундный QR может оказаться слишком коротким для реального открытия, и тогда TTL нужно менять согласованно в backend и frontend.

Для проверки сохранности выполните `sudo docker compose --env-file .env.production -f compose.production.yaml restart` и повторно откройте уже созданные историю и CSV. Не удаляйте volumes. Перед использованием реальных данных сделайте резервную копию и пробное восстановление в отдельную тестовую БД. Минимальный архив только с синтетическими данными:

```bash
umask 077
sudo install -d -m 700 -o "$USER" -g "$(id -gn)" /opt/maxqr-backups
sudo docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  pg_dump -U attendance -d attendance -Fc > /opt/maxqr-backups/attendance-test.dump
sudo docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  pg_restore --list < /opt/maxqr-backups/attendance-test.dump > /dev/null
sudo docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  createdb -U attendance attendance_restore_test
sudo docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  pg_restore -U attendance -d attendance_restore_test --exit-on-error \
  < /opt/maxqr-backups/attendance-test.dump
sudo docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  psql -U attendance -d attendance_restore_test -At -c 'SELECT COUNT(*) FROM users;'
```

Храните рабочие копии вне репозитория и отдельно от одного VDS; один архив на том же сервере не защищает от потери самого сервера. Порядок восстановления и срок хранения согласуйте до пилота с реальными студентами.

## Обновления и границы проверки

После merge и резервной копии: `git pull --ff-only origin main`, затем `sudo docker compose --env-file .env.production -f compose.production.yaml up -d --build --wait`. Миграции выполняются при старте backend. Простая замена кода на старый коммит не гарантирует откат миграций БД; держите проверенную резервную копию до обновления.

Финализируйте `docs/DATA-API.yaml` только после фактической проверки публичных ответов. Отметьте отдельно, что реально проверено в MAX Mobile/Web и что пока покрыто лишь синтетическими тестами. Административная роль в этом MVP отложена: импорт группы временно выполняет преподаватель. Для полноценной сквозной демонстрации нужен второй MAX-аккаунт.
