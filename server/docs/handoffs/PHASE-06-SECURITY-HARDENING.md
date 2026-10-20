# Phase 06 — Security Hardening

**Branch:** `feat/security-hardening`, based on `0478db7`, the Phases 01–05 merge. It is uncommitted; the developer handles Git.
**Date:** 20 October 2026.

**State:**
- Code-only fixes and tests are complete.
- **All three live Oracle TEST scenarios PASSED** (owner-approved, operator-run, 20 October 2026; §3A): RBAC evaluation of ordinary USER_ID 2, password change, and password reset (one Office 365 e-mail, to the approved TEST mailbox only). Their read-only post-checks passed.
- The Super Administrator account, MFA, role and grants are unchanged.
- No Oracle writes or e-mails other than the approved scenarios.

## 1. Issues found and fixes

| # | Area | Finding | Fix |
|---|---|---|---|
| 1 | Self-service recovery: **timing-based account enumeration** | `POST /auth/recovery/request` did the account lookup, the token transaction and the Office 365 SMTP send *before* responding. Known, eligible accounts took visibly longer (a full SMTP round trip) than unknown ones. The body was uniform, but the timing was not. | Only the account-independent fail-closed check (delivery configured, else `503` for every caller) runs before the response. The lookup, token, e-mail and audit run **after** the uniform `202` (`requestSelfService` → background `processSelfService`; errors are logged without details). The delivery fail-closed behaviour is unchanged. Tests prove the response is sent while delivery is still pending, and that bodies are identical for known, unknown, ineligible and privileged usernames. |
| 2 | Audit: lockout inside a session | Locking an account through wrong current-password attempts (password change) or wrong MFA-replacement codes revoked every session **without an audit row**. | New `revokeSessionsAfterLockout` (`auth.lockout.js`) revokes the sessions and writes `SESSION_REVOKED`/`ACCOUNT_LOCKED` (actor `SYSTEM`) in one transaction. Both paths use it. |
| 3 | Audit: first MFA enrollment | Enrollment revoked the user's other sessions and challenges without a `SESSION_REVOKED` row. | `SESSION_REVOKED`/`MFA_ENROLLED`, counting the *other* sessions only (the completing challenge is excluded), in the enrollment transaction. |
| 4 | Audit detail: token re-issue | Revoking the previous outstanding token on re-issue was not visible. | `ACTION_TOKEN_ISSUED.details.previousTokensRevoked`. |
| 5 | Audit detail: password change, setup and reset | Revocation of outstanding reset tokens was not visible. | `PASSWORD_CHANGED.details` = `{ sessionsRevoked, resetTokensRevoked }`. |

### Verified, no change needed

- **Replay and concurrency:**
  - single-use tokens hold under concurrent completion (setup and reset in Phase 05; MFA-recovery confirmation added now, where exactly one succeeds);
  - expired tokens are refused at use (setup 24 h, reset 30 min, MFA 15 min, including an expired token *after* a valid MFA-recovery start).
- **Session revocation:** sessions are revoked on reset, change (including the current session), MFA recovery and replacement, disable, administrative revocation, and lockout (now audited).
- **Authentication failures:**
  - wrong passwords and codes in change, MFA recovery and replacement count toward the 5/15 lockout;
  - login keeps the dummy-hash timing equalisation and generic messages.
- **RBAC** (Phase 03, plus new API-level tests):
  - default deny; grants are additive across roles; ALLOW adds;
  - an explicit DENY wins over role grants and ALLOW (one override per user and permission, `UQ_ZRV_UPO_USER_PERM`);
  - expired or inactive memberships, grants, overrides and catalogue items grant nothing;
  - protected accounts and security-administration holders are Zaid-only (the Phase 04 alignment);
  - security permissions require an MFA-verified session;
  - Zaid's issuance of recovery for privileged targets requires MFA within 10 minutes.

## 2. Tests (executed; in-memory doubles, real Argon2id/TOTP/AES-GCM)

