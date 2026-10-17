# Zamil Revamp
## Architecture Decisions & Developer Guidelines

| Document control | Details |
|---|---|
| **Document ID** | ZR-BE-GOV-06 |
| **Version** | 1.0 |
| **Status** | Architecture reference — issued for technical review |
| **Architecture baseline** | V1.0, approved 16 October 2026 |
| **Applies to** | `zamil-revamp/server/` |
| **Audience** | Backend developers, technical leads, reviewers, QA and integration teams |
| **Related standards** | Documents 01–05 in `server/docs/` |

---

## 1. Purpose and Authority

This document consolidates the approved **Zamil Revamp backend architecture decisions** and defines how developers apply them when setting up the backend or building business APIs. It is the quick-reference governance document for technical onboarding, implementation review and changes to the architecture.

Zamil Revamp modernizes an existing **PHP CodeIgniter 3 (CI3)** application into a **React frontend** and **Node.js/Express backend**. The existing **Oracle ADW Serverless business database** and approved business behavior are preserved. New features must follow the common backend foundation rather than introducing new conventions on a module-by-module basis.

The other five documents explain the design in depth:

| Reference | Authoritative subject |
|---|---|
| [01 — System Architecture & Folder Structure](./01-SYSTEM_ARCHITECTURE.md) | Architecture pattern, module boundaries and target directory structure. |
| [02 — API Design & Development Standards](./02-API_DEVELOPMENT_STANDARDS.md) | Endpoint contracts, responses, Joi, pagination, OpenAPI and Swagger UI. |
| [03 — Oracle Database Architecture](./03-ORACLE_DATABASE_ARCHITECTURE.md) | Oracle driver, wallet, LOW/HIGH pools, SQL, transaction management and schema protection. |
| [04 — Authentication, RBAC & Security](./04-AUTHENTICATION_RBAC_SECURITY.md) | Sessions, password protection, permissions, data scope, security middleware and auditing. |
| [05 — Configuration, Logging & Operations](./05-CONFIGURATION_OPERATIONS.md) | Environment configuration, secrets, Pino, observability, deployment and CI3 cutover. |

**Interpretation:** This document records the approved decision and the developer obligation. Refer to the relevant subject document for implementation-level detail. If two documents appear inconsistent, flag the conflict for technical review rather than silently selecting an alternative.

## 2. Project Boundaries

| Area | Governing rule |
|---|---|
| Existing application | Treat CI3 as the reference for verified business behavior until a change is approved. |
| Existing database | Reuse business tables, data, views, procedures and constraints. No speculative schema redesign. |
| Modernization | Rebuild and enhance only the approved feature scope; preserve required consumers and integration behavior. |
| New identity and RBAC | Establish the initial backend foundation first. Design and approve new RBAC tables in a later step. |
| Legacy user migration | **Excluded** from the backend delivery scope; managed independently by the project owner. |
| Frontend | Maintained under `client/`, with separate frontend architecture documentation. |
| Backend | Implemented under `server/` according to the approved folder and module standards. |
| Infrastructure | Hosting provider and deployment packaging are undecided; keep business logic platform-neutral. |

**Foundation-first delivery:** Set up and verify shared configuration, Oracle connectivity, API responses, Joi validation, errors, logging, testing and OpenAPI before distributing business API development across the team. Authentication-dependent endpoints are not released until the new RBAC and session implementation is approved and functioning; temporary access bypasses are prohibited.

## 3. Approved Architecture Decision Register

The register below summarizes the locked Architecture Baseline V1.0. A **Locked** decision is mandatory. **Deferred** means the topic is intentionally unresolved, not permission to invent a default. A condition attached to a locked direction must be verified before production use.

### 3.1 Technology, structure and API foundation

