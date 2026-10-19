# XX_ZRV_RESOURCES — Database Design & Security Reference
**Design status:** **APPROVED AND LOCKED** · **Sequence:** 04/11 · **Columns:** 10 · **Approval:** 17 October 2026 · **Document purpose:** technical preservation, not schema change.

> **Source status:** Table columns and approvals were reconciled against the locked 17-Oct-2026 RBAC discussions and the previously generated, unexecuted `Zamil_Revamp_RBAC_11_Tables_Oracle_ADW.sql` snapshot. Architecture document 01 and API document 02 were discoverable in the project Library; the full text of architecture documents 03–06 was **not available for independent byte-level verification in this run**. Shared standards cited below are corroborated by the RBAC discussion; any unverified detail is explicitly identified. No Oracle database was accessed.

## A. Overview and responsibility
**Business and technical purpose.** Defines a protected business resource owned by one application module, such as PRODUCTION / WORK_ORDERS, independently of individual React controls or HTTP endpoints.
**Why it is necessary.** Permissions could not be tied consistently to a stable business capability, forcing fragile URL- or screen-based policy.
**When and where used.** Read by permission checks, resource administration and module-level deactivation rules.
**Boundary in the RBAC system.** Protected business capabilities. This table participates in the approved 11-table centralized authorization design. It is not a source of Oracle Fusion employee profile attributes. Its responsibilities do not imply direct role or permission grants beyond the approved foreign-key model.

## B. Approved column catalog
| # | Column | Exact Oracle datatype | Nullability | Default / generation | Key / important validation | Representative value |
|---:|---|---|---|---|---|---|
| 1 | `RESOURCE_ID` | `NUMBER(19,0)` | NOT NULL | `GENERATED ALWAYS AS IDENTITY` | PK; NOT NULL / required; identity primary key; verify corresponding FK where present | `101` |
| 2 | `MODULE_ID` | `NUMBER(19,0)` | NOT NULL | `—` | FK; NOT NULL / required; verify corresponding FK where present | `10` |
| 3 | `RESOURCE_CODE` | `VARCHAR2(80 CHAR)` | NOT NULL | `—` | —; NOT NULL / required; uppercase, trimmed, A–Z / 0–9 / underscore, starts with a letter | `WORK_ORDERS` |
| 4 | `RESOURCE_NAME` | `VARCHAR2(120 CHAR)` | NOT NULL | `—` | —; NOT NULL / required; nonblank after trim | `Work Orders` |
| 5 | `DESCRIPTION` | `VARCHAR2(500 CHAR)` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `Production work-order operations` |
| 6 | `IS_ACTIVE` | `NUMBER(1,0)` | NOT NULL | `1` | —; NOT NULL / required; 0 or 1 | `1` |
| 7 | `CREATED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NOT NULL | `(SYSTIMESTAMP AT TIME ZONE 'UTC')` | —; NOT NULL / required; UTC event timestamp | `2026-10-17T08:00:00+00:00` |
| 8 | `CREATED_BY` | `NUMBER(19,0)` | NULL allowed | `—` | FK; verify corresponding FK where present | `1` |
| 9 | `UPDATED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `NULL` |
| 10 | `UPDATED_BY` | `NUMBER(19,0)` | NULL allowed | `—` | FK; verify corresponding FK where present | `NULL` |

### Column-by-column semantics, population and mutability
**`RESOURCE_ID` — `NUMBER(19,0)`.** Stable resource identity and mandatory parent FK for resource-specific permissions. **Population/change:** Generated on INSERT by Oracle; must never be rewritten or supplied by ordinary application clients. **Validation/security:** NOT NULL / required; identity primary key; verify corresponding FK where present **Example:** `101`.

**`MODULE_ID` — `NUMBER(19,0)`.** Required FK to XX_ZRV_APP_MODULES.MODULE_ID owning this resource; one module may own many resources. **Population/change:** Set on creation; any permitted change follows feature validation, RBAC authorization and audit rules. **Validation/security:** NOT NULL / required; verify corresponding FK where present **Example:** `10`.

