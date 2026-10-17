# Zamil Revamp — Backend (`server/`)

Express 5 modular monolith modernizing a PHP CodeIgniter 3 application. The existing Oracle ADW
business schema and the React frontend (`client/`, never modified from here) are preserved.

## Architecture reference (source of truth)

Read before implementing; flag conflicts rather than choosing silently.

1. [docs/01-SYSTEM_ARCHITECTURE.md](docs/01-SYSTEM_ARCHITECTURE.md) — modular monolith, folder structure, request flow
2. [docs/02-API_DEVELOPMENT_STANDARDS.md](docs/02-API_DEVELOPMENT_STANDARDS.md) — REST, response envelope, Joi, pagination, OpenAPI
3. [docs/03-ORACLE_DATABASE_ARCHITECTURE.md](docs/03-ORACLE_DATABASE_ARCHITECTURE.md) — node-oracledb Thin, wallet mTLS, LOW/HIGH pools, transactions
4. [docs/04-AUTHENTICATION_RBAC_SECURITY.md](docs/04-AUTHENTICATION_RBAC_SECURITY.md) — sessions, RBAC, data scope, security controls
5. [docs/05-CONFIGURATION_OPERATIONS.md](docs/05-CONFIGURATION_OPERATIONS.md) — config, secrets, logging, health, shutdown, cutover
6. [docs/06-ARCHITECTURE_DECISIONS_GUIDELINES.md](docs/06-ARCHITECTURE_DECISIONS_GUIDELINES.md) — locked ADRs and prohibited shortcuts

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

Phases 01–02 provide the HTTP foundation (config, logging, request IDs, envelopes, errors, Helmet,
Swagger UI at `/api/docs` for development/test only) and the Oracle foundation (Thin-mode wallet
mTLS, named LOW/HIGH pools, transactions, `GET /health/live`, `GET /health/ready`). There are no
authentication, RBAC or business modules yet, and the app is not production-ready.