| ADR | Approved decision | Status |
|---|---|---|
| 001 | Modular monolith: one backend application, organized by business domains. | Locked |
| 002 | Feature-based, domain-first code organization. | Locked |
| 003 | Controller–Service–Repository separation. | Locked |
| 004 | JavaScript backend (not TypeScript). | Locked |
| 005 | Business domain → submodule/feature → route, controller, service, repository and validation. | Locked |
| 006 | Node.js 24 LTS runtime. | Locked |
| 007 | Express 5 using ES Modules. | Locked |
| 009 | Server-managed session authentication for the initial React browser client. | Locked |
| 010 | Resource/action authorization with backend enforcement. | Locked |
| 012 | Versioned REST API design and standard response envelopes. | Locked |
| 013 | Joi request validation. | Locked |
| 014 | Node.js built-in test runner with Supertest for HTTP tests. | Locked |

*Preliminary ADR-008 (driver) and ADR-011 (hosting) were replaced by the more specific database and infrastructure decisions below; they are not separate additional obligations.*

### 3.2 Oracle ADW and schema governance

| ADR | Approved decision | Status |
|---|---|---|
| 015 | Official `node-oracledb` in Thin mode with wallet mTLS. | Locked; wallet compatibility test pending |
| 016 | Two centrally managed Oracle connection pools per Node.js process, with independent limits and monitoring. | Locked; numerical sizing pending |
| 017 | Native Oracle SQL in feature-owned repositories; selective existing PL/SQL. | Locked |
| 018 | Service-managed transactions using the same connection across participating repositories. | Locked |
| 019 | `LOW` for ordinary APIs/transactions; `HIGH` for qualified complex analytical queries. | Locked; workload verification required |
| 020 | Reviewed, version-controlled SQL/SQLcl scripts and deployment history for approved database changes. | Locked |
| 021 | Physical authentication-session storage. | Deferred; assess existing design and actual workload |
| 022 | Least-privilege database runtime credentials; assess existing grants. | Locked; grants review pending |
| 023 | Preserve existing wallet-based mTLS connectivity. | Locked |
| 024 | Preserve existing Oracle business objects except explicitly approved, justified changes. | Locked |
| 025 | New RBAC structures designed and created after initial backend project setup. | Locked sequence; physical design pending |

The legacy CI3 application currently uses `HIGH` for all database operations. Its configuration remains unchanged during modernization. Existing transactional operations must be tested on `LOW` before production cutover; a failed or uncertain write must not automatically be retried through `HIGH`.

### 3.3 Identity, authorization and application security

| ADR | Approved decision | Status |
|---|---|---|
| 026 | New Zamil Revamp user-management and RBAC architecture. | Locked direction; tables pending |
| 027 | Permissions represent a resource and an action (forms, reports, widgets and distinct business operations). | Locked |
| 028 | Separate organizational and record-level data scopes (e.g., OWN, TEAM, ORGANIZATION, ALL where applicable). | Locked model; actual policies feature-specific |
| 029 | Centralized, deny-by-default, backend-authoritative authorization. | Locked |
| 030 | Argon2id password hashing and modern password security. | Locked |
| 031 | Secure, revocable, server-managed sessions using HTTP-only cookies. | Locked; storage and exact timeout values pending |
| 032 | MFA for privileged administrators. | Locked requirement; implementation mechanism pending |
| 033 | Centralized security middleware and request protections. | Locked |
| 034 | Security/business auditing kept separate from operational logs. | Locked |
| 035 | Protected user/role administration and privilege-escalation controls. | Locked |
| 036 | Legacy CI3 account/password migration. | **Excluded — project-owner managed** |

React may hide controls based on effective permissions, but Express must enforce the same resource/action rights plus the relevant organization, ownership or record scope. Missing permission means denied access.

### 3.4 API, development and delivery standards

| ADR | Approved decision | Status |
|---|---|---|
| 037 | Consistent resource-oriented REST URLs and methods; preserve required legacy consumer compatibility. | Locked |
| 038 | Common success/error response structure and correct HTTP statuses. | Locked |
| 039 | Centralized Joi validation through reusable middleware. | Locked |
| 040 | Strict route/controller/service/repository ownership of responsibilities. | Locked |
| 041 | Database-side pagination, filtering and sorting; bounded output. | Locked |
| 042 | Centralized application errors and HTTP error handling. | Locked |
| 043 | Pino structured operational logging with correlation IDs and redaction. | Locked |
| 044 | JavaScript ES Modules, ESLint, Prettier and targeted JSDoc. | Locked |
| 045 | OpenAPI 3.1 contract and shared Swagger UI for API discovery/testing. | Locked |
| 046 | Inspect CI3 behavior, SQL, callers and side effects before replacing a feature. | Locked |