- **`tests/security-hardening.test.js`, 9/9:**
  - the response is sent before delivery completes;
  - byte-identical bodies across account kinds;
  - `previousTokensRevoked`;
  - change-password audit detail, with the outstanding reset link invalidated;
  - lockout during password change ends and audits every session (`SYSTEM`, `ACCOUNT_LOCKED`);
  - concurrent MFA-recovery confirmation gives a single success;
  - an expired MFA-recovery token is refused at confirmation;
  - RBAC precedence through `GET /access-control/users/{id}/effective-permissions` (default deny, additive roles, ALLOW, DENY, expired/inactive).

  Mutation check: removing the lockout audit made the test fail; the code was restored.
- **`tests/phase06-operator-flows.test.js`, 6/6:** the TEST-environment gate, plus dry runs of the RBAC, change and reset operator scenarios over HTTP. They include the stop-before-write paths and checks that no password appears in output.
- **Existing suites updated** for background processing (`auth-recovery`, `smtp-delivery`). Affected suites pass: `auth-recovery` 26, `smtp-delivery` 20, `auth-mfa` 42.
- **`npm run check`:** lint, format check and **439/439** tests passed (Oracle and SMTP mocked).

## 3. Live Oracle TEST scenarios

Each tool runs the API **in-process** after a read-only gate: non-production, and the connected `DB_NAME` equals `SMTP_TEST_DATABASE_NAME` (`scripts/operator-session.js`). Secrets go only into hidden prompts. Each tool asks for an explicit `yes` before writing.

| Scenario | Command | Oracle writes / external actions | Read-only checks |
|---|---|---|---|
| RBAC evaluation for ordinary USER_ID 2 | `npm run auth:rbac-user-test -- --employee=2502 --expect-username=MUBEEN.GURMANI` | See below | `npm run db:phase06-check -- --scenario=rbac --employee=2502 --stage=pre\|post` |
| Password change | `npm run auth:recovery-test -- --mode=change --employee=2502 --expect-username=MUBEEN.GURMANI` | USER_ID 2's password changed; two sessions created and revoked; one deliberate failed login with the old password (counter reset by the final sign-in); no e-mail | `--scenario=change` |
| Password reset | `npm run auth:recovery-test -- --mode=reset --employee=2502 --expect-username=MUBEEN.GURMANI` | **One e-mail to the approved TEST mailbox** (after a recipient check); one `PASSWORD_RESET` token issued and consumed; USER_ID 2's password changed; sessions revoked | `--scenario=reset` |

**RBAC writes:**
- **Created, all through the APIs, as Zaid:**
  - a temporary module `ZRV_IT_M<ts>`, with resource `ITEMS` and actions `VIEW` and `APPROVE` (business permissions only, so USER_ID 2 never becomes privileged);
  - a temporary role `ZRV_IT_R<ts>`, granted `VIEW`;
  - the role assigned to USER_ID 2, expiring in 1 hour;
  - an ALLOW override on `APPROVE` and a DENY override on `VIEW` (both expiring in 1 hour);
  - `APPROVE` deactivated as part of the test.
- **Optional:** USER_ID 2 signs in to confirm their own view.
- **Cleanup always runs:** the overrides are revoked, the role is unassigned, the grant is revoked, and the role, permissions, resource and module are deactivated.
- **Retained:** rows stay **inactive** with their audit trail. There is no DELETE by design.

**Preflights (read-only, executed now):** `db:phase06-check --stage=pre` for `rbac`, `change` and `reset` all passed (12/12 each):
- the TEST environment;
- USER_ID 2 `ACTIVE`, with a password and no MFA;
- no sessions, memberships, overrides, effective permissions or usable tokens;
- no active `ZRV_IT_*` catalogue;
- Zaid unchanged: SUPER_ADMINISTRATOR only, 23 grants, MFA-enrolled, no tokens, no open session.

**MFA recovery live test: blocked.** Ordinary accounts cannot enrol MFA voluntarily (no endpoint), so USER_ID 2 has no authenticator to recover. Zaid's MFA must not be touched, and privileged recovery e-mail is disabled. It stays covered by the in-memory tests only.

## 3A. Live Oracle TEST results (owner-approved, operator-run, 20 October 2026)

