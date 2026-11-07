# Feature handoff — Business Visa Letter

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Business Visa Letter form and report |
| Business purpose | Bilingual letter to an embassy for an employee's business visit visa |
| Business owner | HR (project owner) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Screens implemented over the existing backend; **blocked: the table does not exist on TEST** (§7) |
| Replaces CI3 feature | `Business_visa_letter` — `controllers/Business_visa_letter.php`, `models/Business_visa_letter_model.php` (pmform_codebase) |

## 2. Source control

Not committed.

## 3. Behaviour

- Sidebar: Human resources → **Letters** → Business visa letter (`/hr/letters/business-visa-letter`), report
  at `/hr/letters/business-visa-letter/report`, saved letter at `/hr/letters/business-visa-letter/:letterId`.
  Permission `HR.BUSINESS_VISA_LETTERS` (MATCH on TEST; shared with the Business Visa Request form). Switch
  `VITE_FEATURE_HR_BUSINESS_VISA_LETTER`.
- Steps: Letter (reference no., date, division, status Draft / Final; embassy with its Arabic name, request
  for — the embassy list is the full legacy list, and the Arabic name fills only while it is still empty),
  Employee (picked from the current employees, searchable by number or name; the master's nationality,
  passport, ID / Iqama and expiry, job title, employment date, contract nature and salary fill editable
  fields, with the Arabic nationality, job title and contract nature), Visit (place, days, purpose in English
  and Arabic, expenses, return statement, closing text, with the legacy defaults), Preview (the English and
  Arabic letter side by side with the legacy header/request-for text, Arabic dates and signatures; gaps
  highlighted; Print prints it).
- Required (the backend's): reference no. (unique), letter date, division, employee name.
- Report: ref. no. / status, employee, embassy, visit, date; search, status, division and date filters; total
  and by-month cards.

## 4. Backend

`/api/v1/hr/business-visa-letters` unchanged. On TEST (read-only): the employee list (147) and employee
details work; the list, read, create and update fail with `ORA-00942` because the table is missing. The
unmounted duplicate module `server/src/modules/hr/business-visa-letter/` was left as it is.

## 7. Oracle TEST blocker (owner decision: the DBA creates the table)

`XXZP.XX_DIGI_BUSINESS_VISA_LETTERS` does not exist on TEST (no definition in the repository). The legacy
model and the backend use it with an identity `ID` and these columns (types to be taken from production):

`DIVISION_ID, REF_NO (unique), LETTER_DATE (DATE), CONSUL_GENERAL, EMBASSY, EMBASSY_LOCATION, OPENING_TEXT,
REQUEST_FOR, SUBJECT, EMPLOYEE_NAME, NATIONALITY, PASSPORT_NO, PASSPORT_DATE (DATE), ID_NO,
ID_EXPIRATION_DATE (DATE), JOB_TITLE, EMPLOYED_SINCE (DATE), CONTRACT_EXPIRY (DATE), CONTRACT_NATURE,
MONTHLY_SALARY (NUMBER), VISIT_PLACE, VISIT_DAYS (NUMBER), VISIT_PURPOSE, EXPENSE_EMPLOYEE_NAME,
EXPENSE_BORNE_BY, RETURN_EMPLOYEE_NAME, RETURN_STATEMENT, CLOSING_TEXT, STATUS, EMBASSY_AR, JOB_TITLE_AR,
CONTRACT_NATURE_AR, NATIONALITY_AR, VISIT_PURPOSE_AR, CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT`.

On TEST the master also lacks most details for the employee checked (Arabic nationality and job title,
passport, Iqama and expiry, employment category): those fields stay blank to fill in.

## 10. Validation

| Check | Result |
|---|---|
| `cd client; npx eslint src tests`, `npm test` | No problems; 477 tests: 473 pass, 0 fail, 4 todo |
| `cd client; npx vite build` (temporary directory) | Built |
| Oracle TEST, read-only | As §4 and §7 |
| Browser | **Not performed** |
