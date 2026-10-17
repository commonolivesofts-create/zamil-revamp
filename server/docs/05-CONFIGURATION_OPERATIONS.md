# Zamil Revamp
## Backend Configuration, Logging & Operations Standards

| Document control | Details |
|---|---|
| **Document ID** | ZR-BE-OPS-05 |
| **Version** | 1.0 |
| **Status** | Architecture reference — issued for technical review |
| **Architecture baseline** | V1.0, approved 16 October 2026 |
| **Applies to** | `zamil-revamp/server/` and its operational environment |
| **Audience** | Backend developers, technical leads, QA, release and operations teams |
| **Related standards** | [01 — System Architecture](./01-SYSTEM_ARCHITECTURE.md), [02 — API Development Standards](./02-API_DEVELOPMENT_STANDARDS.md), [03 — Oracle Database Architecture](./03-ORACLE_DATABASE_ARCHITECTURE.md), [04 — Authentication & Security](./04-AUTHENTICATION_RBAC_SECURITY.md) |

---

## 1. Purpose and Operating Principles

This document defines how the **Zamil Revamp backend** is configured, started, monitored, released and recovered. It establishes common operational standards so developers can work from the same backend foundation and deployments remain predictable as new business modules are added.

Zamil Revamp replaces the frontend and backend of an existing **PHP CodeIgniter 3 (CI3)** enterprise application with **React** and **Node.js 24 LTS / Express 5**. It continues to use the existing **Oracle ADW Serverless** business database. The legacy application and its business transactions remain protected until each feature has passed an approved cutover.

The deployment architecture is **platform-neutral**. A hosting provider, server operating system, process manager and deployment package format have not been selected. The standards in this document apply whether the backend ultimately runs on a company server, a virtual machine, containers or a managed application platform.

**Operating principles**

- Keep configuration, secrets, database access, error handling and monitoring **centralized**; business modules must not independently implement them.
- Treat **development, testing, UAT and production** as distinct environments with appropriately separated data, credentials and access.
- Protect existing CI3 functionality, Oracle business objects and external integrations during rollout.
- Make releases reproducible and observable, and establish a clear recovery action before production change.
- Prefer simple operational components over infrastructure added without a measurable requirement.

This document describes operational requirements, not actual hosting instructions or deployment scripts.

## 2. Deployment Model and Network Boundaries

The backend is one **modular monolith** with one Express application and shared infrastructure. The React frontend and Express API should be exposed under the **same HTTPS origin** when the chosen hosting platform allows it.

```text
                  Employees using a browser
                              |
                            HTTPS
                              |
                 Approved gateway / ingress
                 TLS, routing, request limits
                         /             \
                        /               \
              React static assets    Express 5 API
                                          |
                          Shared auth, Joi, errors, logging
                                          |
                            Business modules and services
                                          |
                            Central Oracle DB manager
                                 /             \
                            LOW pool        HIGH pool
                             CRUD           Analytics
                                 \             /
                             Existing Oracle ADW

              Hosting provider and runtime packaging: deferred
```

The gateway may be a reverse proxy or a managed ingress service. **Express is not intended to be exposed directly to the public internet** when a trusted gateway is used. The application must trust forwarded headers only from the actual proxy chain configured in the selected environment.

A different-origin React/API deployment is possible, but it needs an explicit review of cookie scope, credentialed requests, allowed CORS origins and CSRF defenses. HTTP-to-HTTPS routing, certificates and firewall rules belong to the chosen infrastructure; security requirements do not depend on that choice.

### Swagger UI in the deployed application

OpenAPI 3.1 is the approved API specification standard and **Swagger UI** is the interactive documentation interface. The proposed documentation route is `/api/docs`, with the specification optionally exposed at `/api/openapi.json`; exact runtime routing will be confirmed during setup.

- Enable interactive testing for authorized developers in development and UAT.
- Restrict documentation and **Try it out** access in production according to the approved access policy; do not expose privileged operations or credentials publicly.
- Document only implemented API contracts and their actual authentication requirements.
- Keep detailed endpoint documentation rules in [Document 02](./02-API_DEVELOPMENT_STANDARDS.md).

## 3. Environments and Configuration

Four logical environments are required. They may run on different infrastructure arrangements, but their data and secrets must be separated appropriately.

| Environment | Purpose | Required safeguards |
|---|---|---|
| **Development** | Build and debug individual features | Nonproduction access; no real production secrets in source code. |
| **Testing** | Execute automated API, database and failure tests | Isolated or controlled test data; destructive tests never target production business tables. |
| **UAT / Staging** | Validate complete business flows and release candidates | Nonproduction database or an appropriately isolated, sanitized copy; controlled integrations. |
| **Production** | Operate approved live functionality | Least privilege, secured secrets, monitoring, recovery and formal change control. |

