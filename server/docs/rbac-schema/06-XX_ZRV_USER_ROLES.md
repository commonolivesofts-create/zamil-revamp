# XX_ZRV_USER_ROLES — Database Design & Security Reference
**Design status:** **APPROVED AND LOCKED** · **Sequence:** 06/11 · **Columns:** 9 · **Approval:** 17 October 2026 · **Document purpose:** technical preservation, not schema change.

> **Source status:** Table columns and approvals were reconciled against the locked 17-Oct-2026 RBAC discussions and the previously generated, unexecuted `Zamil_Revamp_RBAC_11_Tables_Oracle_ADW.sql` snapshot. Architecture document 01 and API document 02 were discoverable in the project Library; the full text of architecture documents 03–06 was **not available for independent byte-level verification in this run**. Shared standards cited below are corroborated by the RBAC discussion; any unverified detail is explicitly identified. No Oracle database was accessed.

## A. Overview and responsibility
**Business and technical purpose.** Resolves the many-to-many user-role relationship and controls individual membership activation plus optional fixed UTC expiration.
**Why it is necessary.** A user could not be assigned multiple roles independently or receive time-limited role access.
**When and where used.** Queried on effective authorization, user access administration and role membership reporting.
**Boundary in the RBAC system.** User-to-role memberships. This table participates in the approved 11-table centralized authorization design. It is not a source of Oracle Fusion employee profile attributes. Its responsibilities do not imply direct role or permission grants beyond the approved foreign-key model.

## B. Approved column catalog
| # | Column | Exact Oracle datatype | Nullability | Default / generation | Key / important validation | Representative value |
|---:|---|---|---|---|---|---|
| 1 | `USER_ROLE_ID` | `NUMBER(19,0)` | NOT NULL | `GENERATED ALWAYS AS IDENTITY` | PK; NOT NULL / required; identity primary key | `1001` |
| 2 | `USER_ID` | `NUMBER(19,0)` | NOT NULL | `—` | FK; NOT NULL / required; verify corresponding FK where present | `105` |
| 3 | `ROLE_ID` | `NUMBER(19,0)` | NOT NULL | `—` | FK; NOT NULL / required; verify corresponding FK where present | `20` |
| 4 | `IS_ACTIVE` | `NUMBER(1,0)` | NOT NULL | `1` | —; NOT NULL / required; 0 or 1 | `1` |
| 5 | `EXPIRES_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; UTC instant; lifecycle validity checked by backend | `NULL` |
| 6 | `CREATED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NOT NULL | `(SYSTIMESTAMP AT TIME ZONE 'UTC')` | —; NOT NULL / required; UTC event timestamp | `2026-10-17T08:45:00+00:00` |
| 7 | `CREATED_BY` | `NUMBER(19,0)` | NULL allowed | `—` | FK; verify corresponding FK where present | `1` |
| 8 | `UPDATED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `NULL` |
| 9 | `UPDATED_BY` | `NUMBER(19,0)` | NULL allowed | `—` | FK; verify corresponding FK where present | `NULL` |

### Column-by-column semantics, population and mutability
**`USER_ROLE_ID` — `NUMBER(19,0)`.** Permanent record key for one user-role assignment; avoids reusing other objects as composite row identity. **Population/change:** Generated on INSERT by Oracle; must never be rewritten or supplied by ordinary application clients. **Validation/security:** NOT NULL / required; identity primary key **Example:** `1001`.

**`USER_ID` — `NUMBER(19,0)`.** Foreign key to XX_ZRV_USERS.USER_ID identifying the user concerned with this user-to-role memberships record, not the Fusion employee master USER_ID. **Population/change:** Set on relationship creation after parent lookup; normally stable, with new grants/targets handled by controlled administration. **Validation/security:** NOT NULL / required; verify corresponding FK where present **Example:** `105`.

**`ROLE_ID` — `NUMBER(19,0)`.** Foreign key to XX_ZRV_ROLES.ROLE_ID specifying the assigned or permission-owning role; must identify an existing role. **Population/change:** Set on relationship creation after parent lookup; normally stable, with new grants/targets handled by controlled administration. **Validation/security:** NOT NULL / required; verify corresponding FK where present **Example:** `20`.

**`IS_ACTIVE` — `NUMBER(1,0)`.** Binary lifecycle switch for user-to-role memberships (1 active, 0 inactive); deactivation preserves references and history. A disabled object has no effective authority through this record. **Population/change:** Defaults to 1; authorized administrators may switch 1↔0 with security audit and prompt effective-permission refresh. **Validation/security:** NOT NULL / required; 0 or 1 **Example:** `1`.

**`EXPIRES_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** Optional UTC expiration instant: NULL means ongoing until deactivated; an elapsed expiration is ineffective without a background update. **Population/change:** Set when the role/override is assigned; NULL means indefinite validity; changes require authorization and auditing. **Validation/security:** UTC instant; lifecycle validity checked by backend **Example:** `NULL`.

