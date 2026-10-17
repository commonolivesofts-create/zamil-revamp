# Zamil Revamp
## Backend API Design & Development Standards

| Document control | Details |
|---|---|
| **Document ID** | ZR-BE-API-02 |
| **Version** | 1.0 |
| **Status** | Issued for technical review |
| **Architecture baseline** | V1.0 — approved 16 October 2026 |
| **Applies to** | `zamil-revamp/server/` |
| **Audience** | Backend and frontend developers, technical leads, QA and integration teams |
| **Related standard** | [01 — System Architecture & Folder Structure](./01-SYSTEM_ARCHITECTURE.md) |

---

## 1. Purpose and Scope

This document defines how REST APIs are designed, built, documented, tested and maintained in **Zamil Revamp**. All backend developers follow the same contracts so that frontend teams receive predictable endpoints, errors and pagination behavior, regardless of which business module owns an API.

The backend uses **JavaScript (ES Modules), Node.js 24 LTS and Express 5**, organized as a **modular monolith** with feature-owned routes, controllers, services, repositories and Joi validation schemas. Authentication, authorization, response formatting, logging and Oracle connectivity are centralized.

Zamil Revamp modernizes an existing **PHP CodeIgniter 3 (CI3)** application. The existing Oracle ADW business schema, verified business rules, report calculations and active integration behavior remain the reference unless an enhancement is expressly approved. This document does **not** define actual CI3 database objects or final business endpoint payloads; those are established when the relevant source and schema are reviewed.

The complete folder architecture is in Document 01. Oracle pool/transaction details, authentication/RBAC mechanisms and deployment concerns belong to Documents 03, 04 and 05 respectively.

## 2. API Design Principles

Every API must be:

- **Consistent:** Use the common URL, HTTP method, JSON response, error and validation rules.
- **Business-oriented:** Represent a business resource or approved action, not the internal database table layout.
- **Secure by default:** Do not treat client-supplied identity, organization, role or permission values as authorization evidence.
- **Bounded:** Limit input size, page size, query duration and expensive report/export workloads.
- **Traceable:** Use a request correlation ID and meaningful operational logs without recording secrets.
- **Documented:** Maintain an accurate OpenAPI 3.1 definition viewable through centralized Swagger UI.
- **Compatible:** Review existing CI3 behavior and affected API consumers before replacing or changing functionality.

A confirmed legacy requirement may justify a documented exception. An exception is not permission to create a second project-wide API convention.

## 3. Endpoints, HTTP Methods and Versioning

### 3.1 URL conventions

New APIs use the **`/api/v1`** prefix. Paths use lowercase words separated by hyphens, normally with plural resource names. Include a business domain when it improves clarity.

| Purpose | Illustrative route |
|---|---|
| Employee collection | `GET /api/v1/hr/employees` |
| Employee details | `GET /api/v1/hr/employees/:id` |
| Update employee | `PATCH /api/v1/hr/employees/:id` |
| Work order collection | `GET /api/v1/production/work-orders` |
| Complete work order | `POST /api/v1/production/work-orders/:id/complete` |
| Downtime report | `GET /api/v1/production/reports/downtime` |
| Inventory transactions | `GET /api/v1/inventory/transactions` |

These illustrate naming conventions; they do not assert that any such endpoints or fields already exist. Actual contracts require feature-level verification.

### 3.2 Method responsibilities

| Method | Use | Rule |
|---|---|---|
| `GET` | Read one resource, collection or report | Does not change business state. |
| `POST` | Create a resource or perform an approved business action | Protect critical operations against duplicate submission. |
| `PATCH` | Update specified fields | Update only authorized, validated fields. |
| `PUT` | Replace a resource where full replacement is appropriate | Do not use for routine partial edits. |
| `DELETE` | Delete where permitted by the business process | Verify whether the existing process requires physical deletion, logical deletion or prevention. |

