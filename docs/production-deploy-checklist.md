# Production deployment checklist

This is a preparation checklist, not proof of a deployed release. The server and `app.qr-otmetka.ru` domain are available, but the installation, certificate and live MAX flow are not yet verified. Follow the concrete Ubuntu steps in [`../deploy/README.md`](../deploy/README.md), then record actual results for the release commit.

## Inputs from the team lead

- Public HTTPS URL and DNS/server access. The separate `compose.production.yaml` publishes only Caddy on ports 80/443, with frontend nginx proxying `/api/v1` to the backend on the internal Docker network.
- Access to the bot's Mini App URL setting. The publicly known bot username is `MAX_BOT_NAME`; the bot access token must be delivered through a private secret channel, never committed or pasted into issue trackers.
- At present only one human MAX account is available. Use the two-stage bootstrap in `deploy/README.md` to verify signed login and teacher actions. A second account is needed for the real teacher-to-student QR flow; a third is useful for the outsider denial case. Record IDs privately; the bot's `/me` ID is not a teacher ID.

## Before exposing the app

1. Use `compose.production.yaml`, not the local/demo `compose.yaml`. Its Caddy service is the only published service on ports 80/443; frontend, backend and PostgreSQL have no host ports. Confirm that no other host service owns 80/443 before startup.
2. Fill the ignored `.env.production` from `.env.production.example`: separate URL-safe `POSTGRES_PASSWORD` and `JWT_SECRET`, `MAX_BOT_TOKEN`, `MAX_BOT_NAME`, a synthetic teacher/group name. Leave `BOOTSTRAP_TEACHER_MAX_USER_ID` empty on the first run and set it only after the human account's signed login. Production, mock-off, frontend build mode and CORS are fixed by the Compose file. Restrict the env file to the deployment operator.
3. Confirm the deployed frontend has no local demo-login screen or sample password. The public build excludes demo accounts and mock API code; `npm run check:production` checks the bundle for these markers. `demo` is only for isolated local acceptance stacks.
4. Keep access logging disabled in both Caddy and Mini App nginx: MAX may put `startapp`/`WebAppStartParam` QR tokens in query strings. Check any additional outer proxy or provider logs separately; never log JWT or bot tokens.
5. Set the bot's Mini App URL to the public HTTPS origin in MAX partner settings. Check the signed `initData` login and `startapp` deep link in MAX Mobile and MAX Web, not only in a normal browser.
6. Prepare the synthetic roster using [`max-test-roster.md`](max-test-roster.md). Run the full teacher/student acceptance matrix, including duplicate, expired and closed QR, manual correction, history and CSV. Verify records in PostgreSQL and after a container restart.
7. Verify `https://<public-host>/healthz` and `https://<public-host>/api/v1/openapi.json` externally. Use [`DATA-API.draft.yaml`](DATA-API.draft.yaml) as the method/role/response checklist, then replace `DATA-API.yaml` with confirmed public URLs, test-account access instructions and observed responses. The draft is not a submission artifact.
8. Create at least one recoverable PostgreSQL backup and test a restore before real pilot data is used. Keep the database volume across ordinary deployments; do not run `docker compose down -v` on a release installation.

## Known limitations to disclose

- MAX bot token validation via `/me` confirms the bot credential but not a working Mini App launch or a teacher/student role.
- The current rate limiter lives in one backend process; use one backend worker/replica for this MVP until a shared limiter is implemented.
- App-group membership is a prepared test roster, not proof of official course enrollment or physical presence.
- Public handling of real student data requires separate legal/organizational review and a retention/backup policy.
