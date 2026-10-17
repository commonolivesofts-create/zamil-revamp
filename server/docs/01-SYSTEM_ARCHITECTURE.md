# Zamil Revamp
## Backend System Architecture & Folder Structure

| Document control | Details |
|---|---|
| **Document ID** | ZR-BE-ARC-01 |
| **Version** | 1.0 |
| **Status** | Architecture reference — issued for review |
| **Architecture baseline** | V1.0, approved 16 October 2026 |
| **Applies to** | `zamil-revamp/server/` |
| **Audience** | Backend and frontend developers, technical leads, QA, integration and operations teams |
| **Related standards** | Documents 02–06 in `server/docs/` |

---

## 1. Purpose and Scope

This document defines the **backend architecture and project structure** for Zamil Revamp. It establishes how business features are organized, how requests pass through the application, and where common services belong. It is the primary architectural reference for developers joining the backend project.

Zamil Revamp modernizes an existing **PHP CodeIgniter 3 (CI3)** enterprise application. The target frontend is **React.js** and the backend is **Node.js / Express.js**. The existing **Oracle Autonomous Data Warehouse (ADW) Serverless** remains the business database.

The architecture is designed to be secure, maintainable and easy to extend. It favors clear responsibilities and shared foundations over excessive layers or infrastructure.

### Project boundaries

| Area | Requirement |
|---|---|
| Frontend | Developed separately in `client/`; frontend architecture documentation is maintained separately. |
| Backend | Built under `server/` using the structure and standards in this document. |
| Existing Oracle database | Existing business tables, records, views, procedures and approved business rules are preserved and reused. |
| Existing CI3 application | Remains operational until an approved transition. Existing functionality is reviewed before redevelopment. |
| Database changes | Allowed only when justified, reviewed and explicitly approved. |
| New user management and RBAC | New authentication/RBAC structures will be designed after initial backend foundation setup. Physical tables are not defined here. |
| Legacy user migration | Outside this development scope; managed independently by the project owner. |
| Hosting | Provider and deployment packaging remain open. The application design is platform-neutral. |

**Architectural principle:** Existing business behavior is the reference for modernization unless a documented enhancement changes it. A file name, Oracle column, table relationship or API contract must not be assumed without verification.

## 2. Architecture at a Glance

### 2.1 Architecture pattern

The backend is a **modular monolith**, organized by **business domain and feature**, using the **Controller–Service–Repository** pattern.

These terms have distinct roles:

- **Modular monolith:** One deployable Express application with well-defined internal business-module boundaries.
- **Domain-first organization:** Related functionality is grouped under domains such as HR, Finance, Production, Inventory and Maintenance.
- **Feature-based submodules:** Large domains are divided into cohesive capabilities such as Employees, Attendance, Work Orders and Reports.
- **Controller–Service–Repository:** HTTP handling, business processing and Oracle access have separate owners.
- **Centralized foundation:** Authentication, authorization, Joi validation handling, responses, errors, database pools, configuration and logging are common services—not rebuilt in each module.

Separate microservices, independent deployments per module and separate database pools per feature are not part of the approved architecture.

### 2.2 Logical system diagram

```text
                        React browser application
                                   |
                             HTTPS / REST
                                   |
                     Approved gateway / reverse proxy
                                   |
                     Node.js 24 + Express 5 API
              +------------------------------------------+
              | Shared request controls                  |
              | Session / RBAC / Joi / limits / logging  |
              +------------------------------------------+
                                   |
             +---------------------+---------------------+
             |                     |                     |
         HR domain           Production domain        Other domains
             |                     |                     |
         Controllers           Controllers            Controllers
             |                     |                     |
          Services               Services                Services
             |                     |                     |
        Repositories           Repositories           Repositories
             +---------------------+---------------------+
                                   |
                       Central Oracle DB manager
                           /               \
                      LOW pool          HIGH pool
                 Normal operations   Complex analytics
                           \               /
                        Existing Oracle ADW

    Optional external integration clients: Oracle Fusion / OIC / WMS
    Business services coordinate these clients as features require.
```

