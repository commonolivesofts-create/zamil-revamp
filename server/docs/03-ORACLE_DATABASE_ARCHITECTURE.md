# Zamil Revamp
## Oracle ADW Database Architecture & Development Standards

| Document control | Details |
|---|---|
| **Document ID** | ZR-BE-DB-03 |
| **Version** | 1.0 |
| **Status** | Architecture reference — issued for technical review |
| **Architecture baseline** | V1.0, approved 16 October 2026 |
| **Applies to** | `zamil-revamp/server/` |
| **Audience** | Backend developers, database engineers, technical leads, QA and operations |
| **Related standards** | [01 — System Architecture](./01-SYSTEM_ARCHITECTURE.md), [02 — API Development Standards](./02-API_DEVELOPMENT_STANDARDS.md) |

---

## 1. Purpose and Scope

This document defines how **Zamil Revamp** connects to, queries and protects its existing **Oracle Autonomous Data Warehouse (ADW) Serverless** database. It provides the common database rules for all backend business modules and ensures that database access is secure, predictable and maintainable.

Zamil Revamp replaces the backend of an existing **PHP CodeIgniter 3 (CI3)** application with **Node.js 24 LTS, JavaScript (ES Modules) and Express 5**. **The existing Oracle business database remains the source of truth.** Its tables, data, views, stored procedures, reports and accepted business behavior are preserved unless an explicitly approved change is required.

The database architecture comprises:

- The official **`node-oracledb`** driver in **Thin mode**, subject to wallet-connectivity verification.
- Existing **wallet-based mutual TLS (mTLS)** and Oracle database username/password authentication.
- **Two centrally managed pools:** `LOW` for normal application work and `HIGH` for approved complex analytical work.
- **Native Oracle SQL** and selective PL/SQL, executed by feature-owned repositories.
- **Service-managed transactions**, with one shared connection for each multi-repository transaction.
- Controlled SQL performance, connection lifecycle, error handling and database change management.

This document does **not** define the physical legacy database schema, invent business table names, specify new RBAC tables or choose final numeric pool sizes. Those details require verified source information or separate approval.

## 2. Database Architecture at a Glance

```text
                  React web application
                            |
                      Express REST API
                            |
               Routes / Joi / Authorization
                            |
                     Business service
                            |
                  Feature-owned repository
                            |
                 Shared database manager
                 /                    \
                /                      \
     Application pool              Reporting pool
       Oracle LOW                    Oracle HIGH
     CRUD / short work             Complex analytics
                \                      /
                 \                    /
                Existing Oracle ADW Serverless
                  Shared business objects
```

### 2.1 Approved workload routing

| Workload | Database service | Rule |
|---|---|---|
| Authentication and session lookup | `LOW` | Normal short operations; session storage remains to be designed and measured. |
| Forms, dropdowns and ordinary CRUD | `LOW` | Default service for new backend operations, after compatibility testing. |
| Approvals and multi-step business transactions | `LOW` | All related repositories use the same connection. |
| Paginated lists and small summaries | `LOW` | Use server-side filters and bounded results. |
| Complex analytical reports and large aggregations | `HIGH` | Explicitly approved query routing; enforce concurrency and timeout controls. |
| Heavy exports and batch analytics | `HIGH` when justified | Confirm query profile, operational impact and export limits before routing. |
| Complex data-changing scripts | Evaluate individually | Query complexity alone is **not** a reason to run transaction-oriented DML on `HIGH`. |

The existing CI3 application currently uses `HIGH` for all operations. **It is not changed automatically.** Every migrated write or transaction must be tested on `LOW` for correctness, performance and concurrency before production cutover. A verified exception must be documented rather than silently changing routing.

`LOW` and `HIGH` are **Oracle connection services**, not separate databases, schemas or Node.js driver modes. Both pools reach the **same existing ADW database**. A failed write must never be retried on the other service simply because the first attempt returned an error or timed out.

### 2.2 Why both services are used

`LOW` runs ordinary statements without automatic parallel execution and supports high-concurrency short requests. `HIGH` is intended for lower-concurrency analytical operations that can benefit from Oracle parallel execution. **HIGH statements may queue inside Oracle even when a pool has free connections.** Increasing the reporting pool size therefore does not automatically increase reporting throughput.

