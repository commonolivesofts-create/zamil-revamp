# Zamil Revamp — Authentication, Authorization & RBAC Implementation Handoff

**As of:** 19 October 2026
**Audience:** Claude Code (VS Code), project architect, backend implementers
**Status:** Approved requirements and verification checklist. **This is not implementation approval and contains no implementation code.**
**Scope:** Backend APIs and Oracle database only. **Do not inspect or modify `client/` in this workstream.** Frontend integration is intentionally deferred.

## 1. Source-of-truth and change-control rules

- Start from the existing `server/` implementation; read all six approved `server/docs/` architecture documents. Preserve the modular monolith, Node.js 24, Express 5, ES modules, Controller → Service → Repository, `/api/v1`, Joi, Pino, existing Oracle LOW/HIGH pools and transaction helpers, standard API envelopes, native Node tests/Supertest, and OpenAPI 3.1.
- **Later explicit owner-approved locked decisions below supersede older, now-outdated sections of the architecture documents.** Do not silently edit the six documents. Report differences for a controlled documentation update.
- All 11 Oracle RBAC tables and their 122 columns are **locked** and already created in TEST. No DDL, constraints, indexes, triggers, sequences, extra tables, or data seeds may be created or changed without explicit owner approval.
- Treat the **deployed Oracle data dictionary** as the source for physical column names/types, nullability, constraints and joins; treat these approved decisions as the source for **intended behavior**. If they conflict, **stop the affected feature** and report the exact mismatch; never improvise new columns.
- No modifications to frontend, secrets, Oracle wallet, unrelated backend modules, CI/CD or Git settings. Claude may inspect Git read-only but must not switch branch, fetch, pull, commit, push, merge, rebase or reset.
- Work only on the currently checked-out feature branch. Scope changes to the current phase, implement tests, and report exact changed files and results. The developer owns Git operations.

## 2. Locked physical table names

1. `XX_ZRV_USERS`
2. `XX_ZRV_ROLES`
3. `XX_ZRV_APP_MODULES`
4. `XX_ZRV_RESOURCES`
5. `XX_ZRV_PERMISSIONS`
6. `XX_ZRV_USER_ROLES`
7. `XX_ZRV_ROLE_PERMISSIONS`
8. `XX_ZRV_USER_PERMISSION_OVERRIDES`
9. `XX_ZRV_USER_SESSIONS`
10. `XX_ZRV_ACCOUNT_ACTION_TOKENS`
11. `XX_ZRV_RBAC_AUDIT_LOGS`

Existing employee source: `XX_DIGI_EMP_MASTER` (Fusion-synchronized). Do not duplicate employee master data in new fields. Query the dictionary for all 122 approved columns and associated FK/UNIQUE/CHECK/index metadata before writing repository SQL.

## 3. **LOCKED login identity** (latest clarification)

- End user enters **`username`** and `password` at `POST /api/v1/auth/login`.
- **Username source:** `XX_DIGI_EMP_MASTER.USER_NAME`.
- **Password hash source:** `XX_ZRV_USERS.PASSWORD_HASH` (Argon2id application password; **not** any employee-master password).
- **Join/linkage:** the existing `EMPLOYEE_NUMBER` linkage between `XX_DIGI_EMP_MASTER` and `XX_ZRV_USERS`.
- No `USER_NAME` duplicate column in `XX_ZRV_USERS`; employee number is not the login-screen username.
- Handle nonexistent, ambiguous, or duplicate case-insensitive usernames safely; no account enumeration. The normalization details (case/trim) are an implementation proposal, not permission to change DDL.
- Read-only TEST inspection reports 162 employee-master records, no null or duplicate `USER_NAME` values observed, no duplicate `EMPLOYEE_NUMBER` values; database does **not** enforce username uniqueness. Revalidate actual rules in the live target environment.

## 4. Locked account, password, MFA and session policies

