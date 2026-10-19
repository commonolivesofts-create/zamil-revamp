# Phase 01 — Authentication Foundation and Secure Password Login

**Date:** 19 October 2026 (implementation, security-review corrections, then the approved
administrator catalogue and prepared TEST bootstrap the same day)
**Branch:** `feat/auth-foundation` (verified read-only; nothing committed by Claude)
**Result:** Implemented, with the seven security-review decisions (docs/07 §10A) and the approved
administrator catalogue (docs/07 §10B) applied. The approved Oracle TEST bootstrap has been
**executed** (61 rows; Zaid USER_ID 1, ACTIVE, SUPER_ADMINISTRATOR) and post-bootstrap
`npm run db:verify-auth` passed. Tested with in-memory Oracle doubles; SQL and classification
semantics verified read-only against Oracle TEST. **Not yet verified end-to-end against Oracle:**
the ordinary-user login/session lifecycle (no ordinary TEST account exists).
**Scope:** Backend only. `client/`, Oracle schema/data/grants, secrets, documents 01–06 and the
11 rbac-schema documents were not modified.

## 1. Implemented API

All routes are under `/api/v1/auth`, return the standard envelope, and send `Cache-Control: no-store`.

| Method / path | Auth | Behaviour |
|---|---|---|
| `GET /password/policy` | none | Locked policy: min 8, max 128, upper/lower/digit/special, 90-day expiry, reminders 14/7/1 days. |
| `POST /login` | none (Origin check, per-IP rate limit) | Body `{ username, password }` only. 200 sets the session cookie and returns `user`, `session`, `password`, `csrf`. Every failure returns the same `401 AUTHENTICATION_FAILED`. `403 MFA_REQUIRED` / `403 PASSWORD_EXPIRED` only after a correct password. `429 RATE_LIMITED` with `Retry-After`. |
| `GET /me` | session | Safe profile (id, username, employeeNumber, fullName, email, jobTitle, department), session limits, password-expiry state. |
| `GET /csrf` | session | `{ token, headerName: "X-CSRF-Token" }` for the current session. |
| `POST /logout` | session + `X-CSRF-Token` | Revokes the session, clears the cookie, audits `LOGOUT`; `204`. |

Contract: `docs/openapi/openapi.yaml` (validated as OpenAPI 3.1 by the test suite).

## 2. Security-review decisions (docs/07 §10A)

| # | Decision | Result | Where |
|---|---|---|---|
| 01 | Eligibility: `CURRENT_EMP_FLAG='Y'`, termination NULL or future in Asia/Riyadh, account ACTIVE | **Implemented and verified** (mocked + real Oracle date vectors) | `auth.repository.js terminationStatusSql`, `auth.eligibility.js` |
| 02 | Mandatory MFA: Zaid 2172, Main Administrators, Administrators, effective security-administration permissions (DENY precedence); ordinary roles not privileged | **Implemented and verified** with the approved catalogue (§5); temporary any-grant heuristic removed | `access-control/securityCatalog.js`, `auth.policy.js PRIVILEGE_CLASSIFICATION`, `auth.repository.js privilegeColumnsSql`, `auth.eligibility.js` |
| 03 | Audit INSERT-only; failures persist independently | **Implemented and verified** in the application; **database immutability is a pre-production blocker** | `securityAudit.*`, `auth.service.js`, `session.service.js`, `tests/audit-append-only.test.js` |
| 04 | NULL `PASSWORD_CHANGED_AT` blocks login; 90-day expiry; session exception kept | **Implemented and verified**; the obligation on future password APIs is documented in `password.js` | `auth.eligibility.js evaluatePasswordExpiry` |
| 05 | Argon2id m=19456, t=2, p=1, 16-byte salt, 32-byte hash, PHC; no downgrade | **Implemented and verified** (including PHP interop) | `auth.policy.js ARGON2_POLICY`, `password.js` |
| 06 | 60 attempts/minute/IP, 429, lockout unchanged; in-memory for Phase 01 | **Implemented and verified**; **shared/gateway limiting is a pre-production requirement** | `config/index.js`, `middleware/rateLimit.js` |
| 07 | Catalogue `LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGOUT`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `ACCESS_DENIED` (+ `SECURITY_BOOTSTRAP`, §10B); outcomes SUCCESS/FAILURE/DENIED | **Implemented and verified** against the deployed CHECK constraints | `securityAudit.service.js` |

