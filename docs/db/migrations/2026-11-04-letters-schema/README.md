# LETTERS-SCHEMA-001: storage for the Salary Certificate "To" and the Business Visa Letter

**Status: APPLIED on TEST (zpadwtest) on 2026-11-04**, at the owner's explicit request (gate G1).
Not applied to any other environment.

## Why

Both letter reports fail on TEST. A read-only dictionary check and one run of each report's own
list query (no row data read) on 2026-11-04 showed:

| Report | Error | Cause |
|---|---|---|
| Salary certificate (English and Arabic) | ORA-00904 `"TO_EMP_NAME": invalid identifier` | The repositories read, search and write `TO_EMP_NAME` (the certificate's "To" addressee); neither `XX_DIGI_SALARY_CERT` nor `XX_DIGI_SALARY_CERT_ARABIC` has it. Saving a certificate fails the same way. |
| Business visa letter | ORA-00942 `table or view does not exist` | The repository uses `XX_DIGI_BUSINESS_VISA_LETTERS`, which does not exist. Only the business visa *request* tables (`XX_BUS_VISA_HEADER`, `XX_BUS_VISA_DOCS`) exist. The list, the form and saving all fail. |

## Order

1. `00-precheck.sql`: read-only; confirms the table and the columns are still missing.
2. `01-migration.sql`: adds `TO_EMP_NAME` to both salary tables (nullable; existing certificates
   have no stored addressee) and creates `XX_DIGI_BUSINESS_VISA_LETTERS` with its primary key,
   status and request-type checks and three indexes.
3. `03-verify.sql`: read-only; the expected counts are in the file.
4. `02-rollback.sql`: only if the change must be undone; it drops data saved since.

Run as the application schema owner. DDL commits implicitly.

## Design notes

- The new table's columns, sizes and allowed values mirror the API
  (`server/src/modules/hr/business-visa-letters/visitingVisa.repository.js` `FIELDS` and
  `visitingVisa.validation.js` `writeBody`), so every value the API accepts fits.
- `ID` is an identity column: the API inserts without an ID and reads it back with `RETURNING ID`.
- Text columns use character semantics (`CHAR`) because several hold Arabic text.
- CI3 coexistence (gate G4): the legacy `Business_visa_letter` screen's own storage was not found
  in this database; if CI3 keeps writing letters elsewhere, the two systems will not share them.

## TEST result (2026-11-04)

- `00-precheck.sql`: 0 / 0 / 2 as expected.
- `01-migration.sql`: both columns added; table, primary key, two checks and three indexes created.
- `03-verify.sql`: SALARY_TO_COLUMNS 2, BVL_COLUMNS 39, three constraints ENABLED / VALIDATED,
  BVL_IDENTITY 1, BVL_INDEXES 4.
- Each report's list query then ran without error (business visa letters: 0 rows; English and
  Arabic salary certificates: their existing rows).

## After applying

Restart the API (no code change is needed), then open both reports and save one certificate and
one letter on TEST.