Business state transitions such as `approve`, `release`, `complete`, `cancel` or `post` may use explicit `POST /:id/action` routes. Avoid action names like `getEmployee` for ordinary reads.

Use route parameters for resource identity, query parameters for filters/search/page selection, and the request body for create/update data.

### 3.3 Compatibility and version changes

Changes to request fields, response structure, error behavior, routes or business outcomes must be checked against known CI3 and integration consumers. Compatible additions may stay within `v1`. A breaking change needs approval and a documented version or compatibility plan. Existing consumers are not retired solely because React uses a newer endpoint.

## 4. Request Contract and Data Conventions

Each endpoint specification identifies **purpose, method/path, authentication, required permission and data scope, parameters, body, success responses, error outcomes and side effects**.

| Area | Convention |
|---|---|
| JSON field naming | Use `camelCase` for new APIs unless a verified external/legacy contract requires otherwise. |
| Bodies | Use `application/json` for ordinary writes; accept only explicitly approved properties. |
| Path IDs | Validate syntax; check resource existence and access independently. |
| Dates | Date-only values: `YYYY-MM-DD`; do not automatically interpret business dates as UTC timestamps. |
| Timestamps | ISO 8601 with `Z` or an explicit offset; document the meaning of each timestamp. |
| Booleans | JSON `true`/`false`; parse query-string booleans explicitly. |
| Decimal amounts and large IDs | Document safe precision and serialization; do not silently lose Oracle `NUMBER` precision. |
| Status values | Use the verified business statuses and transitions, not invented universal enums. |
| Unknown writable fields | Reject by default to prevent mass assignment. |

The backend uses trusted session identity for the actor. Query/body fields such as organization or owner are filters or requested attributes, **not proof that the caller may act for that organization or owner**.

## 5. Standard JSON Response Contract

All ordinary JSON APIs use the same envelope. File responses and `204 No Content` are exceptions described below.

### 5.1 Success

```json
{
  "success": true,
  "data": {
    "id": 101,
    "status": "ACTIVE"
  },
  "meta": {
    "requestId": "req-7c19a5"
  }
}
```

`data` contains endpoint-specific approved fields. The values above illustrate the response shape; they do not represent a verified business record. Do not introduce competing collection keys such as `records`, `result` or `items` without an approved compatibility requirement.

### 5.2 Paginated list

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "requestId": "req-7c19a5"
  }
}
```

No matches means `200` and an empty `data` array. The example uses the standard **total-count pagination contract**. If an approved high-volume endpoint uses cursor pagination or does not return an exact total, its alternative contract must be documented explicitly rather than silently omitting fields.

### 5.3 Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "page",
        "message": "Page must be a positive integer"
      }
    ]
  },
  "meta": {
    "requestId": "req-7c19a5"
  }
}
```

`error.code` is stable and suitable for frontend branching. `error.message` is safe for user display. `details` is included when helpful and safe; sensitive input values, Oracle internals and stack traces are not returned.

### 5.4 HTTP statuses

| Status | Standard use |
|---|---|
| `200` | Successful read, update or action returning content. |
| `201` | Resource created. |
| `202` | Accepted for asynchronous processing, not yet complete. |
| `204` | Successful operation **without a response body**. |
| `400` | Invalid syntax, request parameters or Joi validation failure. |
| `401` | Missing, invalid or expired authentication. |
| `403` | Authenticated but not authorized. |
| `404` | Resource not found or concealed by access policy. |
| `409` | Conflict, duplicate or disallowed resource state. |
| `422` | Documented semantic/business-rule rejection, where appropriate. |
| `429` | Rate limit exceeded. |
| `500` | Unexpected internal error. |
| `502` / `503` / `504` | Upstream or service failure, chosen according to the actual condition. |

Do not return HTTP `200` with `success: false` for normal failures. A `202` response must communicate the truthful processing status, with a status-retrieval mechanism where the workflow supports one. Binary downloads or streams use the correct content type and disposition rather than a JSON envelope.