## 3. Architecture and files

```
src/routes/api.routes.js                    /api/v1 router; wires services; test-double injection
src/modules/auth/auth.routes.js             routes + middleware order
src/modules/auth/auth.controller.js         HTTP in/out, cookie set/clear
src/modules/auth/auth.service.js            login decision flow
src/modules/auth/session.service.js         token/CSRF crypto, per-request session validation, logout
src/modules/auth/auth.repository.js         identity lookup, termination/privilege SQL, lockout SQL
src/modules/auth/session.repository.js      session insert/lookup/touch/revoke SQL
src/modules/auth/auth.validation.js         Joi schemas
src/modules/auth/auth.policy.js             locked policy: password, lockout, session, Argon2, MFA classification
src/modules/auth/auth.eligibility.js        employee eligibility, MFA requirement, password expiry
src/modules/auth/password.js                Argon2id PHC hash/verify with minimum enforcement, policy check
src/modules/access-control/securityCatalog.js  approved security module, resources, actions, admin roles
src/modules/audit/securityAudit.service.js  approved catalogue, in-transaction and independent INSERTs
src/modules/audit/securityAudit.repository.js  single INSERT
src/middleware/authenticate.js              session middleware (req.auth)
src/middleware/csrf.js                      Origin check + synchronizer-token check (ACCESS_DENIED audit)
src/middleware/rateLimit.js                 in-process per-IP fixed-window limiter
src/shared/utils/cookies.js                 single-cookie reader (no parser dependency)
scripts/verify-auth-sql.js                  `npm run db:verify-auth` (read-only Oracle check)
scripts/bootstrap-test-rbac.js              `npm run db:bootstrap-test` (guarded TEST bootstrap, executed once)
```

Also modified: `src/app.js`, `src/config/index.js` (AUTH_* settings), `src/shared/logger/index.js`
(redaction), `.env.example`, `package.json` (`db:verify-auth`, `db:bootstrap-test`), `docs/openapi/openapi.yaml`,
`.prettierignore` (`docs/**/*.md`, keeps owner-authored docs as authored), tests `config`, `logger`,
`api-docs`. **No new dependencies.**

## 4. Login flow (auth.service.js)

1. Per-IP rate limit (default 60/60 s) → Joi (`username` ≤ 100, trimmed, no control characters;
   `password` ≤ 256, not trimmed; unknown fields such as `email` / `employeeNumber` rejected).
2. One LOW query: `XX_DIGI_EMP_MASTER` rows with `UPPER(TRIM(USER_NAME)) = UPPER(TRIM(:username))`
   (max 2), left-joined to `XX_ZRV_USERS` on `EMPLOYEE_NUMBER`, plus employee-number row count,
   termination status, MFA enrolment, privilege-class flags, and the DB clock.
3. Refused with generic 401, a dummy Argon2 verification for timing, and `LOGIN_FAILED`/`FAILURE`:
   no match, more than one match, no local account, duplicated employee number.
4. Refused before verification with generic 401, dummy verification and `LOGIN_FAILED`/`DENIED`:
   active lock, `PENDING`/`DISABLED`, no hash, employee not eligible (Decision 01).
5. Stored hash unreadable or below the Argon2id minimum → generic 401, `LOGIN_FAILED` with reason
   `CREDENTIAL_UNREADABLE` / `CREDENTIAL_BELOW_MINIMUM`; not counted as a failed attempt.
6. Wrong password → counter transaction (atomic increment; at 5 sets `LOCKED_UNTIL = now + 15 min`),
   then `LOGIN_FAILED` and, on lock, `ACCOUNT_LOCKED` in **independent** transactions. If the counter
   transaction fails, `LOGIN_FAILED` is still written (`lockoutCounterUpdated: false`) and the
   request fails with 500/503.
7. Correct password: failed-attempt reset, then MFA requirement (Decision 02) → `403 MFA_REQUIRED`;
   password expired or `PASSWORD_CHANGED_AT` NULL (Decision 04) → `403 PASSWORD_EXPIRED`. The
   `LOGIN_FAILED`/`DENIED` event is written independently even if the reset fails.