- Provision all employees as application accounts initially `PENDING`; **never** automatically activate, permit login, or grant business roles/permissions just because Fusion contains an employee.
- Approved user account statuses: `PENDING`, `ACTIVE`, `DISABLED`; use existing `LOCKED_UNTIL` for temporary lockout, not an invented `LOCKED` status.
- Argon2id password hashing. New passwords: minimum 8 characters, uppercase, lowercase, digit and special character.
- Password expiry: 90 days. Send reminders 14, 7, and 1 day before expiry. Expiry during an active, valid bounded session does not immediately interrupt it; require renewal at the next authentication when it ends.
- Five consecutive incorrect password attempts cause a **15-minute** temporary lockout.
- Database-backed server sessions in `XX_ZRV_USER_SESSIONS` with Secure and HttpOnly cookies, CSRF protection, session-token hash stored server-side, **8-hour absolute expiry**, and idle expiry of **30 minutes ordinary** or **15 minutes administrators/privileged users**.
- MFA: optional for ordinary employees; **mandatory for administrators and privileged users**. Never issue a fully authenticated privileged session before successful MFA. Never bypass MFA already enabled for an ordinary user.
- On password change/reset, MFA change/recovery or account disabling, revoke all active sessions. Sensitive operations are audited.
- Action tokens stored as hashed, secure, purpose-specific, single-use, expiring and revocable. `PASSWORD_SETUP`: 24 hours; `PASSWORD_RESET`: 30 minutes; `MFA_RECOVERY`: 15 minutes. Actual allowed `ACTION_TYPE` values must match the locked DDL.
- TOTP secrets must be stored encrypted and never logged, reflected in API outputs or copied to unrelated tables. Enrolment requires proof of possession before activation; prevent TOTP replay.
- Use server-side access checks for every protected route; UI visibility is never authorization.

## 5. Locked recovery authority hierarchy

1. **Zaid himself:** recovers his own account/password/MFA through secure email recovery pinned to `zaid.sayyed@zamilplastic.com`; no second administrator approval.
2. **Other Main Administrators:** **Zaid's direct, authenticated prior authorization** required before their account or MFA recovery.
3. **Other Administrators:** Zaid manages their account access and recovery.
4. **Ordinary employees:** **verified self-service password recovery is approved**, alongside administrator-assisted account/MFA recovery by a suitably authorized administrator after identity verification.

**Approved Phase 2 recovery Option A:** Zaid authenticates (with MFA and recent step-up), selects a specific protected target and purpose, explicitly authorizes, and directly issues the purpose-specific, target-bound recovery token. **No pending approval queue or approval-request table.** Email delivery alone is never approval. Token issuance and authorization must be attributable, auditable and not reusable.

Protected classifications and Zaid's immutable backend identity must not be determined by arbitrary client-provided account labels; verify the final authoritative mapping before writing protected flows.

## 6. Locked RBAC semantics

- Permissions represent **business resources plus actions**. Do not model each API endpoint as an Oracle resource.
- Multiple roles per user; role grants are additive.
- Individual user overrides are `ALLOW` or `DENY`. Applicable explicit `DENY` overrides applicable role grants (and ALLOW). No applicable permission is **deny by default**.
- Inactive or expired assignments and inactive modules, resources and permissions cannot grant access. `XX_ZRV_USER_PERMISSION_OVERRIDES.EXPIRES_AT` is present in the locked approved design; verify deployed DDL before use.
- Administrator protection and anti-self-escalation policies cannot be overridden by ordinary role permissions or direct user ALLOW overrides.
- Enforce organization-level and record-level scope in backend business operations wherever applicable.
- Privileged role assignment must not grant privileged access until mandatory MFA is satisfied. Stale sessions must not silently gain increased privilege.
- Effective permission reads and administrative modifications must be audited according to the final security event catalogue.

## 7. Audit and time standards

- Persist security-sensitive successful, failed and denied events in `XX_ZRV_RBAC_AUDIT_LOGS`, with correlation/request ID, safe actor/target/purpose data and no secrets. Failed authentication and denied authorization events must persist even if a business operation rolls back.
- Do not assume a CHECK constraint makes audit rows immutable. During readiness verification inspect database grants, protections and deletion/update possibilities; report any gap.
- Persist exact event timestamps consistently in UTC using approved `TIMESTAMP(6) WITH TIME ZONE` conventions, with KSA display in `Asia/Riyadh` as required by the approved architecture. Do not change database datatypes.

## 8. Phase 00 findings — verified by Claude's READ-ONLY inspection

