# Phase 07 — Backend Finalization and Developer Handover

**Branch:** `feat/backend-finalization`, based on `da20f25`, the Phases 01–06 merge. It is uncommitted; the developer handles Git.
**Date:** 20 October 2026.

**Verdict:**

| Target | Status |
|---|---|
| TEST/integration | **Ready for development-team handover and continued TEST/integration use.** |
| Production | **Not production-ready.** Seven production blockers remain open (§9). |

This document is the entry point for developers. Phase details live in `docs/handoffs/PHASE-0X-*.md`; the current state is in `docs/08-IMPLEMENTATION_STATUS.md`.

## 1. What is implemented

The backend is a Node.js 24 / Express 5 ES-module **modular monolith** (Controller → Service → Repository) over Oracle Autonomous Database (TEST: `zpadwtest_low`/`_high`).

It covers the authentication, authorization and user-administration foundation only. **No business modules exist yet**, and the React frontend (`client/`) is out of scope.

| Capability | Summary | Phase |
|---|---|---|
| HTTP foundation | Validated config, request IDs, Pino logging with redaction, Helmet, JSON body limit, standard envelopes, central error handler, OpenAPI 3.1 + Swagger UI (dev/test only), health endpoints | 00–01 |
| Oracle foundation | node-oracledb Thin, wallet mTLS, named LOW/HIGH pools, `withConnection`/`withTransaction` (one connection per transaction, repositories never commit), bind variables, graceful shutdown | 00–01 |
| Login and sessions | `USER_NAME` → `EMPLOYEE_NUMBER` → Argon2id `PASSWORD_HASH`; anti-enumeration; 5/15 lockout; DB-backed opaque sessions (SHA-256 digest only), 8 h absolute, 30/15 min idle; HttpOnly `__Host-` cookie; Origin check + session-bound HMAC CSRF token; Asia/Riyadh employment eligibility; 90-day password expiry | 01 |
| MFA (TOTP) | Mandatory for privileged accounts; 10-minute challenge; AES-256-GCM secrets (HKDF subkeys); replay guard; first enrollment with proof of possession; authenticator replacement (recent MFA) | 02 |
| RBAC | `authorize('MODULE.RESOURCE', 'ACTION')` evaluated in Oracle on every request: default deny, additive roles, ALLOW, explicit DENY wins, inactive/expired never grant, security permissions require an MFA-verified session. RBAC administration APIs with Super Administrator protections, no-escalation and no-self-modification | 03, 04 |
| User administration | List/search/filter/sort; candidates; details (no secrets); PENDING provisioning; gated activation; disable with session and token revocation; session revocation; protected hierarchy | 04 |
| Recovery | Password setup/reset/change; MFA recovery (token + password + new authenticator); single-use SHA-256 action tokens (24 h/30 m/15 m); Super Administrator pinned-address self-recovery; Zaid-only privileged recovery; self-service request answered before any account-dependent work | 05, 06 |
| E-mail | Office 365 SMTP (Nodemailer 10, STARTTLS 587, verified certificates, XOAUTH2 or tenant-permitted AUTH); recipients from `XX_DIGI_EMP_MASTER.EMAIL_ADDRESS`; outside production only the approved test mailbox after an Oracle `DB_NAME` check; privileged recovery mail disabled | 05 |
| Audit | Append-only (application INSERT only) `XX_ZRV_RBAC_AUDIT_LOGS`; changes and their audit rows in one transaction; refusals/failures recorded independently; owner-approved event catalogue (25 codes) | 01–06 |

## 2. Verified APIs (51 operations; OpenAPI 3.1 at `docs/openapi/openapi.yaml`)

**Coverage:** the route inventory matches the spec exactly. 49 declared `/api/v1` routes are all documented with nothing extra, plus `GET /health/live` and `GET /health/ready`. This is checked automatically by `tests/api-docs.test.js` and was cross-checked again in this phase. The spec is served at `/api/openapi.json`, and Swagger UI at `/api/docs` in development/test only.