8. Success → one transaction: re-checks ACTIVE/hash/lock, sets `LAST_LOGIN_AT`, revokes any
   session cookie the browser presented, inserts the session, audits `LOGIN_SUCCESS`. Any failure
   rolls back everything and no cookie is set.

## 5. Mandatory-MFA classification (approved catalogue, docs/07 §10B)

`auth.policy.js` `PRIVILEGE_CLASSIFICATION` (frozen; the module refuses to load if any list is empty):

- `protectedEmployeeNumbers: ['2172']` — Zaid; exact match on `XX_ZRV_USERS.EMPLOYEE_NUMBER`.
- `privilegedRoleCodes: ['SUPER_ADMINISTRATOR', 'MAIN_ADMINISTRATOR', 'ADMINISTRATOR']`.
- `securityAdministrationModuleCodes: ['SECURITY_ADMINISTRATION']`.

`privilegeColumnsSql` computes two flags in Oracle with bound codes, on every login and every
session request:

- `IS_PRIVILEGED_ROLE_MEMBER`: active, unexpired membership of an active protected role.
- `HAS_SECURITY_ADMINISTRATION`: any permission (any action, VIEW included) whose permission,
  resource and module are active and whose module is `SECURITY_ADMINISTRATION`; granted by an
  active, unexpired membership of an active role with an active role grant, or by an active,
  unexpired ALLOW override; and not removed by an active, unexpired DENY override (DENY wins over
  role grants and ALLOW). A DENY does not remove protected-role membership or Zaid's requirement.

`evaluateMfaRequirement` order: Zaid → `PROTECTED_ADMINISTRATOR`; role → `PRIVILEGED_ROLE`;
security permission → `SECURITY_ADMINISTRATION_PERMISSION` (all privileged, 15-minute idle);
voluntarily enrolled MFA → `MFA_ENROLLED` (not privileged). Ordinary business-role holders need no
MFA and get an ordinary 30-minute session. Phase 01 cannot verify MFA, so every MFA requirement means
`403 MFA_REQUIRED` and no session; a session whose user becomes privileged is revoked on the next
request. The temporary any-role/any-ALLOW heuristic (`PRIVILEGE_CLASSIFICATION_PENDING`) and its SQL
are removed.

## 5A. Oracle TEST bootstrap (EXECUTED)

`scripts/bootstrap-test-rbac.js` (`npm run db:bootstrap-test`).

**Execution result (19 October 2026, run by the developer with approval; reported results, not
re-observed by Claude):** committed successfully on Oracle TEST — 61 rows across 8 RBAC tables as
planned below; Zaid (employee 2172) is application **USER_ID 1**, `ACTIVE`, assigned
`SUPER_ADMINISTRATOR`; one `SECURITY_BOOTSTRAP` audit event committed; post-bootstrap
`npm run db:verify-auth` reported all checks passed. Its duplicate checks now refuse any re-run.
`MAIN_ADMINISTRATOR` and `ADMINISTRATOR` exist with no users and no permissions.

| Order | Table | Rows | Content |
|---|---|---|---|
| 1 | `XX_ZRV_APP_MODULES` | 1 | `SECURITY_ADMINISTRATION` |
| 2 | `XX_ZRV_RESOURCES` | 8 | the eight approved resources |
| 3 | `XX_ZRV_PERMISSIONS` | 23 | the approved actions |
| 4 | `XX_ZRV_ROLES` | 3 | `SUPER_ADMINISTRATOR`, `MAIN_ADMINISTRATOR`, `ADMINISTRATOR` |
| 5 | `XX_ZRV_ROLE_PERMISSIONS` | 23 | all 23 to `SUPER_ADMINISTRATOR` only |
| 6 | `XX_ZRV_USERS` | 1 | employee `2172`, `ACTIVE`, Argon2id hash, `PASSWORD_CHANGED_AT` = now (UTC) |
| 7 | `XX_ZRV_USER_ROLES` | 1 | Zaid → `SUPER_ADMINISTRATOR`, active, no expiry |
| 8 | `XX_ZRV_RBAC_AUDIT_LOGS` | 1 | `SECURITY_BOOTSTRAP`, SUCCESS, actor SYSTEM, target USER, counts only |

