# SICK-LEAVE-HALF-DAYS-001: persist fractional sick leave durations

**Status: applied and verified in the TEST database on 2026-11-07**, with the user's explicit
authorization. Production was not changed.

## Why

The Sick Leave API verifies that `LEAVE_DAYS` can store a fractional value and that both
`FROM_DAY_TYPE` and `TO_DAY_TYPE` exist before allowing a half-day request. The test database had
`LEAVE_DAYS` as `VARCHAR2(50)`, so the API correctly kept half-day requests disabled. This migration
converts that column to numeric storage and adds explicit day-type fields.

## Changes

- Convert `LEAVE_DAYS` to unconstrained Oracle `NUMBER`, which supports fractional values without
  rounding existing whole-day records. Oracle cannot directly change the datatype of a populated
  column, so the migration copies values into a numeric shadow column and swaps the column names.
- Mirror writes to the shadow column during the copy. Pause sick leave submissions for the brief
  rename cutover; requests during that small window may fail and can be retried.
- Add `FROM_DAY_TYPE` and `TO_DAY_TYPE` as `VARCHAR2(4 CHAR)`, defaulting existing and legacy
  inserts to `FULL`.
- Restrict both fields to `FULL` or `HALF`.
- Keep the half-day API choices disabled until the running database reports all required
  capabilities.

## Order

The precheck found eight existing rows, all numeric whole-day values from 1 to 9, with no null,
invalid, or fractional values. `HEADER_ID` on both sick leave and attachments was identity-generated.
The target column had no indexes, constraints, triggers, or dependent objects. The migration copied
the existing values, converted `LEAVE_DAYS` to unconstrained `NUMBER`, added the two `FULL`-defaulted
day-type columns and enabled/validated constraints for `FULL` or `HALF`.

`03-verify.sql` confirmed `LEAVE_DAYS` has no precision or scale restriction, both day-type columns
are non-null `VARCHAR2(4)`, both constraints are enabled and validated, and no staging columns
remain. The API's capability lookup reads the schema dynamically, so reopening the Sick Leave form
should enable half-day choices without an API restart. The repository capability check returned
`dayTypes=true`, `fractional=true`, and both identity checks true after the migration.

`ALTER TABLE` commits implicitly. The new defaults keep existing CI3 inserts that omit these
columns valid. Numeric storage preserves the existing whole-day values and allows values such as
`0.5`.

## Recovery

`02-rollback.sql` refuses to drop the day-type columns if a half-day value or fractional leave
duration has been saved. It leaves `LEAVE_DAYS` as unconstrained `NUMBER`; it does not convert the
column back to `VARCHAR2`.