This is a **logical architecture**, not a diagram of physical servers. Network, gateway and runtime products will be selected separately.

### 2.3 Approved technology baseline

| Component | Standard |
|---|---|
| Backend runtime | Node.js 24 LTS |
| Web framework | Express 5 |
| Language | JavaScript with ES Modules |
| Oracle driver | Official `node-oracledb` in Thin mode; wallet-based mTLS |
| SQL | Native Oracle SQL with bind variables; selective PL/SQL |
| Input validation | Joi |
| Authentication | Persistent, server-managed sessions with secure browser cookies |
| Authorization | Resource/action RBAC, plus organizational and record-level scope |
| Logging | Pino structured JSON and request correlation IDs |
| API standard | Versioned REST and standardized responses |
| API documentation | OpenAPI 3.1 specifications with centralized Swagger UI |
| Testing | Node.js built-in test runner and Supertest |
| Code quality | ESLint, Prettier, targeted JSDoc |

The selected technologies define the required implementation direction. Actual compatibility, connection sizing and infrastructure configuration are verified during setup.

## 3. Project and Folder Structure

Backend files and architecture documentation live under **`server/`**. The frontend has its own code and documentation under `client/`.

The following is the **target structure**. Directories and feature files are added when their responsibilities are needed; empty feature scaffolding is not required.

```text
zamil-revamp/
├── client/                              # Existing React application
│
└── server/
    ├── src/
    │   ├── app.js                       # Express setup and middleware registration
    │   ├── server.js                    # Startup, listener and graceful shutdown
    │   ├── config/                      # Centralized, validated runtime settings
    │   ├── database/                    # LOW/HIGH pools, connections, transactions
    │   ├── middleware/                  # Shared HTTP and security middleware
    │   ├── routes/                      # Registration of domain routes
    │   │
    │   ├── modules/
    │   │   ├── auth/                     # Added with approved authentication design
    │   │   ├── users/                    # Added with approved user-management design
    │   │   ├── access-control/           # Added with approved RBAC design
    │   │   ├── hr/
    │   │   │   ├── employees/
    │   │   │   ├── attendance/
    │   │   │   ├── leave/
    │   │   │   └── reports/
    │   │   ├── finance/
    │   │   ├── production/
    │   │   │   ├── work-orders/
    │   │   │   └── reports/
    │   │   ├── inventory/
    │   │   └── maintenance/
    │   │
    │   ├── integrations/                # Outbound enterprise integration clients
    │   ├── shared/
    │   │   ├── errors/
    │   │   ├── responses/
    │   │   ├── logger/
    │   │   └── utils/
    │   └── jobs/                        # Approved scheduled/background tasks only
    │
    ├── docs/
    │   ├── 01-SYSTEM_ARCHITECTURE.md
    │   ├── 02-API_DEVELOPMENT_STANDARDS.md
    │   ├── 03-ORACLE_DATABASE_ARCHITECTURE.md
    │   ├── 04-AUTHENTICATION_RBAC_SECURITY.md
    │   ├── 05-CONFIGURATION_OPERATIONS.md
    │   ├── 06-ARCHITECTURE_DECISIONS_GUIDELINES.md
    │   └── openapi/                     # API specifications, added with API foundation
    │       └── openapi.yaml             # Root OpenAPI 3.1 contract (proposed)
    │
    ├── tests/                           # Cross-feature and integration tests
    ├── database-changes/                # Approved versioned SQL/SQLcl changes only
    ├── scripts/                         # Approved developer/operations scripts
    ├── package.json
    ├── .env.example                      # Variable names, no credentials
    └── CLAUDE.md                         # Project implementation guidance, later
```

**Directory responsibilities**

