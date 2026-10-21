# Backend Documentation (`server/`)

Node.js 24 + Express 5 (ES modules) modular monolith over Oracle ADW. Team-wide guides are in
[`../../docs/`](../../docs/README.md).

## Approved architecture set

These six documents are the approved backend architecture baseline. They are **not** renumbered or
rewritten by developer guides; change them only through the architecture change procedure in
[06 §7](06-ARCHITECTURE_DECISIONS_GUIDELINES.md).

| Document | Governs |
|---|---|
| [01 — System Architecture & Folder Structure](01-SYSTEM_ARCHITECTURE.md) | Modular monolith, folder structure, module boundaries, request flow |
| [02 — API Development Standards](02-API_DEVELOPMENT_STANDARDS.md) | `/api/v1` URLs, methods, envelopes, status codes, Joi, pagination, OpenAPI/Swagger |
| [03 — Oracle Database Architecture](03-ORACLE_DATABASE_ARCHITECTURE.md) | Thin driver + wallet, LOW/HIGH pools, SQL standards, transactions, schema change procedure |
| [04 — Authentication, RBAC & Security](04-AUTHENTICATION_RBAC_SECURITY.md) | Sessions, passwords, resource/action RBAC, data scope, security controls, audit |
| [05 — Configuration & Operations](05-CONFIGURATION_OPERATIONS.md) | Configuration, secrets, logging, health, shutdown, release and cutover |
| [06 — Architecture Decisions & Guidelines](06-ARCHITECTURE_DECISIONS_GUIDELINES.md) | Decision register, developer rules, prohibited shortcuts, delivery checklist |

## Locked requirements, status and records

| Document | Purpose |
|---|---|
| [07 — Authentication/RBAC Locked Requirements](07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md) | Later, explicitly locked owner decisions. **Prevails** over contradictory older behavioural statements in 01–06. |
| [08 — Implementation Status](08-IMPLEMENTATION_STATUS.md) | Backend phase tracker, open items and production blockers |
| [RBAC schema reference](rbac-schema/README.md) | The 11 locked RBAC tables (122 columns) |
| [Foundation verification](FOUNDATION_VERIFICATION.md) | Verification record of the initial foundation |
| [Phase handoffs](handoffs/) | Historical records of each backend phase (Phase 07 is the backend handover entry point) |
| [OpenAPI 3.1 contract](openapi/openapi.yaml) | Authoritative HTTP contract (served at `/api/openapi.json` and `/api/docs` when enabled) |

The deployed Oracle data dictionary is authoritative for actual tables, columns, constraints and
data types.

## Developer guides

| Guide | Read it to |
|---|---|
| [Developer module guide](DEVELOPER-MODULE-GUIDE.md) | Understand the implemented module pattern and add a backend module |
| [API and database change workflow](API-AND-DATABASE-CHANGE-WORKFLOW.md) | Add or change endpoints and propose Oracle changes safely |
| [Backend testing](BACKEND-TESTING.md) | Run and write tests; distinguish mocked tests from Oracle TEST verification |

## Target folders not created yet

| Item | Detail |
|---|---|
| Module layout | The foundation modules are single-level folders (`src/modules/auth`, `users`, `access-control`, `audit`, `notifications`), as listed in 01 §3. Business features follow the domain-first layout of 01 §3–4 (`src/modules/<domain>/<feature>/`). |
| `server/database-changes/` | Defined in 01 §3 as the home of approved versioned SQL changes; not created yet (no approved change has been delivered through it). |
| `src/integrations/`, `src/jobs/` | Target folders in 01 §3; not created yet. |