## 6. Joi Validation and Request Security

**Joi** is the approved request-validation library. Each feature owns its schemas in `*.validation.js`. Shared middleware applies the schema, passes normalized/validated input onward and translates failures into the standard response.

| Validation concern | Required approach |
|---|---|
| URL parameters | Validate identifier formats and supported values. |
| Query parameters | Validate page, limit, search, sort, date ranges and approved filters. |
| Body | Require necessary fields; enforce types, bounds and allowed writable fields. |
| Cross-field checks | Validate combinations and relationships that can be checked from the request. |
| Business rules | Enforce in the service against current trusted data. |
| Authorization | Check centrally and enforce actual record/organization scope within the business operation. |
| Database integrity | Preserve and respect existing Oracle constraints. |

Joi validation cannot replace permission checks or database constraints. Do not build SQL from raw `req.query` or accept user-controlled sort-column names without an allowlist. An authenticated session and CSRF protection are required where applicable for cookie-authenticated write operations.

Rejected validation fields should be expressed as safe field paths and clear messages. For ordinary Joi errors, use `400` with `VALIDATION_ERROR`. Use `409` or `422` for documented business/conflict outcomes, not interchangeably for every error.

## 7. Filtering, Searching, Pagination and Exports

The frontend requests **only the required page**. Server-side pagination must not be simulated through repeated fetching of every backend page.

| Query parameter | Standard |
|---|---|
| `page` | Positive integer; default `1`. |
| `limit` | Positive integer; default `25`, general maximum `100`. |
| `search` | Trimmed, bounded text searching only approved fields. |
| `sortBy` | One of the endpoint's explicitly allowed fields. |
| `sortOrder` | `asc` or `desc` only. |
| Feature-specific filters | Explicitly defined, typed and validated per endpoint. |

### Query behavior

- Apply filtering and search **in Oracle**, before pagination.
- Use a stable, deterministic `ORDER BY` with a unique tie-breaker where needed.
- Bind input values. Dynamic SQL identifiers come from a fixed server-side allowlist, not from user text.
- Calculate totals when required by the approved contract; avoid repeated expensive count queries.
- Use cursor/keyset pagination selectively when offset pagination is unsuitable; document a distinct response contract.
- Reject or bound requests that could trigger uncontrolled full-table scans or excessive processing.

### Reporting and exports

Standard interactive APIs use the centralized Oracle **LOW** pool. Approved complex analytical reports use **HIGH**, with concurrency and timeout controls. Complex SQL is not automatically assigned to HIGH without review; the existing CI3 reporting behavior is the starting point for compatibility tests.

Exports use separate, authorized endpoints with bounded work. An unlimited `limit` parameter is **not** an export mechanism. Large exports should stream or use a controlled asynchronous workflow where justified, and must not load unbounded datasets into Node.js memory. Report-specific filters, export permissions, output format and retention are documented per feature.

## 8. Swagger UI and OpenAPI 3.1 Standards

**OpenAPI 3.1** is the authoritative machine-readable description of the HTTP contract. **Swagger UI** provides one interactive API catalog for the backend and frontend teams. It is developer tooling, not a business module and not an authorization mechanism.

### 8.1 Location and organization

| Component | Planned location / responsibility |
|---|---|
| Source specifications | `server/docs/openapi/` |
| Root specification | `server/docs/openapi/openapi.yaml` |
| Interactive reference | `/api/docs` (proposed route) |
| Machine-readable specification | `/api/openapi.json` (proposed route) |
| Feature ownership | The developer changing an endpoint maintains its contract. |

Start with one root specification and reusable shared schemas. Split the source into domain/feature files only when the specification becomes difficult to maintain. **One centrally presented Swagger UI** is preferred over a different Swagger instance for each module. The route names are intended conventions and may be finalized during foundation setup.

### 8.2 What every endpoint must document

