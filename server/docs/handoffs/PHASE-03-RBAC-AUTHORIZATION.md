# Phase 03 — Authorization Middleware and RBAC Administration APIs

**Branch:** `feat/rbac-authorization` (uncommitted; developer handles Git).
**Date:** 20 October 2026.
**State:** Implemented; in-memory tests passed; **Oracle TEST integration passed** (owner-approved controlled run as the Super Administrator, 20 October 2026; see §7A). Ordinary-user authorization on Oracle is **not yet tested** (no ordinary TEST account named).

## 1. Summary

- Request-time authorization `authorize('MODULE.RESOURCE', 'ACTION')`:
  - evaluated in Oracle on every request (no cache, so a revocation applies on the next request);
  - default deny; an active, unexpired DENY override wins over everything;
  - an active, unexpired ALLOW override or role grant allows;
  - module, resource and permission must all be active;
  - security-administration permissions also require an MFA-verified session;
  - denials return a safe `403 FORBIDDEN` and are audited as `ACCESS_DENIED`.
- RBAC administration APIs (23 operations) for roles, the permission catalogue, role grants, user roles, direct overrides and effective permissions.
- Owner-approved audit codes `RBAC_*` (11). Each change and its audit row commit in one transaction; rule refusals are audited independently as `ACCESS_DENIED` with a reason code.

### Permission key

The resource key is `MODULE_CODE.RESOURCE_CODE`, because `RESOURCE_CODE` is unique only within its module (`UQ_ZRV_RES_MOD_CODE`). The key is validated when the route is declared, so a malformed key fails at startup.

## 2. Routes (`/api/v1/access-control`)

All routes require a session. Every route except `/me/permissions` requires the listed `SECURITY_ADMINISTRATION` permission and an MFA-verified session. Changes also require `X-CSRF-Token` and the Origin check. Guard order is authenticate → CSRF → authorize → Joi validation, so callers without the permission learn nothing about the input contract. Responses are `Cache-Control: no-store`.

| Method | Path | Permission | Audit on success |
|---|---|---|---|
| GET | `/me/permissions` | session only | — |
| GET | `/roles?page&limit` | `ROLES:VIEW` | — |
| POST | `/roles` | `ROLES:CREATE` | `RBAC_ROLE_CREATED` |
| PATCH | `/roles/{roleId}` | `ROLES:UPDATE` | `RBAC_ROLE_UPDATED` |
| POST | `/roles/{roleId}/activate` | `ROLES:UPDATE` | `RBAC_ROLE_ACTIVATED` |
| POST | `/roles/{roleId}/deactivate` | `ROLES:DEACTIVATE` | `RBAC_ROLE_DEACTIVATED` |
| GET | `/catalog` | `PERMISSION_CATALOG:VIEW` | — |
| POST | `/modules` | `PERMISSION_CATALOG:MANAGE` | `RBAC_CATALOG_CHANGED` / `MODULE_CREATED` |
| PATCH | `/modules/{moduleId}` `{isActive}` | `PERMISSION_CATALOG:MANAGE` | `RBAC_CATALOG_CHANGED` / `MODULE_(DE)ACTIVATED` |
| POST | `/modules/{moduleId}/resources` | `PERMISSION_CATALOG:MANAGE` | `RBAC_CATALOG_CHANGED` / `RESOURCE_CREATED` |
| PATCH | `/resources/{resourceId}` `{isActive}` | `PERMISSION_CATALOG:MANAGE` | `RBAC_CATALOG_CHANGED` |
| POST | `/resources/{resourceId}/permissions` | `PERMISSION_CATALOG:MANAGE` | `RBAC_CATALOG_CHANGED` / `PERMISSION_CREATED` |
| PATCH | `/permissions/{permissionId}` `{isActive}` | `PERMISSION_CATALOG:MANAGE` | `RBAC_CATALOG_CHANGED` |
| GET | `/roles/{roleId}/permissions` | `ROLE_PERMISSIONS:VIEW` | — |
| PUT | `/roles/{roleId}/permissions/{permissionId}` | `ROLE_PERMISSIONS:GRANT` | `RBAC_PERMISSION_GRANTED` |
| DELETE | `/roles/{roleId}/permissions/{permissionId}` | `ROLE_PERMISSIONS:REVOKE` | `RBAC_PERMISSION_REVOKED` |
| GET | `/users/{userId}/roles` | `USER_ROLES:VIEW` | — |
| PUT | `/users/{userId}/roles/{roleId}` `{expiresAt?}` | `USER_ROLES:ASSIGN` | `RBAC_ROLE_ASSIGNED` |
| DELETE | `/users/{userId}/roles/{roleId}` | `USER_ROLES:REVOKE` | `RBAC_ROLE_UNASSIGNED` |
| GET | `/users/{userId}/effective-permissions` | `USER_ROLES:VIEW` | — |
| GET | `/users/{userId}/overrides` | `USER_PERMISSION_OVERRIDES:VIEW` | — |
| PUT | `/users/{userId}/overrides/{permissionId}` `{effect, justification, expiresAt?}` | `USER_PERMISSION_OVERRIDES:GRANT` | `RBAC_OVERRIDE_SET` |
| DELETE | `/users/{userId}/overrides/{permissionId}` | `USER_PERMISSION_OVERRIDES:REVOKE` | `RBAC_OVERRIDE_REVOKED` |

