# XX_ZRV_USERS — Database Design & Security Reference
**Design status:** **APPROVED AND LOCKED** · **Sequence:** 01/11 · **Columns:** 16 · **Approval:** 17 October 2026 · **Document purpose:** technical preservation, not schema change.

> **Source status:** Table columns and approvals were reconciled against the locked 17-Oct-2026 RBAC discussions and the previously generated, unexecuted `Zamil_Revamp_RBAC_11_Tables_Oracle_ADW.sql` snapshot. Architecture document 01 and API document 02 were discoverable in the project Library; the full text of architecture documents 03–06 was **not available for independent byte-level verification in this run**. Shared standards cited below are corroborated by the RBAC discussion; any unverified detail is explicitly identified. No Oracle database was accessed.

## A. Overview and responsibility
**Business and technical purpose.** Holds the Zamil Revamp local login account, employee-number linkage, Argon2id password verifier, one active encrypted TOTP credential, account state, lockout counters and last-login evidence. It is NOT the Fusion human-resources profile.
**Why it is necessary.** There would be no stable internal USER_ID for memberships, overrides, sessions or security audit attribution, nor a secure local account/credential store.
**When and where used.** Consulted on login, step-up MFA, account provisioning, disablement, account recovery, each protected session request and administrative security actions.
**Boundary in the RBAC system.** User identities and local authentication. This table participates in the approved 11-table centralized authorization design. It is not a source of Oracle Fusion employee profile attributes. Its responsibilities do not imply direct role or permission grants beyond the approved foreign-key model.

## B. Approved column catalog
| # | Column | Exact Oracle datatype | Nullability | Default / generation | Key / important validation | Representative value |
|---:|---|---|---|---|---|---|
| 1 | `USER_ID` | `NUMBER(19,0)` | NOT NULL | `GENERATED ALWAYS AS IDENTITY` | PK; NOT NULL / required; identity primary key; verify corresponding FK where present | `105` |
| 2 | `EMPLOYEE_NUMBER` | `VARCHAR2(60 BYTE)` | NOT NULL | `—` | —; NOT NULL / required; exactly VARCHAR2(60 BYTE), nonblank trimmed, unique locally | `EMP00421` |
| 3 | `PASSWORD_HASH` | `VARCHAR2(255 CHAR)` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `[ARGON2ID ENCODED HASH — REDACTED]` |
| 4 | `PASSWORD_CHANGED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `2026-10-01T08:20:00+00:00` |
| 5 | `ACCOUNT_STATUS` | `VARCHAR2(20 CHAR)` | NOT NULL | `'PENDING'` | —; NOT NULL / required; PENDING/ACTIVE/DISABLED | `ACTIVE` |
| 6 | `FAILED_LOGIN_ATTEMPTS` | `NUMBER(5,0)` | NOT NULL | `0` | —; NOT NULL / required; nonnegative | `0` |
| 7 | `LAST_FAILED_LOGIN_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `NULL` |
| 8 | `LOCKED_UNTIL` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; UTC instant; lifecycle validity checked by backend | `NULL` |
| 9 | `LAST_LOGIN_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `2026-10-17T06:30:00+00:00` |
| 10 | `MFA_TOTP_SECRET_ENCRYPTED` | `VARCHAR2(1024 CHAR)` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `[ENCRYPTED VALUE — REDACTED]` |
| 11 | `MFA_ENROLLED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `2026-10-01T08:25:00+00:00` |
| 12 | `MFA_LAST_USED_STEP` | `NUMBER(19,0)` | NULL allowed | `—` | —; nonnegative | `NULL` |
| 13 | `CREATED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NOT NULL | `(SYSTIMESTAMP AT TIME ZONE 'UTC')` | —; NOT NULL / required; UTC event timestamp | `2026-09-30T06:30:00+00:00` |
| 14 | `CREATED_BY` | `NUMBER(19,0)` | NULL allowed | `—` | FK; verify corresponding FK where present | `1` |
| 15 | `UPDATED_AT` | `TIMESTAMP(6) WITH TIME ZONE` | NULL allowed | `—` | —; Type/length/nullability plus table-specific business validation. | `2026-10-01T08:25:00+00:00` |
| 16 | `UPDATED_BY` | `NUMBER(19,0)` | NULL allowed | `—` | FK; verify corresponding FK where present | `105` |

### Column-by-column semantics, population and mutability
**`USER_ID` — `NUMBER(19,0)`.** Permanent local account identity for references from sessions, role memberships, overrides and security audit. Never confuse with Fusion employee-master USER_ID. **Population/change:** Generated on INSERT by Oracle; must never be rewritten or supplied by ordinary application clients. **Validation/security:** NOT NULL / required; identity primary key; verify corresponding FK where present **Example:** `105`.

**`EMPLOYEE_NUMBER` — `VARCHAR2(60 BYTE)`.** Required unique local account-to-Fusion employee join key. Exact approved VARCHAR2(60 BYTE); source master field has same datatype. No FK to nonvalidated Fusion parent. **Population/change:** Set on provisioning/registration after normalization; treat as stable after first use and review changes that would affect references. **Validation/security:** NOT NULL / required; exactly VARCHAR2(60 BYTE), nonblank trimmed, unique locally **Example:** `EMP00421`.

**`PASSWORD_HASH` — `VARCHAR2(255 CHAR)`.** Argon2id encoded password verifier, not raw password; nullable for PENDING first-time setup. **Population/change:** Updated only by verified credential enrollment/change/recovery processes, never by ordinary profile editing. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `[ARGON2ID ENCODED HASH — REDACTED]`.

**`PASSWORD_CHANGED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC event instant of successfully established or changed password; used by credential-change workflow and session revocation. **Population/change:** Updated only by verified credential enrollment/change/recovery processes, never by ordinary profile editing. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `2026-10-01T08:20:00+00:00`.