**Common rules:**
- Every state-changing request passes the Origin check.
- Authenticated changes require `X-CSRF-Token`.
- `SECURITY_ADMINISTRATION.*` permissions require an MFA-verified session.
- Security responses are `Cache-Control: no-store`.

| Group (base) | Operations | Guard |
|---|---|---|
| Health (`/health`) | `GET live`, `GET ready` | public |
| Auth (`/api/v1/auth`) | `GET password/policy`; `POST login`; `POST mfa/enrollment`, `mfa/enrollment/confirm`, `mfa/verify` | public (rate-limited; MFA routes need the challenge cookie and challenge CSRF) |
| | `GET me`, `GET csrf`, `POST logout`, `POST mfa/replacement`, `mfa/replacement/confirm`, `POST password/change` | session (+CSRF on POST) |
| | `POST recovery/request`, `password/setup`, `password/reset`, `mfa/recovery/start`, `mfa/recovery/confirm` | public, rate-limited, token in body |
| Access control (`/api/v1/access-control`) | `GET me/permissions`; roles (5); catalogue (7); role grants (3); user roles + effective permissions (4); overrides (3) — 23 total | session + `ROLES`/`PERMISSION_CATALOG`/`ROLE_PERMISSIONS`/`USER_ROLES`/`USER_PERMISSION_OVERRIDES` actions |
| Users (`/api/v1/users`) | list, candidates, details, provision, activate, disable, revoke sessions (all/one), password-setup link, recovery link — 10 total | session + `USER_ACCOUNTS` (or `ACCOUNT_RECOVERY:ISSUE`) actions |

**Response contract:**
- Success: `{ success: true, data, meta: { requestId } }`.
- Lists: plus `pagination { page, limit, total, totalPages, hasNextPage, hasPreviousPage }`.
- Errors: `{ success: false, error: { code, message, details? }, meta }`. Codes are stable; messages are safe to display; internal details are never returned (500 → `INTERNAL_ERROR`).

## 3. Live Oracle TEST integration (owner-approved; verified)

| Scenario | Result |
|---|---|
| Super Administrator bootstrap (61 rows) and MFA enrollment/replacement (Zaid, USER_ID 1) | Passed (Phases 01–02) |
| RBAC administration with a temporary role; protections; audit | Passed (Phase 03) |
| Provisioning employee 2502 → USER_ID 2 `PENDING`; duplicate/premature activation refused | Passed (Phase 04) |
| Office 365 SMTP setup link (test mailbox only) → USER_ID 2 `ACTIVE`; ordinary login and denials | Passed (Phase 05) |
| RBAC evaluation of USER_ID 2 (role, ALLOW, DENY precedence, inactive permission, cleanup) | Passed (Phase 06) |
| Password change; self-service reset with Office 365 delivery to the test mailbox | Passed (Phase 06) |