| Scenario | Operator tool | Read-only post-check (`npm run db:phase06-check -- --scenario=… --employee=2502 --stage=post --hours=24`) |
|---|---|---|
| RBAC evaluation of USER_ID 2 | `auth:rbac-user-test`: **ALL PASSED** (operator-confirmed). Default deny; role grant effective; role + ALLOW additive; DENY wins over the role grant; inactive permission grants nothing; employee's own view matched; employee still denied user administration; cleanup complete. | **19/19 PASS**: temporary modules/roles inactive (0 active); temporary resources/permissions/grants inactive (0/0/0); USER_ID 2 with no active membership or override and 0 effective permissions; audit `RBAC_ROLE_ASSIGNED`, `RBAC_ROLE_UNASSIGNED`, `RBAC_OVERRIDE_SET`, `RBAC_OVERRIDE_REVOKED` present; Super Administrator unchanged. |
| Password change | `auth:recovery-test --mode=change`: **ALL PASSED**. Change succeeded; every session (including a second one) ended; old sessions and the old password refused; the new password signs in. | **15/15 PASS**: `PASSWORD_CHANGED`/`PASSWORD_CHANGE` and `SESSION_REVOKED`/`PASSWORD_CHANGE` audited; failed attempts back to 0; no open sessions. |
| Password reset | `auth:recovery-test --mode=reset`: **ALL PASSED**. Uniform 202; **one Office 365 SMTP e-mail delivered only to the approved TEST mailbox**; token accepted once, replay refused; session ended; the new password signs in. | **16/16 PASS**: latest `PASSWORD_RESET` token consumed, none usable; `ACTION_TOKEN_ISSUED`/`PASSWORD_RESET` with recipient `TEST_OVERRIDE`; `PASSWORD_CHANGED`/`PASSWORD_RESET`; replay `ACCESS_DENIED`/`TOKEN_NOT_USABLE`. |

**System-wide read-only state after the runs:**
- 0 open sessions for any user;
- 0 usable action tokens;
- 0 active overrides;
- 1 active role membership, which is the Super Administrator's SUPER_ADMINISTRATOR.

The Super Administrator is `ACTIVE` and MFA-enrolled, with 23 active grants, no recovery tokens and no open session.

**Retained by design:** the deactivated temporary catalogue (`ZRV_IT_M<ts>`/`ITEMS`/`VIEW`, `APPROVE`), the role `ZRV_IT_R<ts>` and the inactive membership and override rows remain inactive, with their audit trail. No DELETE.