Total **61 rows**; `CREATED_BY` NULL on all (approved bootstrap exception); identity IDs returned as
strings. No sessions, action tokens or overrides are created.

Safety controls:
- Default invocation is **read-only**: environment, database identity, constraints, conflicts and
  Zaid's eligibility are checked and the plan printed. Writes need `-- --apply`.
- Refuses unless `NODE_ENV` is development/test, `ORACLE_LOW_ALIAS` is `zpadwtest_low` and the
  connected `SERVICE_NAME` matches `_zpadwtest_low.`. Only `--apply` is accepted as an argument.
- Pre-checks: 37 required PK/UQ/CK/FK constraints exist and are ENABLED VALIDATED (verified in TEST);
  no existing module, admin role, account for 2172 or `SECURITY_BOOTSTRAP` event; Zaid has exactly one
  current, non-terminated master row with a unique USER_NAME; `SECURITY_BOOTSTRAP` satisfies the
  deployed `CK_ZRV_AUD_EVENT`. Any problem aborts before any prompt or write.
- `--apply` needs a TTY and the typed phrase `BOOTSTRAP zpadwtest_low`. Zaid types the password twice
  into a raw-mode hidden prompt (no echo, no argument/environment/file input); the locked policy is
  enforced; it is hashed with the app's `hashPassword` at the configured cost and self-verified.
- One LOW transaction: `LOCK TABLE ... IN EXCLUSIVE MODE NOWAIT`, identity and all pre-checks
  repeated under the lock, inserts, then in-transaction verification (row counts; the real login
  lookup resolves Zaid to the new ACTIVE account; both privilege flags are 1; MFA is required as
  `PROTECTED_ADMINISTRATOR`). Any failure rolls back everything (identity values may be consumed).
- Output: counts and the new USER_ID only; errors reduced to Oracle codes; never the password or hash.
- Git Bash/mintty is not a TTY for Node: run it from PowerShell, cmd or Windows Terminal.

Rows can be undone only by disabling/deactivating through audited administration, or by a DBA; the
audit row is preserved.

## 6. Sessions, cookies and CSRF

- Token: 32 random bytes, base64url (43 chars) in the cookie; only SHA-256 stored in
  `SESSION_TOKEN_HASH RAW(32)`. Session ID and digest are never accepted as credentials.
- Cookie: `__Host-zr_session` (configurable), `HttpOnly; Secure; SameSite=Lax; Path=/`, no Domain,
  `Expires` = absolute expiry. `AUTH_COOKIE_SECURE=false` is refused outside development/test.
- Lifetime: `EXPIRES_AT = now + 8 h` (DB clock, UTC). Idle: 30 min ordinary, 15 min privileged
  (no privileged session can exist before Phase 02 MFA). `LAST_ACTIVITY_AT` is written at most every
  `AUTH_SESSION_TOUCH_INTERVAL_S` (60 s), so idle timeout is accurate to ~1 minute.
- Every request re-reads session, account, employee eligibility (including a termination date
  reaching today in KSA), MFA enrolment and privilege classification. Security-state failures → 401,
  session revoked, `SESSION_REVOKED`/`SUCCESS` with the reason; if the revocation write fails the
  request is still denied and `ACCESS_DENIED` is written independently. Absolute or idle expiry →
  401 and `SESSION_EXPIRED`/`DENIED` (no session-row write). Unknown or already-revoked tokens → 401,
  not audited. Expired passwords do not end a valid session (`password.expired: true`).
- CSRF: Origin check on every state-changing `/api/v1` request including login (rejections are
  logged, not audited: no session and forgeable at volume). Authenticated writes require
  `X-CSRF-Token` = HMAC-SHA256(key = session token, "zr-csrf-v1"); a missing or wrong token from an
  authenticated session is audited as `ACCESS_DENIED` (`CSRF_TOKEN_MISSING` / `CSRF_TOKEN_INVALID`).

## 7. Audit catalogue in use (Decision 07)

