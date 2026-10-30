# Zamil Digitalization — Backend (`server/`)

Express 5 modular monolith modernizing a PHP CodeIgniter 3 application. The existing Oracle ADW
business schema is preserved. This file covers backend work; frontend (`client/`) changes are made
only when the owner's request authorizes them and follow [../client/docs/](../client/docs/README.md).
Git, approval gates and handoffs follow [../CLAUDE.md](../CLAUDE.md), [../CONTRIBUTING.md](../CONTRIBUTING.md)
and [../docs/FEATURE-DELIVERY-WORKFLOW.md](../docs/FEATURE-DELIVERY-WORKFLOW.md).

## Architecture reference (source of truth)

Read before implementing; flag conflicts rather than choosing silently.

1. [docs/01-SYSTEM_ARCHITECTURE.md](docs/01-SYSTEM_ARCHITECTURE.md) — modular monolith, folder structure, request flow
2. [docs/02-API_DEVELOPMENT_STANDARDS.md](docs/02-API_DEVELOPMENT_STANDARDS.md) — REST, response envelope, Joi, pagination, OpenAPI
3. [docs/03-ORACLE_DATABASE_ARCHITECTURE.md](docs/03-ORACLE_DATABASE_ARCHITECTURE.md) — node-oracledb Thin, wallet mTLS, LOW/HIGH pools, transactions
4. [docs/04-AUTHENTICATION_RBAC_SECURITY.md](docs/04-AUTHENTICATION_RBAC_SECURITY.md) — sessions, RBAC, data scope, security controls
5. [docs/05-CONFIGURATION_OPERATIONS.md](docs/05-CONFIGURATION_OPERATIONS.md) — config, secrets, logging, health, shutdown, cutover
6. [docs/06-ARCHITECTURE_DECISIONS_GUIDELINES.md](docs/06-ARCHITECTURE_DECISIONS_GUIDELINES.md) — locked ADRs and prohibited shortcuts

Later locked owner decisions for authentication, MFA, sessions, recovery and RBAC are in
[docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md](docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md)
and prevail over contradictory older behavioural statements in 01–06; the locked RBAC tables are
documented in [docs/rbac-schema/](docs/rbac-schema/README.md).

Developer handbook (how the standards above are implemented and how to add work):
[docs/README.md](docs/README.md) (backend index),
[docs/DEVELOPER-MODULE-GUIDE.md](docs/DEVELOPER-MODULE-GUIDE.md),
[docs/API-AND-DATABASE-CHANGE-WORKFLOW.md](docs/API-AND-DATABASE-CHANGE-WORKFLOW.md),
[docs/BACKEND-TESTING.md](docs/BACKEND-TESTING.md), and the team-wide
[../docs/README.md](../docs/README.md) (onboarding, feature delivery workflow and approval gates,
security essentials, handoff template).

## Stack

Node.js 24 LTS · JavaScript ES Modules · Express 5 · Joi · Pino · Helmet · OpenAPI 3.1 + Swagger UI ·
`node:test` + Supertest · ESLint + Prettier.

## Commands

- `npm run dev` — start with watch mode (loads `.env` if present; copy from `.env.example`)
- `npm start` — start the server
- `npm run db:status` — standalone LOW/HIGH connectivity check with its own pools (not live server stats)
- `npm test` — run tests (`tests/setup.js` forces `NODE_ENV=test`; Oracle is replaced by test doubles)
- `npm run check` — lint, format check and tests; must pass before handing over work

## Implementation rules

- Feature code lives in `src/modules/<domain>/<feature>/` as `*.routes.js`, `*.controller.js`,
  `*.service.js`, `*.repository.js`, `*.validation.js`. SQL only in repositories; business rules only in services.
  (The foundation modules `auth`, `users`, `access-control`, `audit` and `notifications` are single-level
  folders under `src/modules/`, as listed in docs/01 §3.)
