# API and Database Change Workflow

How to add or change an endpoint, and how to inspect or change the Oracle database safely. The
governing standards are [02 — API](02-API_DEVELOPMENT_STANDARDS.md) and
[03 — Oracle](03-ORACLE_DATABASE_ARCHITECTURE.md); this guide turns them into steps and points to
the implementing code.

## Part A — API changes

### A1. Endpoint standards (summary of 02)

| Topic | Standard | Implemented by |
|---|---|---|
| Prefix | `/api/v1`, lowercase hyphenated plural resources, domain segment where useful | `src/app.js`, `src/routes/api.routes.js` |
| Methods | `GET` read, `POST` create/action (`POST /:id/action`), `PATCH` partial update, `PUT` full replace/idempotent set, `DELETE` per business rule | Module routers |
| JSON | camelCase fields; dates `YYYY-MM-DD`; instants ISO 8601 with offset/`Z`; Oracle `NUMBER` IDs as decimal strings | Repositories (`fetchInfo`), Joi schemas |
| Success | `{ "success": true, "data": …, "meta": { "requestId" } }` | `sendSuccess` |
| List | `data` array + `pagination: { page, limit, total, totalPages, hasNextPage, hasPreviousPage }` | `sendPaginated` |
| Error | `{ "success": false, "error": { code, message, details? }, "meta": { requestId } }` | `AppError` + `errorHandler` |
| Status codes | 200, 201, 202, 204, 400 (validation), 401, 403, 404, 409, 422 (documented business rule), 429, 5xx | `AppError(status, …)` |
| Validation | Joi for params, query, body; unknown fields rejected | `validate()` |
| Pagination | `page` ≥ 1 default 1; `limit` default 25, max 100; `search` trimmed and bounded; `sortBy` from an allowlist; `sortOrder` `asc`/`desc` | Feature `*.validation.js` + repository allowlists |
| Security | Session cookie; `X-CSRF-Token` + Origin check on unsafe methods; `authorize()` per route | Middleware |
| Contract | OpenAPI 3.1 in the same change | `docs/openapi/openapi.yaml` |

### A2. Steps for a new or changed endpoint

1. **Design** method, path, permission (`MODULE.RESOURCE:ACTION`), data scope, request, response,
   errors and pool, consistent with existing endpoints.
2. **Compatibility:** compatible additions stay in `v1`. Changing or removing fields, status codes,
   error behaviour or routes that a consumer (frontend, CI3 integration) uses is a breaking change:
   approval and a compatibility plan first (02 §3.3; gate G3).
3. **Implement** per the [module guide](DEVELOPER-MODULE-GUIDE.md): guards in order
   `authenticate` → `requireCsrfToken` (unsafe methods) → `authorize` → `validate`.
4. **Document in OpenAPI** (`docs/openapi/openapi.yaml`):
   - `operationId`, tag, summary, description with the required permission and side effects;
   - parameters and request body matching the Joi schema;
   - success responses using the shared envelope components; documented error responses;
   - `security: [{ sessionCookie: [] }]` for authenticated routes and the CSRF header for changes
     (copy the pattern of existing `/api/v1/users` operations);
   - examples with fictional data only.
5. **List the route** in `tests/api-docs.test.js` with its security expectations.
6. **Test** (see [backend testing](BACKEND-TESTING.md)).
7. **Frontend:** if a screen consumes it, update the frontend contract reader and tests in the same
   PR or a linked one.

Swagger UI (`/api/docs`) and `/api/openapi.json` are available only when `API_DOCS_ENABLED=true`,
which configuration allows only for development and test.

## Part B — Oracle database

### B1. What exists and what is authoritative

- One existing Oracle ADW business database (shared with the running CI3 application), reached
  through two **services**: `LOW` (all APIs and all writes) and `HIGH` (approved heavy analytics).
  They are connection services, not separate databases.
- Connections: `node-oracledb` Thin mode with wallet mTLS (`src/database/wallet.js`), two named
  pools created once at startup (`src/database/oracle.js`).
- The **deployed data dictionary** is authoritative for tables, columns, types and constraints.
  Never infer a column from CI3 code alone; verify it.
- The 11 RBAC tables (`XX_ZRV_*`, documented in [`rbac-schema/`](rbac-schema/README.md)) and their
  122 columns are **locked**.