- TEST schema contains all eleven tables/122 columns with applicable constraints; **all eleven RBAC tables have 0 rows**. There is **no seeded user, Zaid account, role or password hash**. Therefore, mock-backed automated tests can run, but a real database login is **not** possible until owner-authorized account/bootstrap data is created. **Do not seed automatically.**
- Existing server: `src/app.js`, `server.js`, `shutdown.js`, `src/config/index.js`, `src/database/oracle.js`, `wallet.js`, `src/middleware/{errorHandler,requestId,validate}.js`, `src/shared/{errors,logger,responses}/`, health/docs routes, OpenAPI health routes and tests.
- `npm run check` passed (64/64 tests) in Phase 00. There is not yet an auth module, session middleware, CSRF, API v1 router, audit writer, or RBAC evaluator.
- Reuse `withTransaction(POOLS.LOW, …)`, `withConnection(POOLS.LOW, …)`, existing `validate({ body })`, `AppError`, logger, request ID, `createApp(config,deps)` test injection, and Oracle fakes.
- Session-token and account-token hashes are reportedly `RAW(32)`. Reconfirm types and conditions with read-only schema introspection.
- Older docs 03–06 contain obsolete or deferred RBAC statements. **Preserve the approved requirements above; do not implement the outdated deny-override exclusion.** Flag document update separately.
- Employee source data has conflicting employment-eligibility indicators: inspection reported `CURRENT_EMP_FLAG='N'` for 15 rows and `TERMINATION_DATE` populated for 19. The exact eligibility rule is **unresolved**; do not quietly invent a business rule. Fail closed for ambiguous statuses and obtain owner approval for the target policy.
- Cookie parsing and per-IP throttling approach need dependency/security selection. Existing indirect packages are not approval for new direct production dependencies. Do not silently install dependencies.
- Existing logging redaction should be extended for authentication fields without leaking secrets.
- Frontend discrepancies were noted during Phase 00 but are **deliberately out of scope**. Do not inspect, modify, or attempt to repair `client/`.

## 9. Current Phase 01 scope — do not implement later phases

Current feature branch: **`feat/auth-foundation`** (developer already created it).

**Proposed Phase 01 endpoints** (exact server routes under `/api/v1`):

1. `GET /auth/password/policy` — safely expose approved password policy.
2. `POST /auth/login` — body `{ "username": "...", "password": "..." }`; secure identity lookup, Argon2id, account eligibility, password expiry, lockout, generic errors, audit.
3. `GET /auth/me` — identity and safe account profile for a valid database-backed authenticated session.
4. `POST /auth/logout` — revoke session and clear cookie.
5. If necessary for the approved cookie+CSRF design, `GET /auth/csrf` — safe CSRF token bootstrap; explain integration with current app conventions and document it.

Implement only a **secure minimal session foundation** in Phase 01. If MFA is not implemented, **fail closed** for privileged or already-MFA-enrolled users; do not treat them as logged in. Phase 02 will implement complete MFA verification and session management.

Required test coverage: unknown/ambiguous login mapping, wrong password, `PENDING`/`DISABLED`, password expiry, 5-failure/15-minute lock, Argon2id, cookie/CSRF, session timeout/revocation, no privileged MFA bypass, safe error messages, and audit failure persistence. Distinguish unit/Supertest mock tests from actual Oracle integration tests. Do not execute live data changes without approval.

## 10. Pending owner decisions / checks before affected implementation

- **Employee login eligibility:** how to combine `CURRENT_EMP_FLAG`, `TERMINATION_DATE`, and account `ACTIVE` status when they disagree.
- **Approved login rate-limiting mechanism and dependency:** how to add safe per-IP defense in addition to persistent per-account lockout, with no unauthorized dependency install.
- **Argon2id parameters/hash serialization:** choose an interoperable implementation and verify against package/runtime support; preserve the existing `PASSWORD_HASH` length. Do not treat Phase 00's suggestion about manually formatting Node crypto hashes as a locked security decision.
- **Initial admin/test-account bootstrap:** TEST RBAC tables are empty; no privileged users, grants or hashes may be inserted until a separately approved plan and data change.
- **Session CSRF/cookie handling** and any essential middleware package needs must be validated against actual deployed hosting requirements without starting frontend work.
- **Protected account identification**, immutable audit protection and credential-recovery authorization metadata: verify deployed schema and approved identity source before implementing their later phases.

When a pending issue blocks only one subfeature, report it and continue other safe scoped work if possible. Do not weaken any approved security policy to avoid a blocker.

## 10A. Phase 01 security review decisions — APPROVED (19 October 2026)

These resolve the corresponding §10 items. Implementation status is recorded in 08 and the Phase 01 handoff.

