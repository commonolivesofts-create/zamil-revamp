# Phase 04 — User Administration

**Branch:** `feat/user-administration` (uncommitted; developer handles Git).
**Date:** 20 October 2026.
**State:**
- Implemented and tested with in-memory doubles.
- New SQL verified read-only on Oracle TEST.
- **Oracle TEST integration passed** (owner-approved controlled run, 20 October 2026; §7A): employee 2502 provisioned as USER_ID 2, `PENDING`.
- New accounts **cannot yet be activated**, because password-setup delivery is not approved (§8).

## 1. Summary

User administration under `/api/v1/users`, on the locked schema (no DDL), behind `authorize('SECURITY_ADMINISTRATION.USER_ACCOUNTS', action)`. It covers:
- listing accounts (pagination, search, filters, sort);
- searching provisioning candidates;
- account details (no secrets);
- provisioning a PENDING account without a password;
- gated activation;
- disabling, with revocation of every session and action token;
- revoking all sessions or a single session.

The owner approved the audit codes `ACCOUNT_PROVISIONED`, `ACCOUNT_ACTIVATED` and `ACCOUNT_DISABLED`.

## 2. Routes (`/api/v1/users`)

All routes require a session plus the listed `USER_ACCOUNTS` action. Because this is a security-administration permission, the session must be MFA-verified. Changes require `X-CSRF-Token` and the Origin check. Guard order: authenticate → CSRF → authorize → Joi. Responses are `Cache-Control: no-store`.

| Method | Path | Action | Audit on success |
|---|---|---|---|
| GET | `/users?page&limit&search&status&mfaEnrolled&locked&sortBy&sortOrder` | `VIEW` | — |
| GET | `/users/candidates?page&limit&search&hasAccount` | `CREATE` | — |
| POST | `/users` `{employeeNumber}` | `CREATE` | `ACCOUNT_PROVISIONED` |
| GET | `/users/{userId}` | `VIEW` | — |
| POST | `/users/{userId}/activate` | `ACTIVATE` | `ACCOUNT_ACTIVATED` |
| POST | `/users/{userId}/disable` | `DISABLE` | `ACCOUNT_DISABLED`, plus `SESSION_REVOKED`/`ACCOUNT_DISABLED` when sessions were revoked |
| DELETE | `/users/{userId}/sessions` | `REVOKE_SESSIONS` | `SESSION_REVOKED`/`ADMIN_REVOKED` (when any were revoked) |
| DELETE | `/users/{userId}/sessions/{sessionId}` | `REVOKE_SESSIONS` | `SESSION_REVOKED`/`ADMIN_REVOKED`, target `USER_SESSION` |

### Query parameters

| Parameter | Rules |
|---|---|
| `page` | Default 1 |
| `limit` | Default 25, maximum 100 |
| `search` | 2–100 characters; a case-insensitive contains-match on employee number, `USER_NAME` or full name. LIKE wildcards are escaped. |
| `status` | `PENDING`, `ACTIVE` or `DISABLED` |
| `mfaEnrolled`, `locked` | Booleans |
| `sortBy` | `employeeNumber`, `username`, `createdAt` or `lastLoginAt` (allowlisted) |
| `sortOrder` | `asc` or `desc`. The unique tie-breaker is `USER_ID`. |

### Response content

- **Details:** account status, lockout, failed attempts and last login; password `set`/`changedAt`/`expiresAt`/`expired`; MFA `enrolled`; the employee profile (username, name, email, job title, department, current flag, termination status); eligibility; privilege classification; activation readiness with unmet prerequisites; roles; and active sessions (ID, times, MFA-verified, IP, user agent). `PASSWORD_HASH`, `MFA_TOTP_SECRET_ENCRYPTED` and token hashes are never selected.
- **Changes:** responses return the updated details plus `changed`. `false` means a no-op, and no audit row is written.

