# Zamil Revamp

Zamil Revamp modernizes an existing PHP CodeIgniter 3 (CI3) enterprise application into a
**React frontend** and a **Node.js/Express backend** over the existing **Oracle Autonomous
Database (ADW)** business schema.

> **Status:** feature-development-ready foundation. Authentication, MFA, sessions, recovery,
> backend-authoritative RBAC, user administration and the Security Administration screens are
> implemented. The application is **not** production-deployment-ready; open blockers are listed in
> [`server/docs/handoffs/PHASE-07-BACKEND-FINALIZATION.md`](server/docs/handoffs/PHASE-07-BACKEND-FINALIZATION.md)
> and [`client/README.md`](client/README.md).

## Architecture in one page

| Area | Standard | Where it lives |
|---|---|---|
| Repository | One Git monorepo: one frontend, one backend | `client/`, `server/` |
| Frontend | React 19, Vite 8, React Router, feature-oriented folders, existing design system | [`client/docs/`](client/docs/README.md) |
| Backend | Node.js 24, Express 5, ES Modules, modular monolith, Controller → Service → Repository | [`server/docs/`](server/docs/README.md) |
| API | REST under `/api/v1`, standard JSON envelope, Joi validation, OpenAPI 3.1 | [`server/docs/02-API_DEVELOPMENT_STANDARDS.md`](server/docs/02-API_DEVELOPMENT_STANDARDS.md) |
| Database | Oracle ADW, `node-oracledb` Thin mode with wallet mTLS, LOW/HIGH pools, bind variables | [`server/docs/03-ORACLE_DATABASE_ARCHITECTURE.md`](server/docs/03-ORACLE_DATABASE_ARCHITECTURE.md) |
| Security | HttpOnly server sessions, CSRF, MFA, backend-authoritative RBAC | [`server/docs/04-AUTHENTICATION_RBAC_SECURITY.md`](server/docs/04-AUTHENTICATION_RBAC_SECURITY.md), [`docs/SECURITY-ESSENTIALS.md`](docs/SECURITY-ESSENTIALS.md) |
| Logging | Pino structured logs with request IDs | `server/src/shared/logger/` |
| Tests | Node built-in test runner; Supertest on the backend | [`client/docs/FRONTEND-TESTING.md`](client/docs/FRONTEND-TESTING.md), [`server/docs/BACKEND-TESTING.md`](server/docs/BACKEND-TESTING.md) |

## Getting started

1. Read [`docs/README.md`](docs/README.md) — the documentation index and reading order.
2. Set up your environment with [`docs/DEVELOPER-ONBOARDING.md`](docs/DEVELOPER-ONBOARDING.md)
   (frontend on `http://localhost:5199`, backend on `http://localhost:3000`).
3. Deliver work with [`docs/FEATURE-DELIVERY-WORKFLOW.md`](docs/FEATURE-DELIVERY-WORKFLOW.md) and
   the Git policy in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Contributing

All changes reach `main` through a reviewed Pull Request from a dedicated branch; see
[`CONTRIBUTING.md`](CONTRIBUTING.md). **This repository is public:** never commit credentials,
Oracle wallets, `.env` files, employee data or production records.