The service split is a workload policy, not an instruction to send every report to `HIGH`. Short, indexed reporting queries can remain on `LOW` when their measurements support that choice.

## 3. Oracle Driver, Wallet and Connection Security

### 3.1 Driver standard

The approved driver is the officially supported **`node-oracledb`** package, using **Thin mode**. Thin mode avoids installing Oracle Instant Client and supports the standard SQL, pooling and transaction operations needed by the backend. It must pass compatibility testing against the actual ADW instance and wallet before production use.

Thick mode is not a parallel configuration option for the `HIGH` pool. A decision to adopt Thick mode would require a documented compatibility reason and an architecture change review.

### 3.2 Wallet-based mTLS

The existing connection approach uses Oracle database credentials **and** a database wallet for mutual TLS.

| Connection item | Requirement |
|---|---|
| TNS service aliases | Use verified `LOW` and `HIGH` aliases from the database connection configuration. |
| `tnsnames.ora` | Maps aliases to the correct database network service. |
| `ewallet.pem` | PEM wallet used for Thin-mode mTLS. If absent, wallet compatibility must be resolved before deployment. |
| Wallet password | Protect separately; do not confuse it with the Oracle database user password. |
| Database user credentials | Use an approved least-privilege runtime account, subject to review of current grants. |
| Wallet directory | Outside source control and frontend assets; available only to authorized runtime identities. |

`cwallet.sso` alone is **not** the Thin-mode PEM wallet format. The existing wallet must be inspected for compatibility without displaying or committing its certificate contents or passwords.

**Connection safety rules:**

1. Never place wallets, Oracle usernames/passwords or connection secrets in React, logs, API responses or Git.
2. Configure `LOW` and `HIGH` with different **verified service aliases**, not different copies of business tables.
3. Use controlled runtime secrets and restricted filesystem/network permissions.
4. Keep local, test, UAT and production credentials separate where those environments exist.
5. Recheck access-control lists, DNS and firewall behavior when the hosting platform is selected; preserve working CI3 connectivity.

## 4. Centralized Connection Pool Management

**One centralized database manager** owns both pools. Business controllers and feature repositories must not create their own Oracle pools. A pool is initialized **once per Node.js process**, not per HTTP request, user, screen or business module.

### 4.1 Pool responsibilities

| Component | Responsibility |
|---|---|
| Shared database configuration | Validate aliases, wallet settings, credentials and approved pool options at startup. |
| Pool initializer | Establish named `LOW` and `HIGH` pools and make their readiness visible. |
| Connection helper | Acquire a connection from the requested pool and guarantee release. |
| Transaction helper | Pass one existing connection through participating repositories and control commit/rollback. |
| Query/repository layer | Execute SQL and PL/SQL; never build new connection infrastructure. |
| Operational monitoring | Report pool utilization, queue waiting, timeouts and connection failures. |

### 4.2 Connection lifecycle

```text
Backend startup
      |
Validate environment and secure wallet configuration
      |
Initialize LOW pool and HIGH pool once per process
      |
API request / background operation
      |
Choose pool by approved workload policy
      |
Acquire connection (bounded wait)
      |
Execute repository work / transaction
      |
Commit or rollback if a write transaction is owned
      |
Always release connection
```

The backend should stop accepting new work and close pools gracefully during shutdown. A temporary database outage must produce a controlled error rather than uncontrolled creation of new connections or endless waiting.

### 4.3 Pool configuration principles

| Setting | Standard |
|---|---|
| `poolMin` / `poolMax` | Size per service based on observed demand and ADW compute capacity; small fixed-size pools are preferred as a starting policy once tested. |
| `queueMax` | Bounded queue to prevent uncontrolled request accumulation. |
| `queueTimeout` | Finite wait for an available connection; distinguish pool waiting from SQL execution time. |
| `stmtCacheSize` | Enable driver statement caching; tune for real SQL patterns. |
| `enableStatistics` | Enable suitable pool observability without exposing connection secrets. |
| Application instances | Budget total connections across **every** Node.js process, not only one server. |
| Reporting concurrency | Limit active analytical work independently of the `HIGH` pool connection count. |