1. **Employee eligibility:** login only when `CURRENT_EMP_FLAG = 'Y'`, `TERMINATION_DATE` is NULL or a future date, and the account is `ACTIVE`. "Future" is evaluated against the current business date in `Asia/Riyadh`; `TERMINATION_DATE` is a date-only Oracle `DATE`. A termination date equal to today is not future.
2. **Mandatory MFA classification:** applies to Zaid (employee number `2172`), Main Administrators, Administrators and users with effective security-administration privileges (DENY precedence applies). Ordinary business-role assignments alone do not make a user privileged. Ordinary employees who enrolled MFA must verify it. Role and permission codes come only from the approved catalogue; until it exists, affected accounts remain fail closed.
3. **Audit append-only:** application audit operations are INSERT-only; failed security events persist independently of failed authentication transactions. Database-level immutability (trigger and runtime privileges) is a **mandatory pre-production blocker**; no schema, trigger or grant change is made by the application team.
4. **Password-change timestamp:** NULL `PASSWORD_CHANGED_AT` blocks normal login; 90-day expiry enforced; every successful future password setup/change/reset must set `PASSWORD_CHANGED_AT`. A valid bounded session is not ended by password expiry.
5. **Argon2id minimum:** memory 19,456 KiB, 2 iterations, parallelism 1, 16-byte random salt, 32-byte hash, standard Argon2id PHC string. Existing stronger hashes are never downgraded.
6. **Login rate limiting:** configurable, 60 attempts per minute per IP, HTTP 429 when exceeded; the 5-failure / 15-minute account lockout is unchanged. In-memory limiting is accepted for Phase 01; shared or gateway-level rate limiting is a **pre-production requirement**.
7. **Security audit catalogue:** `LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGOUT`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `ACCESS_DENIED`; outcomes `SUCCESS`, `FAILURE`, `DENIED`. Extended by §10B with `SECURITY_BOOTSTRAP`.

## 10B. Administrator catalogue and TEST bootstrap decisions — APPROVED AND LOCKED (19 October 2026)

1. **Protected administrator roles:** `SUPER_ADMINISTRATOR` (reserved exclusively for Zaid, employee `2172`), `MAIN_ADMINISTRATOR`, `ADMINISTRATOR`. Role names confer nothing; privilege comes from the server-side classification.
2. **Security module and classification:** module `SECURITY_ADMINISTRATION`. Any effective permission under it, **including VIEW**, makes the holder privileged (mandatory MFA). Classification is by module, so future permissions in the module are covered automatically.
3. **Initial security catalogue (8 resources, 23 permissions):** `USER_ACCOUNTS` (VIEW, CREATE, ACTIVATE, DISABLE, REVOKE_SESSIONS); `ROLES` (VIEW, CREATE, UPDATE, DEACTIVATE); `PERMISSION_CATALOG` (VIEW, MANAGE); `ROLE_PERMISSIONS` (VIEW, GRANT, REVOKE); `USER_ROLES` (VIEW, ASSIGN, REVOKE); `USER_PERMISSION_OVERRIDES` (VIEW, GRANT, REVOKE); `ACCOUNT_RECOVERY` (ISSUE); `SECURITY_AUDIT` (VIEW, EXPORT). This is the initial security catalogue, not the business-permission catalogue.
4. **Initial grants:** only `SUPER_ADMINISTRATOR` receives all 23 permissions at bootstrap. `MAIN_ADMINISTRATOR` and `ADMINISTRATOR` are created without users or permissions; Zaid assigns them later through audited administration APIs.
5. **Zaid's account:** `ACTIVE`, with an Argon2id hash of a password Zaid types himself into a hidden prompt; `PASSWORD_CHANGED_AT` set at creation. Mandatory MFA still blocks sign-in until Phase 02.
6. **Bootstrap attribution:** `CREATED_BY` NULL on bootstrap rows (approved bootstrap exception) and one `SECURITY_BOOTSTRAP` audit event (actor `SYSTEM`).
7. **Optional ordinary TEST account** for end-to-end session tests: to be named separately; no grants; disabled after testing.
8. **Execution:** the bootstrap runs only on Oracle TEST from a guarded script under `server/scripts/`, with Zaid present to type his password, and only after explicit execution authorization.

## 11. Completion and handoff protocol for Claude Code

Before editing: read the six docs, this handoff, Phase 00 report (if available), actual existing code, and only needed read-only Oracle metadata. Record conflicts. Work in the existing feature branch only.

After the phase: report (1) branch/status, (2) files changed, (3) endpoints, (4) Oracle tables/columns accessed, (5) security measures, (6) audit events, (7) tests and command outcomes, (8) blockers/assumptions requiring approval, and (9) recommended commit message. **Do not commit, push, or merge**; return control to the developer for review.

---

**Authority classification:** The locked rules above are drawn from the project's owner-approved decisions. The Phase 00 inspection findings are observational and must be rechecked when accessing another environment. Implementation proposals and pending choices are explicitly identified, not represented as locked requirements.