**`RESOURCE_CODE` — `VARCHAR2(80 CHAR)`.** Stable uppercase code identifying a business capability only within its owning MODULE_ID. **Population/change:** Set on provisioning/registration after normalization; treat as stable after first use and review changes that would affect references. **Validation/security:** NOT NULL / required; uppercase, trimmed, A–Z / 0–9 / underscore, starts with a letter **Example:** `WORK_ORDERS`.

**`RESOURCE_NAME` — `VARCHAR2(120 CHAR)`.** Readable business capability label, distinct from React routes and API URLs. **Population/change:** Set on creation; any permitted change follows feature validation, RBAC authorization and audit rules. **Validation/security:** NOT NULL / required; nonblank after trim **Example:** `Work Orders`.

**`DESCRIPTION` — `VARCHAR2(500 CHAR)`.** Optional business-purpose explanation; no secrets or sensitive personal data. **Population/change:** Set on creation; any permitted change follows feature validation, RBAC authorization and audit rules. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `Production work-order operations`.

**`IS_ACTIVE` — `NUMBER(1,0)`.** Binary lifecycle switch for protected business capabilities (1 active, 0 inactive); deactivation preserves references and history. A disabled object has no effective authority through this record. **Population/change:** Defaults to 1; authorized administrators may switch 1↔0 with security audit and prompt effective-permission refresh. **Validation/security:** NOT NULL / required; 0 or 1 **Example:** `1`.

**`CREATED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC timestamp of row creation, with database default SYSTIMESTAMP AT TIME ZONE UTC. In the audit-log table specifically, it represents event recording time. **Population/change:** Set by Oracle UTC default if omitted; creation value must remain unchanged. **Validation/security:** NOT NULL / required; UTC event timestamp **Example:** `2026-10-17T08:00:00+00:00`.

**`CREATED_BY` — `NUMBER(19,0)`.** Authenticated account responsible for creation where attributable. Nullable for approved bootstrap/self-service/system cases; USER_SESSIONS requires authenticated account, matching USER_ID. **Population/change:** Set from validated actor context at INSERT; do not rewrite later. **Validation/security:** verify corresponding FK where present **Example:** `1`.

**`UPDATED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC timestamp of last permitted record modification, nullable and initially NULL. The RBAC audit-log table is a special case where it must always remain NULL. **Population/change:** Initially NULL; set to the UTC change instant only when a real modification succeeds. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `NULL`.

**`UPDATED_BY` — `NUMBER(19,0)`.** Authenticated account responsible for last permitted modification when attributable; nullable. The RBAC audit-log table is a special case where it must always remain NULL. **Population/change:** Initially NULL; set to validated actor only on permitted modification. **Validation/security:** verify corresponding FK where present **Example:** `NULL`.

## C. Keys, constraints, validation and indexes
The following constraint names and rules are transcribed from the previously prepared, **unexecuted** DDL snapshot. Database constraints protect row integrity; eligibility and authorization checks remain backend responsibilities.