**Swagger UI** is part of the shared backend foundation. Developers keep the specification synchronized with implemented routes, validation, permissions, response shapes and errors. Proposed documentation routes are `/api/docs` and `/api/openapi.json`; exact configuration is finalized during setup. Interactive access is secured and follows real authentication/authorization controls.

### 3.5 Operations and deployment

| ADR | Approved decision | Status |
|---|---|---|
| 047 | Hosting provider. | Deferred |
| 048 | VM/container/managed-runtime packaging and process supervision. | Deferred |
| 049 | Approved HTTPS gateway and correctly scoped reverse-proxy trust. | Locked |
| 050 | Prefer one HTTPS origin for React and the API; secure alternatives allowed. | Locked |
| 051 | Separate development, test, UAT and production environments. | Locked |
| 052 | Validated centralized configuration and protected external secrets. | Locked |
| 053 | Restricted network access and protected Oracle wallet mTLS. | Locked |
| 054 | Health/readiness checks, safe startup and graceful shutdown. | Locked |
| 055 | Structured logs, metrics, monitoring and alerts; provider-neutral. | Locked |
| 056 | Verified database/application backup, recovery and rollback approach. | Locked |
| 057 | Controlled CI3 coexistence and feature cutover, with regression checks and write/job ownership. | Locked |

## 4. Developer Working Rules

The following rules apply to all new backend features and changes to shared infrastructure.

| Rule | Expected practice |
|---|---|
| **Inspect before implementing** | Review the relevant CI3 controller/model, SQL, existing Oracle objects, business rules, integration effects and consumers. If evidence is missing, identify the dependency; do not invent it. |
| **Own the correct feature** | Keep routes, controllers, services, repositories and validators with the business submodule. Avoid project-wide folders organized only by technical layers. |
| **Use shared foundations** | Reuse centralized config, session/RBAC services, Joi middleware, responses, errors, Pino logger, Oracle connections and Swagger setup. |
| **Keep controllers focused** | Controllers handle validated HTTP input and the response; business decisions and SQL do not belong in controllers. |
| **Keep transactions coherent** | Services own commit/rollback; participating repositories share the transaction connection. Never split a transaction between LOW and HIGH. |
| **Secure every protected action** | Enforce resource/action permission and record/organization scope in the backend. Frontend visibility is not a security boundary. |
| **Bind Oracle data values** | Use SQL binds and allowlisted dynamic identifiers; avoid string concatenation of untrusted SQL input. |
| **Constrain resource usage** | Use server-side filters, bounded pages, controlled reports/exports, timeouts and approved pool routing. |
| **Document each API** | Update OpenAPI 3.1 / Swagger alongside the implementation. Document inputs, outputs, errors and security requirements. |
| **Stay within scope** | Do not change unrelated modules, existing database objects or shared contracts without a documented reason and approval. |
| **Test the intended behavior** | Test service logic, API contracts, authorization, Oracle transaction outcomes and relevant CI3 regression cases. |

### Prohibited shortcuts

- Hardcoded production secrets, Oracle credentials, wallets, session values, or administrator passwords.
- Temporary `allow-all` permissions, dummy login paths, production security bypasses, or trusting client-supplied roles and scopes.
- New business tables, inferred columns, revised SQL calculations, or data migration scripts without source verification and explicit approval.
- One Oracle pool per module, database connections held unnecessarily, silent commits inside participating repositories, or uncontrolled write retries.
- Unbounded list/report results, fetching all pages to simulate frontend pagination, or unlimited background work.
- Unapproved microservices, ORMs, Redis, message brokers, deployment-platform dependencies, or blanket refactoring of unrelated code.
- Claiming an API or database test passed when it was not executed.

## 5. Standard Feature Delivery Process

**1. Understand.** Identify the feature owner, business objective, relevant CI3 source, existing schema dependencies, data access and external side effects. Confirm whether the work preserves behavior or introduces an approved enhancement.

