# Zamil Revamp — Authentication/RBAC Implementation Status

**Last reviewed:** 20 October 2026 (Phase 04 user administration implemented on `feat/user-administration`, uncommitted; Phases 01–03 merged).
**Scope:** Backend and Oracle only; `client/` intentionally deferred.
**Status:** Phase 01 authentication foundation implemented with the seven security-review decisions and the approved administrator classification; approved TEST bootstrap **executed** (61 rows; Zaid USER_ID 1, ACTIVE, SUPER_ADMINISTRATOR); post-bootstrap `npm run db:verify-auth` passed. Ordinary-user Oracle login/session lifecycle **not yet integration-tested**.
**Current development branch reported by owner:** `feat/user-administration` (verify with read-only Git status before acting).

## Project snapshot

- Modernization of legacy CodeIgniter 3 system into React + Vite frontend and Node.js 24 / Express 5 ES-module backend with Oracle Autonomous Database Serverless.
- Six existing architecture documents in `server/docs/` are approved; preserve existing architecture, Git workflow and working features.
- **11 RBAC tables with 122 approved locked columns exist in Oracle TEST**. No DDL may be changed without owner approval.
- Password source is `XX_ZRV_USERS.PASSWORD_HASH`; login username is `XX_DIGI_EMP_MASTER.USER_NAME`; linked through `EMPLOYEE_NUMBER`.
- Login, session, MFA, recovery, RBAC and administrator protection policies are recorded in `07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md` (security-review decisions §10A; administrator catalogue and bootstrap §10B).
- Zaid directly authorizes protected Main Administrator recovery (Option A); no approval queue. Verified employee self-service password reset also approved.

## Feature status tracker

