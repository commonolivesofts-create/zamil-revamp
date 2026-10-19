# XX_ZRV_USER_PERMISSION_OVERRIDES — Database Design & Security Reference
**Design status:** **APPROVED AND LOCKED** · **Sequence:** 08/11 · **Columns:** 11 · **Approval:** 17 October 2026 · **Document purpose:** technical preservation, not schema change.

> **Source status:** Table columns and approvals were reconciled against the locked 17-Oct-2026 RBAC discussions and the previously generated, unexecuted `Zamil_Revamp_RBAC_11_Tables_Oracle_ADW.sql` snapshot. Architecture document 01 and API document 02 were discoverable in the project Library; the full text of architecture documents 03–06 was **not available for independent byte-level verification in this run**. Shared standards cited below are corroborated by the RBAC discussion; any unverified detail is explicitly identified. No Oracle database was accessed.

## A. Overview and responsibility
**Business and technical purpose.** Stores one direct per-user decision for a permission, permitting an explicit ALLOW grant without a role or an explicit DENY taking precedence over role grants.
**Why it is necessary.** Security administrators could not implement tightly scoped individual exceptions without altering a shared role and affecting other employees.
**When and where used.** Evaluated before role-derived grants and managed by specifically authorized administrators.
**Boundary in the RBAC system.** Individual ALLOW/DENY exceptions. This table participates in the approved 11-table centralized authorization design. It is not a source of Oracle Fusion employee profile attributes. Its responsibilities do not imply direct role or permission grants beyond the approved foreign-key model.

## B. Approved column catalog
| # | Column | Exact Oracle datatype | Nullability | Default / generation | Key / important validation | Representative value |
|---:|---|---|---|---|---|---|
| 1 | `USER_PERMISSION_OVERRIDE_ID` | `NUMBER(19,0)` | NOT NULL | `GENERATED ALWAYS AS IDENTITY` | PK; NOT NULL / required; identity primary key | `7001` |
| 2 | `USER_ID` | `NUMBER(19,0)` | NOT NULL | `—` | FK; NOT NULL / required; verify corresponding FK where present | `105` |
| 3 | `PERMISSION_ID` | `NUMBER(19,0)` | NOT NULL | `—` | FK; NOT NULL / required; verify corresponding FK where present | `1004` |
| 4 | `OVERRIDE_EFFECT` | `VARCHAR2(5 CHAR)` | NOT NULL | `—` | —; NOT NULL / required; ALLOW/DENY | `DENY` |
| 5 | `JUSTIFICATION` | `VARCHAR2(500 CHAR)` | NOT NULL | `—` | —; NOT NULL / required; nonblank after trim | `Approval temporarily restricted pending reassignment` |
| 6 | `IS_ACTIVE` | `NUMBER(1,0)` | NOT NULL | `1` | —; NOT NULL / required; 0 or 1 | `1` |
| 7 | `EXPIRES_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; UTC instant; lifecycle validity checked by backend | `2026-10-20T15:00:00+00:00` |
| 8 | `CREATED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NOT NULL | `(SYSTIMESTAMP AT TIME ZONE 'UTC')` | —; NOT NULL / required; UTC event timestamp | `2026-10-17T09:30:00+00:00` |
| 9 | `CREATED_BY` | `NUMBER(19,0)` | NULL allowed | `—` | FK; verify corresponding FK where present | `1` |
| 10 | `UPDATED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `NULL` |
| 11 | `UPDATED_BY` | `NUMBER(19,0)` | NULL allowed | `—` | FK; verify corresponding FK where present | `NULL` |

### Column-by-column semantics, population and mutability
**`USER_PERMISSION_OVERRIDE_ID` — `NUMBER(19,0)`.** Stable record key for a per-user permission exception. **Population/change:** Generated on INSERT by Oracle; must never be rewritten or supplied by ordinary application clients. **Validation/security:** NOT NULL / required; identity primary key **Example:** `7001`.

**`USER_ID` — `NUMBER(19,0)`.** Foreign key to XX_ZRV_USERS.USER_ID identifying the user concerned with this individual allow/deny exceptions record, not the Fusion employee master USER_ID. **Population/change:** Set on relationship creation after parent lookup; normally stable, with new grants/targets handled by controlled administration. **Validation/security:** NOT NULL / required; verify corresponding FK where present **Example:** `105`.

**`PERMISSION_ID` — `NUMBER(19,0)`.** Required FK to XX_ZRV_PERMISSIONS.PERMISSION_ID identifying the exact business action to grant or override. **Population/change:** Set on relationship creation after parent lookup; normally stable, with new grants/targets handled by controlled administration. **Validation/security:** NOT NULL / required; verify corresponding FK where present **Example:** `1004`.

**`OVERRIDE_EFFECT` — `VARCHAR2(5 CHAR)`.** Mandatory ALLOW or DENY decision. Direct DENY supersedes role-derived ALLOW; direct ALLOW can work without a role grant. **Population/change:** Set by an authorized administrator and audited on every material change; not editable by the affected ordinary user. **Validation/security:** NOT NULL / required; ALLOW/DENY **Example:** `DENY`.

**`JUSTIFICATION` — `VARCHAR2(500 CHAR)`.** Required business/security explanation for a direct exception; audited on modification. **Population/change:** Set by an authorized administrator and audited on every material change; not editable by the affected ordinary user. **Validation/security:** NOT NULL / required; nonblank after trim **Example:** `Approval temporarily restricted pending reassignment`.

**`IS_ACTIVE` — `NUMBER(1,0)`.** Binary lifecycle switch for individual allow/deny exceptions (1 active, 0 inactive); deactivation preserves references and history. A disabled object has no effective authority through this record. **Population/change:** Defaults to 1; authorized administrators may switch 1↔0 with security audit and prompt effective-permission refresh. **Validation/security:** NOT NULL / required; 0 or 1 **Example:** `1`.

**`EXPIRES_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** Optional UTC expiration instant: NULL means ongoing until deactivated; an elapsed expiration is ineffective without a background update. **Population/change:** Set when the role/override is assigned; NULL means indefinite validity; changes require authorization and auditing. **Validation/security:** UTC instant; lifecycle validity checked by backend **Example:** `2026-10-20T15:00:00+00:00`.

