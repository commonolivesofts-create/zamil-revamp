# Phase 05 — Authentication Recovery

**Branch:** `feat/auth-recovery` (uncommitted; developer handles Git).
**Date:** 20 October 2026.
**State:**
- Implemented and tested with in-memory doubles. New SQL verified read-only on Oracle TEST.
- **Office 365 SMTP delivery implemented** (§4). It is disabled unless configured, and fails closed otherwise.
- **Oracle TEST live integration PASSED** (owner-approved, 20 October 2026; §7A): one setup e-mail went to the approved TEST mailbox only; USER_ID 2 (employee 2502) completed first-password setup and is `ACTIVE`; ordinary login, logout and authorization denials passed; the Super Administrator is unchanged.
- **Not production-ready:** see the production blockers (§8).

## 1. Summary

Password setup, password change, self-service and administrator-assisted password reset, and MFA recovery. All use single-use hashed action tokens on the locked `XX_ZRV_ACCOUNT_ACTION_TOKENS` table. The owner approved the audit codes `PASSWORD_CHANGED`, `ACTION_TOKEN_ISSUED` and `MFA_RECOVERED`.

A delivery boundary (`src/modules/notifications/delivery.js`) carries tokens out of band. No provider is approved, so nothing is ever sent or reported as delivered, and no API returns a token.

## 2. Endpoints

### Public (anonymous)

