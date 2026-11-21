# Arabic Salary Certificate employee-name storage

The Arabic certificate repository selects, inserts, and updates `EMP_NAME_LIST`, but the
2026-11-04 letters migration added only `TO_EMP_NAME` to the salary tables. On databases where
`EMP_NAME_LIST` is still absent, Arabic certificate reads and writes fail with Oracle
`ORA-00904: "EMP_NAME_LIST": invalid identifier`. The English repository does not use this column.

Run `00-precheck.sql` as the salary-certificate table owner. If it reports the Arabic table and a
missing column, apply `01-migration.sql`, then run `02-verify.sql`. The rollback removes any values
written to the column after migration; use it only when those values have been preserved.

The new column uses character semantics and the 2,000-character limit already enforced by the
Arabic write schema. No existing rows or other tables are changed.