| Event | Outcome | Actor | When |
|---|---|---|---|
| `LOGIN_SUCCESS` | SUCCESS | USER | session issued (same transaction) |
| `LOGIN_FAILED` | FAILURE | ANONYMOUS | unknown/ambiguous username, no account, wrong password, unreadable/weak hash |
| `LOGIN_FAILED` | DENIED | ANONYMOUS | locked, PENDING/DISABLED, no hash, ineligible employee, MFA required, password expired/NULL change time, state changed mid-login |
| `ACCOUNT_LOCKED` | SUCCESS | SYSTEM | fifth consecutive failure |
| `LOGOUT` | SUCCESS | USER | logout (same transaction as revocation) |
| `SESSION_REVOKED` | SUCCESS | SYSTEM | session revoked for account/eligibility/MFA change |
| `SESSION_EXPIRED` | DENIED | SYSTEM | absolute or idle expiry presented |
| `ACCESS_DENIED` | DENIED | USER / SYSTEM | CSRF failure on a session; revocation write failed |
| `SECURITY_BOOTSTRAP` | SUCCESS | SYSTEM | one-time TEST bootstrap (written once, 19 Oct 2026) |

Reason codes (≤ 60 chars, uppercase): `UNKNOWN_USERNAME`, `AMBIGUOUS_USERNAME`, `NO_LOCAL_ACCOUNT`,
`AMBIGUOUS_EMPLOYEE_NUMBER`, `ACCOUNT_LOCKED`, `ACCOUNT_PENDING`, `ACCOUNT_DISABLED`,
`PASSWORD_NOT_SET`, `EMPLOYEE_NOT_FOUND`, `EMPLOYEE_AMBIGUOUS`, `EMPLOYEE_NOT_CURRENT`,
`EMPLOYEE_TERMINATED`, `CREDENTIAL_UNREADABLE`, `CREDENTIAL_BELOW_MINIMUM`, `INVALID_PASSWORD`,
`CONSECUTIVE_FAILED_LOGINS`, `MFA_REQUIRED`, `PASSWORD_EXPIRED`, `PASSWORD_CHANGE_TIME_MISSING`,
`ACCOUNT_STATE_CHANGED`, `ACCOUNT_NOT_ACTIVE`, `ABSOLUTE_EXPIRY`, `IDLE_TIMEOUT`,
`CSRF_TOKEN_MISSING`, `CSRF_TOKEN_INVALID`, `INITIAL_SUPER_ADMINISTRATOR`. The reason catalogue itself is not owner-approved.

## 8. Oracle usage (LOW pool only; binds only; IDs read as strings)

| Table | Columns | Operations |
|---|---|---|
| `XX_DIGI_EMP_MASTER` | USER_NAME, EMPLOYEE_NUMBER, FULL_NAME, EMAIL_ADDRESS, JOB_TITLE, DEPARTMENT, CURRENT_EMP_FLAG, TERMINATION_DATE | SELECT |
| `XX_ZRV_USERS` | USER_ID, EMPLOYEE_NUMBER, PASSWORD_HASH, PASSWORD_CHANGED_AT, ACCOUNT_STATUS, FAILED_LOGIN_ATTEMPTS, LAST_FAILED_LOGIN_AT, LOCKED_UNTIL, LAST_LOGIN_AT, MFA_ENROLLED_AT, MFA_TOTP_SECRET_ENCRYPTED (IS NOT NULL test only), UPDATED_AT, UPDATED_BY | SELECT, UPDATE |
| `XX_ZRV_USER_SESSIONS` | all 13 (CREATED_AT by default) | SELECT, INSERT, UPDATE |
| `XX_ZRV_RBAC_AUDIT_LOGS` | all except AUDIT_LOG_ID, CREATED_AT (defaults), UPDATED_* (must stay NULL) | **INSERT only** |
| `XX_ZRV_USER_ROLES`, `XX_ZRV_ROLES` | USER_ID, ROLE_ID, IS_ACTIVE, EXPIRES_AT, ROLE_CODE | SELECT (classification) |
| `XX_ZRV_USER_PERMISSION_OVERRIDES` | USER_ID, PERMISSION_ID, IS_ACTIVE, OVERRIDE_EFFECT, EXPIRES_AT | SELECT (classification) |
| `XX_ZRV_ROLE_PERMISSIONS`, `XX_ZRV_PERMISSIONS`, `XX_ZRV_RESOURCES`, `XX_ZRV_APP_MODULES` | ROLE_ID, PERMISSION_ID, RESOURCE_ID, MODULE_ID, MODULE_CODE, IS_ACTIVE | SELECT (classification) |
| All catalogue tables, `XX_ZRV_USERS`, `XX_ZRV_USER_ROLES`, `XX_ZRV_RBAC_AUDIT_LOGS` | see §5A | INSERT by the bootstrap script only (executed once on TEST) |