**`ACCOUNT_STATUS` — `VARCHAR2(20 CHAR)`.** Local lifecycle: PENDING awaiting activation, ACTIVE eligible after credential setup, DISABLED administratively barred. **Population/change:** Initial PENDING, then approved activation/disablement; never activated without required password/setup eligibility. **Validation/security:** NOT NULL / required; PENDING/ACTIVE/DISABLED **Example:** `ACTIVE`.

**`FAILED_LOGIN_ATTEMPTS` — `NUMBER(5,0)`.** Nonnegative counter used for bounded login throttling; reset logic and thresholds are backend policy. **Population/change:** Backend-managed security state; never writable by ordinary client input. Update atomically where concurrent requests could conflict. **Validation/security:** NOT NULL / required; nonnegative **Example:** `0`.

**`LAST_FAILED_LOGIN_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC instant of latest unsuccessful password/authentication attempt; supports failure-count window. **Population/change:** Backend-managed security state; never writable by ordinary client input. Update atomically where concurrent requests could conflict. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `NULL`.

**`LOCKED_UNTIL` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC temporary lockout cutoff; no redundant IS_LOCKED column. Locking is independent of ACCOUNT_STATUS. **Population/change:** Backend-managed security state; never writable by ordinary client input. Update atomically where concurrent requests could conflict. **Validation/security:** UTC instant; lifecycle validity checked by backend **Example:** `NULL`.

**`LAST_LOGIN_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** Most recent successful completed login UTC; do not populate on a merely successful password step if MFA remains required. **Population/change:** Backend-managed security state; never writable by ordinary client input. Update atomically where concurrent requests could conflict. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `2026-10-17T06:30:00+00:00`.

**`MFA_TOTP_SECRET_ENCRYPTED` — `VARCHAR2(1024 CHAR)`.** Encrypted single current TOTP secret; no plaintext secret, no copy to sessions/audit; encryption keys held outside Oracle. **Population/change:** Updated only by verified credential enrollment/change/recovery processes, never by ordinary profile editing. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `[ENCRYPTED VALUE — REDACTED]`.

**`MFA_ENROLLED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC instant when active authenticator was successfully verified/enrolled; nullable until enrollment completed. **Population/change:** Updated only by verified credential enrollment/change/recovery processes, never by ordinary profile editing. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `2026-10-01T08:25:00+00:00`.

**`MFA_LAST_USED_STEP` — `NUMBER(19,0)`.** Last accepted TOTP time-step used for replay prevention; update atomically on verification. **Population/change:** Backend-managed security state; never writable by ordinary client input. Update atomically where concurrent requests could conflict. **Validation/security:** nonnegative **Example:** `NULL`.

**`CREATED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC timestamp of row creation, with database default SYSTIMESTAMP AT TIME ZONE UTC. In the audit-log table specifically, it represents event recording time. **Population/change:** Set by Oracle UTC default if omitted; creation value must remain unchanged. **Validation/security:** NOT NULL / required; UTC event timestamp **Example:** `2026-09-30T06:30:00+00:00`.