Origin check; a per-client limit of 60/min (`loginRateLimit`); tokens travel only in request bodies.

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/v1/auth/recovery/request` | `{username, purpose: PASSWORD_RESET\|MFA_RECOVERY}` | Always `202 {accepted, message}` with the same body for every username, or `503 DELIVERY_UNAVAILABLE` for **every** request while no channel is configured |
| POST | `/api/v1/auth/password/setup` | `{token, newPassword}` | Consumes `PASSWORD_SETUP`; sets the password; `PENDING` → `ACTIVE` |
| POST | `/api/v1/auth/password/reset` | `{token, newPassword}` | Consumes `PASSWORD_RESET`; sets the password; revokes all sessions |
| POST | `/api/v1/auth/mfa/recovery/start` | `{token, password}` | Returns the setup key of a **new** authenticator; stores nothing |
| POST | `/api/v1/auth/mfa/recovery/confirm` | `{token, password, code}` | Consumes `MFA_RECOVERY`; replaces the secret; revokes all sessions |

### Authenticated

| Method | Path | Guards | Result |
|---|---|---|---|
| POST | `/api/v1/auth/password/change` | session + CSRF | `{currentPassword, newPassword}`; revokes all sessions including the current one; clears the cookie |
| POST | `/api/v1/users/{userId}/password-setup` | `USER_ACCOUNTS:CREATE` + MFA session + CSRF | `{confirmEmployeeNumber}` → `202 {userId, actionType, expiresAt, delivered: true, authorizedBySuperAdministrator}` |
| POST | `/api/v1/users/{userId}/recovery` | `ACCOUNT_RECOVERY:ISSUE` + MFA session + CSRF | `{purpose: PASSWORD_RESET\|MFA_RECOVERY, confirmEmployeeNumber}` → `202`, same body |

### Errors

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `TOKEN_INVALID` (one message for unknown, expired, used, revoked or wrong-purpose tokens), `PASSWORD_POLICY_VIOLATION` (rules in details), `PASSWORD_REUSED`, `CONFIRMATION_MISMATCH` |
| 401 | `RECOVERY_FAILED`, `MFA_VERIFICATION_FAILED`, `UNAUTHENTICATED` |
| 403 | `ACCOUNT_NOT_ELIGIBLE`, `CURRENT_PASSWORD_INVALID`, `PROTECTED_ACCOUNT`, `SELF_MODIFICATION_FORBIDDEN`, `MFA_RECENT_VERIFICATION_REQUIRED`, `FORBIDDEN`, `CSRF_REJECTED` |
| 404 | `RESOURCE_NOT_FOUND` |
| 409 | `RECOVERY_NOT_APPLICABLE` (reason in details), `CONFLICT` |
| 429 | `RECOVERY_THROTTLED`, `RATE_LIMITED` |
| 503 | `DELIVERY_UNAVAILABLE` (administrators see `NO_CHANNEL_CONFIGURED`, `RECIPIENT_UNAVAILABLE` or `DELIVERY_FAILED`), `MFA_UNAVAILABLE` |

## 3. Rules (`src/modules/auth/recovery.service.js`)

### Tokens

| Property | Rule |
|---|---|
| Lifetime | `PASSWORD_SETUP` 24 h, `PASSWORD_RESET` 30 min, `MFA_RECOVERY` 15 min (`ACTION_TOKEN_POLICY`) |
| Format | 256-bit random |
| Storage | Only the SHA-256 digest (RAW(32)); the token never appears in responses, logs or audit details |
| Expiry | Evaluated on the database clock |
| Single use | A guarded `UPDATE … WHERE consumed_at IS NULL AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP`, committed in the same transaction as the password or MFA change. A lost race returns `TOKEN_INVALID`. |
| One outstanding per user and type | Issuance locks the user row (`SELECT … FOR UPDATE`) and revokes the previous token |
| Cooldown | At most one issuance per user and type per 5 minutes |
| Delivery coupling | The channel is called last inside the issuing transaction, so a refused delivery leaves no usable token. The failure is audited as `ACTION_TOKEN_ISSUED`/`FAILURE`. |

### Who can recover what (docs/07 §5)

- **Zaid (2172):**
  - self-service password reset and MFA recovery;
  - links go only to the pinned `zaid.sayyed@zamilplastic.com` (`SUPER_ADMINISTRATOR_RECOVERY_EMAIL`), never a stored or client value;
  - no other approver;
  - nobody can issue tokens for his account.
- **Main Administrators, Administrators and any holder of a security-administration permission:**
  - no self-service;
  - only Zaid can issue their tokens, with MFA verified within the last 10 minutes and the target employee number re-entered (`confirmEmployeeNumber`);
  - this is direct authorization, with no approval queue (Option A).
- **Ordinary employees:**
  - self-service password reset;
  - administrator-assisted reset or MFA recovery by holders of `ACCOUNT_RECOVERY:ISSUE` (password setup: `USER_ACCOUNTS:CREATE`);
  - no self-service MFA recovery.
- **Everyone:** nobody issues tokens for their own account through the administration API.

### Completion flows

- **Password setup:**
  - Requires `PENDING`, no password and an eligible employee (re-checked at completion), plus the password policy.
  - In one transaction: consume the token, set the Argon2id hash and `PASSWORD_CHANGED_AT`, clear the lockout, and move to `ACTIVE` (guarded by `expectedStatus`).
  - Audited as `PASSWORD_CHANGED`/`PASSWORD_SETUP` and `ACCOUNT_ACTIVATED`/`PASSWORD_SETUP`.
- **Password reset:**
  - Requires `ACTIVE`, an eligible employee, the policy, and a password different from the current one.
  - Consumes the token, sets the password, clears the lockout, and revokes every session and outstanding reset token.
  - MFA is untouched, so privileged users still need MFA at sign-in.
- **Password change:**
  - The current password is required. Wrong values count toward the 5/15 lockout, and a lock ends every session.
  - The policy applies and reuse is refused. On success every session is revoked, including the current one, and the cookie is cleared.
- **MFA recovery:**
  - `start` needs the token and the current password, and returns a candidate secret. It is derived under its own HKDF purpose (`zr-totp-recovery-derivation-v1`), bound to the user, the token and the stored ciphertext, and is never stored.
  - `confirm` additionally needs a code from the new authenticator. It then consumes the token, replaces the secret (optimistic, only if unchanged) and revokes every session.
  - The account is never left without MFA, so password-only re-enrollment is impossible. Neither the token alone nor the password alone is enough.
  - Wrong passwords and codes count toward the lockout.

### Anti-enumeration

- The request endpoint gives an identical response for every input.
- Denials are audited as `ACCESS_DENIED` with reasons such as `UNKNOWN_USERNAME`, `SELF_SERVICE_NOT_PERMITTED`, `RECIPIENT_UNAVAILABLE` and `RECOVERY_THROTTLED`.
- Response timing is not equalised (§8).

### Password expiry

Login already refuses expired passwords (`403 PASSWORD_EXPIRED`), and the renewal path is the reset flow. `npm run auth:password-reminders` counts the accounts due for the 14/7/1-day reminders on today's Asia/Riyadh date. It is read-only and sends nothing until delivery is configured.

## 4. Delivery: Office 365 SMTP (owner decision: SMTP, not Microsoft Graph)

**Boundary.** The channel interface is `{ configured, resolveRecipient(account), deliver(message) }` (`src/modules/notifications/delivery.js`). `deliver` resolves only after SMTP accepted the message for the recipient. The raw token goes only into the e-mailed link, in the URL **fragment** (`<AUTH_FRONTEND_BASE_URL><path>#token=…`), which browsers never send to servers. It is never returned, logged or audited.