**`CREATED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC timestamp of row creation, with database default SYSTIMESTAMP AT TIME ZONE UTC. In the audit-log table specifically, it represents event recording time. **Population/change:** Set by Oracle UTC default if omitted; creation value must remain unchanged. **Validation/security:** NOT NULL / required; UTC event timestamp **Example:** `2026-10-17T09:30:00+00:00`.

**`CREATED_BY` — `NUMBER(19,0)`.** Authenticated account responsible for creation where attributable. Nullable for approved bootstrap/self-service/system cases; USER_SESSIONS requires authenticated account, matching USER_ID. **Population/change:** Set from validated actor context at INSERT; do not rewrite later. **Validation/security:** verify corresponding FK where present **Example:** `1`.

**`UPDATED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC timestamp of last permitted record modification, nullable and initially NULL. The RBAC audit-log table is a special case where it must always remain NULL. **Population/change:** Initially NULL; set to the UTC change instant only when a real modification succeeds. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `NULL`.

**`UPDATED_BY` — `NUMBER(19,0)`.** Authenticated account responsible for last permitted modification when attributable; nullable. The RBAC audit-log table is a special case where it must always remain NULL. **Population/change:** Initially NULL; set to validated actor only on permitted modification. **Validation/security:** verify corresponding FK where present **Example:** `NULL`.

## C. Keys, constraints, validation and indexes
The following constraint names and rules are transcribed from the previously prepared, **unexecuted** DDL snapshot. Database constraints protect row integrity; eligibility and authorization checks remain backend responsibilities.

