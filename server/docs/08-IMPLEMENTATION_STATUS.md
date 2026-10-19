# Zamil Revamp — Authentication/RBAC Implementation Status

**Last reviewed:** 19 October 2026 (after the approved Oracle TEST bootstrap was executed; awaiting developer review, uncommitted).
**Scope:** Backend and Oracle only; `client/` intentionally deferred.
**Status:** Phase 01 authentication foundation implemented with the seven security-review decisions and the approved administrator classification; approved TEST bootstrap **executed** (61 rows; Zaid USER_ID 1, ACTIVE, SUPER_ADMINISTRATOR); post-bootstrap `npm run db:verify-auth` passed. Ordinary-user Oracle login/session lifecycle **not yet integration-tested**.
**Current development branch reported by owner:** `feat/auth-foundation` (verify with read-only Git status before acting).

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
| 01 | Authentication foundation and password login | **IMPLEMENTED — PENDING REVIEW** | On `feat/auth-foundation`, uncommitted. 5 endpoints under `/api/v1/auth`; seven review decisions and the approved administrator classification applied; `npm run check` 236/236 (Oracle mocked); `npm run db:verify-auth` 61/61 read-only on TEST (SELECTs, date, CHECK and 21 classification vectors executed; DML parse-only). Approved TEST bootstrap **executed** by the developer (61 rows); post-bootstrap `db:verify-auth` all passed (developer-reported). **Not done:** ordinary-user real Oracle login/session/logout/lockout integration test; Zaid's login is blocked by design until Phase 02 MFA. See `handoffs/PHASE-01-AUTH-FOUNDATION.md`. |
| 02 | Full MFA and session management | NOT STARTED | Until done, Zaid, protected-role members, security-administration permission holders and MFA-enrolled users cannot sign in (fail closed). Needs first-time MFA enrolment for a privileged account with a password but no MFA. |
| 03 | Authorization evaluator and middleware | NOT STARTED | Depends on session/account identity and the approved permission catalogue. |
| 04 | Employee provisioning / setup / activation | NOT STARTED | No automatic login access or role grants; must set `PASSWORD_CHANGED_AT`. |
| 05 | User and administrator account management | NOT STARTED | Enforce protected hierarchy. |
| 06 | Roles, modules, resources and permission catalog APIs | NOT STARTED | Locked schema; business resources/actions. |
| 07 | User-role, role-permission and user override APIs | NOT STARTED | Effective DENY precedence. |
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

## Immediate next action

1. Developer reviews Phase 01 (`git diff --stat`, `git diff --check`, untracked files) and `handoffs/PHASE-01-AUTH-FOUNDATION.md`, then commits.
2. Owner names the ordinary TEST account (item 4) so the full login/session lifecycle can be integration-tested on Oracle; schedules items 2 and 3 before production.
3. Optional pre-MFA check with Zaid on TEST: correct password → `403 MFA_REQUIRED`, no session row, `LOGIN_FAILED`/DENIED audit row (writes audit rows; needs approval).
4. Phase 02 (MFA) only after the above.

## Update rules after each major feature

Update date, tracker state, actual endpoints, blockers and test results here. Create separate `handoffs/PHASE-XX-<FEATURE>.md` reflecting **implemented reality**, not intention. Include branch and commit hash only when genuinely known. Preserve historical handoffs instead of repeatedly rewriting them.