Timestamps use `SYSTIMESTAMP` (UTC); the TEST client session time zone is `+05:30`, so
`CURRENT_TIMESTAMP`/`LOCALTIMESTAMP` are never used. `TERMINATION_DATE` is compared with
`TRUNC(...) > TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Riyadh' AS DATE))`; it is never converted
between time zones. TEST (read-only counts): 143 eligible, 15 flag `N`, 4 flag `Y` with a past
termination date (now refused as terminated); no termination date has a time component.

## 9. Verification performed

| Check | Kind | Result |
|---|---|---|
| `npm run check` (ESLint, Prettier, `node --test`) | automated, Oracle replaced by doubles | **236/236 pass** (64 pre-existing + 172 added in Phase 01) |
| `tests/bootstrap-test-rbac.test.js` | bootstrap script with a fake Oracle connection and fake TTY | pass: argument/environment/service guards, dry run writes nothing, TTY and confirmation required, password mismatch/policy, 11 conflict/eligibility/constraint aborts, exact 61-row plan in one locked re-checked transaction, only `SUPER_ADMINISTRATOR` granted, 5 rollback paths, no password/hash in output or binds, hidden prompt, no env/file/console use |
| Login / session API tests | Supertest + in-memory repositories with rollback; every audit row validated against the deployed CHECK rules | pass |
| `tests/auth-eligibility.test.js` | pure decision functions: Zaid, protected roles, security permissions, ordinary roles, voluntary MFA | pass |
| `tests/audit-append-only.test.js` | static scan of `src/` and `scripts/` for audit UPDATE/DELETE/MERGE/TRUNCATE; repository/service surface; catalogue | pass |
| `tests/auth-password.test.js` | real Argon2id; PHP-generated hashes; minimum enforcement | pass |
| Mutation checks | lockout 5→6; idle check removed; eligibility accepting ENDED; Zaid check removed; Argon2 minimum removed; NULL change time allowed; role branch removed; DENY clause removed from the SQL (caught by the Oracle vectors) | every mutation caught; code restored |
| `npm run db:verify-auth` | **real Oracle TEST, read-only** | **61/61**: login/session SELECTs executed; 7 termination-date vectors incl. the UTC-vs-KSA boundary and a DATE with a time part; approved classification SQL executed against the real tables and against **21 synthetic vectors** (WITH clauses shadow the RBAC tables inside the query: admin roles active/inactive/expired, ordinary roles, security VIEW via role or ALLOW, DENY active/expired/inactive, ALLOW+DENY, inactive grant/permission/resource/module, DENY vs admin role); all 16 bootstrap statements except LOCK compiled with `DBMS_SQL.PARSE`; all event codes, outcomes and actor types satisfy the deployed `CK_ZRV_AUD_EVENT`/`OUTCOME`/`ACTOR` conditions; negative controls (malformed codes rejected, unknown column ORA-00904); all 8 INSERT/UPDATE statements compiled with `DBMS_SQL.PARSE` (not executed) |
| HTTP smoke via real pools | **real Oracle TEST, read-only paths** | ready 200; policy 200; `/me` 401 with and without an unknown token (cookie cleared); logout without session 401; RBAC tables still 0 rows |

**Executed by the developer after approval (reported):** the TEST bootstrap (61 rows committed;
this also exercised the `RETURNING ... INTO` string out-binds for identity IDs) and a post-bootstrap
`npm run db:verify-auth` (all checks passed).

**Not yet executed:** a real ordinary-user login, lockout, logout or session lifecycle on Oracle
(session insert out-binds, idle/absolute expiry, revocation); a real Zaid login attempt (expected
`403 MFA_REQUIRED`, no session); the classification SQL evaluated through the HTTP login path against
the persisted catalogue. These need an approved ordinary TEST account and/or approval for the audit
rows that any login attempt writes.

## 10. Pre-production blockers and limitations