The existing CI3 application uses production Oracle ADW for its business operations. New backend development must not alter or experiment against those production records without a separately approved and controlled activity.

### Central configuration service

All runtime settings are read and validated through **one configuration module** at application startup. Configuration is not scattered across controllers, feature services or repositories. The configuration module uses the project's approved validation approach (**Joi**) to enforce required values, types, ranges and dependent settings.

| Configuration group | Examples of information controlled |
|---|---|
| Application | Runtime environment, listening port, trusted proxy policy and request limits. |
| Oracle | Wallet location, username/credential references, LOW and HIGH service aliases. |
| Oracle pools | Separate pool capacities, connection queue limits, timeouts and diagnostic options. |
| Authentication | Cookie policy, approved session settings, cryptographic secrets and expiry parameters. |
| API | Allowed origins, pagination ceilings, upload/export limits and Swagger availability. |
| Logging | Severity level, log destination, redaction rules and request-correlation settings. |
| Integrations | Approved Fusion/OIC/WMS endpoints, credential references, timeouts and retries. |
| Operations | Health-check behavior, graceful-shutdown deadlines and supported feature flags. |

Actual variable names and numerical production settings will be established during implementation, not invented in the architecture documents. A checked-in **example configuration** may list expected keys but never contain usable credentials.

**Startup policy:** Missing critical configuration, an invalid wallet path or an unsupported environment setting must result in a clear startup failure. The process must not silently substitute unsafe defaults. A dependency readiness failure must prevent the instance from accepting protected work.

### Configuration and feature flags

Use a feature flag only for a defined business or rollout requirement, such as controlling a separately approved module cutover. Each flag needs an owner, documented default, permissible values and removal/review plan. Flags do not bypass RBAC, authentication, input validation or existing database protections.

## 4. Secrets and Oracle Wallet Protection

Database credentials, wallet material, session secrets and enterprise integration credentials are **server-side secrets**. They must not appear in React assets, API responses, Swagger examples, source control, exception messages or operational logs.

The existing database connection method is **wallet-based mTLS with a database username and password**. The approved `node-oracledb` driver runs in **Thin mode**, subject to successful compatibility tests with the actual wallet. Both the LOW and HIGH pools use centrally managed connection settings for the same ADW database.

Operational safeguards:

1. Store wallet files outside publicly served directories and limit access to the backend runtime identity.
2. Provide database credentials and wallet passwords from protected runtime configuration or a platform secret manager.
3. Use separate nonproduction and production credentials where supported; do not reuse privileged Oracle administrative credentials for ordinary APIs.
4. Document secret rotation, wallet replacement and emergency revocation with the infrastructure owner.
5. Keep backups or recovery copies of essential secrets and wallet material under separately controlled access.
6. Do not print environment-variable dumps or full connection strings while troubleshooting.

The final secret-management product, networking arrangement and wallet deployment mechanism depend on the hosting platform and remain deferred.

## 5. Centralized Operational Logging

**Pino** is the approved structured logging library. All modules emit operational logs through the shared logger, with a consistent format and request correlation ID. Business modules must not introduce competing logging frameworks.

### Minimum log context

| Information | Why it is useful |
|---|---|
| UTC event timestamp and severity | Establish when an event occurred and how urgent it is. |
| Request/correlation ID | Follow one API request across middleware, services and integrations. |
| Feature or service name | Identify the responsible business area. |
| Operation and outcome | Distinguish normal completion, rejection, timeout and failure. |
| HTTP method, route template, status and duration | Investigate API reliability without leaking arbitrary URL data. |
| Sanitized error code | Group failures without exposing internal SQL or secrets to users. |
| Integration reference where safe | Reconcile external transaction attempts and results. |

Use consistent severity levels, such as `debug`, `info`, `warn` and `error`. Production logging should emphasize useful diagnostics rather than logging every database row, complete request body or successful field update.

**Never log:** Passwords or hashes, raw session identifiers, reset tokens, cookies, authorization headers, wallet contents, database credentials, secret environment values, complete personal records or unrestricted request/response payloads.

### Operational logs versus audit records

Pino logs support troubleshooting and monitoring. **Security and business audit events are separate** and follow [Document 04](./04-AUTHENTICATION_RBAC_SECURITY.md). Audit evidence may include who performed an approved action, the target resource, the outcome and event time; it must not depend on ephemeral debug logs.

