# Security Essentials

The rules every contributor must follow, and where each control is implemented. The full
standards are [`server/docs/04-AUTHENTICATION_RBAC_SECURITY.md`](../server/docs/04-AUTHENTICATION_RBAC_SECURITY.md)
and the locked decisions in [`server/docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md`](../server/docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md).
Changing any of these controls is a **security change** and needs explicit approval
([workflow gate G2](FEATURE-DELIVERY-WORKFLOW.md#approval-gates)).

## 1. The repository is public

Everything committed is visible to anyone, permanently (history included). Never commit:

- `.env` files, Oracle wallets or anything under `secrets/` (git-ignored — never use `git add -f`);
- database or SMTP credentials, MFA encryption keys, tokens, cookies, SSH keys or certificates;
- employee names, numbers, e-mail addresses, production records or exported data — including in
  tests, OpenAPI examples, screenshots, logs and documentation.

Use obviously fictional fixtures (for example `example.invalid` addresses). If a secret is
committed or pushed, stop and report it immediately; history cleanup and credential rotation
follow the approved security process ([`CONTRIBUTING.md` §7](../CONTRIBUTING.md)).

## 2. Authentication and sessions

| Control | Backend | Frontend |
|---|---|---|
| Login identity: employee-master username → employee number → account | `server/src/modules/auth/` | `client/src/pages/auth/LoginPage.jsx` |
| Server-managed session, HttpOnly `Secure` `__Host-` cookie | `server/src/middleware/authenticate.js`, `server/src/modules/auth/session.service.js` | Cookies are never read or written by JavaScript |
| CSRF: Origin check on every unsafe request + session-bound `X-CSRF-Token` | `server/src/middleware/csrf.js` | Token held **in memory only**: `client/src/services/api/csrfStore.js`; attached by `apiClient.js` |
| MFA challenge (separate challenge cookie and challenge CSRF token) | `server/src/middleware/mfaChallenge.js`, `server/src/modules/auth/mfa.service.js` | `client/src/features/auth/authSession.js` |
| Session state machine (restore, expiry, sign-out, 401 handling) | — | `client/src/features/auth/authSession.js`, `AuthProvider.jsx` |

Never store session data, CSRF tokens, permissions or user data in `localStorage`,
`sessionStorage`, IndexedDB or `document.cookie` (enforced by
`client/tests/securityBoundaries.test.mjs` for the auth and API folders).

### Mandatory administrator MFA and its local-development exception

Administrators and other privileged accounts must pass MFA (`evaluateMfaRequirement` in
`server/src/modules/auth/auth.eligibility.js`, applied at login, on every session request and in
the authorization evaluator). The owner-approved backend setting `AUTH_ADMIN_MFA_REQUIRED`
(default `true`, `server/src/config/index.js`) may be `false` **only** on a developer's own
machine: startup is refused unless `NODE_ENV=development`, `HTTP_HOST` is loopback and
`TRUST_PROXY_HOPS=0`.

Under the exception, privileged accounts sign in without an MFA challenge and may use the
Security Administration operations their RBAC permissions allow, but:

- sessions are **never** marked MFA-verified (`MFA_VERIFIED_AT` stays NULL) and the login audit
  row records `mfaExemption: LOCAL_DEVELOPMENT`;
- password, eligibility, account status, lockout, expiry, CSRF, rate limits, RBAC and the
  administrator hierarchy are unchanged; voluntarily enrolled ordinary users still use MFA;
- actions that require a *recent* MFA verification remain unavailable;
- switching back to `true` revokes those sessions on their next request.

There is no frontend MFA setting: the frontend only mirrors `adminMfaRequired` reported by
`GET /api/v1/access-control/me/permissions`.

## 3. Authorization (RBAC)

- Permission identity: **`MODULE_CODE.RESOURCE_CODE:ACTION_CODE`**, for example
  `SECURITY_ADMINISTRATION.USER_ACCOUNTS:VIEW`.
- The **backend is authoritative.** Every protected route uses
  `authorize('MODULE.RESOURCE', 'ACTION')` (`server/src/middleware/authorize.js`), evaluated in
  Oracle on every request: default deny, explicit DENY override wins, the whole catalogue chain
  must be active, and `SECURITY_ADMINISTRATION` permissions also require an MFA-verified session
  (waived only under the local-development exception described above).
- Services enforce record-level rules and protected-account hierarchies (for example
  `server/src/modules/users/users.service.js`, `server/src/modules/access-control/rbac.service.js`).
- The **frontend only mirrors** the backend's effective permissions
  (`GET /api/v1/access-control/me/permissions`) to decide what to show:
  `client/src/features/access/` and `client/src/config/appNavigation.js`. Hiding a button is never
  a security control.
- Never derive access from role names, employee numbers or hard-coded identities in new code.
- No temporary allow-all permissions, dummy logins or bypasses — not even in development. The
  only approved development relaxation is the configuration-validated administrator-MFA exception
  above; it never grants permissions.

## 4. Input, output and data handling

- Validate every request part with Joi (`server/src/middleware/validate.js`); unknown fields are
  rejected.
- Oracle access only through `server/src/database/oracle.js` with **bind variables**; dynamic
  identifiers (sort columns) from fixed allowlists.
- Errors are created as `AppError` and formatted only by `server/src/middleware/errorHandler.js`;
  never return stack traces, SQL or Oracle messages to the browser.
- Logging only through the Pino `logger` (`server/src/shared/logger/index.js`, which redacts
  passwords, hashes, tokens and cookies). No `console.*` in application code.
- The frontend validates responses before trusting them (`*Contract.js` readers) and never renders
  raw HTML from data (`dangerouslySetInnerHTML` is not used).

## 5. Production integrity (ZRV-FE-005)

No fake data, demo records, placeholder screens, nonfunctional buttons, pretend integrations or
fabricated metrics in the production application. A screen or action appears only when a real
backend capability supports it; otherwise the dependency is reported, not simulated.

## 6. Destructive and live operations

- Do not run database writes, operator test flows, recovery e-mails or account changes against
  Oracle TEST without explicit authorization for that run.
- No DDL or seeded rows in the locked RBAC tables (11 tables in
  [`server/docs/rbac-schema/`](../server/docs/rbac-schema/README.md)) without owner approval.
- Report what was actually executed; never claim an untested operation passed.