**Current TEST state (read-only, this phase):**
- `db:status` LOW/HIGH OK.
- `db:verify-auth` **139/139 PASS**.
- 2 accounts (Zaid and USER_ID 2); 0 open sessions; 0 usable tokens; 0 active overrides; 1 active membership (Zaid's SUPER_ADMINISTRATOR).
- All temporary `ZRV_IT_*` objects are inactive.

**Not live-tested:**
- MFA recovery;
- OAuth2 SMTP;
- privileged recovery e-mail;
- the protected-account refusal by a non-Zaid administrator;
- production hosting.

## 4. Code layout and responsibilities (`server/`)

| Path | Responsibility |
|---|---|
| `src/server.js`, `src/shutdown.js` | Process entry: pools, listener, signal handling, graceful shutdown |
| `src/app.js` | Express pipeline: trust proxy → request ID → HTTP log → Helmet → JSON → health → docs → `/api/v1` → 404 → error handler |
| `src/config/index.js` | **Only** place reading `process.env`; Joi-validated, frozen config; startup refusals (cookies, SMTP override, production rules) |
| `src/database/oracle.js`, `wallet.js` | Pools, `withConnection`/`withTransaction`, readiness, wallet validation |
| `src/middleware/` | `authenticate`, `authorize`, `csrf` (Origin + token), `mfaChallenge`, `rateLimit` (in-process), `requestId`, `validate` (Joi, unknown fields rejected), `errorHandler` |
| `src/routes/` | `api.routes.js` (composition root: builds services and mounts feature routers), `health.routes.js`, `docs.routes.js` |
| `src/modules/auth/` | Login, sessions, MFA, passwords, lockout, eligibility, policies, recovery (`recovery.*`) |
| `src/modules/access-control/` | Authorization evaluator, RBAC administration, security catalogue constants |
| `src/modules/users/` | User administration |
| `src/modules/audit/` | Audit event catalogue and writer (`record` in-transaction, `recordIndependently`) |
| `src/modules/notifications/` | Delivery boundary, recipient policy, Office 365 SMTP channel, DB identity |
| `src/shared/` | `AppError`, logger, response envelopes, cookie parsing |
| `tests/` | `node:test` + Supertest; in-memory doubles in `tests/helpers/` mirror repository semantics |
| `scripts/` | Operator and verification tools (§6) |
| `docs/` | Architecture 01–06 (approved), 07 locked requirements, 08 status, `openapi/`, `rbac-schema/` (locked table docs), `handoffs/` |

**Conventions** (see `server/CLAUDE.md`):
- SQL only in repositories; business rules only in services.
- `AppError` for expected failures.
- `sendSuccess`/`sendError`/`sendPaginated` for responses.
- New `/api/v1` APIs must be documented in OpenAPI in the same change.

## 5. Database dependencies (locked; no DDL in Phases 01–07)

- **11 RBAC tables:** `XX_ZRV_USERS`, `XX_ZRV_ROLES`, `XX_ZRV_APP_MODULES`, `XX_ZRV_RESOURCES`, `XX_ZRV_PERMISSIONS`, `XX_ZRV_USER_ROLES`, `XX_ZRV_ROLE_PERMISSIONS`, `XX_ZRV_USER_PERMISSION_OVERRIDES`, `XX_ZRV_USER_SESSIONS`, `XX_ZRV_ACCOUNT_ACTION_TOKENS`, `XX_ZRV_RBAC_AUDIT_LOGS`. Columns and constraints are documented in `docs/rbac-schema/`.
- **Read-only business source:** `XX_DIGI_EMP_MASTER` (`EMPLOYEE_NUMBER`, `USER_NAME`, `FULL_NAME`, `EMAIL_ADDRESS`, `JOB_TITLE`, `DEPARTMENT`, `CURRENT_EMP_FLAG`, `TERMINATION_DATE`).
- **Bootstrap:** the security catalogue (module `SECURITY_ADMINISTRATION`, 8 resources, 23 actions) and the three administrator roles exist on TEST (`npm run db:bootstrap-test`, owner-authorized, already executed). **Production needs its own approved bootstrap.**
- **Soft state only:** no DELETE anywhere; revocation/deactivation sets `IS_ACTIVE=0` / `REVOKED_AT`.

## 6. Local development and commands

### Prerequisites
- Node.js ≥ 24 (`engines`).
- npm.
- Network access to Oracle ADW (mTLS wallet).
- For e-mail: an Office 365 mailbox with SMTP AUTH enabled.

### Setup
```powershell
cd server
npm ci
copy .env.example .env      # then fill values; .env is git-ignored
```

- **Wallet:** unzip the ADW wallet to `../secrets/oracle/<Wallet_dir>`. The root `secrets/` folder is git-ignored. Set `ORACLE_WALLET_DIR`, `ORACLE_WALLET_PASSWORD`, `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_LOW_ALIAS=zpadwtest_low` and `ORACLE_HIGH_ALIAS=zpadwtest_high`. Never commit or copy wallet contents.
- **MFA key:** `AUTH_MFA_ENCRYPTION_KEY` (base64, 32 bytes) is required outside development/test. Use the **same** key as the TEST data, or existing enrolments become unreadable. Obtain it from the secret owner; never generate a new one for TEST.
- **SMTP (optional):**
  - `SMTP_ENABLED=true`, `SMTP_AUTH_METHOD`, `SMTP_USER`, the credentials and `AUTH_FRONTEND_BASE_URL`;
  - outside production, `SMTP_TEST_RECIPIENT_OVERRIDE=shaikh.azim@olivesofts.com` (the only accepted value) and `SMTP_TEST_DATABASE_NAME` (the TEST `DB_NAME`) are mandatory;
  - keep `SMTP_PRIVILEGED_DELIVERY_ENABLED=false`.
- **Every variable** is listed and explained in `.env.example`. Its 57 keys match the configuration schema exactly, verified this phase.

### Commands

| Purpose | Command |
|---|---|
| Run (watch) / run | `npm run dev` / `npm start` |
| Lint, format check, all tests | `npm run check`, which must pass before any hand-off |
| Tests only | `npm test` (Oracle and SMTP replaced by in-memory doubles; `NODE_ENV=test`) |
| Oracle connectivity | `npm run db:status` |
| Oracle SQL verification (**read-only**) | `npm run db:verify-auth` |
| SMTP connectivity and auth (**no e-mail**) | `npm run smtp:verify` |
| Password-expiry reminder counts (**read-only**) | `npm run auth:password-reminders` |
| Read-only state checks | `db:rbac-post-check`, `db:users-check`, `db:setup-check`, `db:phase06-check` |
| Interactive TEST operator tools (**write**; owner approval each time) | `auth:mfa-test`, `auth:rbac-test`, `auth:users-test`, `auth:setup-test`, `auth:rbac-user-test`, `auth:recovery-test` |
| TEST bootstrap (**write**; already executed) | `db:bootstrap-test` |
| API docs | `http://127.0.0.1:3000/api/docs` (development/test) |

The operator tools run the API in-process, check non-production and the TEST database identity first, take secrets only at hidden prompts, and ask for `yes` before writing.

## 7. Deployment readiness (hosting not finalized)

### Requirements already enforced by configuration
- `AUTH_COOKIE_SECURE=true` outside development/test.
- `__Host-` cookies (secure, path `/`, no domain).
- Swagger off outside development/test.
- `HTTP_HOST` defaults to `0.0.0.0` in deployments.
- The SMTP test override is forbidden in production.
- `AUTH_MFA_ENCRYPTION_KEY` is required.
- `https` frontend base URL.

### Topology (recommended)

The TLS-terminating reverse proxy or gateway serves the frontend and `/api` on the **same origin**. There is **no CORS middleware**: browser calls from another origin are not supported by design. A cross-site frontend would also break the `SameSite=Lax` session cookie.

### Proxy settings
- Set `TRUST_PROXY_HOPS` to the exact number of trusted proxies, so `req.ip` (rate limits, audit IPs) and `req.protocol`/host (Origin check) are correct.
- Forward `X-Forwarded-For` and `X-Forwarded-Proto` and preserve `Host`.
- Add only the frontend origin to `AUTH_ALLOWED_ORIGINS` if it differs from the API's own external origin.
- Enforce HTTPS and HSTS at the edge (Helmet also sends HSTS).

### Health checks
- `GET /health/live` is process liveness.
- `GET /health/ready` checks the Oracle LOW and HIGH pools (cached), returning 503 while Oracle is unavailable. The process stays up when Oracle is down at startup.
- Use readiness for load-balancer routing.

### Shutdown
SIGTERM/SIGINT drain HTTP and close the pools within `SHUTDOWN_TIMEOUT_MS`.

### Logging
- Pino JSON goes to stdout, one line per request (method, path without query, status, request ID).
- Passwords, tokens, cookies, CSRF, secrets, hashes, links and SMTP/OAuth credentials are redacted.
- Correlate with the `X-Request-Id` response header and `CORRELATION_ID` in audit rows.
- Ship stdout to the platform log store.

### Monitoring (suggested)
- 5xx rate and readiness;
- Oracle pool queue/timeouts (`ORACLE_POOL_STATISTICS`, `db:status`);
- `LOGIN_FAILED`/`ACCOUNT_LOCKED`/`ACCESS_DENIED` audit spikes;
- `ACTION_TOKEN_ISSUED` with outcome `FAILURE` (delivery problems).

### Hosting decisions still needed
- the platform and process manager;
- the gateway/WAF and **distributed rate limiting** (blocker 6);
- the exact proxy hop count;
- the public origin(s) and certificates;
- the secret store for Oracle/MFA/SMTP secrets and their rotation;
- the production Oracle environment and its bootstrap;
- log retention and alerting;
- the Swagger exposure policy;
- the reminder job runner.

## 8. Troubleshooting

| Symptom | Likely cause and action |
|---|---|
| Startup: `Invalid configuration: …` | A missing or invalid variable; the message names it. Compare with `.env.example`. |
| `/health/ready` 503 / `db:status` FAIL | Wallet path/password, alias, ADB access list, network/proxy, or the ADB being stopped |
| Login always `AUTHENTICATION_FAILED` | Generic by design. Check the audit `REASON_CODE` (`UNKNOWN_USERNAME`, `ACCOUNT_PENDING`, `ACCOUNT_LOCKED`, `PASSWORD_EXPIRED`, …). |
| Privileged user gets `MFA_REQUIRED`/challenge | Expected. MFA is mandatory; check that `AUTH_MFA_ENCRYPTION_KEY` matches the enrolments. |
| `403 CSRF_REJECTED` | Missing `X-CSRF-Token` (from login or `GET /auth/csrf`), wrong Origin, or a `TRUST_PROXY_HOPS`/Host mismatch behind a proxy |
| `503 DELIVERY_UNAVAILABLE` | SMTP disabled, privileged account, no `EMAIL_ADDRESS`, or a TEST DB identity mismatch. The admin response details give the reason; run `npm run smtp:verify`. |
| SMTP `EAUTH 535` | Tenant SMTP AUTH disabled for the mailbox, a wrong credential, or a missing OAuth2 app permission/service principal |
| `FORBIDDEN` on an admin API | The permission is missing or DENY'd, or the session is not MFA-verified. Check `GET /access-control/me/permissions`. |

## 9. Production blockers (none resolved)

| # | Blocker | Severity | Owner | Recommended resolution | Blocks production | Blocks handover |
|---|---|---|---|---|---|---|
| 1 | SMTP basic AUTH (PASSWORD) → OAuth2 | High | M365 tenant admin + backend | Entra app with `SMTP.SendAsApp`, Exchange service principal and mailbox permission; set `SMTP_AUTH_METHOD=OAUTH2` (implemented, unit-tested); `smtp:verify`, then one approved TEST send | **Yes** | No |
| 2 | Employee e-mail ownership not verified | High | Owner/HR + security | Decide the trusted source (HR-maintained, corporate domain only) and/or a verification step before first setup; data-quality check of `EMAIL_ADDRESS` | **Yes** (for real onboarding/recovery mail) | No |
| 3 | Privileged recovery delivery disabled | Medium | Owner + security | Approve `SMTP_PRIVILEGED_DELIVERY_ENABLED` for production, then test Zaid's pinned-address and Zaid-authorized recovery on TEST | **Yes**, for privileged self-recovery (administrator recovery otherwise depends on the Super Administrator) | No |
| 4 | First MFA enrollment of privileged accounts is password-only (provisional, TEST) | High | Owner + security | Require enrollment proof bound to an administrator-issued token or an in-person/verified channel; approve the production policy | **Yes** | No |
| 5 | Password-expiry reminders: count only, no sender/scheduler | Medium | Backend + ops | Scheduled daily job (one per business day) using the SMTP channel; decide the runner; accept no-dedup-column semantics | **Yes** (approved policy requires reminders) | No |
| 6 | Rate limiting in-process only | High | Ops/gateway + backend | Gateway/WAF limits for `/api/v1/auth/*`, or a shared store (needs dependency approval) | **Yes** | No |
| 7 | Audit immutability not database-enforced | High | DBA + owner | Deploy `TR_ZRV_AUDIT_NO_MUTATION` (or equivalent) and least-privilege grants (runtime user INSERT-only on audit); needs DDL approval | **Yes** | No |

### Other known limitations

| Limitation | Notes |
|---|---|
| MFA recovery not live-tested | It needs an enrolled ordinary account; Zaid's MFA is preserved |
| Optional MFA enrollment for ordinary users | No endpoint |
| Read access not audited | Needs a decision |
| Business refusals (400/409) not audited | |
| Reason-code catalogue not owner-approved | |
| Bulk provisioning | Not implemented |
| Self-service timing | Residual timing under heavy load |
| Login replacing a presented cookie | No dedicated audit row |
| Business modules and data-scope rules | Not started |
| Audit retrieval API | Not started |
| Frontend integration | Deferred |
| Hosting/Origin configuration | Pending (§7) |

## 10. Developer onboarding checklist

1. Read `server/CLAUDE.md`, `docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md`, `docs/08-IMPLEMENTATION_STATUS.md`, then this document.
2. `npm ci`; create `.env` from `.env.example` with secrets from the owner; place the wallet under `../secrets/`.
3. `npm run check` (expect all tests green); `npm run db:status`; `npm run db:verify-auth` (read-only).
4. `npm run dev`; open `/api/docs`; sign in with an existing TEST account; never create accounts or grants on TEST without owner approval.
5. For new business modules:
   - add catalogue rows through the RBAC APIs (approved);
   - guard routes with `authorize('MODULE.RESOURCE', 'ACTION')`;
   - follow Controller → Service → Repository;
   - document in OpenAPI;
   - add tests with the in-memory doubles and, if SQL is new, read-only checks in `scripts/verify-auth-sql.js`.

## 11. Changes in Phase 07

**Verification only, plus one defence-in-depth change:** the logger redaction now also covers `clientSecret`, `accessToken`, `pass` and `link` (SMTP/OAuth2 material and e-mailed links). These were never logged. No confirmed functional defects were found.

**Verified in this phase:**
- **API inventory:** 51 operations match the code exactly.
- **Configuration:** schema, `.env.example` and the local `.env` key names all match (57 keys; values not read out).
- **Dependencies:** consistent; `npm audit` reports 0 vulnerabilities; Node `engines >=24`.
- **Secrets in code:**
  - no secret-column values in responses (password hash and TOTP secret are selected only internally for authentication);
  - log calls carry only error objects, codes and counts;
  - `500`s return no internals.
- **Startup and shutdown:** startup refuses invalid configuration; an unreachable Oracle keeps the process up with readiness 503; shutdown drains.
- **Oracle read-only:** `db:status` OK; `db:verify-auth` 139/139.
- **`npm run check`:** lint, format check and **439/439** tests passed (Oracle and SMTP mocked).

## 12. Suggested commit message

```
docs(backend): finalize backend handover and production-readiness assessment

- Phase 07 developer handover: architecture, API inventory (51 operations),
  verified TEST integrations, configuration, local setup, deployment and
  troubleshooting guidance
- production-readiness assessment of the seven open blockers with severity,
  owner and resolution; known limitations retained
- logger redaction extended to SMTP/OAuth2 material and e-mailed links
- implementation status updated
```
