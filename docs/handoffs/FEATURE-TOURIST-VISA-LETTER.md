# Feature handoff — Tourist Visa Letter

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Tourist Visa Letter form and report |
| Business purpose | Bilingual letter to the consul general for an employee's tourist visa |
| Business owner | HR (project owner) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Implemented over the existing backend (column fix below); **blocked on TEST data** (§7) |
| Replaces CI3 feature | `Tourist_visa` — `controllers/Tourist_visa.php`, `models/Tourist_visa_model.php` (pmform_codebase) |

## 2. Source control

Not committed.

## 3. Behaviour

- Sidebar: Human resources → **Letters** → Tourist visa letter (`/hr/letters/tourist-visa`), report at
  `/hr/letters/tourist-visa/report`, saved letter at `/hr/letters/tourist-visa/:letterId` (the letter's UUID).
- Steps: Letter (date, Hijri date and ref. no. from the server, division ZPIL / Z3P, the consul general's
  country), Employee (search by number or name; name, nationality, passport, national ID, position and
  contract in English and Arabic, and the salary, from the master; passport issue, national ID issue,
  position start and contract expiry dates), Travel (tourism from — defaults to the employee's country — and
  to), Approval (approver and position; the legacy closing line).
- The optional dates may be left blank; only the letter date is required. Tourism from keeps the
  requester's answer (the employee's country is only the default).
- The server writes the salary in words and the Hijri date, and checks the countries and the approver. A
  blank or non-numeric salary is refused instead of being stored as 0. Each Arabic date follows its English
  date (legacy had two inputs). The employee is fixed once saved. No delete on screen.
- Report: ref. no., employee, nationality / national ID, To, approver, date; search, division, country and
  date filters; total and by-month cards.
- Permission `HR.TOURIST_VISA_LETTERS` (VIEW / CREATE / UPDATE): RESOURCE and all four permissions MATCH on
  TEST. Switch `VITE_FEATURE_HR_TOURIST_VISA`.

## 4. Backend fix

`tourist-visa.repository.js` read and wrote `POSITION_START_DATE(_AR)` and `EMPLOYEE_NATIONALITY(_AR)`, but the
table (TEST dictionary, and the legacy model) has `POSI_START_DATE(_AR)` and `EMP_NATIONALITY(_AR)`: every
read, create and update failed with `ORA-00904`. The API field names are unchanged; the repository maps them
to the physical columns and aliases them back on read. Regression test: `server/tests/hr-report-sql.test.js`.
After the fix, on TEST (read-only): list and filters, countries (12), approvers (3), employee search and
details, read and print succeed; the INSERT and UPDATE parse (`DBMS_SQL.PARSE`, not executed).

## 7. Oracle TEST blocker

The server requires the employee's passport number from the master: on TEST **0 of 76** employees with
details have `PASSPORT_NUMBER`, so every save is refused there ("…passport… is missing in the master"). The
rule was not relaxed; the master data must be completed (or the rule changed by the owner).

## 10. Validation

| Check | Result |
|---|---|
| `cd server; npm run check` | Passes (916 tests: 909 pass, 0 fail, 7 todo) |
| `cd client; npx eslint src tests`, `npm test` | No problems; 473 tests: 469 pass, 0 fail, 4 todo |
| `cd client; npx vite build` (temporary directory) | Built |
| Create / update on TEST | **Not performed** (no database writes authorized; blocked by §7 anyway) |
| Browser | **Not performed** |