| OpenAPI element | Required information |
|---|---|
| Path, method and `operationId` | Exact endpoint and a stable, unique operation name. |
| Tags and summary | Business domain and concise purpose; e.g., HR or Production. |
| Description | Processing intent, relevant side effects and important business constraints. |
| Parameters | Path/query fields, types, defaults, permitted values and examples. |
| Request body | Content type, required fields, accepted values and validated schema. |
| Responses | Success HTTP statuses, standard envelopes, domain fields and documented error cases. |
| Security | Session/cookie authentication where required; any CSRF requirement for interactive writes. |
| Authorization | Required resource/action permission and applicable data scope stated clearly. |
| Pagination | Query limits, filter/search/sort behavior and response metadata. |
| Examples | Realistic illustrations consistent with Joi and actual responses; do not expose private data. |

Use shared OpenAPI components for the standard success/error shapes, pagination metadata, security scheme and common parameters. Feature-specific `data` schemas remain in the owning feature specification. Avoid copying large identical schema fragments across endpoints.

For the approved **server-side cookie-session model**, document the cookie-based authentication requirement in the OpenAPI security scheme once the actual cookie name is established. For state-changing requests, also document the agreed CSRF-token exchange/header when its implementation is finalized. Authentication cookies, CSRF tokens, passwords and internal permission data must never appear as hardcoded example credentials.

A resource permission is a **business rule in the endpoint description**, enforced by Express. The OpenAPI `security` declaration describes authentication, but does not by itself enforce RBAC, record-level scope or CSRF controls.

### 8.3 Swagger UI access and interactive testing

- Enable interactive **Try it out** for approved development and UAT usage where properly secured.
- All tested APIs still enforce authentication, CSRF, rate limits and backend permissions.
- Restrict production documentation access according to the selected deployment/security policy; do not expose internal reference material indiscriminately.
- Avoid embedding live passwords, bearer tokens, wallet credentials or production records in specifications or examples.
- Do not enable state-changing production requests merely to make Swagger demonstrations convenient.

### 8.4 Documentation quality gate

OpenAPI changes accompany endpoint code changes in the same review. Before acceptance, confirm that paths and methods exist, schemas reflect Joi validation, response/error examples match behavior, permission notes are accurate, and the OpenAPI document validates against version **3.1**. An undocumented endpoint is not considered complete. The frontend team uses Swagger UI as the common contract reference, not as a replacement for integrated API tests.

## 9. Controller–Service–Repository Responsibilities

A feature owns its own HTTP and database behavior while using centralized middleware and Oracle infrastructure.

```text
modules/
└── production/
    └── work-orders/
        ├── workOrder.routes.js
        ├── workOrder.controller.js
        ├── workOrder.service.js
        ├── workOrder.repository.js
        └── workOrder.validation.js
```

| Layer | Owns | Must not do |
|---|---|---|
| Route | Define endpoint and shared authentication/permission/validation middleware. | Implement complex business rules or SQL. |
| Controller | Work with validated HTTP input and format the standard response. | Create Oracle pools or own transactions. |
| Service | Enforce business and data-scope rules; coordinate repositories and integration flows. | Depend directly on Express response objects. |
| Repository | Execute verified Oracle SQL/PLSQL and map database results. | Format HTTP responses or commit another layer's transaction. |
| Validation | Joi schemas for incoming request data. | Perform persistence or external network calls. |

Cross-feature dependencies use the owning module's service interface, not private repository imports. Multi-repository transactions use **one shared database connection** controlled by the service. An operation must not switch between LOW and HIGH mid-transaction. External Oracle Fusion/OIC/WMS calls belong to approved integration clients coordinated by the owning service.

## 10. Centralized Errors, Correlation and Async Processing

Express 5 forwards rejected asynchronous route-handler promises to centralized error middleware. Use shared application-error categories and one error translator instead of bespoke `try/catch` HTTP responses throughout every controller.

