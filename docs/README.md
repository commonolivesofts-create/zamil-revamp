# Zamil Digitalization — Developer Documentation

This is the entry point for everyone who builds Zamil Digitalization features, whether by hand or with an
AI coding assistant. The documents describe **what already exists** and **how to extend it**
without creating parallel infrastructure.

## Current development handover gate

Before adding a new business module, read the [pre-module repository audit and readiness gates](DEVELOPER-HANDOVER-GATE.md) and [form and UX quality standard](FORM-UX-QUALITY.md). Historical phase reports retain their original dates; do not interpret an old branch label as current.

## Reading order

| # | Document | Read it to learn |
|---|---|---|
| 1 | [Developer onboarding](DEVELOPER-ONBOARDING.md) | Prerequisites, installation, running, lint, tests, build, troubleshooting |
| 2 | [Git & GitHub policy](../CONTRIBUTING.md) | Branches, commits, Pull Requests, sensitive files (approved policy) |
| 3 | [Feature delivery workflow](FEATURE-DELIVERY-WORKFLOW.md) | The one lifecycle every feature follows, approval gates, definition of done |
| 4 | [Security essentials](SECURITY-ESSENTIALS.md) | The non-negotiable security rules and where they are implemented |
| 5 | [Frontend documentation](../client/docs/README.md) | React architecture, shared building blocks, adding a module, testing |
| 6 | [Backend documentation](../server/docs/README.md) | Approved architecture set, module guide, API/database change workflow, testing |
| 7 | [Feature handoff template](FEATURE-HANDOFF-TEMPLATE.md) | What to record when a feature is delivered |
| 8 | [AI assistant starter prompt](AI-ASSISTANT-STARTER.md) | A reusable prompt that makes any assistant follow these standards |
| 9 | [Administrator guide: role permissions and sidebar access](ADMIN-GUIDE-ROLE-PERMISSIONS.md) | Granting several permissions to a role, reading the results, why a page does not appear |

Frontend-only developers can skip the backend module guide; backend-only developers can skip the
frontend new-feature guide. Everyone reads 1–4.

## Authority

1. The six approved backend architecture documents
   ([`server/docs/01`–`06`](../server/docs/README.md#approved-architecture-set)) and the locked
   authentication/RBAC requirements ([`server/docs/07`](../server/docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md))
   are the governing standards. Where 07 records a later locked owner decision, it prevails over
   older behavioural statements in 01–06.
2. The deployed Oracle data dictionary is authoritative for actual tables, columns and constraints.
3. These developer guides explain how the standards are **implemented in the current source** and
   how to apply them. They do not change an approved decision. If a guide and an approved document
   disagree, raise it for review instead of choosing one silently.

## Where each locked standard is implemented

| Standard | Implemented in |
|---|---|
| One React/Vite frontend and one Node/Express backend in one repository | `client/`, `server/` |
| Feature-oriented frontend modules | `client/src/features/<feature>/` |
| Feature-oriented backend modules, Controller → Service → Repository | `server/src/modules/<module>/` (`*.routes.js`, `*.controller.js`, `*.service.js`, `*.repository.js`, `*.validation.js`) |
| REST `/api/v1` | `server/src/app.js` mounts `server/src/routes/api.routes.js` at `/api/v1` |
| Joi validation | `server/src/middleware/validate.js` + feature `*.validation.js` |
| Pino logging | `server/src/shared/logger/index.js` |
| OpenAPI 3.1 | `server/docs/openapi/openapi.yaml`, served by `server/src/routes/docs.routes.js` (when `API_DOCS_ENABLED`) |
| Oracle ADW Thin + wallet, LOW/HIGH pools, transactions | `server/src/database/oracle.js`, `server/src/database/wallet.js` |
| Existing CI3 schema compatibility | Policy: [`server/docs/03` §9](../server/docs/03-ORACLE_DATABASE_ARCHITECTURE.md); locked RBAC tables: [`server/docs/rbac-schema/`](../server/docs/rbac-schema/README.md) |
| HttpOnly session cookie, CSRF, MFA | `server/src/middleware/authenticate.js`, `csrf.js`, `mfaChallenge.js`; `server/src/modules/auth/`; frontend `client/src/features/auth/`, `client/src/services/api/csrfStore.js` |
| Mandatory administrator MFA (`AUTH_ADMIN_MFA_REQUIRED`, local/Test exceptions) | `server/src/config/index.js`, `server/src/modules/auth/auth.eligibility.js` (`evaluateMfaRequirement`), `server/src/modules/access-control/authorization.service.js`; see [Security essentials](SECURITY-ESSENTIALS.md#mandatory-administrator-mfa-and-non-production-exceptions) |
| Product identity: Zamil Digitalization, V 2.1.0 | `server/src/config/product.js`, `client/src/config/appConfig.js` (versions equal to each `package.json`) |
| Backend-authoritative effective permissions | `server/src/middleware/authorize.js`, `server/src/modules/access-control/authorization.service.js`; frontend `client/src/features/access/` |
| Protected routes and centralized navigation | `client/src/config/appNavigation.js`, `client/src/routes/RouteGuards.jsx`, `client/src/app/router.jsx` |
| Shared Fetch client | `client/src/services/api/apiClient.js` |
| Existing visual design system | `client/public/orvexa/assets/css/`, `client/src/styles/`, `client/src/components/` |
| No fake production data or placeholder functionality (ZRV-FE-005) | Enforced by review and by `client/tests/productionReadiness.test.mjs`, `client/tests/navigation.test.mjs` |
| `main` stays stable; feature branches and reviewed PRs | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| No credentials in the repository | Root `.gitignore` (`/secrets/`, `.env*`, wallet/key files); [Security essentials](SECURITY-ESSENTIALS.md) |

Do **not** create an alternative authentication system, HTTP client, navigation registry,
permission store, database layer or design system. Extend the ones listed above.

## Feature records

- Backend phase handoffs: [`server/docs/handoffs/`](../server/docs/handoffs/) (historical records; do not rewrite).
- Backend implementation status: [`server/docs/08-IMPLEMENTATION_STATUS.md`](../server/docs/08-IMPLEMENTATION_STATUS.md).
- New features: one handoff per feature using the [template](FEATURE-HANDOFF-TEMPLATE.md).
