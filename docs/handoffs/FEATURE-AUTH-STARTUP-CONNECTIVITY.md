# Feature handoff — Session recovery and startup connectivity (Phase 1)

## 1. Summary

| Item | Value |
|---|---|
| Feature | Bounded automatic session-check recovery; accessible login when it fails; connectivity and port 5173 investigation |
| Release | Zamil Digitalization V 2.1.0 |
| Status | Implemented; automated and local HTTP tests pass; no browser driven; no Oracle writes or live login |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `fix/auth-startup-connectivity` (from `main` at `d51522f`) |
| Commit | `fix(auth): improve session recovery and startup connectivity` |
| Pull Request | Owner reviews and merges |

## 3. Findings

| Item | Finding | Evidence |
|---|---|---|
| A | A transient `502`/network failure on the single session check (`GET /auth/me`) left the root page on "Session check unavailable" until a manual retry. | Unit and live tests |
| B | `/login` already rendered in the error state, but the error page offered no way to reach it. | `RouteGuards.jsx` |
| C | **Verified cause:** `npm run dev` (`node --watch`) restarts the backend on every saved backend file; the port is closed ~1.07 s per restart and the Vite proxy answers `502` (35 consecutive proxied requests in one measured restart). A sign-in in that window shows "The application server could not be reached"; the next attempt works. Not reproduced: keep-alive socket reuse (20 requests at 4950–5050 ms idle gaps, all `401`), IPv6 (proxy targets `127.0.0.1`). Other unexplained occurrences remain unverified. | Read-only HTTP diagnostics through the real Vite config |
| D | `5173` is **not** in tracked source or defaults. It comes from the private `server/.env`: `AUTH_FRONTEND_BASE_URL` is set to `http://127.0.0.1:5173`. Fix locally: `AUTH_FRONTEND_BASE_URL=http://localhost:5199`, then restart the backend. The tracked `.env.example` showed `http://localhost:5173` as an allowed-origin example; corrected. | Key-name scan of private env files (values not printed) |

## 4. Files

| Path | Change |
|---|---|
| `client/src/features/auth/authSession.js` | `restore()`: initial GET + retries after 1 s and 2 s, only for `NETWORK_ERROR`/`502`/`503`/`504`; one request at a time; aborted by newer operations, API 401 or `stop()` |
| `client/src/routes/RouteGuards.jsx` | Shared error page with **Retry session check** and **Go to Login** |
| `client/src/components/feedback/PageState.{jsx,css}` | Optional secondary action (children) |
| `client/src/pages/auth/LoginPage.jsx` | Connection warning + retry while the session check is in error |
| `client/tests/authReliability.test.mjs`, `authSession.test.mjs` | Recovery, bounds, cancellation, actual-HTTP recovery, login distinctions |
| `server/.env.example`, `server/tests/frontend-links.test.js` | Development frontend origin `http://localhost:5199` |
| `docs/DEVELOPER-ONBOARDING.md` | Troubleshooting: restart window, 5173 links |

## 8. Security

Login POST and every state-changing request are never retried. `401` → guest at once. The error
state is neither authenticated nor guest; protected routes stay blocked; MFA, CSRF, RBAC, cookies,
lockout, audit, MFA five-minute policies and the development administrator MFA exception are
unchanged. No backend code, API contract or Oracle change.

## 10. Test evidence

See the PR report for command results. Live check: real session code through the real Vite proxy,
backend launched 1.5 s late → responses `502, 502, 401` → guest after 3.1 s.

## 12. Known limitations

- The backend restart window under `--watch` (~1 s) remains; sign-ins in it fail visibly and must be resubmitted.
- Intermittent failures not caused by a restart were not reproduced.
- No real browser was driven; route behavior is covered by state tests and source checks.
