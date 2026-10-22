# Feature handoff — Authentication reliability and MFA timeouts

## 1. Summary

| Item | Value |
|---|---|
| Feature | Session-check/login reliability diagnosis and correction; MFA security windows reduced to 5 minutes |
| Release | Zamil Digitalization V 2.1.0 |
| Status | Implemented; automated tests pass; read-only local diagnostics against Oracle TEST; no login performed against Oracle |
| Replaces CI3 feature | Not applicable |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `fix/auth-login-mfa-reliability` (from `main` at `630e4b3`) |
| Commit(s) | `fix(auth): improve login reliability and tighten MFA timeouts` |
| Pull Request | To be created by the owner |
| Merged into `main` | Not yet |

## 3. Findings (what was actually verified)

| # | Finding | Evidence |
|---|---|---|
| 1 | The session check is correct: `GET /auth/me` without a cookie returns `401` → guest → `/login`; a valid session → `/dashboard`. "Session check unavailable" appears only for a non-401 answer. | Backend run: `401 UNAUTHENTICATED`; `client/tests/authReliability.test.mjs` |
| 2 | **Confirmed cause of non-401 answers:** `server.js` awaited the Oracle readiness probe (log-only) before `listen()`. The port stayed closed ~3.3 s after every start, including each `node --watch` restart, and the Vite proxy answered `502` (empty body) to session checks and sign-ins. A fresh clone without a valid `server/.env` never starts, so it always gets `502`. | Measured: listening at 3273 ms before, 1246 ms after (pools ready at 2906 ms) |
| 3 | The frontend showed the same "The service is temporarily unavailable." for a proxy `502` (backend not reached) and a backend `503 SERVICE_UNAVAILABLE` (Oracle connection not obtained). | `apiClient.js` fallback mapping |
| 4 | Proxy target `localhost` resolves to `::1` first; backend listens on `127.0.0.1`. Node's dual-stack fallback recovered in every local attempt (40/40, also with a blocked event loop), so this is **not proven** to cause failures; aligned as hardening. | Local reproduction script |
| 5 | Oracle LOW pool: new connections take ~1.4–1.8 s and are opened one at a time; after ~1 min idle, extra connections are closed. Concurrent requests after idle waited up to ~3.2 s; a cold burst of 6 waited up to 5.9 s (queue timeout 10 s). No `503` was observed. | Read-only `SELECT 1 FROM DUAL` probes after 0, 2 and 5 min idle |
| 6 | No automatic retries and no duplicate login POST: the login form ignores submits while pending; the API client never replays requests. | Tests |

The intermittent login `503` reported by developers was **not reproduced**. Its next occurrence can
now be classified: "could not be reached" = backend not listening (Vite logs `http proxy error`);
"temporarily unavailable" with a Reference = backend `503`, whose backend log line (same request ID,
level `error`) contains the Oracle cause (for example `NJS-040` queue timeout or a connect error).

## 4. Files

| New / Modified | Path | Purpose |
|---|---|---|
| Modified | `server/src/server.js` | Listen right after pool creation; readiness probe afterwards (log only) |
| Modified | `server/src/modules/auth/auth.policy.js` | Three MFA windows 10 → 5 min |
| Modified | `server/src/modules/auth/{mfa,recovery}.service.js`, `auth.routes.js` | Messages/comments state 5 minutes |
| Modified | `server/docs/openapi/openapi.yaml` | 5-minute challenge and recent-verification wording |
| New | `server/tests/server-startup.test.js` | Startup order regression test |
| Modified | `server/tests/auth-mfa.test.js`, `auth-recovery.test.js` | 5-minute boundaries (mutation-checked against 10 min) |
| Modified | `client/vite.config.js` | Proxy target `http://127.0.0.1:3000` |
| Modified | `client/src/services/api/apiClient.js` | Non-envelope `502`/`504`: "The application server could not be reached." |
| Modified | `client/src/pages/auth/LoginPage.jsx` | Shows the request ID (Reference) for server-side failures |
| Modified | `client/src/routes/RouteGuards.jsx` | Clearer root session-check error text |
| Modified | `client/src/pages/auth/MfaReplacementPage.jsx` | "within 5 minutes" |
| New | `client/tests/authReliability.test.mjs` | 401/valid/502/network restore; login 401 vs 503 vs 502 vs network, one POST |
| Modified | `client/tests/{mfa,apiClient,securityBoundaries,securityAdministration}.test.mjs` | 5-minute expiry, messages, proxy target |
| Modified | `docs/DEVELOPER-ONBOARDING.md`, `server/docs/08-IMPLEMENTATION_STATUS.md` | Proxy target, troubleshooting, current MFA timing |

## 5–7. Routes, API and Oracle

No route, endpoint, contract or schema change. Error codes are unchanged. Oracle access during
diagnosis was read-only (`SELECT 1 FROM DUAL`, startup readiness); no DML, DDL or login.

## 8. Authentication and permissions

| Policy | Before | After |
|---|---|---|
| `MFA_POLICY.challengeLifetimeMs` | 10 min | **5 min** |
| `MFA_POLICY.replacementRecentVerificationMs` | 10 min | **5 min** |
| `ACTION_TOKEN_POLICY.recentVerificationMs` | 10 min | **5 min** |

Expiry is enforced by the backend: the challenge row's `EXPIRES_AT` is set from the policy and
compared with the database clock; the challenge cookie expires at the same time. The frontend timer
only follows the backend `expiresAt`. Expired challenges fail closed (`MFA_CHALLENGE_INVALID`) and
require a new sign-in. Challenges issued with the old 10-minute lifetime before deployment are
refused (`NOT_A_CHALLENGE`), which also requires a new sign-in. Unchanged: TOTP step and replay
guard, recovery-token lifetimes, lockout, session lifetimes, the development-only administrator MFA
exception, RBAC.

## 10. Validation and test evidence

| Check | Result |
|---|---|
| `server`: `npm run check` | ESLint clean, Prettier clean, 468/468 (Oracle mocked) |
| `client`: `npm run lint` / `npm test` / `npm run build` / `verify-production.mjs` | clean / 217/217 / built / PASS |
| Live Vite + backend (HTTP, read-only) | Proxied `/auth/me` → 401 at 1.26 s after backend launch; `GET /` 200 |

No browser was driven; route rendering is covered by state-level tests only.

## 12. Known limitations

- The reported intermittent `503` was not reproduced; root cause on the affected machine unknown.
- Pool regrowth latency after idle is unchanged (raising `ORACLE_LOW_POOL_MIN` locally would reduce it; not changed).
- Requests sent during the remaining ~1.2 s startup still receive `502` (shown as a recoverable error).