**`CREATED_BY` — `NUMBER(19,0)`.** Authenticated account responsible for creation where attributable. Nullable for approved bootstrap/self-service/system cases; USER_SESSIONS requires authenticated account, matching USER_ID. **Population/change:** Set from validated actor context at INSERT; do not rewrite later. **Validation/security:** verify corresponding FK where present **Example:** `1`.

**`UPDATED_AT` — `TIMESTAMP(6) WITH TIME ZONE`.** UTC timestamp of last permitted record modification, nullable and initially NULL. The RBAC audit-log table is a special case where it must always remain NULL. **Population/change:** Initially NULL; set to the UTC change instant only when a real modification succeeds. **Validation/security:** Type/length/nullability plus table-specific business validation. **Example:** `2026-10-01T08:25:00+00:00`.

**`UPDATED_BY` — `NUMBER(19,0)`.** Authenticated account responsible for last permitted modification when attributable; nullable. The RBAC audit-log table is a special case where it must always remain NULL. **Population/change:** Initially NULL; set to validated actor only on permitted modification. **Validation/security:** verify corresponding FK where present **Example:** `105`.

## C. Keys, constraints, validation and indexes
The following constraint names and rules are transcribed from the previously prepared, **unexecuted** DDL snapshot. Database constraints protect row integrity; eligibility and authorization checks remain backend responsibilities.