**SMTP channel** (`src/modules/notifications/smtpDelivery.js`, Nodemailer `^10.1.7`). The owner approved the dependency; 7.x was rejected for open advisories, and `npm audit` reports 0 vulnerabilities.

| Aspect | Behaviour |
|---|---|
| Endpoint | `smtp.office365.com:587`, fixed in code |
| TLS | `secure:false` with `requireTLS:true` (STARTTLS mandatory), TLS ≥ 1.2, `rejectUnauthorized:true` (not configurable), `servername` pinned |
| Message composition | File and URL access disabled |
| Logging | Nodemailer logging off; errors are logged as SMTP code and response code only |
| `OAUTH2` auth (default, preferred) | SMTP AUTH XOAUTH2. The token comes from `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token` using the client-credentials grant, scope `https://outlook.office365.com/.default`. It is cached until 60 s before expiry and renewed once when SMTP rejects it. Token errors expose only the OAuth error code. No Microsoft Graph and no additional library: Node `fetch` is used. |
| `PASSWORD` auth | Only for tenants that still permit basic SMTP AUTH on the mailbox. It is never assumed. |
| Acceptance | A message SMTP did not accept for the recipient counts as failed |

**Recipient policy** (`createRecipientResolver`):
- **Ordinary accounts:** `XX_DIGI_EMP_MASTER.EMAIL_ADDRESS`, which is authoritative (owner decision). An account with no address has no recipient, so the flow fails closed.
- **Outside production** (development, test, uat): `SMTP_TEST_RECIPIENT_OVERRIDE` is **required** when SMTP is enabled, and may only be `shaikh.azim@olivesofts.com`. Every ordinary-user message goes there instead of the employee. It carries a `[TEST]` subject and a banner naming the employee number.
- **Override safety checks:**
  - before the first send in each process, the channel checks in Oracle that `SYS_CONTEXT('USERENV','DB_NAME')` equals `SMTP_TEST_DATABASE_NAME` (which must contain `TEST`; TEST is `G480281AE328134_ZPADWTEST`, verified read-only);
  - otherwise it refuses with `DATABASE_IDENTITY_UNVERIFIED`;
  - any address other than the override is refused (`RECIPIENT_NOT_PERMITTED`).
- **Startup refusals:** configuration validation refuses to start with an override in production, an override other than the approved mailbox, a missing or non-TEST database name, or incomplete credentials.
- **Privileged accounts** (Super Administrator, administrator roles, security-permission holders):
  - no e-mail unless `SMTP_PRIVILEGED_DELIVERY_ENABLED=true`, which needs separate approval and is forbidden together with an override;
  - never redirected to the test mailbox;
  - the Super Administrator only ever uses the pinned `zaid.sayyed@zamilplastic.com`.

**Failure handling.** Delivery is the last step inside the token transaction, so a refusal rolls back the token and its success audit row. The failure is then audited independently as `ACTION_TOKEN_ISSUED`/`FAILURE` with the reason. Anonymous requests still get the uniform `202`; administrators get `503 DELIVERY_UNAVAILABLE` with the reason. Oracle or other non-delivery errors are not mislabelled as delivery failures.

**Operator check:** `npm run smtp:verify` validates the configuration, the TEST database identity (with override), STARTTLS and SMTP authentication. It sends **no** e-mail.