| Constraint | Approved rule / purpose | Failure prevented |
|---|---|---|
| `PK_ZRV_UPO` | Establishes immutable row identity; prevents ambiguous joins and records. `PRIMARY KEY (USER_PERMISSION_OVERRIDE_ID)` | Without it, dependent FKs and precise event/row references would fail. |
| `UQ_ZRV_UPO_USER_PERM` | Prohibits duplicate keys or assignment pairs, including previously deactivated rows. `UNIQUE (USER_ID, PERMISSION_ID)` | Without it, repeated grants, inconsistent logins or duplicate policy decisions could occur. |
| `CK_ZRV_UPO_EFFECT` | Restricts the column to agreed lifecycle or decision values. `CHECK (OVERRIDE_EFFECT IN ('ALLOW', 'DENY'))` | Without it, the backend could receive unknown states and make unsafe policy assumptions. |
| `CK_ZRV_UPO_REASON` | Enforces a reviewed data-consistency invariant in the approved DDL. `CHECK (TRIM(JUSTIFICATION) IS NOT NULL)` | Without it, invalid or internally inconsistent values may enter the data model. |
| `CK_ZRV_UPO_ACTIVE` | Restricts the column to agreed lifecycle or decision values. `CHECK (IS_ACTIVE IN (0, 1))` | Without it, the backend could receive unknown states and make unsafe policy assumptions. |
| `FK_ZRV_UPO_USER` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (USER_ID) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |
| `FK_ZRV_UPO_PERM` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (PERMISSION_ID) REFERENCES XX_ZRV_PERMISSIONS (PERMISSION_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |
| `FK_ZRV_UPO_CBY` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (CREATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |
| `FK_ZRV_UPO_UBY` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (UPDATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |

**NOT NULL and defaults.** `NOT NULL` requirements are listed per column above. Oracle-generated identity IDs are not user-supplied. Explicit non-identity defaults in this table: `IS_ACTIVE` = `1`, `CREATED_AT` = `(SYSTIMESTAMP AT TIME ZONE 'UTC')`. SQL CHECK constraints do not replace Joi validation or safe backend state transitions.

**Indexes.** Oracle normally supplies supporting indexes for PK/UNIQUE constraints; do not create duplicate equivalents. The separately approved/indexed reverse lookups are:
```sql
CREATE INDEX IX_ZRV_UPO_PERM ON XX_ZRV_USER_PERMISSION_OVERRIDES (PERMISSION_ID);
```

**Constraint enforcement boundary.** A FK proves a parent row exists, not that the parent remains active; an expiry CHECK cannot consult the continuously changing clock; and a row CHECK cannot evaluate effective permissions across many tables. Those requirements belong in transaction-aware Node.js services and middleware.

## D. Relationships and referential integrity
**Parent tables:** [XX_ZRV_PERMISSIONS](XX_ZRV_PERMISSIONS.md), [XX_ZRV_USERS](XX_ZRV_USERS.md).
**Direct RBAC children:** None in the approved schema; other components can still query the table logically.

| FK constraint | Child column | Parent key | Relationship meaning |
|---|---|---|---|
| `FK_ZRV_UPO_USER` | `XX_ZRV_USER_PERMISSION_OVERRIDES.USER_ID` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_USER_PERMISSION_OVERRIDES records can reference one parent record; nullability follows the column definition. |
| `FK_ZRV_UPO_PERM` | `XX_ZRV_USER_PERMISSION_OVERRIDES.PERMISSION_ID` | `XX_ZRV_PERMISSIONS.PERMISSION_ID` | Many XX_ZRV_USER_PERMISSION_OVERRIDES records can reference one parent record; nullability follows the column definition. |
| `FK_ZRV_UPO_CBY` | `XX_ZRV_USER_PERMISSION_OVERRIDES.CREATED_BY` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_USER_PERMISSION_OVERRIDES records can reference one parent record; nullability follows the column definition. |
| `FK_ZRV_UPO_UBY` | `XX_ZRV_USER_PERMISSION_OVERRIDES.UPDATED_BY` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_USER_PERMISSION_OVERRIDES records can reference one parent record; nullability follows the column definition. |

**Direct parent relationship sketch** (conceptual cardinalities; nullable audit actor FKs may be absent):
```mermaid
erDiagram
    XX_ZRV_PERMISSIONS ||--o{ XX_ZRV_USER_PERMISSION_OVERRIDES : "references"
    XX_ZRV_USERS ||--o{ XX_ZRV_USER_PERMISSION_OVERRIDES : "references"
```

**Insertion/deletion rules:** Create core parents before dependent relationships. Oracle FKs prevent inserting nonexistent parent keys and ordinarily prevent deleting parents that still have referencing rows. Approved administration favors deactivation, revocation or expiration over hard deletion; never enable cascade deletion of access/audit history by convenience. Join through approved numeric IDs for RBAC and through verified employee number for Fusion profile context.

## E. Operational usage and realistic example
**Create:** Authorized administrator records a user, permission, decision, required business justification and optional expiry.
**Read:** Every protected authorization uses active, unexpired direct overrides before considering ordinary role grants.
**Update:** Modify effect, justification, expiry or IS_ACTIVE on the same pair; audit old and new values.
**Deactivate/revoke/expire:** Deactivate or allow expiry; then fall back to ordinary role grants/default DENY rather than automatically granting/denying.

**Illustrative record** (not real employee or operational data; credential secrets always redacted):
| Column | Sample value |
|---|---|
| `USER_PERMISSION_OVERRIDE_ID` | `7001` |
| `USER_ID` | `105` |
| `PERMISSION_ID` | `1004` |
| `OVERRIDE_EFFECT` | `DENY` |
| `JUSTIFICATION` | `Approval temporarily restricted pending reassignment` |
| `IS_ACTIVE` | `1` |
| `EXPIRES_AT` | `2026-10-20T15:00:00+00:00` |
| `CREATED_AT` | `2026-10-17T09:30:00+00:00` |
| `CREATED_BY` | `1` |
| `UPDATED_AT` | `NULL` |
| `UPDATED_BY` | `NULL` |

**How to interpret the example.** This is one conceptual record in the Zamil-Revamp RBAC model, linked only to demonstrative other records (for example local user 105, production role 20, resource 101). A `NULL` sample is deliberately an allowed absence, not proof that the field is always NULL. Identifiers, employee numbers, times and client IP addresses are illustrative.

## F. Complete record lifecycle
1. **Pre-create:** Validate relevant parents, eligibility, required field types and authorization before issuing database work. Authorized administrator records a user, permission, decision, required business justification and optional expiry.
2. **Create:** Use a bind-variable INSERT omitting generated IDs and allowing the UTC default; populate verified actor and required business fields. Insert any critical security audit event in the same transaction.
3. **Read/use:** Every protected authorization uses active, unexpired direct overrides before considering ordinary role grants.
4. **Modify:** Modify effect, justification, expiry or IS_ACTIVE on the same pair; audit old and new values. Enforce actual state transitions and audit actor metadata.
5. **End effective life:** Deactivate or allow expiry; then fall back to ordinary role grants/default DENY rather than automatically granting/denying.
6. **Historical/retention treatment:** Preserve referenced security history under the approved non-cascade approach; retention duration, archival implementation and privileged purge access are unresolved policy decisions unless stated otherwise below.

## G. Security, access control and abuse prevention
**Approved security and business invariants:**
- UNIQUE(USER_ID,PERMISSION_ID) prevents contradictory simultaneous ALLOW and DENY rows.
- OVERRIDE_EFFECT is exactly ALLOW or DENY; JUSTIFICATION is mandatory and nonblank.
- Direct DENY beats role-based ALLOW; direct ALLOW may authorize without a role grant, but never bypasses mandatory account/MFA/module/resource/record restrictions.
- Inactive/expired exceptions are ignored, including inactive DENY (normal role evaluation resumes).
- Sensitive ALLOW exceptions require appropriately strong administrator authority and audit.

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
- UNIQUE(USER_ID,PERMISSION_ID) prevents contradictory simultaneous ALLOW and DENY rows.
- OVERRIDE_EFFECT is exactly ALLOW or DENY; JUSTIFICATION is mandatory and nonblank.
- Direct DENY beats role-based ALLOW; direct ALLOW may authorize without a role grant, but never bypasses mandatory account/MFA/module/resource/record restrictions.
- Inactive/expired exceptions are ignored, including inactive DENY (normal role evaluation resumes).
- Sensitive ALLOW exceptions require appropriately strong administrator authority and audit.

### Discussed and explicitly excluded from this table
- ROLE_ID, RESOURCE_ID, MODULE_ID, ACTION_CODE (derivable).
- EMPLOYEE_NUMBER (join through USERS).
- APPROVED_BY and EFFECTIVE_FROM (not approved workflows).
- REVOKED_AT (change history in audit event).

### Not Confirmed / Requires Clarification / Not Yet Decided
- **Open item:** Default maximum ALLOW override lifetime for sensitive privileges, and any secondary approval policy: Not Yet Decided.

### Decision rationale and trade-off
The table is intentionally restricted to **individual allow/deny exceptions**. Adding the rejected fields would either duplicate normalized RBAC/Fusion facts, create conflicting sources of truth, or couple access controls to presentation or transport details. The compact design allows controlled expansion **only through a separately approved design change**. The present document records approval history; recommendations or open items are not retroactively approved.

## J. Node.js / Express / React / Oracle integration
**Expected service behavior.** Evaluated before role-derived grants and managed by specifically authorized administrators. The owning feature service verifies policy and transactions; its repository performs bounded Oracle SQL using binds and shared pooled connections. Controllers validate request contracts using Joi and return sanitized standardized responses. Auth/session and resource/action checks belong in centralized middleware plus domain-level business services. **No API URL is defined or approved by this document.**
**Typical repository operations.** Authorized administrator records a user, permission, decision, required business justification and optional expiry. Every protected authorization uses active, unexpired direct overrides before considering ordinary role grants. Modify effect, justification, expiry or IS_ACTIVE on the same pair; audit old and new values.
**Transaction responsibility.** Services own one Oracle connection per transaction and commit related security state/audit inserts together when success must be atomic. For failed attempts, record an independent audit event rather than losing it to a business rollback. Never infer external Fusion integration atomicity from an Oracle local transaction.
**React responsibilities.** Consume safe projected account/permission metadata only, never hash material, shared secrets, session bearer tokens or privileged raw audit details. Components display roles/permissions for usability; the backend repeats every mandatory check.
**Error classes to test.** Invalid input (400-style validation), missing parent/not found, duplicate unique key/conflict, inactive or ineligible account, unauthorized action (403), expired/revoked credential, concurrency conflict, Oracle transaction failure and audit-write failure. Final status codes and route contracts remain feature-specific and **not approved here**.

## K. Edge cases and expected handling
- **Case:** Same user/permission cannot have simultaneous ALLOW and DENY rows. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** Direct DENY beats role grant; ALLOW can grant absent role, subject to mandatory policies. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** Expired/inactive override ceases effect without mutating row. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** Blank JUSTIFICATION fails and self-granting attempts are rejected. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.

**Concurrency:** Where multiple administrators or authentication requests act simultaneously, uniqueness and Oracle transactions are the last line of integrity defense; service-level guards must re-check current state while holding appropriate locks or implementing safe atomic updates. **Not Confirmed:** the final distributed cache invalidation and retry strategy.

## L. Implementation checklist and verification guidance
**Dependency and creation-order guidance:** `XX_ZRV_USERS` first (self-reference permitted), then ROLES and APP_MODULES, RESOURCES, PERMISSIONS, USER_ROLES, ROLE_PERMISSIONS, USER_PERMISSION_OVERRIDES, USER_SESSIONS, ACCOUNT_ACTION_TOKENS, RBAC_AUDIT_LOGS. Existing Fusion master is external, not created here. This order follows the previously produced SQL script; no runtime DDL is executed by these documents.

**Database verification (planned, not executed):** inspect USER_TAB_COLUMNS, USER_CONSTRAINTS, USER_CONS_COLUMNS and USER_INDEXES for exact datatypes/defaults/nullable flags, FK parent names and checks; test required/invalid duplicate inserts in nonproduction and verify error outcomes. Confirm data dictionary and Oracle version compatibility before any deployment.

**Specific acceptance tests (planned, not executed):
- [ ] Same user/permission cannot have simultaneous ALLOW and DENY rows.
- [ ] Direct DENY beats role grant; ALLOW can grant absent role, subject to mandatory policies.
- [ ] Expired/inactive override ceases effect without mutating row.
- [ ] Blank JUSTIFICATION fails and self-granting attempts are rejected.

**Cross-layer verification (planned, not executed):** exercise normal and failure workflows using Node.js native test runner and Supertest, plus isolated Oracle test data. Verify backend denial even when React controls are manipulated; check JSON/log redaction, role-cache freshness, safe ID precision, and precise UTC/KSA conversions. Record evidence of tests actually executed and never call planned checks "passed".

**New recommendations, not approvals:** validate physical Oracle CHECK/DEFAULT compilation on the target ADW before running in production, secure least-privilege runtime grants, size operational log retention after actual workload measurement, and document an approved rollback/reconciliation plan. None modifies a locked field.

## M. CREATE TABLE statement — documented existing DDL snapshot
> **IMPORTANT:** The statement below is reproduced verbatim from the previously generated SQL file for technical reference. It has **not been executed or compiled against your Oracle instance**, and its inclusion is not approval to change the schema. Standalone CREATE TABLE may depend on parent tables being present; supporting indexes and append-only trigger, where applicable, follow separately.
```sql
CREATE TABLE XX_ZRV_USER_PERMISSION_OVERRIDES (
    USER_PERMISSION_OVERRIDE_ID NUMBER(19,0) GENERATED ALWAYS AS IDENTITY,
    USER_ID                     NUMBER(19,0) NOT NULL,
    PERMISSION_ID               NUMBER(19,0) NOT NULL,
    OVERRIDE_EFFECT             VARCHAR2(5 CHAR) NOT NULL,
    JUSTIFICATION               VARCHAR2(500 CHAR) NOT NULL,
    IS_ACTIVE                   NUMBER(1,0) DEFAULT 1 NOT NULL,
    EXPIRES_AT                  TIMESTAMP(6) WITH TIME ZONE,
    CREATED_AT                  TIMESTAMP(6) WITH TIME ZONE DEFAULT (SYSTIMESTAMP AT TIME ZONE 'UTC') NOT NULL,
    CREATED_BY                  NUMBER(19,0),
    UPDATED_AT                  TIMESTAMP(6) WITH TIME ZONE,
    UPDATED_BY                  NUMBER(19,0),
    CONSTRAINT PK_ZRV_UPO PRIMARY KEY (USER_PERMISSION_OVERRIDE_ID),
    CONSTRAINT UQ_ZRV_UPO_USER_PERM UNIQUE (USER_ID, PERMISSION_ID),
    CONSTRAINT CK_ZRV_UPO_EFFECT CHECK (OVERRIDE_EFFECT IN ('ALLOW', 'DENY')),
    CONSTRAINT CK_ZRV_UPO_REASON CHECK (TRIM(JUSTIFICATION) IS NOT NULL),
    CONSTRAINT CK_ZRV_UPO_ACTIVE CHECK (IS_ACTIVE IN (0, 1)),
    CONSTRAINT FK_ZRV_UPO_USER FOREIGN KEY (USER_ID) REFERENCES XX_ZRV_USERS (USER_ID),
    CONSTRAINT FK_ZRV_UPO_PERM FOREIGN KEY (PERMISSION_ID) REFERENCES XX_ZRV_PERMISSIONS (PERMISSION_ID),
    CONSTRAINT FK_ZRV_UPO_CBY FOREIGN KEY (CREATED_BY) REFERENCES XX_ZRV_USERS (USER_ID),
    CONSTRAINT FK_ZRV_UPO_UBY FOREIGN KEY (UPDATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)
);
```

### Supporting indexes — separately approved DDL snapshot
```sql
CREATE INDEX IX_ZRV_UPO_PERM ON XX_ZRV_USER_PERMISSION_OVERRIDES (PERMISSION_ID);
```

## N. Related reading and traceability
- Other directly related finalized table documents: [XX_ZRV_PERMISSIONS](XX_ZRV_PERMISSIONS.md), [XX_ZRV_USERS](XX_ZRV_USERS.md).
- [README.md](README.md) — cross-table index, decision statuses, outstanding confirmation items and complete system-level authorization flow.
- Approved backend architecture references (project `server/docs/`): `01-SYSTEM_ARCHITECTURE.md`, `02-API_DEVELOPMENT_STANDARDS.md`, `03-ORACLE_DATABASE_ARCHITECTURE.md`, `04-AUTHENTICATION_RBAC_SECURITY.md`, `05-CONFIGURATION_OPERATIONS.md`, `06-ARCHITECTURE_DECISIONS_GUIDELINES.md`. Only architecture 01/02 were retrievable by file search in this run; explicit RBAC approvals supersede their earlier "tables pending" wording.
- Oracle DDL reference: previously generated `Zamil_Revamp_RBAC_11_Tables_Oracle_ADW.sql` (unexecuted static snapshot).
- Documentation status: **Design APPROVED AND LOCKED; database execution and full integration verification NOT PERFORMED.**
