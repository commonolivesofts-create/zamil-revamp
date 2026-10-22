# Feature handoff — Administrator MFA environment control and Zamil Digitalization V 2.1.0

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Environment-controlled administrator MFA; official application branding V 2.1.0 |
| Business purpose | Let developers test administrator features locally without enrolling an authenticator, while MFA stays mandatory in UAT and production; establish the official product name **Zamil Digitalization** and release **V 2.1.0** |
| Business owner | Project owner |
| Status | Implemented; automated tests pass; live Oracle TEST verification not performed |
| Replaces CI3 feature | Not applicable |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/admin-mfa-config-app-branding` (from `main` at `62e35a1`) |
| Commit(s) | `feat: configure local admin MFA and brand Zamil Digitalization v2.1.0` |
| Pull Request | To be created by the owner |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | `AUTH_ADMIN_MFA_REQUIRED` defaults to `true`; exact `true`/`false` only | Yes | `server/tests/admin-mfa-policy.test.js` |
| 2 | `false` accepted only for `NODE_ENV=development`, loopback `HTTP_HOST`, `TRUST_PROXY_HOPS=0`; otherwise startup fails | Yes | same |
| 3 | Development + `false`: administrators (enrolled or not) sign in with password only and use Security Administration within RBAC | Yes (mocked) | same |
| 4 | No session is marked MFA-verified without a verified challenge | Yes | same (session row, audit details, `/auth/me`, `/me/permissions`) |
| 5 | Re-enabling MFA ends exception sessions; a fresh sign-in needs MFA | Yes | same |
| 6 | Password, account state, lockout, expiry, RBAC and DENY unchanged | Yes | same + existing suites |
| 7 | Startup warning logged when the exception is active | Yes (static) | same |
| 8 | Application name "Zamil Digitalization"; version "V 2.1.0" only in login and sidebar footers | Yes | `client/tests/branding.test.mjs`, `server/tests/product-branding.test.js` |
| 9 | Technical identifiers unchanged | Yes | same |

## 4. Files

| New / Modified | Path | Purpose |
|---|---|---|
| Modified | `server/src/config/index.js` | `AUTH_ADMIN_MFA_REQUIRED`, safety rules, `isLoopbackHost`, branded defaults |
| New | `server/src/config/product.js` | Authoritative product name and version |
| Modified | `server/src/modules/auth/auth.eligibility.js` | Central policy (`evaluateMfaRequirement(account, { adminMfaRequired })`) |
| Modified | `server/src/modules/auth/auth.service.js`, `session.service.js`, `mfa.service.js` | Apply the policy at login, session validation and challenge evaluation; audit `mfaExemption` |
| Modified | `server/src/modules/access-control/authorization.service.js`, `rbac.controller.js` | Security-permission MFA condition; `adminMfaRequired` in `/me/permissions` |
| Modified | `server/src/routes/api.routes.js`, `server/src/server.js` | Wiring; startup warning |
| Modified | `server/src/modules/notifications/smtpDelivery.js`, `server/src/modules/auth/recovery.service.js` | Product name in e-mails and issuer default |
| Modified | `client/src/features/access/*`, `client/src/config/appNavigation.js`, `client/src/features/dashboard/DashboardPage.jsx` | Mirror `adminMfaRequired` |
| Modified | `client/src/config/appConfig.js`, auth pages, `Sidebar.jsx`, `client/index.html`, `client/public/favicon.svg`, styles | Branding and version display |
| Modified | `package.json`/`package-lock.json` (client, server), OpenAPI, `.env.example` files, scripts, docs | Version 2.1.0, names, documentation |

## 5. Frontend routes and navigation

No new routes. `routeAccess` waives the MFA condition of `requiresMfa` routes only when the
backend reports `adminMfaRequired: false`; permissions are still required.

## 6. API endpoints and contracts

| Method | Path | Change |
|---|---|---|
| GET | `/api/v1/access-control/me/permissions` | Additive field `adminMfaRequired` (boolean). Documented in OpenAPI `MyPermissions`. |

No route, status-code or `/api/v1` changes. OpenAPI `info.title` is "Zamil Digitalization API",
`info.version` 2.1.0.

## 7. Oracle database

None. No DDL, no data changes; enrolled MFA secrets are never modified.

## 8. Authentication and permissions

Security change approved by the owner (V 2.1.0 request). No new permissions. The exception never
grants permissions and never sets `MFA_VERIFIED_AT`. Actions needing a recent MFA verification
(authenticator replacement, Super Administrator authorization of an administrator's recovery)
remain unavailable without a real verification — intended.

## 9. Shared components and services reused

`config`, `evaluateMfaRequirement`, `authorize`/`decide`, session validation, `usePermissions`,
`routeAccess`, `appConfig`.

## 10. Validation and test evidence

| Check | Command | Result |
|---|---|---|
| Backend lint, format, tests | `cd server; npm run check` | ESLint clean; Prettier clean; 465/465 tests passed (439 before this change + 26 new) |
| Frontend lint | `cd client; npm run lint` | Clean |
| Frontend tests | `cd client; npm test` | 211/211 passed (199 before + 12 new) |
| Frontend build + release check | `npm run build; node scripts/verify-production.mjs` | Build succeeded; release checks PASS |
| Oracle TEST verification | — | **Not performed** |

## 11. Known limitations and dependencies

- Existing authenticator entries keep the label they were enrolled with (for example the former
  name); they still verify because codes depend only on the stored secret. New enrollments show
  "Zamil Digitalization".
- A local `client/.env.local` that sets `VITE_APP_NAME` to the former name overrides the new
  default; developers must update it.
- Historical records (`server/docs/01–08`, phase handoffs, RBAC schema notes) keep the name used
  at that time.

## 12. Follow-up work

- Browser verification against Oracle TEST with `AUTH_ADMIN_MFA_REQUIRED=false` and `true`.

## 13. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Pending |
| Review outcome | Pending |