**Still open:**
- the scheduling of the reminder job (dedup only by a once-per-business-day run; no reminder-sent column);
- approval of privileged-account recovery e-mail;
- the frontend routes, which by default are `/password/setup`, `/password/reset` and `/mfa/recovery` and are configurable.

## 5. Files

**New:**
- `src/modules/auth/recovery.repository.js`
- `src/modules/auth/recovery.service.js`
- `src/modules/auth/recovery.controller.js`
- `src/modules/notifications/delivery.js` (boundary and recipient policy)
- `src/modules/notifications/smtpDelivery.js` (Office 365 SMTP channel)
- `src/modules/notifications/databaseIdentity.repository.js` (`SYS_CONTEXT DB_NAME`)
- `scripts/smtp-verify.js` (`npm run smtp:verify`)
- `tests/smtp-delivery.test.js`
- `scripts/setup-test-flow.js` (`npm run auth:setup-test`): interactive TEST operator tool for first-password setup
- `scripts/setup-integration-check.js` (`npm run db:setup-check`): read-only pre/post checks
- `tests/setup-test-flow.test.js`: in-memory dry run of the operator scenario
- `scripts/password-expiry-reminders.js`
- `tests/helpers/recoveryFakes.js`
- `tests/auth-recovery.test.js`
- this handoff

**Changed:**
- `src/config/index.js`: SMTP and link settings with the startup refusals; the fixed Office 365 endpoint; the approved test mailbox.
- `.env.example`: SMTP placeholders (commented secrets).
- `package.json`/`package-lock.json`: `nodemailer ^10.1.7` (approved production dependency) and `smtp:verify`.
- `src/modules/auth/auth.routes.js`: five public routes plus password change.
- `src/modules/auth/auth.validation.js`: recovery schemas.
- `src/modules/auth/auth.policy.js`: `ACTION_TOKEN_POLICY`.
- `src/modules/auth/mfaSecret.js`: `recoverySecret`.
- `src/modules/access-control/securityCatalog.js`: the pinned recovery address.
- `src/modules/audit/securityAudit.service.js`: three codes.
- `src/modules/users/users.{routes,controller,validation}.js`: two issuance routes.
- `src/routes/api.routes.js`: wiring; the keyring is shared with the MFA service.
- `docs/openapi/openapi.yaml`: 8 operations, the tag, schemas and 5 responses.
- `scripts/verify-auth-sql.js`.
- `tests/api-docs.test.js`, `tests/audit-append-only.test.js`, `tests/helpers/authFakes.js` (exposes the race barrier; passes the recovery deps).
- `package.json`: `auth:password-reminders`.
- `docs/08-IMPLEMENTATION_STATUS.md`.

## 6. Oracle tables and columns (no DDL)

| Table | Use |
|---|---|
| `XX_ZRV_ACCOUNT_ACTION_TOKENS` | INSERT `USER_ID`, `ACTION_TYPE` (`CK_ZRV_TOK_TYPE` values only), `TOKEN_HASH`, `EXPIRES_AT` (UTC now + lifetime, so `CK_ZRV_TOK_EXP` holds), `CREATED_BY`. UPDATE `CONSUMED_AT` or `REVOKED_AT`, never both (`CK_ZRV_TOK_STATE`), plus `UPDATED_AT`/`UPDATED_BY`. SELECT by `TOKEN_HASH`, and by `(USER_ID, ACTION_TYPE)` using `IX_ZRV_TOK_USER_TYPE`. |
| `XX_ZRV_USERS` | `SELECT … FOR UPDATE` (issuance lock). UPDATE `PASSWORD_HASH`, `PASSWORD_CHANGED_AT`, `FAILED_LOGIN_ATTEMPTS`, `LOCKED_UNTIL`, `ACCOUNT_STATUS` (`CK_ZRV_USERS_PWD` satisfied), `UPDATED_AT`, `UPDATED_BY`. MFA columns only via the existing `replaceMfa` (`CK_ZRV_USERS_MFA`). |
| `XX_ZRV_USER_SESSIONS` | Revocation through the existing `revokeUserSessions`. |
| `XX_DIGI_EMP_MASTER` | Read: eligibility and `EMAIL_ADDRESS` (used only once approved). |
| `XX_ZRV_RBAC_AUDIT_LOGS` | INSERT only. |