| Location | Responsibility |
|---|---|
| `src/app.js` | Assemble the Express instance, common middleware, module routes, documentation routes and error handling; no HTTP listener. |
| `src/server.js` | Validate startup configuration, initialize resources, start the listener and manage graceful shutdown. |
| `config/` | Define and validate runtime settings once. Features must not read scattered environment variables. |
| `database/` | Create/manage both Oracle pools, acquire and release connections, and support shared-connection transactions. |
| `middleware/` | Central request IDs, session authentication, permission checks, Joi validation, security limits and error handling. |
| `routes/` | Register domain routers under the approved API prefix; endpoint definitions stay in feature folders. |
| `modules/` | Own business rules and feature-level HTTP/database logic. |
| `integrations/` | Own common transport, authentication and error concerns for external systems; no unrelated domain business rules. |
| `shared/` | Reusable technical helpers and contracts shared by multiple modules. |
| `jobs/` | Approved scheduling or background work with explicit processing ownership. |
| `docs/` | Backend architecture standards and API contracts for developers. |
| `tests/` | Cross-feature integration, API and regression tests; small unit tests may be near their features. |
| `database-changes/` | Reviewed, approved and traceable Oracle schema/data change scripts only. |

## 4. Business Module Design

Each business domain contains its own features. **A form or report does not automatically require a separate module**; features should be grouped by business responsibility.

A typical HR feature structure is:

```text
modules/
└── hr/
    ├── employees/
    │   ├── employee.routes.js
    │   ├── employee.controller.js
    │   ├── employee.service.js
    │   ├── employee.repository.js
    │   └── employee.validation.js
    ├── attendance/
    ├── leave/
    └── reports/
```

The feature names are architectural examples, not a verified inventory of existing CI3 modules.

### 4.1 File responsibilities

| File | Responsibility | Boundary |
|---|---|---|
| `*.routes.js` | HTTP routes and route-level middleware | No complex business processing or SQL. |
| `*.controller.js` | Pass validated HTTP input to services and return approved responses | No SQL, connection creation or transaction ownership. |
| `*.service.js` | Business rules, state transitions, data-scope enforcement and orchestration | Does not depend on Express response objects or control raw SQL execution. |
| `*.repository.js` | Verified Oracle SQL, bind values, query execution and result mapping | No HTTP response formatting or independent commits within service transactions. |
| `*.validation.js` | Joi schemas for route parameters, query and request body | No SQL or external API calls. |

A general `models/` folder is **not mandatory** for native SQL. Introduce separate domain models or mappers only when an actual business requirement needs them.

### 4.2 Cross-module communication

- Features communicate through **documented service interfaces**, rather than accessing another feature's internal repositories.
- Cross-domain workflows have a clear owning service that coordinates the necessary modules.
- Shared infrastructure is implemented once; shared business rules retain a defined business owner.
- Circular module dependencies are not permitted.
- A new infrastructure dependency or abstraction must solve a demonstrated problem. Generic base-controller and base-repository frameworks are not required.

## 5. Request Processing and Response Ownership

A standard protected API request follows these steps:

1. **Entry:** React sends a request to `/api/v1/...` through the approved HTTPS gateway.
2. **Shared middleware:** Express applies correlation IDs, request controls, and session authentication.
3. **Access control:** The endpoint requires the appropriate resource/action permission; the service enforces organizational and record-level scope before protected data is returned or changed.
4. **Validation:** Joi validates the request body, parameters and query fields.
5. **Controller:** The controller delegates the operation to its owning service.
6. **Service:** Business rules are applied, transactions coordinated, and repositories or integration clients invoked.
7. **Repository:** Oracle statements execute through the centralized pool/connection layer.
8. **Response:** The controller returns the standard API envelope, or centralized error handling returns a safe failure response.

The order of access checks and validation may differ by route where required; unauthorized information must not be exposed during validation or processing.

### Example: Employee list

An employee list request such as `GET /api/v1/hr/employees?page=1&limit=25` follows the HR employee router, controller, service and repository. The repository performs **server-side** pagination and applies validated filters and authorized data scope. The controller returns a consistent paginated response.

Endpoint names and sample parameters in this document express design conventions; actual employee fields, Oracle objects and legacy business behavior require source and schema review before implementation.

### Standard API contract at a glance

- Versioned resource-based routes under `/api/v1`.
- Standard success, error and pagination responses, with request correlation metadata.
- Joi validation for incoming data; separate business-rule checks in services.
- Bound, database-side pagination/filtering/sorting for list and report APIs.
- Appropriate HTTP status codes, including `201` for creation and `204` for a successful response with no body.
- Sensitive Oracle errors, stack traces, session credentials and secrets are never returned to browsers.

