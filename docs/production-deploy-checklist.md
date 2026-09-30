# Production deployment checklist

Use this checklist for each release. Follow the concrete Ubuntu steps in [`../deploy/README.md`](../deploy/README.md), then verify the public MAX flow on the exact commit named in the submission PDF.

## Inputs from the team lead

- Public HTTPS URL and DNS/server access. The separate `compose.production.yaml` publishes only Caddy on ports 80/443, with frontend nginx proxying `/api/v1` to the backend on the internal Docker network.
- Access to the bot's Mini App URL setting. The publicly known bot username is `MAX_BOT_NAME`; the bot access token must be delivered through a private secret channel, never committed or pasted into issue trackers.
- The jury uses two MAX accounts and the separate `JURY_ADMIN_TOKEN` from the submission PDF to select teacher/student roles in the synthetic group. A third account is useful for the outsider denial case. Record IDs privately; the bot's `/me` ID is not a teacher ID.

## Before exposing the app

1. Use `compose.production.yaml`, not the local/demo `compose.yaml`. Its Caddy service is the only published service on ports 80/443; frontend, backend and PostgreSQL have no host ports. Confirm that no other host service owns 80/443 before startup.
2. Fill the ignored `.env.production` from `.env.production.example`: separate URL-safe `POSTGRES_PASSWORD` and `JWT_SECRET`, `MAX_BOT_TOKEN`, `MAX_BOT_NAME`, and the separate `JURY_ADMIN_TOKEN` shown in the PDF. Set `JURY_GROUP_NAME=Проверка жюри`; use only synthetic data in this group. Leave `BOOTSTRAP_TEACHER_MAX_USER_ID` empty unless appointing a separate permanent test teacher. Production, mock-off, frontend build mode and CORS are fixed by the Compose file. Restrict the env file to the deployment operator.
3. Confirm the deployed frontend has no local demo-login screen or sample password. The public build excludes demo accounts and mock API code; `npm run check:production` checks the bundle for these markers. `demo` is only for isolated local acceptance stacks.
4. Keep access logging disabled in both Caddy and Mini App nginx: MAX may put `startapp`/`WebAppStartParam` QR tokens in query strings. Check any additional outer proxy or provider logs separately; never log JWT or bot tokens.
5. Set the bot's Mini App URL to the public HTTPS origin in MAX partner settings. Check the signed `initData` login and `startapp` deep link in MAX Mobile and MAX Web, not only in a normal browser.
6. With two MAX accounts follow [`jury-access.md`](jury-access.md). Run the full teacher/student acceptance matrix, including duplicate, expired and closed QR, manual correction, history and CSV. Verify records in PostgreSQL and after a container restart.
7. Verify `https://app.qr-otmetka.ru/healthz` and `https://app.qr-otmetka.ru/api/v1/openapi.json` externally. Run the methods and role checks in [`DATA-API.yaml`](DATA-API.yaml), including the jury-role endpoint; compare them with the published OpenAPI response.
8. Create at least one recoverable PostgreSQL backup and test a restore before real pilot data is used. Keep the database volume across ordinary deployments; do not run `docker compose down -v` on a release installation.

## Known limitations to disclose

- MAX bot token validation via `/me` confirms the bot credential but not a working Mini App launch or a teacher/student role.
- The current rate limiter lives in one backend process; use one backend worker/replica for this MVP until a shared limiter is implemented.
- App-group membership is a prepared test roster, not proof of official course enrollment or physical presence.
- Public handling of real student data requires separate legal/organizational review and a retention/backup policy.