Suggested stable error-code families include `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `CONFLICT`, `BUSINESS_RULE_VIOLATION` and `INTERNAL_ERROR`. Business modules may extend these through reviewed, documented codes.

For each request, generate or securely accept a validated correlation ID and return it in `meta.requestId` for JSON responses. **Pino** logs request outcomes, durations and safe diagnostics with sensitive-field redaction. Business/security audit events remain separate from technical logs. Do not log request bodies by default for authentication, financial or other sensitive operations.

For asynchronous and integration-related operations:

- `202` means **accepted**, not completed; return a truthful processing status.
- Business-critical create/post actions need appropriate uniqueness and idempotency controls.
- An HTTP timeout does not prove that an Oracle or external-system write failed.
- Do not automatically retry uncertain writes or switch failed writes from LOW to HIGH.
- Limit concurrent report/export operations and bound request, pool-wait and query durations.

## 11. JavaScript Code Quality and Testing

Use approved **JavaScript ES Modules** and keep implementation straightforward. Naming should remain consistent: `camelCase` functions and variables; explicit filenames such as `employee.service.js`; descriptive constants. Prefer `const`, use `async`/`await`, and avoid unnecessary dependencies or generic base controller/repository frameworks.

| Area | Project standard |
|---|---|
| Lint/format | ESLint and Prettier. |
| Interface documentation | Targeted JSDoc for public contracts and non-obvious behavior. |
| Unit tests | Node.js built-in test runner. |
| HTTP tests | Supertest. |
| Database tests | Isolated nonproduction Oracle environment. |
| API documentation | OpenAPI 3.1 validated and presented through Swagger UI. |

Test appropriate success, validation, authentication, permission, data-scope, conflict, pagination, transaction rollback, query failure and external-integration scenarios. Report APIs additionally require filter-boundary, concurrency and performance checks. Compare accepted business outcomes with the existing CI3 feature when replacing it.

A completed change report identifies files modified, tests **actually run**, results, limitations and any cutover impact. Do not claim that a database call, integration or load scenario was tested unless it was executed.

## 12. Feature Delivery Rules and Open Items

Before starting an API, verify its CI3 controllers/models, SQL, database dependencies, business rules, consumers and side effects. Then identify the owning feature, required resource permission, validation contract, repository query, pool routing, error cases and OpenAPI definition. Implement only the approved feature scope; unrelated changes require separate review.

**Approved boundaries:** Existing business tables and rules are preserved unless a justified change is approved. New RBAC tables will be designed after the initial backend foundation is established. Legacy CI3 user migration is independently managed and **outside the project development scope**.

The following are not defined by this document and remain pending their appropriate stages: physical RBAC and session tables, exact session timeout values and MFA implementation, final Oracle pool sizes, hosting/deployment packaging, and actual feature-specific database contracts.

## 13. Related Documents

| Document | Responsibility |
|---|---|
| [01-SYSTEM_ARCHITECTURE.md](./01-SYSTEM_ARCHITECTURE.md) | System pattern, folder structure, business boundaries and request lifecycle. |
| **02-API_DEVELOPMENT_STANDARDS.md** | API design, validation, response schema, Swagger/OpenAPI and development quality (this document). |
| `03-ORACLE_DATABASE_ARCHITECTURE.md` | Oracle ADW driver, wallet, LOW/HIGH pools, SQL, transactions and database governance. |
| `04-AUTHENTICATION_RBAC_SECURITY.md` | Login/session security, resource RBAC, scopes, authorization and audit controls. |
| `05-CONFIGURATION_OPERATIONS.md` | Runtime configuration, environment separation, monitoring, hosting and release controls. |
| `06-ARCHITECTURE_DECISIONS_GUIDELINES.md` | Locked decisions, implementation restrictions, exceptions and developer review guidance. |

**Document maintenance:** Change a rule in its owning document, and reflect architectural changes in the ADR register. Keep this document and the published OpenAPI specification aligned with the implementation.

---

*Document end — ZR-BE-API-02 · Version 1.0*