**Document 02 — API Development Standards** specifies the exact response schemas, pagination rules, status codes and API validation details.

## 6. API Documentation Architecture: OpenAPI and Swagger UI

The backend uses **OpenAPI 3.1** as its machine-readable API contract and **Swagger UI** as the standard interactive API reference for developers.

### Documentation design

| Component | Role |
|---|---|
| OpenAPI 3.1 specification | Describes endpoints, operations, parameters, request bodies, response schemas, authentication and error outcomes. |
| Swagger UI | Provides a central, readable interface for frontend developers, backend developers and testers to explore the documented APIs. |
| Express documentation route | Serves the API reference from a centrally configured route, proposed as `/api/docs`. |
| OpenAPI document route | Serves the underlying specification, proposed as `/api/openapi.json`. |
| Specification files | Owned within `server/docs/openapi/`; split by domain/feature only when size warrants it. |

**Ownership:** Each feature developer maintains documentation for the endpoints they implement or change. Swagger UI presents a unified catalog; business modules do not host independent documentation servers.

**Coverage:** An endpoint specification identifies its purpose, URL/method, required authentication and permission, input fields, examples, success/error responses, and relevant pagination rules. The published contract must match actual validation and runtime behavior.

**Access policy:** Interactive **Try it out** testing is intended for approved development and UAT environments with appropriate credentials. Production documentation access is restricted based on the selected deployment security policy; Swagger UI does not bypass session authentication, CSRF protection, RBAC or rate limits.

The OpenAPI standard and Swagger UI are part of the backend foundation, not an additional business module. Actual implementation and configuration details are described in **Document 02**. The proposed routes and file layout may be refined during setup without changing the approved documentation approach.

## 7. Oracle Database and Workload Routing

Zamil Revamp connects to the **same existing Oracle ADW Serverless instance** through two centrally managed connection pools per backend process:

| Pool | Connection service | Intended workload |
|---|---|---|
| Application | `LOW` | Normal CRUD, login/session access, lookups, forms, approvals and short transactions. |
| Reporting | `HIGH` | Approved complex analytical SQL, large aggregations and intensive reporting. |

The existing CI3 application uses `HIGH` for its operations. Its behavior is preserved. Transactional features must pass compatibility and workload testing on `LOW` before the revamped implementation is released.

Connection acquisition and release are centralized. Neither controllers nor features create their own pools. Pool sizes, queue limits and timeouts are determined by the hosting configuration and workload measurements.

**Transaction ownership:** A service coordinates multi-repository operations using **one acquired connection**. It commits only on successful completion, otherwise rolls back, and releases the connection on every path. A transaction cannot switch from `LOW` to `HIGH` midway.

**Query standards:** Use native Oracle SQL with bind variables, verified schema objects, allowlisted dynamic identifiers, server-side filtering and bounded report execution. Existing compatible SQL and PL/SQL are preserved unless a reviewed change is justified.

External REST operations, including Oracle Fusion, OIC and WMS when applicable, are not atomically covered by Oracle local transactions. Features requiring reliable external delivery must use approved idempotency, status tracking and retry controls; database connections must not be held unnecessarily while awaiting external responses.

See **Document 03 — Oracle Database Architecture** for pool, SQL, transaction and database-change details.

## 8. Centralized Security and Shared Services

Security and operational controls apply consistently to all backend modules.

| Area | Architecture rule |
|---|---|
| Authentication | Server-managed sessions with opaque identifiers and secure, HttpOnly cookies. |
| Authorization | Central resource/action permissions; backend remains authoritative. |
| Data scope | Organizational and record-level access restrictions are enforced in business services. |
| Passwords | Argon2id; secure reset rules and MFA for privileged administrators. |
| CSRF | Protect cookie-authenticated state-changing requests. |
| Validation | Central Joi middleware and feature-owned schemas. |
| Errors | One error-handling mechanism; safe messages and standardized API response structures. |
| Logging | Pino structured logs with request IDs and secret redaction. |
| Auditing | Security/business audit trails separated from operational diagnostics. |
| Secrets | Wallets, credentials and session secrets remain outside source code and React bundles. |