| Constraint | Approved rule / purpose | Failure prevented |
|---|---|---|
| `PK_ZRV_RES` | Establishes immutable row identity; prevents ambiguous joins and records. `PRIMARY KEY (RESOURCE_ID)` | Without it, dependent FKs and precise event/row references would fail. |
| `UQ_ZRV_RES_MOD_CODE` | Prohibits duplicate keys or assignment pairs, including previously deactivated rows. `UNIQUE (MODULE_ID, RESOURCE_CODE)` | Without it, repeated grants, inconsistent logins or duplicate policy decisions could occur. |
| `CK_ZRV_RES_CODE` | Enforces canonical, stable machine-readable codes. `CHECK ( RESOURCE_CODE = TRIM(RESOURCE_CODE) AND REGEXP_LIKE(RESOURCE_CODE, '^[A-Z][A-Z0-9_]*$', 'c') )` | Without it, inconsistent casing or spacing could make authorization lookups disagree. |
| `CK_ZRV_RES_NAME` | Enforces a reviewed data-consistency invariant in the approved DDL. `CHECK (TRIM(RESOURCE_NAME) IS NOT NULL)` | Without it, invalid or internally inconsistent values may enter the data model. |
| `CK_ZRV_RES_ACTIVE` | Restricts the column to agreed lifecycle or decision values. `CHECK (IS_ACTIVE IN (0, 1))` | Without it, the backend could receive unknown states and make unsafe policy assumptions. |
| `FK_ZRV_RES_MOD` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (MODULE_ID) REFERENCES XX_ZRV_APP_MODULES (MODULE_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |
| `FK_ZRV_RES_CBY` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (CREATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |
| `FK_ZRV_RES_UBY` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (UPDATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |

**NOT NULL and defaults.** `NOT NULL` requirements are listed per column above. Oracle-generated identity IDs are not user-supplied. Explicit non-identity defaults in this table: `IS_ACTIVE` = `1`, `CREATED_AT` = `(SYSTIMESTAMP AT TIME ZONE 'UTC')`. SQL CHECK constraints do not replace Joi validation or safe backend state transitions.

**Indexes.** Oracle normally supplies supporting indexes for PK/UNIQUE constraints; do not create duplicate equivalents. The separately approved/indexed reverse lookups are:
No additional standalone index was approved for this table beyond its PK/UNIQUE support.

**Constraint enforcement boundary.** A FK proves a parent row exists, not that the parent remains active; an expiry CHECK cannot consult the continuously changing clock; and a row CHECK cannot evaluate effective permissions across many tables. Those requirements belong in transaction-aware Node.js services and middleware.

## D. Relationships and referential integrity
**Parent tables:** [XX_ZRV_APP_MODULES](XX_ZRV_APP_MODULES.md), [XX_ZRV_USERS](XX_ZRV_USERS.md).
**Child tables referencing this table:** [XX_ZRV_PERMISSIONS](XX_ZRV_PERMISSIONS.md).

| FK constraint | Child column | Parent key | Relationship meaning |
|---|---|---|---|
| `FK_ZRV_RES_MOD` | `XX_ZRV_RESOURCES.MODULE_ID` | `XX_ZRV_APP_MODULES.MODULE_ID` | Many XX_ZRV_RESOURCES records can reference one parent record; nullability follows the column definition. |
| `FK_ZRV_RES_CBY` | `XX_ZRV_RESOURCES.CREATED_BY` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_RESOURCES records can reference one parent record; nullability follows the column definition. |
| `FK_ZRV_RES_UBY` | `XX_ZRV_RESOURCES.UPDATED_BY` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_RESOURCES records can reference one parent record; nullability follows the column definition. |

**Direct parent relationship sketch** (conceptual cardinalities; nullable audit actor FKs may be absent):
```mermaid
erDiagram
    XX_ZRV_APP_MODULES ||--o{ XX_ZRV_RESOURCES : "references"
    XX_ZRV_USERS ||--o{ XX_ZRV_RESOURCES : "references"
```

**Insertion/deletion rules:** Create core parents before dependent relationships. Oracle FKs prevent inserting nonexistent parent keys and ordinarily prevent deleting parents that still have referencing rows. Approved administration favors deactivation, revocation or expiration over hard deletion; never enable cascade deletion of access/audit history by convenience. Join through approved numeric IDs for RBAC and through verified employee number for Fusion profile context.

## E. Operational usage and realistic example
**Create:** Authorized administrator identifies the owning module and defines a stable resource code/name.
**Read:** Authorization traverses PERMISSION -> RESOURCE -> MODULE to verify active ancestor objects.
**Update:** Human-readable metadata or IS_ACTIVE may be modified; resource codes are stable identifiers.
**Deactivate/revoke/expire:** IS_ACTIVE=0 renders its permissions ineffective, retaining child permission/grant history.

**Illustrative record** (not real employee or operational data; credential secrets always redacted):
| Column | Sample value |
|---|---|
| `RESOURCE_ID` | `101` |
| `MODULE_ID` | `10` |
| `RESOURCE_CODE` | `WORK_ORDERS` |
| `RESOURCE_NAME` | `Work Orders` |
| `DESCRIPTION` | `Production work-order operations` |
| `IS_ACTIVE` | `1` |
| `CREATED_AT` | `2026-10-17T08:00:00+00:00` |
| `CREATED_BY` | `1` |
| `UPDATED_AT` | `NULL` |
| `UPDATED_BY` | `NULL` |

**How to interpret the example.** This is one conceptual record in the Zamil-Revamp RBAC model, linked only to demonstrative other records (for example local user 105, production role 20, resource 101). A `NULL` sample is deliberately an allowed absence, not proof that the field is always NULL. Identifiers, employee numbers, times and client IP addresses are illustrative.

## F. Complete record lifecycle
1. **Pre-create:** Validate relevant parents, eligibility, required field types and authorization before issuing database work. Authorized administrator identifies the owning module and defines a stable resource code/name.
2. **Create:** Use a bind-variable INSERT omitting generated IDs and allowing the UTC default; populate verified actor and required business fields. Insert any critical security audit event in the same transaction.
3. **Read/use:** Authorization traverses PERMISSION -> RESOURCE -> MODULE to verify active ancestor objects.
4. **Modify:** Human-readable metadata or IS_ACTIVE may be modified; resource codes are stable identifiers. Enforce actual state transitions and audit actor metadata.
5. **End effective life:** IS_ACTIVE=0 renders its permissions ineffective, retaining child permission/grant history.
6. **Historical/retention treatment:** Preserve referenced security history under the approved non-cascade approach; retention duration, archival implementation and privileged purge access are unresolved policy decisions unless stated otherwise below.

## G. Security, access control and abuse prevention
**Approved security and business invariants:**
- Every resource has exactly one MODULE_ID (mandatory FK).
- Unique pair (MODULE_ID, RESOURCE_CODE); resource code can repeat under a different module.
- Resource represents an authorization boundary, not one API route, component, form or button.
- An inactive resource cannot be rescued by any direct user ALLOW override.

**Database vs backend responsibilities.** Oracle enforces identity, uniqueness, FK references, supported CHECK conditions and exact typed values. The Node.js service must enforce the right administrator authority, current account/Fusion employee eligibility, active modules/resources/permissions, direct ALLOW/DENY precedence, mandatory MFA, record-level/organizational policy, rate limiting, secure time windows and cross-row concurrency. React may render allowed actions but is never the authoritative policy enforcement point.
**Abuse cases:** protect against unauthorized self-assignment, stale access after revocation, tampered UI requests, forged identities, insecure logging and race conditions. Use parameterized SQL and least-privilege Oracle runtime grants. Password, TOTP and bearer-token values must never appear in logs or error details.

## H. Audit fields and timezone conventions
The approved shared standard uses **UTC exact event instants**, persisted as `TIMESTAMP(6) WITH TIME ZONE`, and presentation in **Asia/Riyadh** for Saudi users. The India development workstation timezone must not change stored instants. No event timestamp here is a date-only Oracle DATE business value.

| Field | Population rule | Nullability / lifecycle |
|---|---|---|
| `CREATED_AT` | Set by Oracle UTC default if omitted; creation value must remain unchanged. | NOT NULL; UTC default. |
| `CREATED_BY` | Set from validated actor context at INSERT; do not rewrite later. | NULL permitted; no default. |
| `UPDATED_AT` | Initially NULL; set to the UTC change instant only when a real modification succeeds. | NULL permitted; no default. |
| `UPDATED_BY` | Initially NULL; set to validated actor only on permitted modification. | NULL permitted; no default. |

## I. Locked decisions, rejected alternatives, and unresolved items
### Approved and locked — do not change without explicit authorization
- Every resource has exactly one MODULE_ID (mandatory FK).
- Unique pair (MODULE_ID, RESOURCE_CODE); resource code can repeat under a different module.
- Resource represents an authorization boundary, not one API route, component, form or button.
- An inactive resource cannot be rescued by any direct user ALLOW override.

### Discussed and explicitly excluded from this table
- API_ENDPOINT, HTTP_METHOD, ROUTE_PATH and ICON_NAME.
- CAN_VIEW, CAN_CREATE, CAN_UPDATE or CAN_DELETE flags (actions are permission rows).
- ROLE_ID, USER_ID and PERMISSION_ID (other relationships).
- RESOURCE_TYPE and DISPLAY_ORDER (not needed for security capability definition).

### Not Confirmed / Requires Clarification / Not Yet Decided
- **Open item:** Final production resource code inventory and handling of a shared capability displayed in several modules: Not Yet Decided.

### Decision rationale and trade-off
The table is intentionally restricted to **protected business capabilities**. Adding the rejected fields would either duplicate normalized RBAC/Fusion facts, create conflicting sources of truth, or couple access controls to presentation or transport details. The compact design allows controlled expansion **only through a separately approved design change**. The present document records approval history; recommendations or open items are not retroactively approved.

## J. Node.js / Express / React / Oracle integration
**Expected service behavior.** Read by permission checks, resource administration and module-level deactivation rules. The owning feature service verifies policy and transactions; its repository performs bounded Oracle SQL using binds and shared pooled connections. Controllers validate request contracts using Joi and return sanitized standardized responses. Auth/session and resource/action checks belong in centralized middleware plus domain-level business services. **No API URL is defined or approved by this document.**
**Typical repository operations.** Authorized administrator identifies the owning module and defines a stable resource code/name. Authorization traverses PERMISSION -> RESOURCE -> MODULE to verify active ancestor objects. Human-readable metadata or IS_ACTIVE may be modified; resource codes are stable identifiers.
**Transaction responsibility.** Services own one Oracle connection per transaction and commit related security state/audit inserts together when success must be atomic. For failed attempts, record an independent audit event rather than losing it to a business rollback. Never infer external Fusion integration atomicity from an Oracle local transaction.
**React responsibilities.** Consume safe projected account/permission metadata only, never hash material, shared secrets, session bearer tokens or privileged raw audit details. Components display roles/permissions for usability; the backend repeats every mandatory check.
**Error classes to test.** Invalid input (400-style validation), missing parent/not found, duplicate unique key/conflict, inactive or ineligible account, unauthorized action (403), expired/revoked credential, concurrency conflict, Oracle transaction failure and audit-write failure. Final status codes and route contracts remain feature-specific and **not approved here**.

## K. Edge cases and expected handling
- **Case:** Duplicate RESOURCE_CODE within a MODULE_ID fails; same code in different modules succeeds. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** Missing MODULE_ID fails FK validation. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** Inactive module or resource blocks effective permission. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.

**Concurrency:** Where multiple administrators or authentication requests act simultaneously, uniqueness and Oracle transactions are the last line of integrity defense; service-level guards must re-check current state while holding appropriate locks or implementing safe atomic updates. **Not Confirmed:** the final distributed cache invalidation and retry strategy.

## L. Implementation checklist and verification guidance
**Dependency and creation-order guidance:** `XX_ZRV_USERS` first (self-reference permitted), then ROLES and APP_MODULES, RESOURCES, PERMISSIONS, USER_ROLES, ROLE_PERMISSIONS, USER_PERMISSION_OVERRIDES, USER_SESSIONS, ACCOUNT_ACTION_TOKENS, RBAC_AUDIT_LOGS. Existing Fusion master is external, not created here. This order follows the previously produced SQL script; no runtime DDL is executed by these documents.

**Database verification (planned, not executed):** inspect USER_TAB_COLUMNS, USER_CONSTRAINTS, USER_CONS_COLUMNS and USER_INDEXES for exact datatypes/defaults/nullable flags, FK parent names and checks; test required/invalid duplicate inserts in nonproduction and verify error outcomes. Confirm data dictionary and Oracle version compatibility before any deployment.

**Specific acceptance tests (planned, not executed):
- [ ] Duplicate RESOURCE_CODE within a MODULE_ID fails; same code in different modules succeeds.
- [ ] Missing MODULE_ID fails FK validation.
- [ ] Inactive module or resource blocks effective permission.

**Cross-layer verification (planned, not executed):** exercise normal and failure workflows using Node.js native test runner and Supertest, plus isolated Oracle test data. Verify backend denial even when React controls are manipulated; check JSON/log redaction, role-cache freshness, safe ID precision, and precise UTC/KSA conversions. Record evidence of tests actually executed and never call planned checks "passed".

**New recommendations, not approvals:** validate physical Oracle CHECK/DEFAULT compilation on the target ADW before running in production, secure least-privilege runtime grants, size operational log retention after actual workload measurement, and document an approved rollback/reconciliation plan. None modifies a locked field.

## M. CREATE TABLE statement — documented existing DDL snapshot
> **IMPORTANT:** The statement below is reproduced verbatim from the previously generated SQL file for technical reference. It has **not been executed or compiled against your Oracle instance**, and its inclusion is not approval to change the schema. Standalone CREATE TABLE may depend on parent tables being present; supporting indexes and append-only trigger, where applicable, follow separately.
```sql
CREATE TABLE XX_ZRV_RESOURCES (
    RESOURCE_ID                 NUMBER(19,0) GENERATED ALWAYS AS IDENTITY,
    MODULE_ID                   NUMBER(19,0) NOT NULL,
    RESOURCE_CODE               VARCHAR2(80 CHAR) NOT NULL,
    RESOURCE_NAME               VARCHAR2(120 CHAR) NOT NULL,
    DESCRIPTION                 VARCHAR2(500 CHAR),
    IS_ACTIVE                   NUMBER(1,0) DEFAULT 1 NOT NULL,
    CREATED_AT                  TIMESTAMP(6) WITH TIME ZONE DEFAULT (SYSTIMESTAMP AT TIME ZONE 'UTC') NOT NULL,
    CREATED_BY                  NUMBER(19,0),
    UPDATED_AT                  TIMESTAMP(6) WITH TIME ZONE,
    UPDATED_BY                  NUMBER(19,0),
    CONSTRAINT PK_ZRV_RES PRIMARY KEY (RESOURCE_ID),
    CONSTRAINT UQ_ZRV_RES_MOD_CODE UNIQUE (MODULE_ID, RESOURCE_CODE),
    CONSTRAINT CK_ZRV_RES_CODE CHECK (
        RESOURCE_CODE = TRIM(RESOURCE_CODE)
        AND REGEXP_LIKE(RESOURCE_CODE, '^[A-Z][A-Z0-9_]*$', 'c')
    ),
    CONSTRAINT CK_ZRV_RES_NAME CHECK (TRIM(RESOURCE_NAME) IS NOT NULL),
    CONSTRAINT CK_ZRV_RES_ACTIVE CHECK (IS_ACTIVE IN (0, 1)),
    CONSTRAINT FK_ZRV_RES_MOD FOREIGN KEY (MODULE_ID) REFERENCES XX_ZRV_APP_MODULES (MODULE_ID),
    CONSTRAINT FK_ZRV_RES_CBY FOREIGN KEY (CREATED_BY) REFERENCES XX_ZRV_USERS (USER_ID),
    CONSTRAINT FK_ZRV_RES_UBY FOREIGN KEY (UPDATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)
);
```

## N. Related reading and traceability
- Other directly related finalized table documents: [XX_ZRV_APP_MODULES](XX_ZRV_APP_MODULES.md), [XX_ZRV_PERMISSIONS](XX_ZRV_PERMISSIONS.md), [XX_ZRV_USERS](XX_ZRV_USERS.md).
- [README.md](README.md) — cross-table index, decision statuses, outstanding confirmation items and complete system-level authorization flow.
- Approved backend architecture references (project `server/docs/`): `01-SYSTEM_ARCHITECTURE.md`, `02-API_DEVELOPMENT_STANDARDS.md`, `03-ORACLE_DATABASE_ARCHITECTURE.md`, `04-AUTHENTICATION_RBAC_SECURITY.md`, `05-CONFIGURATION_OPERATIONS.md`, `06-ARCHITECTURE_DECISIONS_GUIDELINES.md`. Only architecture 01/02 were retrievable by file search in this run; explicit RBAC approvals supersede their earlier "tables pending" wording.
- Oracle DDL reference: previously generated `Zamil_Revamp_RBAC_11_Tables_Oracle_ADW.sql` (unexecuted static snapshot).
- Documentation status: **Design APPROVED AND LOCKED; database execution and full integration verification NOT PERFORMED.**