**No numeric size or timeout is fixed by this document.** The actual values depend on ECPU/OCPU allocation, compute autoscaling, database sessions, query duration, reporting concurrency and deployed process count.

Asynchronous Node.js request handling does not give each user a dedicated Oracle session. Pool connections are shared across short-lived database operations. Do not hold a connection while a user fills out a form, while a response streams to the browser unnecessarily, or while an external Fusion/OIC/WMS call is pending.

## 5. Repository and Native SQL Standards

SQL belongs to **feature-owned repositories** within the approved domain-first architecture.

```text
server/src/
├── database/                      # Shared pools and transaction utilities
└── modules/
    └── production/
        ├── work-orders/
        │   ├── workOrder.service.js
        │   └── workOrder.repository.js
        └── reports/
            └── ...               # Feature-owned reporting queries
```

A repository may keep readable SQL in its own file or a separate feature-local SQL file when a complex query warrants it. It must not assume table names, columns, statuses, or joins without verifying the existing CI3 source and Oracle schema.

| Concern | Required practice |
|---|---|
| SQL values | **Always bind** untrusted and variable data. Never concatenate user input into data predicates. |
| Dynamic identifiers | Validate sort columns, directions, table/view choices and other non-bindable identifiers against server-side allowlists. |
| Selected columns | Retrieve the fields needed by the API; avoid broad `SELECT *` use in production contracts. |
| Business rules | Services own decisions; repositories own verified persistence and retrieval operations. |
| PL/SQL | Reuse existing compatible procedures/functions; introduce new ones only for demonstrated needs and approved changes. |
| Bulk DML | Evaluate `executeMany()` for approved bulk operations, with correct transaction handling. |
| Data mapping | Convert Oracle result shapes to approved API types without losing precision or null meaning. |
| Session settings | Set or reset any changed pooled-session state deliberately; never let one request's settings leak to another. |

### 5.1 Oracle type and date handling

- **`NUMBER` and monetary values:** JavaScript numbers are not safe for arbitrarily large identifiers or exact decimal amounts. Choose a documented serialization strategy that preserves precision; avoid silent rounding.
- **Date-only fields:** Preserve business dates as dates. Do not treat a leave date, accounting date or period as if it were always a UTC instant.
- **Timestamps:** Define how the original Oracle type, time zone and application output relate. API timestamps use ISO 8601 with an explicit offset or `Z` when representing an instant.
- **`NULL`:** Preserve the distinction between missing data, zero, false and empty string where it affects business behavior.
- **Existing formats:** Preserve a verified legacy contract where an API consumer depends on it, until a breaking change is approved.

## 6. Transaction and Concurrency Rules

**The business service owns a write transaction.** When an operation spans multiple repositories, all repositories use **the same acquired connection** for that operation.

```text
Business service
  -> acquire one LOW connection
  -> repository A performs approved write
  -> repository B performs related write
  -> success: commit once
     failure: rollback once
  -> release connection in all cases
```

### Mandatory transaction behavior

1. Do not globally enable autocommit for service-managed multi-statement transactions.
2. Do not commit or roll back independently inside a participating repository.
3. Release connections on success, validation/business failure and unexpected errors. Release of an uncommitted connection causes rollback, but explicit rollback should still be the normal failure path.
4. Use Oracle constraints, unique keys and appropriate locking or optimistic concurrency to prevent duplicate or conflicting business changes.
5. Keep transactions short; avoid long reports, file work and unnecessary external HTTP calls within a write transaction.
6. Do not execute independent parallel SQL operations against the same transaction connection as an uncontrolled `Promise.all()` batch.
7. A transaction **must not switch from LOW to HIGH midway**. Pool selection is fixed for the whole transaction.
8. A timeout or disconnection can leave the final write outcome uncertain. Investigate and reconcile instead of blindly repeating it.

### 6.1 Oracle parallel-DML consideration

`HIGH` enables parallel query behavior and may enable parallel DML. On Oracle Database 19c, parallel DML can restrict subsequent access to the modified table in the same transaction, producing errors such as `ORA-12838` or `ORA-12839`. This is one reason ordinary multi-step writes belong on `LOW`, and any existing complex DML script using `HIGH` requires direct compatibility testing.

### 6.2 External systems are separate transactions