## 7. Tests and verification (executed)

- **`node --test tests/auth-recovery.test.js`:** 24/24 passed (in-memory doubles; real Argon2id, TOTP and AES-GCM). Coverage:
  - **Setup:** delivery-only token (never in responses or audit, digest stored, 24 h); policy; activation plus audits; login afterwards; replay refused; confirmation, eligibility and status prerequisites; eligibility lost before completion; 24 h expiry; cooldown 429; re-issue revokes the old token; wrong-purpose and unknown tokens.
  - **Reset:** identical responses for known and unknown users; reuse refused; lockout cleared; all sessions revoked; old password rejected; **concurrent double completion: exactly one succeeds**; privileged non-Zaid accounts get no self-service; Zaid uses the pinned address while ordinary accounts without an approved source get none; provider failure leaves no token and writes the FAILURE audit.
  - **Fail-closed:** `503` for known and unknown users with no channel; `503 RECIPIENT_UNAVAILABLE` without an approved source; no tokens created.
  - **Change:** a wrong current password counts toward the lockout; policy; reuse; every session including the current one revoked; cookie cleared; CSRF and session required.
  - **MFA recovery:** self-service is Zaid-only; a wrong password counts as a failure; nothing is stored at `start`; the old authenticator's code is refused; success replaces the secret and revokes sessions; replay refused; the next login is an MFA challenge without enrollment; 15 min expiry.
  - **Administrator-issued:** ordinary target allowed; `MFA_NOT_ENROLLED` 409; the permission is required; another administrator is refused for non-Zaid actors; Zaid is allowed with recent MFA and refused after 11 min; Zaid's account and self-issuance are refused.
- **Mutation checks:** removing the atomic consume guard, the privileged self-service block, the MFA-recovery password check or Zaid's recent-MFA requirement made 3, 1, 1 and 1 tests fail respectively. The code was restored.
- **`node --test tests/api-docs.test.js tests/audit-append-only.test.js`:** 14/14 passed.
- **`npm run db:verify-auth` (read-only on Oracle TEST):** **139/139 passed**. That includes:
  - the recovery SELECTs (token lookup by digest, cooldown, password hash, 14/7/1-day reminder queries);
  - parse-only `insertToken`, `consumeToken`, `revokeOutstandingTokens`, `setPassword` and the `FOR UPDATE` lock;
  - the three new codes against the deployed `CK_ZRV_AUD_EVENT`.
- **`npm run auth:password-reminders` (read-only):** 0/0/0 due; nothing sent.
- **`node --test tests/smtp-delivery.test.js`:** 20/20 passed, with no network (fake transport and token endpoint). Coverage: transport TLS/STARTTLS/certificate options; OAuth2 and basic auth; the XOAUTH2 provision callback; client-credentials request, caching, renewal and safe errors; the link in the fragment; HTML escaping; the TEST database identity gate (wrong, null and error) checked once per process; override-only recipients; production recipients and the pinned Super Administrator address; SMTP auth and transport errors; unaccepted recipients; configuration refusals (12 cases); end-to-end reset through the API with the token taken from the captured mail; and no token left after an SMTP failure or an identity mismatch.
- **SMTP mutation checks:** removing the database-identity gate, the override-only recipient check or certificate verification made 3, 2 and 1 tests fail respectively. The code was restored.
- **`node --test tests/auth-recovery.test.js`:** 26/26 passed. The recipient policy is now the real resolver: employee-master address, pinned Super Administrator, privileged accounts without approval, TEST override with privileged never redirected, and a missing address.
- **`npm run check`:** lint, format check and **424/424** tests passed (Oracle and SMTP mocked), final run after the live integration.

## 7A. Oracle TEST live integration (owner-approved, 20 October 2026)

**Approval:** controlled Oracle TEST password-setup writes and one actual setup e-mail for employee 2502 / USER_ID 2, redirected only to `shaikh.azim@olivesofts.com`.