**`CREATED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC timestamp of row creation, with database default SYSTIMESTAMP AT TIME ZONE UTC. In the audit-log table specifically, it represents event recording time. **Population/change:** Set by Oracle UTC default if omitted; creation value must remain unchanged. **Validation/security:** NOT NULL / required; UTC event timestamp **Example:** `2026-10-17T08:45:00+00:00`.

**`CREATED_BY` — `NUMBER(19,0)`.** Authenticated account responsible for creation where attributable. Nullable for approved bootstrap/self-service/system cases; USER_SESSIONS requires authenticated account, matching USER_ID. **Population/change:** Set from validated actor context at INSERT; do not rewrite later. **Validation/security:** verify corresponding FK where present **Example:** `1`.

**`UPDATED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC timestamp of last permitted record modification, nullable and initially NULL. The RBAC audit-log table is a special case where it must always remain NULL. **Population/change:** Initially NULL; set to the UTC change instant only when a real modification succeeds. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `NULL`.

**`UPDATED_BY` — `NUMBER(19,0)`.** Authenticated account responsible for last permitted modification when attributable; nullable. The RBAC audit-log table is a special case where it must always remain NULL. **Population/change:** Initially NULL; set to validated actor only on permitted modification. **Validation/security:** verify corresponding FK where present **Example:** `NULL`.

## C. Keys, constraints, validation and indexes
The following constraint names and rules are transcribed from the previously prepared, **unexecuted** DDL snapshot. Database constraints protect row integrity; eligibility and authorization checks remain backend responsibilities.