An Oracle ADW commit does **not** atomically commit a request made to Oracle Fusion, OIC or WMS. For business-critical integration flows, use an approved mechanism for durable integration tracking, idempotency and retry/reconciliation. Do not hold database locks while waiting for the remote service or report remote acceptance as confirmed final completion.

These integration safeguards are applied to the relevant feature when its existing CI3 behavior and external contracts have been reviewed.

## 7. Query Performance, Lists and Reporting

The existing database can serve both transactional screens and substantial analytical reports. Each workload must operate within reasonable resource limits.

| Area | Standard |
|---|---|
| Filtering/searching | Perform in Oracle using bound inputs and validated fields, before returning data. |
| Pagination | Bounded server-side pagination with deterministic sorting; default API limit `25`, general maximum `100` as defined in Document 02. |
| Counts | Execute when required by the agreed API; optimize costly counts and avoid redundant count queries. |
| Large results | Use bounded fetching or driver result-set/streaming techniques instead of loading unlimited rows into Node.js memory. |
| Aggregations | Prefer appropriate SQL-side aggregation over retrieving raw tables and aggregating in JavaScript. |
| Query plans | Investigate execution plans, selectivity, join behavior and actual run time before optimization. |
| N+1 patterns | Avoid repeatedly issuing queries for each returned record when one suitable batched query is possible. |
| Indexes and schema tuning | Recommend through the approved change process; do not modify existing business objects without approval. |
| Timeouts | Bound pool acquisition, individual database round-trips, overall API execution and export duration separately. |
| Reporting exports | Require explicit size, concurrency and delivery limits; do not bypass pagination with an unlimited `limit`. |

**Driver `callTimeout` controls individual database calls/round-trips, not automatically the complete elapsed lifetime of an HTTP request or report.** Application and report execution must have an overall time budget and appropriate cancellation/recovery behavior.

### 7.1 Reporting protection

- Route confirmed high-cost analytical queries to the `HIGH` pool through explicit repository/service policy.
- Limit the number of concurrently executing heavy requests to prevent overloading the ADW `HIGH` service.
- Reject, defer or control excess report work; do not silently launch unlimited background jobs.
- Monitor both **application pool queues** and **Oracle-side statement queuing**.
- Test interactive API responsiveness during peak report activity.
- Keep report permissions and organization/record scope enforcement consistent with Document 04.

## 8. Error Handling, Monitoring and Availability

Oracle errors must be captured by centralized technical logging and translated into safe application errors. Client responses follow **Document 02**; raw SQL text, bound sensitive values, credentials, wallet information, connection strings and Oracle stack traces must not be returned to the browser.

| Failure | Required response pattern |
|---|---|
| Database not reachable | Controlled service-unavailable behavior; readiness reflects inability to serve critical operations. |
| Pool exhausted or queue timed out | Bounded failure and operational alert; no unlimited waiting. |
| Oracle uniqueness or integrity violation | Translate to the appropriate documented conflict/business error without leaking schema details. |
| SQL or mapping defect | Internal error, request correlation, protected diagnostic log and corrective test. |
| Report too expensive or timed out | Controlled termination/error or approved asynchronous export behavior. |
| Unknown write outcome | Check authoritative state and idempotency information before retrying. |

**Operational metrics** should include connections currently in use, pool limits, acquire/wait times, queue timeouts, SQL latency, `LOW` versus `HIGH` request mix, heavy-report concurrency, Oracle-side queuing where observable, rollback frequency and connection failures.

A liveness check should verify the Node.js process rather than restarting it for every short Oracle outage. A readiness check should indicate whether essential database dependencies are usable. Specific health-check design and alerting infrastructure belong to **Document 05**.

## 9. Existing Schema, Database Permissions and Change Management

The existing Oracle ADW database schema is the starting point for every modernized feature. **Schema redesign is not part of the backend foundation.**

### 9.1 Existing-object policy

- Confirm the actual legacy tables, relationships, constraints, indexes, views, stored procedures and triggers before relying on them.
- Retain existing business data, behavior, and accepted reporting results unless an enhancement has been approved.
- Do not invent database fields or create replacement business tables for convenience.
- Record an explicit impact assessment before a change to an existing business object.
- Document required Oracle grants and runtime privileges; do not assume current CI3 grants are appropriate for the new backend.

