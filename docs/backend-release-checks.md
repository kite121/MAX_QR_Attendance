# Backend release checks (local evidence)

Recorded on 29 September 2026 against the `feat/backend-release-readiness` branch. These are local checks with synthetic accounts; they do **not** certify the future VPS or a live MAX Mini App. Repeat them on the final release commit.

| Check | Result | Scope / remaining work |
| --- | --- | --- |
| Build without Docker layer cache | Passed in about one minute | Base images were already available; measured on a local Docker Desktop host, not the target VPS. The five-minute VPS criterion remains open. |
| Separate Compose stack | Passed | `maxqr_acceptance` started db, backend and frontend with its own volume on loopback ports 18000/18080. Frontend proxy `/healthz` returned `ok`. |
| QR and manual attendance | Passed | A new synthetic session stored one QR and one manual mark; duplicates and unlisted students were rejected. |
| Persistence after stop/start | Passed | The same closed session, both marks, audit event, CSV and history were readable after restarting all three test containers without deleting the volume. Direct PostgreSQL result: `closed|2|1|1` (status, total, QR, manual). |
| Parallel check-in on PostgreSQL | Passed | Two simultaneous HTTP requests returned one `200` and one `409`; a direct SQL query found exactly one `check_ins` row. |
| Backend unit/contract tests | 16 passed, 1 skipped | The optional `test_postgres.py` needs `TEST_POSTGRES_URL`; the separate live HTTP concurrency check above covered the PostgreSQL race locally. |
| Backend runtime user | Passed | Rebuilt test backend runs as UID `10001`, not root; healthcheck and persistence check still pass. |
| nginx configuration | Passed | `nginx -t` succeeded after disabling Mini App access logs that could contain QR start parameters. External HTTPS-proxy logging remains to be checked. |
| Image metadata and local request logs | Passed for checked patterns | Neither test image contained `MAX_BOT_TOKEN`, `JWT_SECRET` or `POSTGRES_PASSWORD` environment keys; a synthetic `startapp` marker did not appear in frontend container logs. This is not a full secret scan of image layers or Git history. |
| Environment-file tracking | Passed for checked paths | `.env`, `backend/.env` and `frontend/.env` are absent from tracked files and their Git path history. Perform a dedicated whole-history secret scan before public release. |
| MAX Mobile/Web and production settings | Not yet checked | Need lead's HTTPS/server information, bot Mini App URL and test MAX accounts. Disable mock login and remove the frontend demo login screen in the public build. |
| DATA-API and final security audit | Not yet complete | Need public base URL, final API/UX contract, secret scan of release artifacts and target-host checks. |

Reproduction commands and expected outputs are in [`../backend/README.md`](../backend/README.md). The isolated stack can be stopped without deleting its PostgreSQL volume. Never use `down -v` for a persistence test.