| Constraint | Approved rule / purpose | Failure prevented |
|---|---|---|
| `PK_ZRV_USERS` | Establishes immutable row identity; prevents ambiguous joins and records. `PRIMARY KEY (USER_ID)` | Without it, dependent FKs and precise event/row references would fail. |
| `UQ_ZRV_USERS_EMP` | Prohibits duplicate keys or assignment pairs, including previously deactivated rows. `UNIQUE (EMPLOYEE_NUMBER)` | Without it, repeated grants, inconsistent logins or duplicate policy decisions could occur. |
| `CK_ZRV_USERS_EMP` | Enforces a reviewed data-consistency invariant in the approved DDL. `CHECK ( TRIM(EMPLOYEE_NUMBER) IS NOT NULL AND EMPLOYEE_NUMBER = TRIM(EMPLOYEE_NUMBER) )` | Without it, invalid or internally inconsistent values may enter the data model. |
| `CK_ZRV_USERS_STATUS` | Restricts the column to agreed lifecycle or decision values. `CHECK (ACCOUNT_STATUS IN ('PENDING', 'ACTIVE', 'DISABLED'))` | Without it, the backend could receive unknown states and make unsafe policy assumptions. |
| `CK_ZRV_USERS_FAILED` | Enforces a reviewed data-consistency invariant in the approved DDL. `CHECK (FAILED_LOGIN_ATTEMPTS >= 0)` | Without it, invalid or internally inconsistent values may enter the data model. |
| `CK_ZRV_USERS_PWD` | Enforces a reviewed data-consistency invariant in the approved DDL. `CHECK (ACCOUNT_STATUS <> 'ACTIVE' OR PASSWORD_HASH IS NOT NULL)` | Without it, invalid or internally inconsistent values may enter the data model. |
| `CK_ZRV_USERS_MFA` | Enforces a reviewed data-consistency invariant in the approved DDL. `CHECK ( (MFA_TOTP_SECRET_ENCRYPTED IS NULL AND MFA_ENROLLED_AT IS NULL AND MFA_LAST_USED_STEP IS NULL) OR (MFA_TOTP_SECRET_ENCRYPTED IS NOT NULL AND MFA_ENROLLED_AT IS NOT NULL) )` | Without it, invalid or internally inconsistent values may enter the data model. |
| `CK_ZRV_USERS_MFA_STEP` | Enforces a reviewed data-consistency invariant in the approved DDL. `CHECK (MFA_LAST_USED_STEP IS NULL OR MFA_LAST_USED_STEP >= 0)` | Without it, invalid or internally inconsistent values may enter the data model. |
| `FK_ZRV_USERS_CBY` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (CREATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |
| `FK_ZRV_USERS_UBY` | Guarantees an existing referenced parent at insertion/update; ordinary deletion of referenced parent is restricted. `FOREIGN KEY (UPDATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)` | Without it, orphan memberships, permissions or unattributable audit references would accumulate. |

**NOT NULL and defaults.** `NOT NULL` requirements are listed per column above. Oracle-generated identity IDs are not user-supplied. Explicit non-identity defaults in this table: `ACCOUNT_STATUS` = `'PENDING'`, `FAILED_LOGIN_ATTEMPTS` = `0`, `CREATED_AT` = `(SYSTIMESTAMP AT TIME ZONE 'UTC')`. SQL CHECK constraints do not replace Joi validation or safe backend state transitions.

**Indexes.** Oracle normally supplies supporting indexes for PK/UNIQUE constraints; do not create duplicate equivalents. The separately approved/indexed reverse lookups are:
No additional standalone index was approved for this table beyond its PK/UNIQUE support.

**Constraint enforcement boundary.** A FK proves a parent row exists, not that the parent remains active; an expiry CHECK cannot consult the continuously changing clock; and a row CHECK cannot evaluate effective permissions across many tables. Those requirements belong in transaction-aware Node.js services and middleware.

## D. Relationships and referential integrity
**Parent tables:** None for its core identity; self-referential audit FKs, if present, are described below.
**Child tables referencing this table:** [XX_ZRV_ACCOUNT_ACTION_TOKENS](XX_ZRV_ACCOUNT_ACTION_TOKENS.md), [XX_ZRV_APP_MODULES](XX_ZRV_APP_MODULES.md), [XX_ZRV_PERMISSIONS](XX_ZRV_PERMISSIONS.md), [XX_ZRV_RBAC_AUDIT_LOGS](XX_ZRV_RBAC_AUDIT_LOGS.md), [XX_ZRV_RESOURCES](XX_ZRV_RESOURCES.md), [XX_ZRV_ROLES](XX_ZRV_ROLES.md), [XX_ZRV_ROLE_PERMISSIONS](XX_ZRV_ROLE_PERMISSIONS.md), [XX_ZRV_USER_PERMISSION_OVERRIDES](XX_ZRV_USER_PERMISSION_OVERRIDES.md), [XX_ZRV_USER_ROLES](XX_ZRV_USER_ROLES.md), [XX_ZRV_USER_SESSIONS](XX_ZRV_USER_SESSIONS.md).
**External Fusion relationship:** `XX_ZRV_USERS.EMPLOYEE_NUMBER` logically joins to `XX_DIGI_EMP_MASTER.EMPLOYEE_NUMBER` (`VARCHAR2(60 BYTE)`). Parent `EMPLOYEE_NUMBER` uniqueness, effective assignment cardinality, and synchronization are **Not Confirmed**; the approved DDL intentionally has **no physical FK** to the Fusion table. `XX_DIGI_EMP_MASTER.USER_ID` is not equivalent to local USER_ID.

| FK constraint | Child column | Parent key | Relationship meaning |
|---|---|---|---|
| `FK_ZRV_USERS_CBY` | `XX_ZRV_USERS.CREATED_BY` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_USERS records can reference one parent record; nullability follows the column definition. |
| `FK_ZRV_USERS_UBY` | `XX_ZRV_USERS.UPDATED_BY` | `XX_ZRV_USERS.USER_ID` | Many XX_ZRV_USERS records can reference one parent record; nullability follows the column definition. |

**Insertion/deletion rules:** Create core parents before dependent relationships. Oracle FKs prevent inserting nonexistent parent keys and ordinarily prevent deleting parents that still have referencing rows. Approved administration favors deactivation, revocation or expiration over hard deletion; never enable cascade deletion of access/audit history by convenience. Join through approved numeric IDs for RBAC and through verified employee number for Fusion profile context.

## E. Operational usage and realistic example
**Create:** A controlled provisioning workflow confirms the Fusion employee and creates a PENDING account; the initial privileged account uses the approved bootstrap exception.
**Read:** Authentication, account administration, sessions and effective authorization query USER_ID/account state; permitted business screens join employee profiles by EMPLOYEE_NUMBER.
**Update:** Password setup/change, verified TOTP rotation, failed-login accounting, lockouts, successful logins and activation/disablement update their respective fields transactionally as appropriate.
**Deactivate/revoke/expire:** Set ACCOUNT_STATUS=DISABLED and revoke sessions; preserve the USER_ID and evidence. HR termination blocks authentication even when the local status was not yet updated.

**Illustrative record** (not real employee or operational data; credential secrets always redacted):
| Column | Sample value |
|---|---|
| `USER_ID` | `105` |
| `EMPLOYEE_NUMBER` | `EMP00421` |
| `PASSWORD_HASH` | `[ARGON2ID ENCODED HASH — REDACTED]` |
| `PASSWORD_CHANGED_AT` | `2026-10-01T08:20:00+00:00` |
| `ACCOUNT_STATUS` | `ACTIVE` |
| `FAILED_LOGIN_ATTEMPTS` | `0` |
| `LAST_FAILED_LOGIN_AT` | `NULL` |
| `LOCKED_UNTIL` | `NULL` |
| `LAST_LOGIN_AT` | `2026-10-17T06:30:00+00:00` |
| `MFA_TOTP_SECRET_ENCRYPTED` | `[ENCRYPTED VALUE — REDACTED]` |
| `MFA_ENROLLED_AT` | `2026-10-01T08:25:00+00:00` |
| `MFA_LAST_USED_STEP` | `NULL` |
| `CREATED_AT` | `2026-09-30T06:30:00+00:00` |
| `CREATED_BY` | `1` |
| `UPDATED_AT` | `2026-10-01T08:25:00+00:00` |
| `UPDATED_BY` | `105` |

**How to interpret the example.** This is one conceptual record in the Zamil-Revamp RBAC model, linked only to demonstrative other records (for example local user 105, production role 20, resource 101). A `NULL` sample is deliberately an allowed absence, not proof that the field is always NULL. Identifiers, employee numbers, times and client IP addresses are illustrative.

## F. Complete record lifecycle
1. **Pre-create:** Validate relevant parents, eligibility, required field types and authorization before issuing database work. A controlled provisioning workflow confirms the Fusion employee and creates a PENDING account; the initial privileged account uses the approved bootstrap exception.
2. **Create:** Use a bind-variable INSERT omitting generated IDs and allowing the UTC default; populate verified actor and required business fields. Insert any critical security audit event in the same transaction.
3. **Read/use:** Authentication, account administration, sessions and effective authorization query USER_ID/account state; permitted business screens join employee profiles by EMPLOYEE_NUMBER.
4. **Modify:** Password setup/change, verified TOTP rotation, failed-login accounting, lockouts, successful logins and activation/disablement update their respective fields transactionally as appropriate. Enforce actual state transitions and audit actor metadata.
5. **End effective life:** Set ACCOUNT_STATUS=DISABLED and revoke sessions; preserve the USER_ID and evidence. HR termination blocks authentication even when the local status was not yet updated.
6. **Historical/retention treatment:** Preserve referenced security history under the approved non-cascade approach; retention duration, archival implementation and privileged purge access are unresolved policy decisions unless stated otherwise below.

## G. Security, access control and abuse prevention
**Approved security and business invariants:**
- One local account per EMPLOYEE_NUMBER; EMPLOYEE_NUMBER is VARCHAR2(60 BYTE), required and unique in USERS.
- Local status values are PENDING, ACTIVE and DISABLED. Temporary lock is derived from LOCKED_UNTIL, not another IS_LOCKED flag.
- ACTIVE requires PASSWORD_HASH in the approved local-password model; enforce Argon2id encoded hash and password reset controls in the backend.
- One active TOTP secret per user: replacement must securely verify a new authenticator then retire the old secret; replay is blocked with MFA_LAST_USED_STEP.
- Employee profile (name, email, department, job, organization, nationality and salary) is from XX_DIGI_EMP_MASTER, not copied here.

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
- One local account per EMPLOYEE_NUMBER; EMPLOYEE_NUMBER is VARCHAR2(60 BYTE), required and unique in USERS.
- Local status values are PENDING, ACTIVE and DISABLED. Temporary lock is derived from LOCKED_UNTIL, not another IS_LOCKED flag.
- ACTIVE requires PASSWORD_HASH in the approved local-password model; enforce Argon2id encoded hash and password reset controls in the backend.
- One active TOTP secret per user: replacement must securely verify a new authenticator then retire the old secret; replay is blocked with MFA_LAST_USED_STEP.
- Employee profile (name, email, department, job, organization, nationality and salary) is from XX_DIGI_EMP_MASTER, not copied here.

### Discussed and explicitly excluded from this table
- DEPARTMENT_ID and XX_ZRV_DEPARTMENTS (removed from the 11-table RBAC scope).
- FULL_NAME, EMAIL, EMAIL_VERIFIED_AT, JOB_TITLE, employee demographic/payroll attributes (Fusion-owned).
- USERNAME (employee number is the primary Zamil login identifier; alternative identifier resolution remains an integration policy).
- IS_ADMIN and ROLE_ID (authorization via membership/permission tables).
- PASSWORD_SALT or PASSWORD_ALGORITHM (encoded Argon2id format contains these parameters).

### Not Confirmed / Requires Clarification / Not Yet Decided
- **Open item:** Parent-side uniqueness and selection rule for XX_DIGI_EMP_MASTER.EMPLOYEE_NUMBER: Not Confirmed; physical FK intentionally omitted.
- **Open item:** Eligibility semantics of CURRENT_EMP_FLAG, assignment status and effective dates: Requires Clarification.
- **Open item:** MFA replacement pending-enrollment temporary challenge persistence, recovery identity verification, required MFA rollout beyond privileged administrators and key custody: Requires Clarification.
- **Open item:** System-actor attribution for future background account changes and account-provisioning source: Requires Clarification.

### Decision rationale and trade-off
The table is intentionally restricted to **user identities and local authentication**. Adding the rejected fields would either duplicate normalized RBAC/Fusion facts, create conflicting sources of truth, or couple access controls to presentation or transport details. The compact design allows controlled expansion **only through a separately approved design change**. The present document records approval history; recommendations or open items are not retroactively approved.

## J. Node.js / Express / React / Oracle integration
**Expected service behavior.** Consulted on login, step-up MFA, account provisioning, disablement, account recovery, each protected session request and administrative security actions. The owning feature service verifies policy and transactions; its repository performs bounded Oracle SQL using binds and shared pooled connections. Controllers validate request contracts using Joi and return sanitized standardized responses. Auth/session and resource/action checks belong in centralized middleware plus domain-level business services. **No API URL is defined or approved by this document.**
**Typical repository operations.** A controlled provisioning workflow confirms the Fusion employee and creates a PENDING account; the initial privileged account uses the approved bootstrap exception. Authentication, account administration, sessions and effective authorization query USER_ID/account state; permitted business screens join employee profiles by EMPLOYEE_NUMBER. Password setup/change, verified TOTP rotation, failed-login accounting, lockouts, successful logins and activation/disablement update their respective fields transactionally as appropriate.
**Transaction responsibility.** Services own one Oracle connection per transaction and commit related security state/audit inserts together when success must be atomic. For failed attempts, record an independent audit event rather than losing it to a business rollback. Never infer external Fusion integration atomicity from an Oracle local transaction.
**React responsibilities.** Consume safe projected account/permission metadata only, never hash material, shared secrets, session bearer tokens or privileged raw audit details. Components display roles/permissions for usability; the backend repeats every mandatory check.
**Error classes to test.** Invalid input (400-style validation), missing parent/not found, duplicate unique key/conflict, inactive or ineligible account, unauthorized action (403), expired/revoked credential, concurrency conflict, Oracle transaction failure and audit-write failure. Final status codes and route contracts remain feature-specific and **not approved here**.

## K. Edge cases and expected handling
- **Case:** Two users cannot share the same employee number. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** PENDING with no password cannot log in; ACTIVE without a hash violates the CHECK. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** TOTP replacement accepts the new secret and rejects the old one. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** Reusing an accepted TOTP step is rejected even in concurrent attempts. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** A terminated/ineligible Fusion employee or DISABLED user loses login/session access. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.
- **Case:** A 19-digit USER_ID is transported losslessly between Oracle and Node.js. **Expected:** Reject unsafe state, preserve referenced rows, report a safe error and create a security event where required.

**Concurrency:** Where multiple administrators or authentication requests act simultaneously, uniqueness and Oracle transactions are the last line of integrity defense; service-level guards must re-check current state while holding appropriate locks or implementing safe atomic updates. **Not Confirmed:** the final distributed cache invalidation and retry strategy.

## L. Implementation checklist and verification guidance
**Dependency and creation-order guidance:** `XX_ZRV_USERS` first (self-reference permitted), then ROLES and APP_MODULES, RESOURCES, PERMISSIONS, USER_ROLES, ROLE_PERMISSIONS, USER_PERMISSION_OVERRIDES, USER_SESSIONS, ACCOUNT_ACTION_TOKENS, RBAC_AUDIT_LOGS. Existing Fusion master is external, not created here. This order follows the previously produced SQL script; no runtime DDL is executed by these documents.

**Database verification (planned, not executed):** inspect USER_TAB_COLUMNS, USER_CONSTRAINTS, USER_CONS_COLUMNS and USER_INDEXES for exact datatypes/defaults/nullable flags, FK parent names and checks; test required/invalid duplicate inserts in nonproduction and verify error outcomes. Confirm data dictionary and Oracle version compatibility before any deployment.

**Specific acceptance tests (planned, not executed):
- [ ] Two users cannot share the same employee number.
- [ ] PENDING with no password cannot log in; ACTIVE without a hash violates the CHECK.
- [ ] TOTP replacement accepts the new secret and rejects the old one.
- [ ] Reusing an accepted TOTP step is rejected even in concurrent attempts.
- [ ] A terminated/ineligible Fusion employee or DISABLED user loses login/session access.
- [ ] A 19-digit USER_ID is transported losslessly between Oracle and Node.js.

**Cross-layer verification (planned, not executed):** exercise normal and failure workflows using Node.js native test runner and Supertest, plus isolated Oracle test data. Verify backend denial even when React controls are manipulated; check JSON/log redaction, role-cache freshness, safe ID precision, and precise UTC/KSA conversions. Record evidence of tests actually executed and never call planned checks "passed".

**New recommendations, not approvals:** validate physical Oracle CHECK/DEFAULT compilation on the target ADW before running in production, secure least-privilege runtime grants, size operational log retention after actual workload measurement, and document an approved rollback/reconciliation plan. None modifies a locked field.

## M. CREATE TABLE statement — documented existing DDL snapshot
> **IMPORTANT:** The statement below is reproduced verbatim from the previously generated SQL file for technical reference. It has **not been executed or compiled against your Oracle instance**, and its inclusion is not approval to change the schema. Standalone CREATE TABLE may depend on parent tables being present; supporting indexes and append-only trigger, where applicable, follow separately.
```sql
CREATE TABLE XX_ZRV_USERS (
    USER_ID                     NUMBER(19,0) GENERATED ALWAYS AS IDENTITY,
    EMPLOYEE_NUMBER             VARCHAR2(60 BYTE) NOT NULL,
    PASSWORD_HASH               VARCHAR2(255 CHAR),
    PASSWORD_CHANGED_AT         TIMESTAMP(6) WITH TIME ZONE,
    ACCOUNT_STATUS              VARCHAR2(20 CHAR) DEFAULT 'PENDING' NOT NULL,
    FAILED_LOGIN_ATTEMPTS       NUMBER(5,0) DEFAULT 0 NOT NULL,
    LAST_FAILED_LOGIN_AT        TIMESTAMP(6) WITH TIME ZONE,
    LOCKED_UNTIL                TIMESTAMP(6) WITH TIME ZONE,
    LAST_LOGIN_AT               TIMESTAMP(6) WITH TIME ZONE,
    MFA_TOTP_SECRET_ENCRYPTED   VARCHAR2(1024 CHAR),
    MFA_ENROLLED_AT             TIMESTAMP(6) WITH TIME ZONE,
    MFA_LAST_USED_STEP          NUMBER(19,0),
    CREATED_AT                  TIMESTAMP(6) WITH TIME ZONE DEFAULT (SYSTIMESTAMP AT TIME ZONE 'UTC') NOT NULL,
    CREATED_BY                  NUMBER(19,0),
    UPDATED_AT                  TIMESTAMP(6) WITH TIME ZONE,
    UPDATED_BY                  NUMBER(19,0),
    CONSTRAINT PK_ZRV_USERS PRIMARY KEY (USER_ID),
    CONSTRAINT UQ_ZRV_USERS_EMP UNIQUE (EMPLOYEE_NUMBER),
    CONSTRAINT CK_ZRV_USERS_EMP CHECK (
        TRIM(EMPLOYEE_NUMBER) IS NOT NULL
        AND EMPLOYEE_NUMBER = TRIM(EMPLOYEE_NUMBER)
    ),
    CONSTRAINT CK_ZRV_USERS_STATUS CHECK (ACCOUNT_STATUS IN ('PENDING', 'ACTIVE', 'DISABLED')),
    CONSTRAINT CK_ZRV_USERS_FAILED CHECK (FAILED_LOGIN_ATTEMPTS >= 0),
    CONSTRAINT CK_ZRV_USERS_PWD CHECK (ACCOUNT_STATUS <> 'ACTIVE' OR PASSWORD_HASH IS NOT NULL),
    CONSTRAINT CK_ZRV_USERS_MFA CHECK (
        (MFA_TOTP_SECRET_ENCRYPTED IS NULL AND MFA_ENROLLED_AT IS NULL AND MFA_LAST_USED_STEP IS NULL)
        OR (MFA_TOTP_SECRET_ENCRYPTED IS NOT NULL AND MFA_ENROLLED_AT IS NOT NULL)
    ),
    CONSTRAINT CK_ZRV_USERS_MFA_STEP CHECK (MFA_LAST_USED_STEP IS NULL OR MFA_LAST_USED_STEP >= 0),
    CONSTRAINT FK_ZRV_USERS_CBY FOREIGN KEY (CREATED_BY) REFERENCES XX_ZRV_USERS (USER_ID),
    CONSTRAINT FK_ZRV_USERS_UBY FOREIGN KEY (UPDATED_BY) REFERENCES XX_ZRV_USERS (USER_ID)
);
```

## N. Related reading and traceability
- Other directly related finalized table documents: [XX_ZRV_ACCOUNT_ACTION_TOKENS](XX_ZRV_ACCOUNT_ACTION_TOKENS.md), [XX_ZRV_APP_MODULES](XX_ZRV_APP_MODULES.md), [XX_ZRV_PERMISSIONS](XX_ZRV_PERMISSIONS.md), [XX_ZRV_RBAC_AUDIT_LOGS](XX_ZRV_RBAC_AUDIT_LOGS.md), [XX_ZRV_RESOURCES](XX_ZRV_RESOURCES.md), [XX_ZRV_ROLES](XX_ZRV_ROLES.md), [XX_ZRV_ROLE_PERMISSIONS](XX_ZRV_ROLE_PERMISSIONS.md), [XX_ZRV_USER_PERMISSION_OVERRIDES](XX_ZRV_USER_PERMISSION_OVERRIDES.md), [XX_ZRV_USER_ROLES](XX_ZRV_USER_ROLES.md), [XX_ZRV_USER_SESSIONS](XX_ZRV_USER_SESSIONS.md).
- [README.md](README.md) — cross-table index, decision statuses, outstanding confirmation items and complete system-level authorization flow.
- Approved backend architecture references (project `server/docs/`): `01-SYSTEM_ARCHITECTURE.md`, `02-API_DEVELOPMENT_STANDARDS.md`, `03-ORACLE_DATABASE_ARCHITECTURE.md`, `04-AUTHENTICATION_RBAC_SECURITY.md`, `05-CONFIGURATION_OPERATIONS.md`, `06-ARCHITECTURE_DECISIONS_GUIDELINES.md`. Only architecture 01/02 were retrievable by file search in this run; explicit RBAC approvals supersede their earlier "tables pending" wording.
- Oracle DDL reference: previously generated `Zamil_Revamp_RBAC_11_Tables_Oracle_ADW.sql` (unexecuted static snapshot).
- Documentation status: **Design APPROVED AND LOCKED; database execution and full integration verification NOT PERFORMED.**