Retention periods, export destinations and access privileges are controlled by the eventual operational platform and applicable company policy. Logging should remain useful even if no dedicated observability product is selected initially.

## 6. Monitoring and Alerting

The operations team must be able to assess whether the application is available, slow, overloaded or failing. Monitor the API and **both Oracle pools separately**.

| Area | Key signals |
|---|---|
| HTTP APIs | Request rate, latency, 4xx/5xx distribution, timeout rate. |
| Node.js process | CPU, memory, event-loop responsiveness, restarts and unhandled failures. |
| **LOW pool** | Connections in use, acquisition wait, queue timeouts, SQL/transaction duration. |
| **HIGH pool** | Active report requests, runtime, pool occupancy, queue duration and report failures. |
| Oracle ADW | Connectivity errors, database resource pressure and expensive queries. |
| Authentication/security | Unusual failed-login patterns, access denials and privilege-change audit events. |
| Enterprise integrations | Pending, failed and retried operations; duplicate-prevention and reconciliation issues. |
| Deployments | Release version, startup readiness failures and post-release error spikes. |

A free connection in the HIGH pool does **not** guarantee that Oracle can immediately execute another analytical statement: the Oracle HIGH service may independently queue statements. Monitor both application queue pressure and database-side report delays.

Alert on significant availability failures, sustained error or latency increases, pool exhaustion, report overload and security-sensitive events. Exact thresholds, notification routing and on-call ownership will be defined from measured operating conditions and the selected monitoring platform, rather than assumed now.

## 7. Health Checks, Startup and Shutdown

Health endpoints support runtime supervision, deployment verification and incident diagnosis. They must not expose secrets, wallet paths, internal credentials or detailed database diagnostics to the public.

| Check | Responsibility | Availability |
|---|---|---|
| **Liveness** | Confirm that the application process can respond. Avoid expensive Oracle queries. | Suitable for platform process probes. |
| **Readiness** | Confirm initialization and that required dependencies are usable within bounded checks. | Suitable for gateway/load-balancer readiness. |
| **Detailed status** | Expose sanitized operational diagnostics when authorized. | Restricted to trusted operators. |

Endpoint paths are implementation choices; the initially proposed forms are `/health/live`, `/health/ready` and `/health/status`.

### Startup sequence

1. Validate environment configuration and required secret references.
2. Initialize shared logger and database driver settings.
3. Establish the approved LOW and HIGH pools and perform bounded connectivity checks.
4. Initialize required application services and endpoint registration.
5. Mark the instance ready only after its critical dependencies meet the readiness policy.

Failure to initialize a critical dependency must be visible in logs and readiness state. Do not make the process appear ready with a silently disabled database connection.

### Graceful shutdown

On an approved termination signal, stop admitting new work; allow active requests a **bounded** completion period; stop or safely relinquish background work; close both Oracle pools; flush required logs; and exit so the hosting platform can replace the instance.

Long-running reports must be cancelled or terminated under a defined policy. Work involving external transactions must be idempotent or recoverable so that restarts do not repeat completed Fusion, OIC or WMS actions.

Timeouts must be coordinated across browser, gateway, Express, pool queue and database execution settings. Oracle driver call timeouts do not by themselves define one absolute deadline for an entire multi-step HTTP request.

## 8. Release, Cutover and Rollback

Production releases must be identifiable, reviewed, tested and accompanied by a recovery plan. The implementation method can be a VM process, container or managed runtime; the release controls remain the same.

### Standard release checks

| Stage | Required outcome |
|---|---|
| Scope review | Approved files/modules only; no accidental cross-module or schema changes. |
| Static checks | ESLint, formatting and relevant quality checks pass. |
| Automated tests | Relevant service, API, validation, authorization and failure-path tests pass. |
| Database review | Existing objects preserved; any approved change has a reviewed SQL/SQLcl record. |
| UAT comparison | Migrated CI3 outputs, calculations and side effects have been verified. |
| Pre-release checks | Environment, wallet, Oracle service aliases, secrets and integration endpoints verified. |
| Deployment | Release is identifiable and supports safe restart or replacement. |
| Smoke checks | Health, representative APIs, security checks and critical flows verified. |
| Observation | Errors, pool behavior and integration health reviewed after release. |
| Recovery | Previous release and restoration or reconciliation steps are available. |

### Controlled CI3 coexistence

The legacy CI3 application currently uses **Oracle HIGH for all database operations**. The new backend uses **LOW for ordinary application work and HIGH for tested analytical workloads**. Moving a feature from the old application must include LOW-service functional and concurrency verification before a production change.

For each feature cutover, record:

- Which application owns **writes** before, during and after the change.
- Whether scheduled tasks or integration processors must be disabled in one application.
- Whether both applications can safely read the same records during transition.
- How duplicates, uncertain transactions and partially posted external operations will be detected.
- What business checks must pass before traffic is moved and how the feature can be restored if the release fails.

**Do not allow both CI3 and Express to process the same business event independently** without an approved coordination mechanism. Avoid duplicate Fusion/OIC/WMS submissions and simultaneous scheduled-job processing. Rollback must account for writes already made and external transactions that cannot simply be undone by deploying an earlier backend release.

Legacy CI3 **user migration is excluded** from this project documentation and development scope; it is handled separately by the project owner.

## 9. Backup, Recovery and Operational Readiness

The existing Oracle ADW database has platform backup and recovery capabilities, but their **configured retention, accessibility and restore procedure must be verified** with the database owner. Application rollback is a separate activity from database recovery.

| Asset | Required recovery consideration |
|---|---|
| Existing Oracle ADW | Confirm backup retention, recovery permissions, restoration procedure and business impact. |
| React/Express releases | Preserve reproducible build inputs and prior tested release artifacts. |
| Runtime configuration | Recover approved non-secret configuration safely. |
| Wallets and secrets | Maintain restricted recovery, rotation and revocation procedures. |
| Approved database changes | Keep reviewed SQL/SQLcl change history and a documented recovery approach. |
| Integration records | Reconcile external posted transactions; do not assume database restoration reverses them. |
| Operational evidence | Retain required logs and audit evidence according to approved policy. |

The infrastructure and business owners must establish **Recovery Time Objective (RTO)** and **Recovery Point Objective (RPO)** before production rollout, together with named incident and recovery responsibilities. Recovery capability must be demonstrated through appropriate tests rather than inferred only from the existence of backups.

## 10. Developer and Operations Handoff

For any backend change intended for release, the developer provides:

- The purpose and scope of the change, including affected business modules and files.
- Configuration keys added or changed, without exposing their secret values.
- Oracle pool routing and any query/transaction behavior that could affect concurrency.
- API changes and updated OpenAPI/Swagger documentation where applicable.
- Security implications, including permission, cookie, CSRF or audit changes.
- Test commands, actual results and any unexecuted checks clearly identified.
- Deployment prerequisites, observed risks and the recovery path.

The reviewer checks consistency with the approved architecture and Documents 01–04. Operational configuration belongs in the shared foundation; business modules may consume approved configuration values but must not bypass centralized validation or secret handling.

## 11. Architecture Decisions and Open Items

The operating requirements in this document reflect **locked Phase 06 decisions ADR-049 through ADR-057**.

| ADR | Approved operational direction |
|---|---|
| **049–050** | Secure HTTPS gateway and preferably same-origin React/API deployment. |
| **051–052** | Separated environments, validated centralized configuration and protected secrets. |
| **053** | Restricted networking and existing Oracle wallet mTLS. |
| **054** | Health/readiness and controlled startup/shutdown. |
| **055** | Centralized observability with structured logs, metrics and alerts. |
| **056** | Verified backup, recovery and release rollback standards. |
| **057** | Controlled CI3-to-Express cutover with business compatibility checks. |

**Deliberately deferred:** ADR-047 hosting provider; ADR-048 deployment packaging/process supervision; exact pool sizes, timeout values, monitoring provider, alert/retention thresholds, infrastructure network topology, session-store implementation, precise session timeout policy, and RTO/RPO values. These must be explicitly settled before the corresponding production operation; they are not hidden defaults.

The new RBAC database design and its physical session implementation occur after the initial backend foundation is established. This document does not create RBAC tables, migrate CI3 accounts or prescribe unapproved database changes.

## 12. Related Standards

- [01 — System Architecture & Folder Structure](./01-SYSTEM_ARCHITECTURE.md): modular monolith, module boundaries and shared infrastructure.
- [02 — API Design & Development Standards](./02-API_DEVELOPMENT_STANDARDS.md): API contracts, Joi validation, OpenAPI 3.1, Swagger UI and testing rules.
- [03 — Oracle Database Architecture](./03-ORACLE_DATABASE_ARCHITECTURE.md): Thin driver, wallet, LOW/HIGH pools, native SQL and transactions.
- [04 — Authentication, RBAC & Security](./04-AUTHENTICATION_RBAC_SECURITY.md): cookie sessions, resource permissions, CSRF, MFA and security auditing.
- **06 — Architecture Decisions & Developer Guidelines** (next document): complete approved decision register and developer governance.

---

*Document control: ZR-BE-OPS-05 · Version 1.0 · Technical review edition.*