- Reuse the shared foundation; never duplicate it:
  - Config: `src/config/index.js` (Joi-validated). Never read `process.env` elsewhere.
  - Logging: `logger` from `src/shared/logger/`. No `console.*`; never log secrets, cookies or full bodies.
  - Validation: `validate({ params, query, body })` from `src/middleware/validate.js` with
    feature-owned Joi schemas in `*.validation.js`. Unknown fields are rejected.
  - Responses: `sendSuccess` / `sendError` from `src/shared/responses/apiResponse.js`.
  - Errors: throw `AppError(status, CODE, safeMessage, details?)`; `src/middleware/errorHandler.js`
    is the only place that formats errors. Do not write per-controller `try/catch` responses.
- New business APIs go under `/api/v1`, and each one is documented in `docs/openapi/openapi.yaml` in the same change.
- Oracle: only through `src/database/oracle.js` (`withConnection`, `withTransaction`) with bind
  variables. `POOLS.LOW` for APIs and all writes; `POOLS.HIGH` only for approved analytics. A
  transaction stays on one connection and one pool; repositories never commit or roll back.
  Do not create tables, SQL scripts or schema changes without approval.
- Wallets live in `../secrets/` (git-ignored). Never print, copy or commit wallet contents or credentials.
- No temporary auth or permission bypasses. No speculative modules, base classes, generic repositories, ORMs, Redis, queues or Docker.
- Do not claim a test passed unless it was executed.

## Current state

Foundation: HTTP (config, logging, request IDs, envelopes, errors, Helmet, Swagger UI at
`/api/docs` for development/test only) and Oracle (Thin-mode wallet mTLS, named LOW/HIGH pools,
transactions, `GET /health/live`, `GET /health/ready`).

Implemented and verified on Oracle TEST (phase records in [docs/handoffs/](docs/handoffs/),
status in [docs/08-IMPLEMENTATION_STATUS.md](docs/08-IMPLEMENTATION_STATUS.md)); 51 operations are
documented in `docs/openapi/openapi.yaml`:

- `src/modules/auth/` — `/api/v1/auth`: password login, server sessions (HttpOnly `__Host-` cookie,
  Origin check + session-bound `X-CSRF-Token`), TOTP MFA (challenge, enrollment, verification,
  replacement), password policy and change, and recovery (password setup/reset, MFA recovery).
- `src/modules/access-control/` — request-time `authorize('MODULE.RESOURCE', 'ACTION')` evaluator
  (default deny, DENY overrides win, MFA-verified session for security administration),
  `GET /api/v1/access-control/me/permissions` (effective permissions), and RBAC administration:
  roles, permission catalogue, role grants, user roles, overrides, effective permissions of a user.
- `src/modules/users/` — `/api/v1/users`: account list, provisioning candidates, details,
  provisioning, activation, disabling, session revocation, and administrator-issued
  password-setup/recovery links, with the protected administrator hierarchy.
- `src/modules/audit/` — append-only security audit writer (`XX_ZRV_RBAC_AUDIT_LOGS`).
- `src/modules/notifications/` — Office 365 SMTP delivery; delivery-dependent flows fail closed when
  it is not configured.

These APIs are consumed by the frontend's authentication pages, effective-permission layer and
Security Administration screens (`client/src/features/`); keep their contracts compatible.

Mandatory administrator MFA is controlled by `AUTH_ADMIN_MFA_REQUIRED` (default `true`). The
exceptions are local `NODE_ENV=development` on loopback with `TRUST_PROXY_HOPS=0`, and the explicit
`APP_ENV=Test` shared test profile. Test disables administrator MFA on the LAN; sessions are never
marked MFA-verified. Keep Test on the trusted test network. **UAT and production must require MFA.**
The exceptions are enforced by `src/config/index.js` and applied through `evaluateMfaRequirement`
and the authorization evaluator. See
[../docs/SECURITY-ESSENTIALS.md](../docs/SECURITY-ESSENTIALS.md).

Product identity: **Zamil Digitalization**, release **V 2.1.0**, defined once in
`src/config/product.js` (version equal to `package.json`). Technical identifiers (`zamil-revamp`,
`XX_ZRV_*`, cookie names, `/api/v1`) are unchanged.

Not yet implemented: security audit retrieval API, reminder sending, and all business modules.
The application is **not production-ready**; open blockers are listed in
[docs/handoffs/PHASE-07-BACKEND-FINALIZATION.md](docs/handoffs/PHASE-07-BACKEND-FINALIZATION.md) §9.