- There is no ORM and no startup migration.

### B2. Writing repository SQL

| Rule | How |
|---|---|
| Bind every value | Named binds (`:employeeNumber`); never concatenate input into SQL |
| Allowlist identifiers | Sort columns, directions and optional filter fragments from fixed server-side maps (see `SORT_COLUMNS`/`FILTERS` in `src/modules/users/users.repository.js`) |
| Explicit columns | No `SELECT *` in API contracts |
| Bounded results | `OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY` or `FETCH FIRST n ROWS ONLY` |
| Stable order | `ORDER BY` with a unique tie-breaker |
| Types | IDs read as strings (`fetchInfo: { ID_COLUMN: { type: oracledb.STRING } }`); keep date-only values as dates; preserve `NULL` meaning; no silent precision loss for amounts |
| Output | `outFormat: oracledb.OUT_FORMAT_OBJECT`; map to camelCase in the repository |
| Naming | SQL text uses the existing object names exactly. **No naming convention for new database objects has been approved**; a proposed name is part of the G1 change request (the existing RBAC tables use the `XX_ZRV_` prefix). |

### B3. Connections, pools and transactions

```js
import { POOLS, withConnection, withTransaction } from '../../database/oracle.js'

// Read
const rows = await withConnection(POOLS.LOW, (c) => repository.listThings(c, query))

// Write: one connection, one commit, rollback on any error, always released
await withTransaction(POOLS.LOW, async (c) => {
  await repository.updateThing(c, input)
  await auditService.record(c, event)        // same transaction where the audit row belongs with the change
})
```

- `LOW` for all interactive work and every write. `HIGH` only for routing explicitly approved for
  heavy analytics (03 §2.1); never switch pools inside a transaction.
- The service owns the transaction; repositories never commit or roll back.
- No `Promise.all` on one transaction connection; no external HTTP calls inside a transaction.
- Acquisition failures surface as `503 SERVICE_UNAVAILABLE`; a timed-out write has an **unknown**
  outcome — investigate and reconcile, never blindly retry.
- Never retry a failed write on the other service.

### B4. Read-only inspection vs. authorized writes

| Activity | Allowed without specific authorization? |
|---|---|
| Reading the data dictionary (`ALL_TAB_COLUMNS`, `ALL_CONSTRAINTS`, …) and `SELECT` on objects you are authorized to read, against TEST | Yes, with your issued TEST credentials |
| `npm run db:status`, `npm run db:verify-auth` and the `db:*-check` scripts (read-only by design) | Yes, against TEST |
| Signing in through the application against TEST | Yes for your authorized account — note it **writes** audit/session rows |
| Running `auth:*` operator test flows, `db:bootstrap-test -- --apply`, or any script/API call that changes data | **No** — only within an approved test plan |
| Any DML/DDL by hand, data fixes, seeding | **No** — approval required (G1) |
| Anything against production | **No** — outside development scope |

### B5. When a schema or data change is genuinely needed (gate G1)

Schema redesign is not part of feature work (03 §9). If an approved enhancement truly needs a
database change:

1. **Request:** business reason, exact objects and columns, data types, constraints, affected CI3
   consumers, data volume, rollback/forward-fix plan, grants needed.
2. **Approval:** explicit approval from the project owner / architecture lead **before** writing
   the change. Changes to locked RBAC tables, existing business tables or CI3-consumed behaviour
   additionally need G4 review and, for security tables, G2.
3. **Versioned script:** store the approved SQL/SQLcl script in version control with a unique
   change identifier and documented execution history. 01 §3 designates
   `server/database-changes/` for this; the folder does not exist yet and is created with the first
   approved change. No automatic migrations; Liquibase is not required (03 §9.2).
4. **TEST first:** apply in TEST by an authorized person; verify CI3 and Express compatibility;
   record the applied version and results.
5. **Recovery:** keep the documented recovery or forward-fix plan (DDL commits implicitly).
6. **Document:** handoff record with the change identifier, approval reference and verification.

### B6. Never

- Invent tables, columns, statuses or joins.
- Create tables or SQL scripts "for convenience", per-module pools, or retries of uncertain writes.
- Run destructive statements, or assume a test may write to TEST, without authorization.
- Put credentials, connection strings, wallet contents or real data in code, logs, tests or docs.