| Phase | Feature | State | Verified outcome / note |
|---|---|---|---|
| 00 | Read-only backend / Oracle readiness inspection | **COMPLETE** | Existing infra inventoried; baseline `npm run check` 64/64 tests passed; no repository changes; see `handoffs/PHASE-00-READINESS.md`. |
| 01 | Authentication foundation and password login | **MERGED** (`main`, #2) |  5 endpoints under `/api/v1/auth`; seven review decisions and the approved administrator classification applied; `npm run check` 236/236 (Oracle mocked); `npm run db:verify-auth` 61/61 read-only on TEST (SELECTs, date, CHECK and 21 classification vectors executed; DML parse-only). Approved TEST bootstrap **executed** by the developer (61 rows); post-bootstrap `db:verify-auth` all passed (developer-reported). **Not done:** ordinary-user real Oracle login/session/logout/lockout integration test; Zaid's login is blocked by design until Phase 02 MFA. See `handoffs/PHASE-01-AUTH-FOUNDATION.md`. |
| 02 | Full MFA and session management | **MERGED** (`main`, #3; retrospective `handoffs/PHASE-02-MFA.md`). Compromised TEST secret replaced; read-only post-check 18/18 passed (developer-run). History below. | TOTP login challenge (10-min `XX_ZRV_USER_SESSIONS` row, `MFA_VERIFIED_AT` NULL), first-time enrollment with proof of possession (candidate secret derived per challenge; AES-256-GCM at rest), verification with replay guard (`MFA_LAST_USED_STEP`), MFA failures share the 5/15 lockout. Endpoints `POST /api/v1/auth/mfa/enrollment`, `/mfa/enrollment/confirm`, `/mfa/verify`, plus authenticator replacement `/mfa/replacement` and `/mfa/replacement/confirm` (MFA verified on the session within 10 min; separate derivation purpose; optimistic replace; revokes every session incl. the current one; `SESSION_REVOKED`/`MFA_REPLACED`, refusals `ACCESS_DENIED`). **Oracle TEST (developer-run, 2026-10-20):** Zaid enrolled, logged out, verified again and logged out; read-only post-check passed (2 challenges + 2 MFA-verified sessions, all revoked; audit LOGIN_SUCCESS ×2, LOGOUT ×2, no failures). The enrolled TOTP secret was then exposed and is treated as **compromised: replacement on TEST pending** (`npm run auth:mfa-test -- --replace`). Challenge issuance writes no audit event; `LOGIN_SUCCESS` only when the MFA-verified session is created; failed codes `LOGIN_FAILED`. Concurrent same-step and double-enrollment races proven to fail one request (atomic UPDATE guards). Approved: 10-min challenge, counter reset only after MFA, password-only first enrollment **provisionally for controlled TEST enrollment of Zaid only** (not the production policy). `npm run check` 295/295 (Oracle mocked); `db:verify-auth` all passed read-only (new DML incl. `replaceMfa` parse-only). **Not done:** replacement of Zaid's compromised secret on TEST (approval pending), voluntary enrollment from an ordinary session, step-up for other sensitive actions, MFA recovery (Phase 08), key rotation. Without the key, mandatory-MFA users still get `403 MFA_REQUIRED`. |
| 03 | Authorization evaluator and middleware + RBAC administration APIs | **MERGED** (`main`, #4) | `authorize('MODULE.RESOURCE', 'ACTION')` evaluated in Oracle per request (default deny, explicit DENY wins, active catalogue chain, MFA-verified session for security permissions; denials `403` + `ACCESS_DENIED`). 23 operations under `/api/v1/access-control` (roles, catalogue, role grants, user roles, overrides, effective permissions) with Super Administrator protections, no-escalation and no-self-modification rules; owner-approved `RBAC_*` audit codes in the same transaction. Tests: 44 new (in-memory doubles), mutation-checked; `npm run check` 340/340 passed (lint, format, tests; Oracle mocked). **Oracle TEST (owner-approved, 2026-10-20):**
- `db:verify-auth`: 112/112 read-only checks passed.
- `auth:rbac-test`: all checks passed. Run as Zaid via MFA. It covered authorized reads, protected-role/catalogue, self-modification, CSRF and validation refusals, and a temporary `ZRV_IT_TEMP_*` role taken through create, 409 duplicate, update, grant/revoke with read-back, deactivation and an inactive-role 409.
- `db:rbac-post-check`: all passed. The audit trail was CREATED > UPDATED > GRANTED > REVOKED > DEACTIVATED. The temp role is inactive with no active grants or members. Zaid's account, memberships, the 23 SUPER grants and the catalogue are unchanged, and no run session is open.

**Not done:**
- ordinary-user authorization on Oracle (403 default deny, assignments, overrides): needs the item-4 account;
- assignment/override audit codes not yet written on Oracle;
- read access not audited. Phases 06/07 API scope (catalogue, role/user grants, overrides) is covered here. See `handoffs/PHASE-03-RBAC-AUTHORIZATION.md`. |
| 04 | User administration: provisioning, activation, disabling, session revocation | **IMPLEMENTED — uncommitted** (`feat/user-administration`) | 8 operations under `/api/v1/users` (`USER_ACCOUNTS` VIEW/CREATE/ACTIVATE/DISABLE/REVOKE_SESSIONS): list (pagination, search, filters, sort), provisioning candidates, details (no hashes/secrets/tokens), PENDING provisioning without password for eligible employees with an unambiguous USER_NAME, activation only when eligible and a password is set, disable with revocation of all sessions and action tokens, revoke all/one session. Hierarchy: Zaid's account never changed here; administrator and security-permission holders Zaid-only; no self-changes. Owner-approved `ACCOUNT_PROVISIONED`/`ACCOUNT_ACTIVATED`/`ACCOUNT_DISABLED`; sessions `SESSION_REVOKED` (`ADMIN_REVOKED`/`ACCOUNT_DISABLED`); refusals `ACCESS_DENIED`. **Security correction (Phase 03/04 alignment):** RBAC role-assignment and override administration now protects every account with an effective security-administration permission (shared `PRIVILEGE_COLUMNS` classification: role-derived or ALLOW, active chain, not removed by DENY), not only administrator-role holders; Zaid-only. 8 regression tests. Tests: 21 new user-administration tests (in-memory), mutation-checked; `npm run check` 373/373 passed (lint, format, tests; Oracle mocked). `db:verify-auth` 128/128 read-only on TEST, rerun after the correction (new SELECTs executed, DML parse-only, `ACCOUNT_*` codes satisfy `CK_ZRV_AUD_EVENT`). **Not done:** password-setup token issuance/delivery and completion (**blocker: no approved delivery channel**) — so new accounts cannot yet be activated and stay `PENDING` (no temporary-password workaround, by design); **Oracle TEST (owner-approved, 2026-10-20): PASSED** — employee 2502 provisioned through the API as USER_ID 2 `PENDING` (no password, MFA, roles, sessions or tokens); duplicate provisioning (409) and activation without password (409) rejected; `ACCOUNT_PROVISIONED` audit verified; Zaid's account and 23 SUPER_ADMINISTRATOR grants unchanged; `db:users-check --stage=post` all passed. Ordinary-user **login** not tested (account stays `PENDING` until password setup); protected-account refusal by a non-Zaid administrator not testable on TEST (no second administrator); failed activation/provisioning business refusals (409) not audited. See `handoffs/PHASE-04-USER-ADMINISTRATION.md`. |
| 05 | User and administrator account management | **Partly covered by Phase 04** | Account status/session administration and protected hierarchy done; administrator account recovery belongs to Phase 08. |
| 06 | Roles, modules, resources and permission catalog APIs | **API implemented in Phase 03** | Business resources/actions still to be defined per business module. |
| 07 | User-role, role-permission and user override APIs | **API implemented in Phase 03** | Effective DENY precedence implemented. |
| 08 | Password/MFA recovery and Zaid authorization | NOT STARTED | No pending-approval queue; must set `PASSWORD_CHANGED_AT`. |
| 09 | Audit retrieval, reminders and security hardening | NOT STARTED | Application failure-audit persistence implemented in Phase 01; DB immutability still blocked. |
| 10 | Integration, OpenAPI and regression verification | NOT STARTED | Scope/release review. |

## Phase 01 implemented reality

- Endpoints: `GET /api/v1/auth/password/policy`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `GET /api/v1/auth/csrf`, `POST /api/v1/auth/logout` (OpenAPI 3.1 documented).
- Argon2id via built-in `node:crypto`, PHC format, enforced minimum m=19456 KiB, t=2, p=1, 16-byte salt, 32-byte hash; stronger stored hashes accepted unchanged; interoperable with PHP `password_hash`.
- Eligibility: `CURRENT_EMP_FLAG = 'Y'` and `TERMINATION_DATE` NULL or after today in Asia/Riyadh (computed in Oracle), account `ACTIVE`. TEST: 143 eligible; 15 flag `N` and 4 flag `Y` with a past termination date refused.
- Mandatory MFA: Zaid (employee number 2172); active membership of `SUPER_ADMINISTRATOR`, `MAIN_ADMINISTRATOR` or `ADMINISTRATOR`; any effective permission (VIEW included) under `SECURITY_ADMINISTRATION` with active-state, expiry and DENY precedence; voluntarily enrolled MFA. Ordinary business-role holders need no MFA. The temporary any-grant heuristic is removed. Phase 01 issues no session where MFA is required.
- Approved initial security catalogue in `src/modules/access-control/securityCatalog.js`: 1 module, 8 resources, 23 permissions, 3 administrator roles.
- Bootstrap `scripts/bootstrap-test-rbac.js` (`npm run db:bootstrap-test`): read-only by default; `--apply` + TTY + typed confirmation + hidden password; TEST identity, 37 constraints, conflicts and Zaid's eligibility checked; one locked, re-checked, verified transaction. **Executed on Oracle TEST (19 October 2026, developer-reported):** 61 rows committed across 8 RBAC tables — 1 module, 8 resources, 23 permissions, 3 roles, 23 role-permission grants, Zaid's account (employee 2172, USER_ID 1, ACTIVE), 1 SUPER_ADMINISTRATOR assignment, 1 `SECURITY_BOOTSTRAP` audit event. Re-running is refused by its duplicate checks.
- Sessions in `XX_ZRV_USER_SESSIONS` (SHA-256 digest only), 8 h absolute, 30 min idle (15 min privileged), revalidated per request; Origin check + session-bound `X-CSRF-Token`; in-process per-IP limit 60/min.
- Audit in `XX_ZRV_RBAC_AUDIT_LOGS`: INSERT-only, approved catalogue (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGOUT`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `ACCESS_DENIED`, `SECURITY_BOOTSTRAP`), failure events in independent transactions; catalogue verified against the deployed CHECK constraints.
- **Warning:** any real login attempt against TEST writes audit rows (and session/user rows on success).

## Approved decisions — status (docs/07 §10A)

| # | Decision | Status |
|---|---|---|
| 01 | Employee eligibility (Asia/Riyadh) | Implemented and verified |
| 02 | Mandatory MFA classification | Implemented and verified with the approved catalogue (§10B) |
| 03 | Audit append-only | Application INSERT-only implemented and verified; **DB immutability = pre-production blocker** |
| 04 | Password-change timestamp | Implemented and verified (future password APIs must set it) |
| 05 | Argon2id minimum | Implemented and verified |
| 06 | Login rate limiting 60/min | Implemented and verified; **shared/gateway limiting = pre-production requirement** |
| 07 | Security audit catalogue | Implemented and verified |

## Open items and blockers — do not silently decide

1. ~~Bootstrap execution~~ — **done** on TEST (61 rows). Production bootstrap is a separate, unapproved decision.
2. **Database audit immutability (pre-production blocker):** `TR_ZRV_AUDIT_NO_MUTATION` not deployed in TEST; runtime account owns the RBAC tables and can UPDATE/DELETE audit rows; least-privilege grants not in place.
3. **Shared/gateway login rate limiting (pre-production requirement).**
4. Optional ordinary TEST account (§10B item 7) for end-to-end login/session/logout/lockout verification on Oracle: employee to be named; no grants; disabled afterwards. Zaid alone can only verify the `MFA_REQUIRED` path before Phase 02.
5. Audit reason-code catalogue (Phase 01 handoff §7) not owner-approved.
6. Expired passwords / NULL change times cannot be resolved until a password setup/change/reset phase exists.
7. Hosting/CSRF: Origin check needs correct `TRUST_PROXY_HOPS` or `AUTH_ALLOWED_ORIGINS`; cross-site frontend hosting would break `SameSite=Lax` cookies.

8. Phase 03: RBAC read access (effective permissions, lists) is not audited; no approved read-audit code.
9. Phase 03: ordinary-user authorization not yet verified on Oracle; depends on item 4.
10. **Phase 05 dependency — password-setup delivery (blocker for activating new accounts, e.g. USER_ID 2 / employee 2502):** `PASSWORD_SETUP` tokens (24 h, hashed, single use) must reach the employee out of band; no email/notification channel or dependency is approved, and exposing the token to the administrator is not allowed. Owner decision needed (e.g. SMTP relay + library approval). Until then provisioned accounts stay `PENDING` (`CK_ZRV_USERS_PWD` forbids `ACTIVE` without a hash).
11. Phase 04: bulk provisioning of all employees (docs/07 §4) not implemented; one employee per request.

## Immediate next action

1. Developer reviews Phase 04 (`git diff --ignore-cr-at-eol --stat`, untracked files) and `handoffs/PHASE-04-USER-ADMINISTRATION.md`, then commits.
2. ~~Read-only `db:verify-auth` and the controlled Super Administrator RBAC API run on TEST~~: **done, all passed** (2026-10-20). Rerun with `npm run db:verify-auth`, `npm run auth:rbac-test` (interactive; server running) and `npm run db:rbac-post-check`.
3. Owner names the ordinary TEST account (item 4). Then, with authorization, test ordinary-user authorization on Oracle: 403 default deny, role assignment/removal, ALLOW/DENY overrides and immediate revocation.
4. ~~Controlled Oracle TEST user-administration run~~: **done, passed** (employee 2502 → USER_ID 2, PENDING). Rerun: `npm run db:users-check -- --employee=2502 --stage=preflight|post`, `npm run auth:users-test -- --employee=2502 --expect-username=MUBEEN.GURMANI` (interactive; server running).
5. Phase 05: owner decides the password-setup delivery channel (item 10); then implement setup-token issuance/completion, activate USER_ID 2 and run the ordinary-user Oracle login/session/authorization tests (items 4, 9).
6. Schedule blockers 2 and 3 before production.

## Update rules after each major feature

Update date, tracker state, actual endpoints, blockers and test results here. Create separate `handoffs/PHASE-XX-<FEATURE>.md` reflecting **implemented reality**, not intention. Include branch and commit hash only when genuinely known. Preserve historical handoffs instead of repeatedly rewriting them.