The new **user-management/RBAC structures** are an approved future capability, but their **physical design and creation will occur after the initial backend project setup**. The session-store mechanism is also not yet finalized. Existing CI3 user migration is **outside the backend development scope**.

### 9.2 Approved database change procedure

When an approved enhancement genuinely requires a database change:

1. Record the business reason, impacted objects, affected CI3 consumers and recovery considerations.
2. Review the proposed change and obtain explicit approval.
3. Store the approved Oracle SQL/SQLcl deployment script in version control with a unique change identifier and documented execution history.
4. Test the change in a suitable isolated nonproduction environment; check compatibility with CI3 and Express.
5. Deploy through authorized database access, verify the result, and record the applied version.
6. Retain a documented recovery or forward-fix plan. Oracle DDL usually commits implicitly and cannot be treated as a fully reversible ordinary DML transaction.

**No automatic schema synchronization or application-startup migrations** are part of this architecture. SQLcl is the delivery tooling; a Liquibase dependency is not required unless later approved.

### 9.3 Database access principles

The target design separates **object ownership**, **runtime access**, and **authorized schema deployment** responsibilities. Runtime access should have only the permissions required for its verified operations. Existing production grants will be assessed before restricting or changing them; no action should interrupt the operational CI3 application.

## 10. Verification and Open Implementation Values

Before considering the database foundation production-ready, confirm:

| Verification | Acceptance evidence |
|---|---|
| Thin-mode connectivity | Compatible wallet, required `LOW` and `HIGH` aliases, authenticated mTLS and clean startup. |
| Pool lifecycle | Each pool initializes once, connections are released, and shutdown is graceful. |
| Workload routing | Normal operations use `LOW`; approved heavy reports use `HIGH`; exceptions are reviewed. |
| CI3 compatibility | Existing business results and representative transactions match accepted CI3 behavior. |
| Transaction safety | Multi-repository commit, rollback, concurrency, constraint and unknown-outcome tests pass. |
| Security | Parameterized SQL, least privilege, wallet protection and no sensitive logging. |
| Performance | Concurrent CRUD with reporting load, pool exhaustion, query timeouts and resource usage are measured. |
| Recovery | Temporary Oracle unavailability and reconnection behavior are exercised. |

**Open implementation values** remain: actual wallet compatibility, database compute ECPU/OCPU and autoscaling configuration, numeric pool sizes/queue limits/timeouts, physical session storage, the new RBAC schema, verified CI3 schema inventory and hosting/network topology. These are not assumed in this document and must be settled during their relevant implementation stages.

## 11. Related Documents and Technical References

| Document | Covers |
|---|---|
| [01-SYSTEM_ARCHITECTURE.md](./01-SYSTEM_ARCHITECTURE.md) | Overall backend pattern, domain boundaries and request flow. |
| [02-API_DEVELOPMENT_STANDARDS.md](./02-API_DEVELOPMENT_STANDARDS.md) | REST responses, Joi validation, filters, pagination and OpenAPI. |
| **03-ORACLE_DATABASE_ARCHITECTURE.md** | Oracle connection pools, native SQL, transactions and schema governance. |
| `04-AUTHENTICATION_RBAC_SECURITY.md` | Permissions, session architecture, authentication and auditing. |
| `05-CONFIGURATION_OPERATIONS.md` | Environment configuration, secrets, runtime health, monitoring and deployment. |
| `06-ARCHITECTURE_DECISIONS_GUIDELINES.md` | Complete locked ADR register and implementation governance. |

**Oracle product references** (implementation guidance; the approved project architecture above governs the design):

- [Oracle node-oracledb — Connecting to Oracle Database](https://node-oracledb.readthedocs.io/en/stable/user_guide/connection_handling.html)
- [Oracle Autonomous Database — Predefined Database Services](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/predefined-database-services-names.html)
- [Oracle node-oracledb — Managing Transactions](https://node-oracledb.readthedocs.io/en/stable/user_guide/txn_management.html)
- [Oracle node-oracledb — Connection Pool API](https://node-oracledb.readthedocs.io/en/stable/api_manual/pool.html)

---

*Document end — ZR-BE-DB-03 · Version 1.0*
