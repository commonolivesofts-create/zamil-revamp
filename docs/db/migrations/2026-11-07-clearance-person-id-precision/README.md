# EMPLOYEE-CLEARANCE-PERSON-ID-001: match clearance IDs to the employee master

**Status: applied and verified in TEST on 2026-11-07.** No production database was changed.

**Approval and compatibility:** The user approved this TEST change in the conversation on
2026-11-07. The CI3 compatibility review checked `models/Empclearance_model.php` in the legacy
project: it writes the employee-master `PERSON_ID` unchanged. Increasing column precision keeps
the Oracle `NUMBER` type and value semantics intact; it does not change the CI3 contract.

## Finding

The legacy `models/Empclearance_model.php` looks up `PERSON_ID` from `XX_DIGI_EMP_MASTER` and writes
that value directly to the clearance header and detail tables. In TEST, the source is
`NUMBER(18,0)`, while `PERSON_ID` is `NUMBER(10,0)` in all seven `XX_CLEARANCE_*` tables. The
employee master currently has 160 IDs above the target's 10-digit limit. The two employee numbers
in the provided clearance lookup logs also have IDs above that limit. The header insert therefore
fails with ORA-01438 before the clearance request can be saved.

The existing clearance code preserves the source ID as-is, which matches the old project. The
database target precision is too small. Widening the seven target columns to `NUMBER(18,0)` matches
the source without changing their meaning or nullability.

The legacy editability matrix also disables signature selects on Create and enables them after the
first save. The current `Not signed` option follows that behavior; this change does not alter it.

## Applied change

Widen `PERSON_ID` on the following tables:

- `XX_CLEARANCE_HEADER`
- `XX_CLEARANCE_IT`
- `XX_CLEARANCE_EMPLOYEES`
- `XX_CLEARANCE_QUALITY`
- `XX_CLEARANCE_WH`
- `XX_CLEARANCE_ACCOUNTS`
- `XX_CLEARANCE_ADMIN`

This only increases numeric precision. It does not update or delete any rows. The current metadata
shows no primary, unique, or foreign-key constraints on these columns; the two existing check
constraints enforce `NOT NULL` and are unaffected.

## Execution record

The guarded TEST prechecks passed: the source column was `NUMBER(18,0)`, all seven target columns
were present with the expected starting definitions, no key constraints referenced them, and the
employee master contained IDs above ten digits. The seven precision widenings completed and a
post-change data-dictionary query verified `NUMBER(18,0)` for every target column.

The migration changed schema only; it did not insert, update, or delete business rows. A clearance
form submission was not generated as part of verification because that would create an HR record.
The next functional check is to submit the user's intended clearance request in the application.

Oracle DDL commits implicitly. If a statement fails midway, inspect `03-verify.sql` and widen only
the remaining `NUMBER(10,0)` columns. Do not rerun the guarded migration blindly after a partial
application.

## Recovery

`02-rollback.sql` narrows the seven columns back to `NUMBER(10,0)` only when no clearance row has a
`PERSON_ID` outside that range. Once a larger ID is stored in a clearance row, rollback is blocked
to avoid data loss.
