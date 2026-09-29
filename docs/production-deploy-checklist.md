# Production deployment checklist (awaiting server and HTTPS details)

This is a preparation checklist, not proof of a deployed release. Fill in the public address and verify every item on the actual server before submission.

## Inputs from the team lead

- Public HTTPS URL and DNS/server access. One HTTPS origin can serve both the Mini App and `/api/v1`: frontend nginx already proxies API requests to the backend container.
- Access to the bot's Mini App URL setting. The publicly known bot username is `MAX_BOT_NAME`; the bot access token must be delivered through a private secret channel, never committed or pasted into issue trackers.
- Test MAX accounts for one teacher, enrolled students and one unlisted student. Record their MAX IDs privately; the bot's own `/me` user ID is not a teacher ID.

## Before exposing the app

1. Configure the host's HTTPS reverse proxy to forward the public origin to the frontend service. Publish only ports 80/443 externally; bind the compose frontend/backend host ports to `127.0.0.1` with `FRONTEND_BIND_ADDRESS` and `BACKEND_BIND_ADDRESS`. PostgreSQL has no published port in `compose.yaml`.
2. Supply private environment values: `POSTGRES_PASSWORD`, a fresh `JWT_SECRET` of at least 32 characters, `MAX_BOT_TOKEN`, `MAX_BOT_NAME`, `BOOTSTRAP_TEACHER_MAX_USER_ID`, `BOOTSTRAP_TEACHER_NAME`, `BOOTSTRAP_GROUP_NAME`, and the public `CORS_ORIGINS`. Set exactly `ENVIRONMENT=production` and `ENABLE_MOCK_AUTH=false`. Keep the private environment file outside Git and restrict its filesystem permissions.
3. Confirm that the frontend public build does not expose the local demo-login screen or its sample password. The backend refuses mock login in production, but the current frontend screen still needs a separate frontend change.
4. Ensure the external HTTPS proxy does not log query strings or headers containing `startapp`, `WebAppStartParam`, JWT or bot tokens. Mini App nginx access logs are disabled; the outer proxy must be reviewed separately.
5. Set the bot's Mini App URL to the public HTTPS origin in MAX partner settings. Check the signed `initData` login and `startapp` deep link in MAX Mobile and MAX Web, not only in a normal browser.
6. Prepare the synthetic roster using [`max-test-roster.md`](max-test-roster.md). Run the full teacher/student acceptance matrix, including duplicate, expired and closed QR, manual correction, history and CSV. Verify records in PostgreSQL and after a container restart.
7. Verify `https://<public-host>/healthz` and `https://<public-host>/api/v1/openapi.json` externally. Replace the local placeholder structure in `DATA-API.yaml` with the confirmed public base URL and tested request/response examples.
8. Create at least one recoverable PostgreSQL backup and test a restore before real pilot data is used. Keep the database volume across ordinary deployments; do not run `docker compose down -v` on a release installation.

## Known limitations to disclose

- MAX bot token validation via `/me` confirms the bot credential but not a working Mini App launch or a teacher/student role.
- The current rate limiter lives in one backend process; use one backend worker/replica for this MVP until a shared limiter is implemented.
- App-group membership is a prepared test roster, not proof of official course enrollment or physical presence.
- Public handling of real student data requires separate legal/organizational review and a retention/backup policy.
