# Phase 00 — Backend Authentication Readiness Handoff

**Date:** 19 October 2026
**Result:** Completed as a read-only inspection; no files or database objects changed.
**Source:** Claude Code Phase 00 report supplied by project owner; observational results, not an independent re-test here.
**Scope:** Backend and Oracle TEST. Frontend work is deferred and omitted here.

## 1. Foundation found in current server

| Area | Reported state |
|---|---|
| `src/app.js`, `src/server.js`, `src/shutdown.js` | Present |
| `src/config/index.js` | Joi validated environment/configuration; single reader of process.env |
| `src/database/oracle.js`, `wallet.js` | LOW/HIGH pools; `withConnection`, `withTransaction`, readiness |
| `src/middleware/` | Error handler, request IDs, Joi request validation |
| `src/shared/` | `AppError`, Pino logger, API response helpers |
| `src/routes/` | Health and docs routes |
| `docs/openapi/openapi.yaml` | Existing health documentation |
| `tests/` | Existing test doubles, dependency-injection pattern |
| `src/modules/`, `/api/v1` router | Not present at inspection |

**Verification reported:** `npm run check` passed lint, Prettier and **64/64 tests**.

## 2. Oracle TEST read-only findings

- All 11 `XX_ZRV_*` tables were present with **122 total locked columns**; identity PKs, FK/check constraints, session/action token hash columns `RAW(32)` reported.
- **All 11 RBAC tables were empty** (0 rows). There is no user, Argon2id hash, role, permission or initial administrator available for actual TEST login.
- `XX_DIGI_EMP_MASTER` contained **162 rows**; PK reportedly `USER_ID`.
- `USER_NAME` had no observed nulls, exact duplicates or case-insensitive duplicates; 19 usernames reportedly use mixed case. No database-enforced uniqueness was identified.
- `EMPLOYEE_NUMBER` had no observed nulls or duplicates; approved relationship to `XX_ZRV_USERS`.
- `CURRENT_EMP_FLAG='N'` for 15 rows; `TERMINATION_DATE` set for 19. These indicators do not fully agree. **Employment eligibility policy is unresolved.**
- No triggers, PL/SQL or sequences identified for the 11 RBAC tables.

These counts apply only to the reported TEST observation and must not be assumed for production.

## 3. Reuse rather than recreate

- `withTransaction(POOLS.LOW, ...)` for atomic login/logout/session operations; `withConnection(POOLS.LOW, ...)` for permitted session lookups.
- Existing `validate({ body })`, `AppError`, Pino logger, `req.id` for audit `CORRELATION_ID`.
- Existing `createApp(config, deps)` injection/test-double conventions and Oracle fake connections.
- Existing approved response envelopes, centralized middleware and Swagger patterns.

## 4. Missing Phase 01 capabilities at inspection

1. Feature auth routes/controller/service/repository; API v1 route registration.
2. Password hashing/verification and login status/expiry/lockout checks.
3. Cookie parsing, CSRF protection and database-backed session issuance/validation/revocation.
4. Per-IP throttling and config controls.
5. Security audit writer and safe failure persistence.
6. OpenAPI cookie security and actual auth route definitions.
7. Authentication-specific secret redaction beyond basic password/token/cookie fields.

## 5. Blockers and approvals

| Item | Treatment |
|---|---|
| Later locked RBAC policy absent from legacy docs; old deny-override text contradicts approved behavior | Use new 07 locked requirements and report differences; do not silently edit old docs. |
| Employee status indicators inconsistent | Owner must approve login eligibility; fail closed for ambiguity in the interim. |
| Cookie/parser and IP throttle libraries absent as declared deps | Propose smallest safe option; no installation without approval. |
| Argon2id interoperability and parameter policy | Verify runtime/library approach, safe standard encoding, current column length. |
| Empty RBAC TEST tables | Unit tests possible; real DB login needs separately approved account/bootstrap data insertion. |
| `USER_NAME` case/trim matching and no uniqueness constraint | Use safe match detection; reject ambiguity. No index/DDL without approval. |
| Session/CSRF timing, audit independent failure commits | Prove implementation behavior through tests. |

## 6. Relevant Phase 01 endpoint contract

- `GET /api/v1/auth/password/policy`
- `POST /api/v1/auth/login` — body `{ "username": "...", "password": "..." }`; source is `XX_DIGI_EMP_MASTER.USER_NAME` linked using `EMPLOYEE_NUMBER` to `XX_ZRV_USERS.PASSWORD_HASH`.
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/csrf` only if required for the chosen CSRF model, and documented if added.

Never issue a normal session to a privileged or MFA-enrolled user before MFA. Phase 01 may fail closed until Phase 02 implements MFA. Never modify client code.

## 7. Phase completion and Git record

- **Phase 00:** Inspection completed; no code/schema edits.
- **Git:** User states that `feat/auth-foundation` was created after inspection. Actual current branch/status must be rechecked by Claude read-only.
- **Phase 01:** Not started at handoff time; do not falsely mark done.
- **Git actions owner:** Developer. Claude must not switch/commit/push/merge.

## 8. Handoff to Phase 01

Read `CLAUDE.md`, the locked requirements in `server/docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md`, the status file and applicable approved docs. Inspect only necessary backend files and Oracle schema metadata. Follow the separately provided Phase 01 implementation prompt. Record actual code changes/tests and write `server/docs/handoffs/PHASE-01-AUTH-FOUNDATION.md` at the end; update status only to reflect proven results.