| Constraint | Approved rule / purpose | Failure prevented |
|---|---|---|
| `PK_ZRV_UR` | Establishes immutable row identity; prevents ambiguous joins and records. `PRIMARY KEY (USER_ROLE_ID)` | Without it, dependent FKs and precise event/row references would fail. |
| `UQ_ZRV_UR_USER_ROLE` | Prohibits duplicate keys or assignment pairs, including previously deactivated rows. `UNIQUE (USER_ID, ROLE_ID)` | Without it, repeated grants, inconsistent logins or duplicate policy decisions could occur. |
| `CK_ZRV_UR_ACTIVE` | Restricts the column to agreed lifecycle or decision values. `CHECK (IS_ACTIVE IN (0, 1))` | Without it, the backend could receive unknown states and make unsafe policy assumptions. |
| `FK_ZRV_UR_USER` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (USER_ID) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |
| `FK_ZRV_UR_ROLE` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (ROLE_ID) REFERENCES XX_ZRV_ROLES (ROLE_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |
| `FK_ZRV_UR_CBY` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (CREATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |
| `FK_ZRV_UR_UBY` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (UPDATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |

**NOT NULL and defaults.** `NOT NULL` requirements are listed per column above. Oracle-generated identity IDs are not user-supplied. Explicit non-identity defaults in this table: `IS_ACTIVE` = `1`, `CREATED_AT` = `(SYSTIMESTAMP AT TIME ZONE 'UTC')`. SQL CHECK constraints do not replace Joi validation or safe backend state transitions.

**Indexes.** Oracle normally supplies supporting indexes for PK/UNIQUE constraints; do not create duplicate equivalents. The separately approved/indexed reverse lookups are:
```sql
CREATE INDEX IX_ZRV_UR_ROLE ON XX_ZRV_USER_ROLES (ROLE_ID);
```

**Constraint enforcement boundary.** A FK proves a parent row exists, not that the parent remains active; an expiry CHECK cannot consult the continuously changing clock; and a row CHECK cannot evaluate effective permissions across many tables. Those requirements belong in transaction-aware Node.js services and middleware.

## D. Relationships and referential integrity
**Parent tables:** [XX_ZRV_ROLES](XX_ZRV_ROLES.md), [XX_ZRV_USERS](XX_ZRV_USERS.md).
**Direct RBAC children:** None in the approved schema; other components can still query the table logically.

| FK constraint | Child column | Parent key | Relationship meaning |
|---|---|---|---|
| `FK_ZRV_UR_USER` | `XX_ZRV_USER_ROLES.USER_ID` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_USER_ROLES records can reference one parent record; nullability follows the column definition. |
| `FK_ZRV_UR_ROLE` | `XX_ZRV_USER_ROLES.ROLE_ID` | `XX_ZRV_ROLES.ROLE_ID` | Many XX_ZRV_USER_ROLES records can reference one parent record; nullability follows the column definition. |
| `FK_ZRV_UR_CBY` | `XX_ZRV_USER_ROLES.CREATED_BY` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_USER_ROLES records can reference one parent record; nullability follows the column definition. |
| `FK_ZRV_UR_UBY` | `XX_ZRV_USER_ROLES.UPDATED_BY` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_USER_ROLES records can reference one parent record; nullability follows the column definition. |

**Direct parent relationship sketch** (conceptual cardinalities; nullable audit actor FKs may be absent):
```mermaid
erDiagram
    XX_ZRV_ROLES ||--o{ XX_ZRV_USER_ROLES : "references"
    XX_ZRV_USERS ||--o{ XX_ZRV_USER_ROLES : "references"
```

**Insertion/deletion rules:** Create core parents before dependent relationships. Oracle FKs prevent inserting nonexistent parent keys and ordinarily prevent deleting parents that still have referencing rows. Approved administration favors deactivation, revocation or expiration over hard deletion; never enable cascade deletion of access/audit history by convenience. Join through approved numeric IDs for RBAC and through verified employee number for Fusion profile context.

## E. Operational usage and realistic example
**Create:** Authorized administrator assigns a role to an existing user, creating at most one row per user-role pair.
**Read:** Backend resolves all currently active and unexpired memberships before evaluating grants.
**Update:** Revoke or reactivate the existing assignment using IS_ACTIVE; extension/replacement of EXPIRES_AT is audited.
**Deactivate/revoke/expire:** Deactivate instead of deleting; an expired row automatically stops applying even if IS_ACTIVE remains 1.

**Illustrative record** (not real employee or operational data; credential secrets always redacted):
| Column | Sample value |
|---|---|
| `USER_ROLE_ID` | `1001` |
| `USER_ID` | `105` |
| `ROLE_ID` | `20` |
| `IS_ACTIVE` | `1` |
| `EXPIRES_AT` | `NULL` |
| `CREATED_AT` | `2026-10-17T08:45:00+00:00` |
| `CREATED_BY` | `1` |
| `UPDATED_AT` | `NULL` |
| `UPDATED_BY` | `NULL` |

**How to interpret the example.** This is one conceptual record in the Zamil-Revamp RBAC model, linked only to demonstrative other records (for example local user 105, production role 20, resource 101). A `NULL` sample is deliberately an allowed absence, not proof that the field is always NULL. Identifiers, employee numbers, times and client IP addresses are illustrative.

## F. Complete record lifecycle
1. **Pre-create:** Validate relevant parents, eligibility, required field types and authorization before issuing database work. Authorized administrator assigns a role to an existing user, creating at most one row per user-role pair.
2. **Create:** Use a bind-variable INSERT omitting generated IDs and allowing the UTC default; populate verified actor and required business fields. Insert any critical security audit event in the same transaction.
3. **Read/use:** Backend resolves all currently active and unexpired memberships before evaluating grants.
4. **Modify:** Revoke or reactivate the existing assignment using IS_ACTIVE; extension/replacement of EXPIRES_AT is audited. Enforce actual state transitions and audit actor metadata.
5. **End effective life:** Deactivate instead of deleting; an expired row automatically stops applying even if IS_ACTIVE remains 1.
6. **Historical/retention treatment:** Preserve referenced security history under the approved non-cascade approach; retention duration, archival implementation and privileged purge access are unresolved policy decisions unless stated otherwise below.

## G. Security, access control and abuse prevention
**Approved security and business invariants:**
- UNIQUE(USER_ID,ROLE_ID) across both active and inactive rows.
- An effective membership requires IS_ACTIVE=1, EXPIRES_AT null or in future, active role, eligible active user.
- Multiple roles contribute additive grants; an individual DENY exception still overrides grants.
- Users cannot self-assign privileged roles; protect the last effective RBAC administrator.

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
- UNIQUE(USER_ID,ROLE_ID) across both active and inactive rows.
- An effective membership requires IS_ACTIVE=1, EXPIRES_AT null or in future, active role, eligible active user.
- Multiple roles contribute additive grants; an individual DENY exception still overrides grants.
- Users cannot self-assign privileged roles; protect the last effective RBAC administrator.

### Discussed and explicitly excluded from this table
- EMPLOYEE_NUMBER (from USERS).
- ASSIGNED_AT/ASSIGNED_BY (CREATED_* already serve this purpose).
- REVOKED_AT/REVOKED_BY (change history in RBAC audit log).
- PERMISSION_ID or ALLOW_DENY (grant/override relationships are separate).
- EFFECTIVE_FROM (future scheduled activation was not approved).

### Not Confirmed / Requires Clarification / Not Yet Decided
- **Open item:** Exact privileged role-assignment approval sequence and default temporary expiry policy: Not Yet Decided.

### Decision rationale and trade-off
The table is intentionally restricted to **user-to-role memberships**. Adding the rejected fields would either duplicate normalized RBAC/Fusion facts, create conflicting sources of truth, or couple access controls to presentation or transport details. The compact design allows controlled expansion **only through a separately approved design change**. The present document records approval history; recommendations or open items are not retroactively approved.

## J. Node.js / Express / React / Oracle integration
**Expected service behavior.** Queried on effective authorization, user access administration and role membership reporting. The owning feature service verifies policy and transactions; its repository performs bounded Oracle SQL using binds and shared pooled connections. Controllers validate request contracts using Joi and return sanitized standardized responses. Auth/session and resource/action checks belong in centralized middleware plus domain-level business services. **No API URL is defined or approved by this document.**
**Typical repository operations.** Authorized administrator assigns a role to an existing user, creating at most one row per user-role pair. Backend resolves all currently active and unexpired memberships before evaluating grants. Revoke or reactivate the existing assignment using IS_ACTIVE; extension/replacement of EXPIRES_AT is audited.
**Transaction responsibility.** Services own one Oracle connection per transaction and commit related security state/audit inserts together when success must be atomic. For failed attempts, record an independent audit event rather than losing it to a business rollback. Never infer external Fusion integration atomicity from an Oracle local transaction.
**React responsibilities.** Consume safe projected account/permission metadata only, never hash material, shared secrets, session bearer tokens or privileged raw audit details. Components display roles/permissions for usability; the backend repeats every mandatory check.
**Error classes to test.** Invalid input (400-style validation), missing parent/not found, duplicate unique key/conflict, inactive or ineligible account, unauthorized action (403), expired/revoked credential, concurrency conflict, Oracle transaction failure and audit-write failure. Final status codes and route contracts remain feature-specific and **not approved here**.

## K. Edge cases and expected handling
- **Case:** Same (USER_ID, ROLE_ID) duplicate is rejected even when prior row inactive. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** Expires exactly at EXPIRES_AT and cannot grant afterwards. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** Revoking one membership does not revoke all other user memberships. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** Another role may still grant access after one role is revoked. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.

**Concurrency:** Where multiple administrators or authentication requests act simultaneously, uniqueness and Oracle transactions are the last line of integrity defense; service-level guards must re-check current state while holding appropriate locks or implementing safe atomic updates. **Not Confirmed:** the final distributed cache invalidation and retry strategy.

## L. Implementation checklist and verification guidance
**Dependency and creation-order guidance:** `XX_ZRV_USERS` first (self-reference permitted), then ROLES and APP_MODULES, RESOURCES, PERMISSIONS, USER_ROLES, ROLE_PERMISSIONS, USER_PERMISSION_OVERRIDES, USER_SESSIONS, ACCOUNT_ACTION_TOKENS, RBAC_AUDIT_LOGS. Existing Fusion master is external, not created here. This order follows the previously produced SQL script; no runtime DDL is executed by these documents.

**Database verification (planned, not executed):** inspect USER_TAB_COLUMNS, USER_CONSTRAINTS, USER_CONS_COLUMNS and USER_INDEXES for exact datatypes/defaults/nullable flags, FK parent names and checks; test required/invalid duplicate inserts in nonproduction and verify error outcomes. Confirm data dictionary and Oracle version compatibility before any deployment.

**Specific acceptance tests (planned, not executed):
- [ ] Same (USER_ID, ROLE_ID) duplicate is rejected even when prior row inactive.
- [ ] Expires exactly at EXPIRES_AT and cannot grant afterwards.
- [ ] Revoking one membership does not revoke all other user memberships.
- [ ] Another role may still grant access after one role is revoked.

**Cross-layer verification (planned, not executed):** exercise normal and failure workflows using Node.js native test runner and Supertest, plus isolated Oracle test data. Verify backend denial even when React controls are manipulated; check JSON/log redaction, role-cache freshness, safe ID precision, and precise UTC/KSA conversions. Record evidence of tests actually executed and never call planned checks "passed".

**New recommendations, not approvals:** validate physical Oracle CHECK/DEFAULT compilation on the target ADW before running in production, secure least-privilege runtime grants, size operational log retention after actual workload measurement, and document an approved rollback/reconciliation plan. None modifies a locked field.

## M. CREATE TABLE statement — documented existing DDL snapshot
> **IMPORTANT:** The statement below is reproduced verbatim from the previously generated SQL file for technical reference. It has **not been executed or compiled against your Oracle instance**, and its inclusion is not approval to change the schema. Standalone CREATE TABLE may depend on parent tables being present; supporting indexes and append-only trigger, where applicable, follow separately.
```sql
CREATE TABLE XX_ZRV_USER_ROLES (
    USER_ROLE_ID                NUMBER(19,0) GENERATED ALWAYS AS IDENTITY,
    USER_ID                     NUMBER(19,0) NOT NULL,
    ROLE_ID                     NUMBER(19,0) NOT NULL,
    IS_ACTIVE                   NUMBER(1,0) DEFAULT 1 NOT NULL,
    EXPIRES_AT                  TIMESTAMP(6) WITH TIME ZONE,
    CREATED_AT                  TIMESTAMP(6) WITH TIME ZONE DEFAULT (SYSTIMESTAMP AT TIME ZONE 'UTC') NOT NULL,
    CREATED_BY                  NUMBER(19,0),
    UPDATED_AT                  TIMESTAMP(6) WITH TIME ZONE,
    UPDATED_BY                  NUMBER(19,0),
    CONSTRAINT PK_ZRV_UR PRIMARY KEY (USER_ROLE_ID),
    CONSTRAINT UQ_ZRV_UR_USER_ROLE UNIQUE (USER_ID, ROLE_ID),
    CONSTRAINT CK_ZRV_UR_ACTIVE CHECK (IS_ACTIVE IN (0, 1)),
    CONSTRAINT FK_ZRV_UR_USER FOREIGN KEY (USER_ID) REFERENCES XX_ZRV_USERS (USER_ID),
    CONSTRAINT FK_ZRV_UR_ROLE FOREIGN KEY (ROLE_ID) REFERENCES XX_ZRV_ROLES (ROLE_ID),
    CONSTRAINT FK_ZRV_UR_CBY FOREIGN KEY (CREATED_BY) REFERENCES XX_ZRV_USERS (USER_ID),
    CONSTRAINT FK_ZRV_UR_UBY FOREIGN KEY (UPDATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)
);
```

### Supporting indexes — separately approved DDL snapshot
```sql
CREATE INDEX IX_ZRV_UR_ROLE ON XX_ZRV_USER_ROLES (ROLE_ID);
```

## N. Related reading and traceability
- Other directly related finalized table documents: [XX_ZRV_ROLES](XX_ZRV_ROLES.md), [XX_ZRV_USERS](XX_ZRV_USERS.md).
- [README.md](README.md) — cross-table index, decision statuses, outstanding confirmation items and complete system-level authorization flow.
- Approved backend architecture references (project `server/docs/`): `01-SYSTEM_ARCHITECTURE.md`, `02-API_DEVELOPMENT_STANDARDS.md`, `03-ORACLE_DATABASE_ARCHITECTURE.md`, `04-AUTHENTICATION_RBAC_SECURITY.md`, `05-CONFIGURATION_OPERATIONS.md`, `06-ARCHITECTURE_DECISIONS_GUIDELINES.md`. Only architecture 01/02 were retrievable by file search in this run; explicit RBAC approvals supersede their earlier "tables pending" wording.
- Oracle DDL reference: previously generated `Zamil_Revamp_RBAC_11_Tables_Oracle_ADW.sql` (unexecuted static snapshot).
- Documentation status: **Design APPROVED AND LOCKED; database execution and full integration verification NOT PERFORMED.**