- **Database audit immutability (mandatory pre-production blocker):** trigger
  `TR_ZRV_AUDIT_NO_MUTATION` is not deployed in TEST and the runtime account owns all RBAC tables, so
  it can UPDATE/DELETE audit rows; `CK_ZRV_AUD_IMMUT` only forces UPDATED_* to NULL. Least-privilege
  runtime grants (ADR-022) are also not in place. Application code is INSERT-only.
- **Shared/gateway login rate limiting (pre-production requirement):** the in-process limiter is per
  instance and resets on restart.
- **Ordinary TEST account:** needed for the end-to-end Oracle login/session lifecycle test (docs/07
  §10B item 7); not created.
- **Production bootstrap:** the executed bootstrap applies to TEST only; production provisioning is a
  separate, unapproved decision.
- MFA (Phase 02) is absent: privileged and MFA-enrolled users cannot sign in.
- Expired passwords and NULL change times cannot be resolved yet (no setup/change/reset endpoint).
  Future password APIs must set `PASSWORD_CHANGED_AT` and never lower an existing Argon2 cost.
- Origin check depends on `TRUST_PROXY_HOPS` or `AUTH_ALLOWED_ORIGINS` behind a TLS gateway; a
  cross-site frontend would not receive a `SameSite=Lax` cookie (hosting undecided).
- Password-expiry reminders (14/7/1 days) are not implemented.
- **Any real login attempt against TEST, even a failed one, writes audit rows**; a successful one
  writes session and user rows.

## 11. Documentation conflicts (not edited)

- Docs 03–06 still describe RBAC tables and session storage as pending and exclude deny overrides;
  superseded by 07.
- `rbac-schema/01-XX_ZRV_USERS.md` §I says the employee number is the login identifier; superseded
  by 07 §3 (`USER_NAME`).
- `rbac-schema/11` documents an append-only trigger that is not deployed (§10).

## 12. Dependencies for later phases

- Phase 02: MFA verification sets `XX_ZRV_USER_SESSIONS.MFA_VERIFIED_AT`; regenerate the session on
  privilege change; design first-time enrolment for a privileged account with a password but no MFA
  (Zaid after bootstrap).
- Phase 05/07: `SUPER_ADMINISTRATOR` may be held only by employee 2172; block DENY overrides or
  revocations that would leave no effective Super Administrator; no self-escalation.
- Phase 03: the authorization evaluator must require `mfaVerified` for privileged permissions and
  apply DENY precedence; reuse `ACCESS_DENIED`; `req.auth` provides `userId`, `sessionId`,
  `employeeNumber`.
- Phase 04/08: password setup/change/reset must set `PASSWORD_CHANGED_AT`, use `hashPassword` and
  `checkPasswordPolicy`, never lower the stored cost, and revoke all sessions.

## 13. Suggested commit message

```
feat(auth): add Phase 01 authentication foundation with password login

- POST /api/v1/auth/login: USER_NAME -> EMPLOYEE_NUMBER -> XX_ZRV_USERS Argon2id
  verification, generic failures, 5-attempt/15-minute lockout, 90-day expiry
  (NULL change time blocks login), per-IP rate limit (60/min)
- Fusion eligibility: CURRENT_EMP_FLAG = 'Y' and termination date NULL or after
  today in Asia/Riyadh
- Mandatory-MFA classification: Zaid 2172, SUPER/MAIN_ADMINISTRATOR and
  ADMINISTRATOR roles, any effective SECURITY_ADMINISTRATION permission with DENY
  precedence; privileged users get no session until Phase 02 MFA
- Approved initial security catalogue and guarded Oracle TEST bootstrap script
  (dry run by default; executed once on TEST with approval)
- Database-backed sessions in XX_ZRV_USER_SESSIONS (SHA-256 token digest,
  HttpOnly Secure cookie, 8 h absolute / 30 min idle, per-request revalidation)
- GET /me, GET /csrf, POST /logout, GET /password/policy
- Origin check plus session-bound CSRF tokens for state-changing requests
- INSERT-only security audit using the approved catalogue; failure events
  persisted independently of rejected requests
- Argon2id minimum m=19456 t=2 p=1, 16-byte salt, 32-byte hash (PHC)
- OpenAPI 3.1 contract, auth config, log redaction, read-only Oracle SQL check
- 172 new tests; no new dependencies, no schema or data changes
```