### Contract details

- **Identifiers:** path IDs are decimal strings (`^[1-9][0-9]{0,18}$`, `NUMBER(19,0)`).
- **Codes:** codes match `^[A-Z][A-Z0-9_]*$` with column lengths role/module 60, resource 80, action 40. Names are 1–120 characters; descriptions and justification at most 500. Unknown fields are rejected.
- **Expiry:** `expiresAt` is an ISO 8601 instant in the future, or `null`.
- **Pagination:** `GET /roles` uses the standard total-count pagination envelope (docs/02 §5.2): `page` defaults to 1, `limit` defaults to 25 with a maximum of 100.
- **Idempotency:** grants, revocations, activation, assignment and removal are idempotent. `changed: false` means a no-op, and no audit row is written.

### Errors

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN`, `CSRF_REJECTED`, or a rule code (`PROTECTED_ROLE`, `PROTECTED_ACCOUNT`, `PROTECTED_CATALOG`, `SUPER_ADMINISTRATOR_ONLY`, `SELF_MODIFICATION_FORBIDDEN`, `PRIVILEGE_ESCALATION_FORBIDDEN`) |
| 404 | `RESOURCE_NOT_FOUND` |
| 409 | `CONFLICT` (unique key, ORA-00001) or `INACTIVE_TARGET` |

## 3. Administration rules (`rbac.service.js`)

"Zaid" means the actor's employee number is in `PRIVILEGE_CLASSIFICATION.protectedEmployeeNumbers` (`2172`).

### Protected roles

- `SUPER_ADMINISTRATOR`, `MAIN_ADMINISTRATOR` and `ADMINISTRATOR` cannot be renamed, deactivated or re-activated through the API, even by Zaid.
- `SUPER_ADMINISTRATOR` is never assigned or removed through the API.
- Security permissions are never revoked from `SUPER_ADMINISTRATOR`. This is lockout protection.

### Super Administrator only

These changes are reserved for Zaid:
- `MAIN_ADMINISTRATOR`/`ADMINISTRATOR` memberships;
- grants on any protected role;
- any change to an account that holds a protected role, or to Zaid's own account;
- creating resources or actions in `SECURITY_ADMINISTRATION`;
- granting, overriding or revoking any `SECURITY_ADMINISTRATION` permission.

### Other rules

- **Catalogue:** the security-administration module, its resources and its actions cannot be deactivated (`PROTECTED_CATALOG`).
- **Overrides:** the Super Administrator's account never receives overrides.
- **Self-modification:** nobody changes their own roles or overrides.
- **No escalation:** when the actor is not Zaid:
  - a grant, or an `ALLOW` override, requires the actor to hold that permission;
  - a role assignment requires the actor to hold every active grant of the role;
  - lifting a `DENY` counts as granting.
- **Active targets:** grants require an active role and an active permission chain; assignment requires an active role.

### Data scope

No record or organization scope applies to RBAC administration beyond these hierarchy rules. Business data-scope enforcement is out of scope until business modules exist.

## 4. Code files

**New:**
- `src/middleware/authorize.js`
- `src/modules/access-control/authorization.repository.js`
- `src/modules/access-control/authorization.service.js`
- `src/modules/access-control/rbac.repository.js`
- `src/modules/access-control/rbac.service.js`
- `src/modules/access-control/rbac.validation.js`
- `src/modules/access-control/rbac.controller.js`
- `src/modules/access-control/rbac.routes.js`
- `tests/helpers/rbacFakes.js`
- `tests/rbac-authorization.test.js`
- `scripts/rbac-test-flow.js`: interactive operator tool (`npm run auth:rbac-test`)
- `scripts/rbac-post-check.js`: read-only post-check (`npm run db:rbac-post-check`)
- `tests/rbac-test-flow.test.js`: in-memory dry run of the operator scenario over HTTP
- this handoff
- `docs/handoffs/PHASE-02-MFA.md`

**Changed:**
- `src/routes/api.routes.js`: wiring and the `/access-control` mount.
- `src/modules/audit/securityAudit.service.js`: 11 `RBAC_*` codes.
- `src/shared/responses/apiResponse.js`: `sendPaginated`.
- `docs/openapi/openapi.yaml`: 23 operations, schemas, ID parameters, and the `AccessDenied`/`NotFound`/`Conflict` responses.
- `scripts/verify-auth-sql.js`.
- `tests/api-docs.test.js`.
- `tests/audit-append-only.test.js`.
- `tests/helpers/authFakes.js`: passes the RBAC repositories.
- `scripts/mfa-test-flow.js`: exports the existing `signInWithMfa` and `logout` helpers (no behaviour change).
- `package.json`: `auth:rbac-test` and `db:rbac-post-check` scripts.
- `docs/08-IMPLEMENTATION_STATUS.md`.

Prettier also normalised CRLF→LF in several previously committed files. These are line-ending-only changes; `git diff --ignore-cr-at-eol --stat` shows no content change in them.

## 5. Oracle tables and columns used (no DDL, no new columns)

| Table | Columns |
|---|---|
| `XX_ZRV_APP_MODULES` | `MODULE_ID`, `MODULE_CODE`, `MODULE_NAME`, `DESCRIPTION`, `DISPLAY_ORDER`, `IS_ACTIVE` |
| `XX_ZRV_RESOURCES` | `RESOURCE_ID`, `MODULE_ID`, `RESOURCE_CODE`, `RESOURCE_NAME`, `DESCRIPTION`, `IS_ACTIVE` |
| `XX_ZRV_PERMISSIONS` | `PERMISSION_ID`, `RESOURCE_ID`, `ACTION_CODE`, `DESCRIPTION`, `IS_ACTIVE` |
| `XX_ZRV_ROLES` | `ROLE_ID`, `ROLE_CODE`, `ROLE_NAME`, `DESCRIPTION`, `IS_ACTIVE` |
| `XX_ZRV_ROLE_PERMISSIONS` | `ROLE_ID`, `PERMISSION_ID`, `IS_ACTIVE` |
| `XX_ZRV_USER_ROLES` | `USER_ID`, `ROLE_ID`, `IS_ACTIVE`, `EXPIRES_AT` |
| `XX_ZRV_USER_PERMISSION_OVERRIDES` | `USER_ID`, `PERMISSION_ID`, `OVERRIDE_EFFECT`, `JUSTIFICATION`, `IS_ACTIVE`, `EXPIRES_AT` |
| `XX_ZRV_USERS` (read) | `USER_ID`, `EMPLOYEE_NUMBER`, `ACCOUNT_STATUS` |
| `XX_ZRV_RBAC_AUDIT_LOGS` | INSERT only, existing columns |

On every one of the seven RBAC tables above, writes set `CREATED_BY` on insert, and `UPDATED_AT` (UTC `SYSTIMESTAMP`) and `UPDATED_BY` on update.

Revocation is a soft state change (`IS_ACTIVE = 0`); no `DELETE` statements are issued. Re-grant and re-assignment use `MERGE` on the unique keys.

Expiry comparisons use `SYSTIMESTAMP`. Lists are bounded: effective permissions 1,000, catalogue 2,000 rows, role grants 1,000, memberships and overrides 500 each.

## 6. Security controls

- Default deny, explicit DENY precedence and an active catalogue chain, evaluated in SQL on every request.
- MFA-verified session required for every security permission. This also holds at session level: a user who holds security administration without MFA has the session rejected (Phase 01/02 classification).
- Session-bound CSRF token on all changes, plus the Origin check.
- Bind variables throughout. Dynamic identifiers come only from a fixed allowlist (`setActive`).
- Override justification is stored but never written to audit details. Audit details hold codes and labels only.
- Unique-key violations map to 409. Internal errors are never echoed.

## 7. Tests run (executed, with Oracle replaced by in-memory doubles)

- **`node --test tests/rbac-authorization.test.js`:** 44 tests, all passed:
  - pure decision tests;
  - middleware tests;
  - administration-rule tests (protections, escalation, self-modification, CSRF, validation order, 404/409, audit within the transaction, rollback when the audit insert fails, immediate revocation).
- **Mutation checks:** removing the no-escalation check, the DENY precedence or the self-modification guard made 4, 2 and 2 tests fail respectively. The code was restored afterwards.
- **`npm run check`:** lint, format check and 340/340 tests passed (Oracle mocked). This ran before the operator tooling was added.
- **`node --test tests/rbac-test-flow.test.js`:** 1/1 passed. It dry-runs the full operator scenario against the in-memory app over HTTP. Only this file was run after the tooling was added. The application code did not change, so the full suite was not rerun.

## 7A. Oracle TEST integration (owner-approved, 20 October 2026)

### Commands (no credentials in arguments or files)

1. `npm run db:status`: LOW and HIGH connectivity on `zpadwtest_low`/`zpadwtest_high` passed.
2. `npm run db:verify-auth` (read-only): **112/112 passed**. That includes:
   - 17 CTE-shadowed decision vectors executing the real decision SQL;
   - 14 RBAC SELECTs against the real tables;
   - 15 RBAC DML statements parse-only via `DBMS_SQL.PARSE` (including `MERGE`);
   - all 19 audit event codes satisfying the deployed `CK_ZRV_AUD_EVENT`, plus the outcome check.
3. `npm run db:rbac-post-check` as a baseline before the run. The account, memberships and grants were intact, and no temporary role existed yet (expected).
4. `npm run dev` (MFA key configured), then `npm run auth:rbac-test` in an interactive terminal. The developer ran it as the Super Administrator through the existing MFA flow. The password and TOTP code were entered at hidden prompts; nothing was printed or stored. **Result: all checks passed** (owner-confirmed).
5. `npm run db:rbac-post-check` (read-only) after the run: **all passed** (owner-confirmed).

### APIs exercised against Oracle (through the API only; no manual DML)

- **Authorized reads:**
  - `GET /me/permissions`, with effective security permissions resolved via the role;
  - `GET /roles` (paginated);
  - `GET /catalog`;
  - `GET /roles/{SUPER}/permissions`, whose active grants equal the effective security permissions;
  - `GET /users/{self}/roles`, showing SUPER_ADMINISTRATOR as effective;
  - `GET /users/{self}/effective-permissions`, which matches `/me/permissions`;
  - `GET /users/{self}/overrides`.
- **Refusals** (no RBAC change; each audited as `ACCESS_DENIED`):
  - `PATCH` on SUPER_ADMINISTRATOR → `403 PROTECTED_ROLE`;
  - deactivating ADMINISTRATOR → `PROTECTED_ROLE`;
  - revoking a security grant from SUPER_ADMINISTRATOR → `PROTECTED_ROLE`;
  - assigning SUPER_ADMINISTRATOR → `PROTECTED_ROLE`;
  - a self-override → `SELF_MODIFICATION_FORBIDDEN`;
  - deactivating the security module → `PROTECTED_CATALOG`;
  - a change without the CSRF token → `CSRF_REJECTED`;
  - an invalid role code → `400 VALIDATION_ERROR`;
  - an unauthenticated read → `401 UNAUTHENTICATED`.
- **Temporary role lifecycle** (`ZRV_IT_TEMP_<UTC timestamp>`, no members):
  - `POST /roles` → 201;
  - the same code again → `409 CONFLICT`, mapped from the real ORA-00001;
  - `PATCH` → 200;
  - `PUT /roles/{temp}/permissions/{SECURITY_AUDIT:VIEW}` → `changed: true`; repeating it → `changed: false`; read-back shows the grant active;
  - `DELETE` the grant → `changed: true`; repeating it → `changed: false`; read-back shows it inactive;
  - `POST /roles/{temp}/deactivate` → inactive; repeating it is a no-op;
  - a grant on the inactive role → `409 INACTIVE_TARGET`.
- The Super Administrator's own effective permissions were unchanged at the end, and the session was logged out.

### Transactions and audit (verified by the read-only post-check)

- The temporary role's audit trail is exactly `RBAC_ROLE_CREATED > RBAC_ROLE_UPDATED > RBAC_PERMISSION_GRANTED > RBAC_PERMISSION_REVOKED > RBAC_ROLE_DEACTIVATED`, all `SUCCESS`. Each change and its audit row were persisted together.
- The no-op repeats wrote no rows, and the refused and conflicting requests left no RBAC change.
- Every `RBAC_*` row in the window was made by the Super Administrator (actor type `USER`).
- The audit codes satisfied the deployed CHECK constraints at insert time, so no schema issue was found.
- Audit history is preserved; nothing was deleted or updated.

### Fixture cleanup and protected state (post-check)

- **Temporary role:** inactive, created by the Super Administrator, with no active grants (its single grant row is revoked) and no members.
- **Super Administrator:** USER_ID 1, ACTIVE and MFA-enrolled. Their only membership is SUPER_ADMINISTRATOR (active), with no overrides.
- **Administrator roles and catalogue:**
  - SUPER_ADMINISTRATOR has 23 active grants and none inactive;
  - MAIN_ADMINISTRATOR and ADMINISTRATOR are active and their grants are unchanged;
  - the security catalogue is fully active.
- **Sessions:** no Super Administrator session from the run is still open.
- **Retained data:** the role row and its revoked grant row are kept in their inactive state, by design (soft revocation; the audit trail references them). No employee, account or other assignment was created or changed.

## 8. Limitations and pending functionality

- **Ordinary-user authorization on Oracle is not tested.** That covers a `403 FORBIDDEN` default-deny for a user without grants, user-role assignment and removal, ALLOW/DENY overrides, expiry, and immediate revocation for a real member. These need an ordinary TEST account (status item 4), which the owner has not named. They are covered only by the in-memory tests.
- `RBAC_ROLE_ASSIGNED`/`UNASSIGNED`, `RBAC_OVERRIDE_SET`/`REVOKED`, `RBAC_ROLE_ACTIVATED` and `RBAC_CATALOG_CHANGED` passed the deployed CHECK evaluation but have not yet been written on Oracle.
- Catalogue creation (modules, resources, actions) was not exercised on Oracle, to avoid permanent catalogue rows.
- The in-memory doubles prove service and HTTP behaviour, not SQL. Concurrency of competing administration changes was not race-tested. The design relies on single-statement MERGE/UPDATE guards and unique keys.
- Effective-permission reads and list reads are not audited; no approved read-audit code exists.
- No step-up re-verification for sensitive RBAC changes beyond the MFA-verified session, and no rate limit specific to the administration routes.
- `USER_ACCOUNTS`, `ACCOUNT_RECOVERY` and `SECURITY_AUDIT` APIs are not part of this phase (Phases 05, 08 and 09).
- Pre-production blockers carried over: DB audit immutability, shared rate limiting.

## 9. Suggested commit message

```
feat(rbac): add request-time authorization and RBAC administration APIs

- authorize(MODULE.RESOURCE, ACTION) middleware: default deny, explicit DENY
  precedence, active catalogue, MFA-verified session for security permissions,
  evaluated in Oracle per request; denials audited as ACCESS_DENIED
- /api/v1/access-control: roles, permission catalogue, role grants, user
  roles, direct overrides, effective permissions (23 operations)
- Super Administrator identity protections, no-escalation and
  no-self-modification rules; RBAC_* audit in the same transaction
- OpenAPI, focused tests, read-only Oracle verifier checks, Phase 02/03 handoffs
```