**Configuration:**
- Office 365 SMTP with **PASSWORD** authentication. The tenant permits basic SMTP AUTH for the sending mailbox; OAuth2 was not used.
- STARTTLS on 587 with a verified certificate.
- The test override is the approved mailbox, and `SMTP_TEST_DATABASE_NAME` is the TEST `DB_NAME`.
- Privileged delivery is off.

| Step | Command | Result |
|---|---|---|
| 1 | `npm run smtp:verify` (no e-mail) | **PASS**: database identity, STARTTLS, SMTP authentication |
| 2 | `npm run db:setup-check -- --employee=2502 --stage=pre` (read-only) | **13/13 PASS**: safety gate, eligibility, e-mail present, USER_ID 2 `PENDING` without password, no tokens/roles/sessions, Super Administrator intact |
| 3 | `npm run auth:setup-test -- --employee=2502 --expect-username=MUBEEN.GURMANI` (interactive; Zaid MFA sign-in; token and password at hidden prompts) | **ALL PASSED** (operator-confirmed) |
| 4 | `npm run db:setup-check -- --employee=2502 --stage=post` (read-only) | **ALL PASSED** (operator-confirmed) |

**What the live run verified:**
- **Before sending** (the tool runs the API in-process from the verified configuration):
  - non-production;
  - Oracle `DB_NAME` equals the configured TEST database;
  - the effective recipient for USER_ID 2 is **only** the approved TEST mailbox (`TEST_OVERRIDE`);
  - the target is eligible, `PENDING`, without password, not privileged, has an employee-master address, and has no roles or sessions.
- **Issuing:**
  - `POST /api/v1/users/2/password-setup` as Zaid (MFA, CSRF, `USER_ACCOUNTS:CREATE`, explicit confirmation) returned 202 with no token in the response;
  - **Office 365 delivered the `[TEST]` setup message to the approved TEST mailbox only**;
  - Zaid was signed out afterwards.
- **Completing:**
  - `POST /api/v1/auth/password/setup` with the link token returned 200, and USER_ID 2 became `ACTIVE`;
  - a replay of the same token was refused (400 `TOKEN_INVALID`).
- **Ordinary user:**
  - login returned a session without MFA (ordinary, not enrolled), and `/auth/me` returned USER_ID 2;
  - own effective permissions: **0**;
  - **403 `FORBIDDEN`** for `GET /users`, `GET /access-control/roles` and `GET /users/1`;
  - logout worked;
  - no grants were changed.
- **Post-check (Oracle):**
  - USER_ID 2: `ACTIVE` with password hash and `PASSWORD_CHANGED_AT`, 0 failed attempts, no MFA, no roles or overrides, no open sessions.
  - Tokens: exactly one `PASSWORD_SETUP` token (24 h), **consumed**, none usable.
  - Audit:
    - `ACTION_TOKEN_ISSUED`/`SUCCESS`/`PASSWORD_SETUP` by Zaid with recipient source `TEST_OVERRIDE`;
    - `PASSWORD_CHANGED` and `ACCOUNT_ACTIVATED` (`PASSWORD_SETUP`) by the user;
    - `ACCESS_DENIED`/`TOKEN_NOT_USABLE` for the replay;
    - `LOGIN_SUCCESS` and `LOGOUT`;
    - `ACCESS_DENIED`/`NO_GRANT` for the denied calls.
  - Super Administrator: `ACTIVE`, MFA-enrolled, SUPER_ADMINISTRATOR only, 23 active grants, no recovery tokens, no open session.
- **SQL verified on Oracle by this run** (previously parse-only): token `INSERT … RETURNING … INTO` with the `TIMESTAMP WITH TIME ZONE` out-bind, the issuance row lock, `consumeToken` and `setPassword`.

**Important:** test-mailbox onboarding proves the setup mechanism, not mailbox ownership. Because the message was redirected, it does **not** establish that employee 2502 owns or controls the `EMAIL_ADDRESS` recorded in the employee master. Production onboarding relies on that address being correct and controlled by the employee.