The logical security approach is approved. **Physical RBAC tables, session-storage implementation, precise timeout policies and MFA mechanism** will be defined during the appropriate implementation design. Protected APIs must not ship with temporary permissive authorization controls.

See **Document 04 — Authentication, RBAC & Security** and **Document 05 — Configuration & Operations**.

## 9. Legacy CI3 Modernization and Delivery Boundaries

Modernization begins with an assessment of each actual CI3 feature rather than an assumed data model.

| Activity | Required evidence |
|---|---|
| Review legacy functionality | Identify the CI3 routes, controllers, models, SQL and business processes that implement the feature. |
| Verify database dependencies | Confirm existing tables, columns, constraints, procedures, triggers and data relationships. |
| Define feature ownership | Select its business domain, submodule, service boundary and dependencies. |
| Define public contract | Record the API behavior, validation, permissions, response and OpenAPI documentation. |
| Implement authorized changes | Modify only approved areas and reuse shared backend foundations. |
| Verify results | Compare business calculations, records, side effects, reports and external processing with accepted CI3 behavior. |
| Prepare controlled cutover | Assign write/job ownership, test coexistence and document rollback or reconciliation where necessary. |

Two applications sharing a database must not independently process the same write or integration job without an approved coordination mechanism. Changes to existing business tables require separate review and approval.

Legacy **user migration is excluded**. New RBAC table design and implementation occur after the initial backend foundation is established.

## 10. Developer Architecture Rules

The following requirements apply to every backend feature:

1. Use domain-first, feature-based folders and the Controller–Service–Repository pattern.
2. Reuse centralized database pools, middleware, configuration, logging, errors and response helpers.
3. Keep business logic in services and verified Oracle SQL in repositories.
4. Enforce backend authorization and data scopes independently of React visibility.
5. Preserve the existing business schema and CI3 behavior unless approved changes are documented.
6. Use bind variables, bounded SQL operations and the assigned LOW/HIGH workload routing.
7. Respect transaction boundaries, guaranteed connection release and controlled external integration processing.
8. Keep OpenAPI documentation accurate and accessible through the centralized Swagger UI.
9. Avoid unrelated changes, premature microservices, duplicate technical utilities and unnecessary dependencies.
10. Verify changes with automated tests, legacy compatibility checks and documented review evidence.

### Open items

These are intentionally **not** settled by this document:

- Hosting provider, operating system and deployment packaging.
- Numeric pool sizes, timeout values and measured workload limits.
- Physical RBAC database design, session-store choice and MFA mechanism.
- Verified catalog of existing CI3 features, business APIs and Oracle schema objects.

## 11. Related Backend Documents

The following six files form the backend architecture reference set in `server/docs/`:

| Document | Purpose |
|---|---|
| **01-SYSTEM_ARCHITECTURE.md** | Overall system pattern, folder structure, module boundaries and request flows. |
| `02-API_DEVELOPMENT_STANDARDS.md` | Detailed REST and OpenAPI/Swagger conventions, schemas, Joi validation, pagination and error handling. |
| `03-ORACLE_DATABASE_ARCHITECTURE.md` | Wallet mTLS, LOW/HIGH pools, SQL, repositories, transactions and database safeguards. |
| `04-AUTHENTICATION_RBAC_SECURITY.md` | Authentication, permission model, sessions, security controls and auditing. |
| `05-CONFIGURATION_OPERATIONS.md` | Configuration, secrets, logging, monitoring, environments, testing, cutover and recovery. |
| `06-ARCHITECTURE_DECISIONS_GUIDELINES.md` | Approved ADRs, development restrictions, deferred decisions and implementation review standards. |

**This document is the primary system-level reference.** Specialized implementation rules are maintained in the relevant companion document to keep the architecture clear and avoid duplication.

---

*ZR-BE-ARC-01 · Version 1.0 · End of document*