**Still not live-tested:**
- MFA recovery (no ordinary MFA enrollment; Zaid's MFA must be preserved);
- OAuth2 SMTP;
- privileged recovery e-mail (not approved);
- the protected-account refusal by a non-Zaid administrator (TEST has no second administrator).

## 4. Audit coverage review

**Written and audited (all inside the change transaction unless noted):**
- **Authentication:** login success and failure, lockout, logout, session expiry and revocation (including lockout, now audited).
- **MFA:** enrollment (now including the revocation of other sessions), verification, replacement.
- **RBAC administration:** `RBAC_*`.
- **User administration:** `ACCOUNT_*` and `SESSION_REVOKED`.
- **Recovery:** `ACTION_TOKEN_ISSUED` (with outcome `FAILURE` for delivery failures), `PASSWORD_CHANGED`, `ACCOUNT_ACTIVATED`, `MFA_RECOVERED`.
- **Refusals:** `ACCESS_DENIED`, written independently of the request transaction.
- **Append-only:** the application layer still only INSERTs into `XX_ZRV_RBAC_AUDIT_LOGS`.

**Documented gaps (not redesigned):**
1. **Read access is not audited:** user lists and details, effective permissions, catalogue. There is no approved read-audit code, and per-read auditing would need a volume and retention decision.
2. **Business refusals (400/409) are not audited:** not eligible, prerequisites not met, duplicate, confirmation mismatch. They are not authorization denials, and there is no approved code.
3. **Login replacing a presented cookie:** the old session is revoked without a dedicated row. The new `LOGIN_SUCCESS` is recorded.
4. **Database-level immutability is not enforced:** `TR_ZRV_AUDIT_NO_MUTATION` is not deployed, and the runtime account can UPDATE or DELETE audit rows. This is a production blocker and needs DDL/DBA approval.
5. **Reason codes:** the codes in use are listed below. The catalogue is still not owner-approved (status item 5).
   - `SESSION_REVOKED`: `ADMIN_REVOKED`, `ACCOUNT_DISABLED`, `ACCOUNT_LOCKED`, `MFA_ENROLLED`, `MFA_REPLACED`, `MFA_RECOVERED`, `PASSWORD_SETUP`, `PASSWORD_RESET`, `PASSWORD_CHANGE`.
   - `PASSWORD_CHANGED`: `PASSWORD_SETUP`, `PASSWORD_RESET`, `PASSWORD_CHANGE`.
   - `ACTION_TOKEN_ISSUED`: the token type, or `DELIVERY_FAILED`, `DATABASE_IDENTITY_UNVERIFIED` or `RECIPIENT_NOT_PERMITTED` on failure.

## 5. Files

**New:**

- `scripts/operator-session.js`
- `scripts/rbac-user-test-flow.js`
- `scripts/recovery-test-flow.js`
- `scripts/phase06-check.js`
- `tests/security-hardening.test.js`
- `tests/phase06-operator-flows.test.js`
- this handoff

**Changed:**
- `src/modules/auth/recovery.service.js`: background self-service, the lockout helper, audit details.
- `src/modules/auth/recovery.controller.js`: does not await the background work.
- `src/modules/auth/auth.lockout.js`: `revokeSessionsAfterLockout`.
- `src/modules/auth/mfa.service.js`: lockout and enrollment revocation audits.
- `src/routes/api.routes.js`: optional `backgroundTasks` (test hook).
- `docs/openapi/openapi.yaml`: request-endpoint description.
- `tests/auth-recovery.test.js`, `tests/smtp-delivery.test.js`, `tests/helpers/authFakes.js`: background settling.
- `package.json`: `auth:rbac-user-test`, `auth:recovery-test`, `db:phase06-check`.
- `docs/08-IMPLEMENTATION_STATUS.md`.

No schema, frontend or locked-table change. No new dependency.

## 6. Remaining blockers

The seven production blockers are **retained, unresolved**:
1. SMTP authentication migration from PASSWORD to OAuth2.
2. Verified employee-mailbox ownership.
3. Privileged recovery delivery.
4. First privileged MFA enrollment policy.
5. Reminder delivery and scheduling.
6. Distributed rate limiting.
7. Database audit immutability.

**Also open:**
- the read-audit decision;
- the reason-code catalogue approval;
- voluntary MFA enrollment for ordinary users (needed for a live MFA-recovery test);
- bulk provisioning;
- hosting and Origin configuration.

**Residual timing note:** the background work still uses the shared database pool. Under heavy load, sustained request floods could reveal aggregate work. This is mitigated by the per-client rate limit and, in production, should also be covered by the distributed limit (blocker 6).

## 7. Approvals (granted and executed)

All three scenarios in §3 were approved by the owner and run by the operator. The RBAC scenario's temporary objects were created and fully deactivated. USER_ID 2's password was changed twice: once by the change scenario, once by reset. One e-mail went to the approved TEST mailbox. No further live operation is pending.

## 8. Suggested commit message

```
fix(security): close recovery timing leak, audit lockout and enrollment revocations

- self-service recovery responds before any account-dependent work (lookup,
  token, SMTP), removing the timing-based account enumeration; fail-closed
  delivery check unchanged
- SESSION_REVOKED audit for lockout-driven revocations (ACCOUNT_LOCKED, SYSTEM)
  and for sessions ended by first MFA enrollment (MFA_ENROLLED)
- audit details for revoked earlier tokens and reset tokens
- RBAC precedence, concurrency and expiry regression tests
- Oracle TEST operator tools (RBAC user evaluation, password change/reset) with
  read-only pre/post checks; Phase 06 handoff
```