### Errors

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN`, `CSRF_REJECTED`, `PROTECTED_ACCOUNT`, `SELF_MODIFICATION_FORBIDDEN` |
| 404 | `RESOURCE_NOT_FOUND` (user, employee or session) |
| 409 | `ACCOUNT_EXISTS`, `EMPLOYEE_NOT_ELIGIBLE` (reason in `details`), `ACTIVATION_PREREQUISITES_NOT_MET` (unmet prerequisites in `details`), `CONFLICT` (a concurrent change) |

## 3. Rules (`users.service.js`)

### Provisioning eligibility

All of these must hold:
- Exactly one `XX_DIGI_EMP_MASTER` row for the employee number; otherwise `EMPLOYEE_AMBIGUOUS`.
- `CURRENT_EMP_FLAG = 'Y'`; otherwise `EMPLOYEE_NOT_CURRENT`.
- `TERMINATION_DATE` is NULL or strictly after today's Asia/Riyadh business date. Today or earlier gives `EMPLOYEE_TERMINATED`. This reuses the Decision 01 SQL.
- `USER_NAME` is present (`USERNAME_MISSING`) and unique after trimming and case-folding across the employee master (`USERNAME_AMBIGUOUS`). Otherwise the account could never log in unambiguously.

### Provisioning behaviour

- **Duplicates:** blocked by a pre-check and by `UQ_ZRV_USERS_EMP` (ORA-00001 maps to 409 `ACCOUNT_EXISTS`).
- **New accounts:** `PENDING`, no `PASSWORD_HASH`, `PASSWORD_CHANGED_AT` NULL, failed attempts 0, no roles. No password is generated or returned.

### Activation

- Allowed from `PENDING` or `DISABLED` only when the employee is eligible and a password has been set (`PASSWORD_HASH` and `PASSWORD_CHANGED_AT` present).
- The guarded `UPDATE` re-checks the password conditions. `CK_ZRV_USERS_PWD` also forbids `ACTIVE` without a hash.
- `ACTIVE` accounts give a no-op.

### Disabling

- Moves any status to `DISABLED`.
- In the same transaction it revokes every active session and MFA challenge (docs/07 §4) and every outstanding (unconsumed, unrevoked) action token.
- A disabled user's next request is rejected.

### Hierarchy (every change to an existing account)

- **Self:** no changes to one's own account (`SELF_MODIFICATION_FORBIDDEN`).
- **Zaid:** the Super Administrator account (employee 2172) is never changed through these APIs (`PROTECTED_ACCOUNT`), including session revocation by others.
- **Administrators:** accounts that hold an effective protected administrator role, or *any* effective security-administration permission, can be changed only by Zaid (`PROTECTED_ACCOUNT`).
- **Ordinary employees:** managed by any administrator holding the specific `USER_ACCOUNTS` action. Each action is checked separately, including explicit DENY overrides.

### Data scope

No organization or record scope is defined for user administration. Administrators with `USER_ACCOUNTS` see all accounts and candidates. Writes are restricted by the hierarchy above.

### Transactions and audit

- Each change and its audit row commit in one `withTransaction(POOLS.LOW)`. If the audit row fails, the change rolls back.
- Refusals are recorded independently as `ACCESS_DENIED` (actor = administrator, subject = target).

## 3A. Security correction — Phase 03/04 alignment

**Problem.** Phase 03 role-assignment and override administration (`rbac.service.js` `loadTarget`) protected only accounts holding a protected administrator *role*. An administrator holding `USER_ROLES`/`USER_PERMISSION_OVERRIDES` could therefore change the roles or overrides of a user who held security-administration access without an administrator role, for example through a custom role or a direct ALLOW. User administration already protected such accounts.

**Fix.** `rbac.repository.findUser` now returns the shared Oracle classification (`PRIVILEGE_COLUMNS`, the same SQL used by session validation and user administration):
- `isPrivilegedRoleMember`;
- `hasSecurityAdministration`, meaning any effective security-administration permission that is role-derived or from a direct ALLOW, whose module/resource/permission chain is active, and that is not removed by an effective DENY.

The target check protects the account when the target is Zaid or either flag is true. Such accounts' roles and overrides are changeable only by Zaid (`PROTECTED_ACCOUNT`).

**Unchanged:**
- Zaid-only administrator protections;
- the SUPER_ADMINISTRATOR restrictions;
- the self-modification and no-escalation rules;
- security permissions being Zaid-only;
- DENY precedence.

The now-unused `listActiveRoleCodes` was removed (repository, fake and verifier).

**Regression tests** (`tests/rbac-authorization.test.js`, 8 new, all on role assignment, removal, DENY set and override revocation):

| Case | Expected |
|---|---|
| Direct active ALLOW on a security permission | Protected |
| Role-derived security permission without an administrator role | Protected |
| Inactive role grant | Not protected |
| Expired membership, inactive role or expired ALLOW | Not protected |
| Inactive security permission | Not protected |
| Effective DENY removing the permission | Not protected; lifting that DENY stays `SUPER_ADMINISTRATOR_ONLY` |
| Expired DENY | Protected again |
| Administrator-role holders and Zaid | Still protected |

Zaid can still make the changes in every protected case. Mutation check: removing `hasSecurityAdministration` from the target check made 3 tests fail.

## 4. Files

**New:**
- `src/modules/users/users.repository.js`
- `src/modules/users/users.service.js`
- `src/modules/users/users.validation.js`
- `src/modules/users/users.controller.js`
- `src/modules/users/users.routes.js`
- `tests/helpers/usersFakes.js`
- `tests/users-admin.test.js`
- `scripts/users-test-flow.js`: interactive operator tool (`npm run auth:users-test`)
- `scripts/users-integration-check.js`: read-only preflight/post-check (`npm run db:users-check`)
- `tests/users-test-flow.test.js`: in-memory dry run of the operator scenario over HTTP, including the rerun path
- this handoff

**Changed:**
- `src/modules/access-control/rbac.repository.js`, `rbac.service.js`: §3A classification-based target protection; `listActiveRoleCodes` removed.
- `tests/rbac-authorization.test.js`, `tests/helpers/rbacFakes.js`: regression tests; the fake `findUser` derives the flags from its tables.
- `src/routes/api.routes.js`: service wiring and the `/users` mount.
- `src/modules/audit/securityAudit.service.js`: three `ACCOUNT_*` codes.
- `docs/openapi/openapi.yaml`: 8 operations, the `User Administration` tag, the `SessionId` parameter, schemas and the `UserConflict` response.
- `scripts/verify-auth-sql.js`: 11 SELECT checks and 5 parse-only DML.
- `tests/api-docs.test.js`, `tests/audit-append-only.test.js`, `tests/helpers/authFakes.js`.
- `docs/08-IMPLEMENTATION_STATUS.md`.

## 5. Oracle tables and columns (no DDL, no new columns)

| Table | Use |
|---|---|
| `XX_ZRV_USERS` | Read: `USER_ID`, `EMPLOYEE_NUMBER`, `ACCOUNT_STATUS`, `FAILED_LOGIN_ATTEMPTS`, `LAST_FAILED_LOGIN_AT`, `LOCKED_UNTIL`, `LAST_LOGIN_AT`, `PASSWORD_CHANGED_AT`, `MFA_ENROLLED_AT`, `CREATED_AT`, `UPDATED_AT`, and the presence only of `PASSWORD_HASH` and `MFA_TOTP_SECRET_ENCRYPTED`. INSERT: `EMPLOYEE_NUMBER`, `ACCOUNT_STATUS`, `FAILED_LOGIN_ATTEMPTS`, `CREATED_BY`. UPDATE: `ACCOUNT_STATUS`, `UPDATED_AT`, `UPDATED_BY`. |
| `XX_DIGI_EMP_MASTER` (read only) | `EMPLOYEE_NUMBER`, `USER_NAME`, `FULL_NAME`, `EMAIL_ADDRESS`, `JOB_TITLE`, `DEPARTMENT`, `CURRENT_EMP_FLAG`, `TERMINATION_DATE` (classified, never returned raw). Joined by `OUTER APPLY … FETCH FIRST 1 ROW` with a duplicate-row count. |
| `XX_ZRV_USER_SESSIONS` | Read for active sessions. UPDATE `REVOKED_AT`, `UPDATED_AT`, `UPDATED_BY`; the single-session revoke is scoped to `USER_ID`. |
| `XX_ZRV_ACCOUNT_ACTION_TOKENS` | UPDATE `REVOKED_AT`, `UPDATED_AT`, `UPDATED_BY` for outstanding tokens on disable. `TOKEN_HASH` is never read. |
| RBAC tables | Read: roles (`listUserRoles`) and the privilege classification (`PRIVILEGE_COLUMNS`). |
| `XX_ZRV_RBAC_AUDIT_LOGS` | INSERT only. |

## 6. Security controls

- `authorize` is used per action, so DENY wins and the check runs in Oracle on every request.
- MFA-verified session required; CSRF and Origin checks on changes.
- Bind variables throughout. Filter fragments and sort columns come from fixed allowlists, and LIKE input is escaped.
- No secrets in responses, logs or audit details. Audit details hold statuses and counts only.
- Unknown fields are rejected, and validation runs after authorization.

## 7. Tests and verification (executed)

- **`node --test tests/users-admin.test.js`:** 21/21 passed (in-memory doubles, Supertest). Coverage:
  - authentication and the permission (`NO_GRANT`), an `EXPLICIT_DENY` on a single action, and CSRF;
  - list pagination, search (including wildcard escaping), filters, sort, and invalid parameters;
  - details without secrets, and candidates with every ineligibility reason;
  - provisioning: PENDING without password, a duplicate (409), a future termination accepted, terminated or today's termination, not current, duplicate master rows, missing or ambiguous username, an unknown employee (404), validation, and rollback when the audit insert fails;
  - activation: refused while `PASSWORD_NOT_SET`, then activated; idempotent; a terminated employee refused; re-activation from DISABLED;
  - disable: sessions and outstanding tokens revoked (consumed tokens untouched), the disabled user's session rejected, idempotent, and rollback on audit failure;
  - single and all-session revocation, including a session of another user (404);
  - protection: of Zaid, of administrators (Zaid allowed), of security-permission holders, and against self-changes.
- **Mutation checks:** removing the administrator-protection guard, the session revocation on disable, or the employment-eligibility check made 2, 1 and 2 tests fail respectively. The code was restored.
- **`node --test tests/api-docs.test.js tests/audit-append-only.test.js`:** 14/14 passed. That includes the spec validation, the users-route documentation check and the approved catalogue.
- **`node --test tests/rbac-authorization.test.js`:** 52/52 passed after the §3A correction (44 existing and 8 new).
- **`npm run db:verify-auth` (read-only on Oracle TEST):** **128/128 passed**, rerun after §3A. The changed `rbac.findUser` SQL executed, and a new check confirms USER_ID 1 is classified privileged and as a security administrator. The removed `listActiveRoleCodes` check accounts for the unchanged total. All `ACCOUNT_*` codes still satisfy the deployed `CK_ZRV_AUD_EVENT`. The Phase 04 checks:
  - `listUsers` without filters, with every filter plus an escaped-wildcard search (0 rows as expected), and with each sort;
  - `findUserDetail` for a nonexistent user and for USER_ID 1 (status, booleans and types only);
  - the sessions lookups;
  - the candidate searches (161 employees without an account; the username-ambiguity counts work);
  - the five users DML statements, parse-only;
  - the three `ACCOUNT_*` codes against the deployed `CK_ZRV_AUD_EVENT`.
- **`npm run check`:** lint, format check and 373/373 tests passed (Oracle mocked), after the §3A correction and the operator-tool tests.
- **`node --test tests/users-test-flow.test.js`:** 2/2 passed (operator-scenario dry run and the rerun safety check).

## 7A. Oracle TEST integration (owner-approved, 20 October 2026)

**Commands.** No credentials were passed in arguments or files; Zaid entered his password and MFA code at hidden prompts.

1. `npm run db:users-check -- --employee=2502 --stage=preflight` (read-only): all passed.
   - Employee 2502 is eligible: 1 master row, `CURRENT_EMP_FLAG = Y`, no termination date, unique `USER_NAME`.
   - No existing account.
   - Zaid is ACTIVE, MFA-enrolled, a SUPER_ADMINISTRATOR member only, with 23 grants, no overrides and no open session.
2. `npm run dev`, then `npm run auth:users-test -- --employee=2502 --expect-username=MUBEEN.GURMANI`, run interactively as Zaid. **Passed** (owner-confirmed).
3. `npm run db:users-check -- --employee=2502 --stage=post` (read-only): **all passed** (owner-confirmed).

**Verified against Oracle through the APIs:**
- **Reads:** the list (pagination, filters), the candidate lookup (username matched the approved `MUBEEN.GURMANI`) and the details.
- **Provisioning:** employee 2502 provisioned as **USER_ID 2**, `PENDING`.
- **Rejections:**
  - duplicate provisioning: 409 `ACCOUNT_EXISTS` (pre-check; `UQ_ZRV_USERS_EMP` backs it);
  - activation without a password: 409 `ACTIVATION_PREREQUISITES_NOT_MET` / `PASSWORD_NOT_SET`;
  - CSRF, invalid body, unknown employee, ineligible employee;
  - Zaid's self-disable and self session revocation (`SELF_MODIFICATION_FORBIDDEN`);
  - unauthenticated access.
- **Account state:** `PENDING` with no password hash, no `PASSWORD_CHANGED_AT`, no MFA, 0 failed attempts, created by Zaid, and no roles, overrides, sessions or action tokens. No secret fields appeared in responses.
- **Transactions and audit:** exactly one `ACCOUNT_PROVISIONED` (`SUCCESS`, actor Zaid, subject USER_ID 2), committed with the account. There are no activation, disable or session-revocation rows for the account. The refusals left no change.
- **Zaid:** the account, the SUPER_ADMINISTRATOR membership and the 23 grants are unchanged, and no session from the run is open.

**Fixture:** USER_ID 2 is retained as `PENDING`, as instructed. It was not disabled or deleted and holds no roles. It is the intended ordinary TEST account for Phase 05.

**Not covered on Oracle:**
- ordinary-user login, sessions and authorization, because the account stays `PENDING` until password setup;
- the `PROTECTED_ACCOUNT` refusal by a non-Zaid administrator, because TEST has no second administrator;
- activate, disable and session revocation of a real account (not authorized).

## 8. Blockers, limitations and dependencies

1. **Password-setup delivery (blocker for activating new accounts).**
   - Provisioned accounts need a `PASSWORD_SETUP` token (24 h, hashed, single use) delivered to the employee out of band, plus a public completion endpoint that sets the Argon2id hash and `PASSWORD_CHANGED_AT`.
   - No email or notification channel (nor its dependency) is approved, and returning the token to an administrator would expose a credential.
   - **No temporary-password or administrator-set-password workaround is implemented, by design.**
   - **Phase 05 dependency.** Until the owner decides, new accounts remain `PENDING`. On TEST this includes USER_ID 2 (employee 2502). Activation is implemented and enforced but can only succeed for accounts that already have a password, such as re-enabling a `DISABLED` account.
2. **Oracle coverage.** The controlled provisioning run passed (§7A). Ordinary-user login, sessions and authorization, plus activate/disable/session revocation on Oracle, remain for after password setup (Phase 05) and need authorization.
3. **Unaudited refusals.** Business refusals (409 not eligible, prerequisites not met, duplicate) are not audited. There is no approved code, and they are not authorization denials. Reads are not audited either (as in Phase 03).
4. **Bulk provisioning.** Provisioning of all employees (docs/07 §4) is not implemented; it is one employee per request.
5. **MFA prerequisite.** Activating an administrator account does not require prior MFA enrolment. MFA is enforced at login for privileged users (Phase 02).
6. ~~Consistency with Phase 03~~: **fixed in this phase** (§3A).
7. **Carried-over pre-production blockers:** DB audit immutability, shared rate limiting.

## 9. Suggested commit message

```
feat(users): add user administration APIs

- /api/v1/users: list (pagination, search, filters, sort), provisioning
  candidates, details without secrets, PENDING provisioning for eligible
  employees, gated activation, disable with session/token revocation,
  revoke all/one session
- USER_ACCOUNTS permissions via authorize(); Super Administrator and
  administrator-account protection; no self-changes
- ACCOUNT_PROVISIONED/ACTIVATED/DISABLED audit in the same transaction
- OpenAPI, focused tests, read-only Oracle verifier checks, Phase 04 handoff
```