**2. Design.** Define the endpoint and OpenAPI contract, input validation, required permission and record scope, business rules, pool selection, SQL/repositories, transaction boundary, expected errors and test cases. Record any unresolved evidence or required schema changes.

**3. Approve scope.** Review anticipated files, shared-infrastructure impact, compatibility issues and database/integration changes. Do not expand the work into other business modules without approval.

**4. Implement.** Follow the approved folders and common utilities. Keep business decisions in the service and Oracle SQL in the repository. Update the relevant OpenAPI and technical notes.

**5. Verify.** Run relevant lint/format checks, unit tests, API tests, permission tests and approved database/integration checks. Compare representative legacy behavior when replacing CI3 functionality.

**6. Handover.** Provide a short summary of completed behavior, changed files, verification results, known limitations, outstanding dependencies and operational impact. State explicitly when a test or environment check could not be performed.

### Feature acceptance checklist

| Check | Minimum evidence |
|---|---|
| Functionality | Approved behavior and business rules verified; changes from CI3 called out. |
| Architecture | Correct module and layer ownership; no unrelated modifications. |
| Contract | Request, response, error handling and OpenAPI match actual implementation. |
| Validation/security | Joi input checks and applicable session, CSRF, RBAC and record-scope controls tested. |
| Database | Verified objects, binds, correct pool, transaction/release behavior, bounded queries. |
| Quality | Relevant automated test results and lint/format status recorded. |
| Operations | Logging, failure handling, integration effects and cutover risks reviewed. |

## 6. Foundation Setup and Team Onboarding

The implementation sequence is intentionally staged:

| Stage | Result required before proceeding |
|---|---|
| **Initial backend foundation** | Express structure, central config, LOW/HIGH database manager, Joi, response/error utilities, Pino, core security interfaces, health checks, OpenAPI/Swagger and test tooling are organized and verified. No speculative business/RBAC schema is created. |
| **New RBAC design** | Physical user/resource/role/permission, session and audit structures documented and explicitly approved. |
| **Authentication and RBAC delivery** | Approved storage, secure sessions, password handling, MFA/permission enforcement and tests in place. No protected business APIs released with placeholder access controls. |
| **Business-module development** | Individual CI3 features reviewed, assigned to owning modules, implemented under the shared standards and regression-tested. |
| **Controlled production cutover** | Deployment ownership, transaction/job coordination, monitoring and rollback/reconciliation plans approved for the affected feature. |

Before beginning work, each developer should read Document 01, this document and the relevant subject standard. A developer consuming or implementing an API should also consult Document 02 and the shared Swagger UI. The backend foundation—not individual teams—owns common configuration, database pools, auth/RBAC utilities, logging, errors and API documentation presentation.

## 7. Deferred Decisions and Change Control

**Deferred items** must receive a documented implementation decision when they become relevant:

| Item | When it must be resolved |
|---|---|
| Physical RBAC tables, relationships and session storage | Before authentication/RBAC implementation. |
| Session expiry values, MFA mechanism and CSRF exchange details | Before production authentication release. |
| Thin-mode wallet compatibility, database grants and LOW/HIGH connection limits | During database foundation verification and load testing. |
| Hosting provider, packaging, process supervisor and network topology | Before environment provisioning and deployment. |
| Monitoring provider, log retention, alert thresholds and recovery targets | Before production operational acceptance. |
| Feature-specific API contracts, database mappings and CI3 regression cases | Before each corresponding feature is developed or migrated. |

**Architecture change procedure:** Record the affected ADRs, the reason for change, alternative choices, security/database implications, impact on existing CI3 behavior, and documents that would need revision. Obtain explicit architecture approval before changing a locked direction. Revise this register and the relevant subject document together; do not allow competing project standards to develop.

**Document maintenance:** Keep version and review status current. Update documentation in the same review as an approved contract or architectural change. Architecture examples illustrate a pattern; they must never be presented as verified CI3 tables, credentials, data or implemented endpoints unless confirmed from source.

---

**Architecture authority:** Zamil Revamp Backend Architecture Baseline V1.0. The six documents in `server/docs/` form the initial backend architecture reference set. Frontend architecture is maintained separately under `client/`.