**Not exercised live:**
- self-service reset, password change and MFA recovery on Oracle (covered by in-memory tests only);
- privileged-account recovery e-mail (not approved).

## 8. Production blockers, limitations and dependencies

**Production blockers (must be resolved before production use):**

1. **SMTP authentication migration.** The live run used basic SMTP AUTH (PASSWORD), which Microsoft is retiring and security defaults block. Migrate to OAuth2 (`SMTP_AUTH_METHOD=OAUTH2`, already implemented and unit-tested, not yet live-tested):
   - an Entra ID app with `SMTP.SendAsApp` and admin consent;
   - an Exchange service principal with mailbox permission;
   - client secret rotation in the secret store.
2. **Verified employee-mailbox ownership.** `XX_DIGI_EMP_MASTER.EMAIL_ADDRESS` is used as authoritative, but nothing verifies that each employee controls it (see §7A). This needs an owner decision on data quality and ownership verification before real employee onboarding or recovery e-mail.
3. **Privileged recovery delivery.** `SMTP_PRIVILEGED_DELIVERY_ENABLED` is off. Super Administrator, Main Administrator, Administrator and security-permission holders receive no recovery e-mail until it is separately approved and tested; the Super Administrator always uses the pinned address.
4. **First privileged MFA enrollment.** After password setup, a privileged account enrols MFA at first login through the Phase 02 password-only challenge enrollment, which was approved provisionally for TEST only. The production policy is undecided.
5. **Reminder delivery and scheduling.** `npm run auth:password-reminders` only counts the 14/7/1-day reminders. There is no sending loop and no scheduler, and dedup relies on a once-per-business-day run because the locked schema has no reminder-sent column.
6. **Distributed rate limiting.** The login and recovery limits are in-process only (status item 3). A shared or gateway limit is required.
7. **Database audit immutability.** `TR_ZRV_AUDIT_NO_MUTATION` is not deployed, and the runtime account can UPDATE or DELETE audit rows (status item 2).

**Other known limitations (preserved):**

8. **Timing.** Self-service request timing is not equalised: known accounts do more work.
9. **Business refusals.** 409/400 business refusals in administrator issuance are not audited (as in Phase 04). RBAC read access is not audited.
10. **Live coverage.** Reset, change and MFA recovery are not live-tested on Oracle; OAuth2 SMTP is not live-tested.
11. **Dependency freshness.** `nodemailer` 10.1.7 (MIT-0, no dependencies, `npm audit` clean) was published on 2026-10-18. 7.x was rejected for open advisories. The lockfile pins 10.1.7 with integrity; review release notes before upgrading.
12. **Carried over from earlier phases:**
    - bulk provisioning is not implemented;
    - ordinary-user RBAC role/override changes are not yet live-tested on Oracle;
    - Origin/proxy configuration for hosting;
    - the audit reason-code catalogue is not owner-approved.

## 9. Suggested commit message

```
feat(auth): add password setup/reset/change, MFA recovery and Office 365 SMTP delivery

- single-use SHA-256-hashed action tokens (setup 24h, reset 30m, MFA 15m) with
  atomic consumption, one outstanding token per type and issuance cooldown
- setup activates eligible PENDING accounts; reset/change/MFA recovery revoke all
  sessions; MFA recovery needs token + password + new-authenticator code
- Super Administrator self-recovery via pinned address only; privileged recovery
  issued only by the Super Administrator (recent MFA, explicit confirmation);
  ordinary self-service reset and administrator-assisted recovery
- Office 365 SMTP (Nodemailer 10, STARTTLS 587, verified certificates, XOAUTH2 or
  tenant-permitted AUTH); recipients from XX_DIGI_EMP_MASTER.EMAIL_ADDRESS; outside
  production only the approved test mailbox after an Oracle DB_NAME check;
  privileged recovery mail disabled pending approval; tokens never returned/logged
- PASSWORD_CHANGED / ACTION_TOKEN_ISSUED / MFA_RECOVERED audit codes
- operator tools (smtp:verify, auth:setup-test, db:setup-check), read-only Oracle
  verifier checks, OpenAPI, tests; Phase 05 handoff (TEST setup of USER_ID 2 passed)
```
