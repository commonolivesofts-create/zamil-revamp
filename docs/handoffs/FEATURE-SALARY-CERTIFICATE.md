# Feature handoff — Salary Certificate (English and Arabic in one form)

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Salary Certificate form and report, English and Arabic in one screen |
| Business purpose | Issue a salary certificate for an employee in English or Arabic |
| Business owner | HR (project owner) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Implemented on the existing two backends; **blocked on Oracle TEST** (§7) |
| Replaces CI3 feature | `Salary_cert` and `Salary_cert_arabic` (pmform_codebase) |

## 2. Source control

Not committed.

## 3. Behaviour

- One form: the chosen **language** selects the API (`/salary-certificates` or
  `/salary-certificates-ar`) and the stored language of the names, nationality and titles. It is fixed
  once saved; a record id carries it (`/hr/talent-management/salary-certificate/en-12`, `…/ar-7`).
- Steps: Employee (language, employee no., personal and job information), Salary (from the master,
  read-only), Certificate (date, To, ref. no., approver and position, the legacy notes). Labels show
  English and Arabic; values follow the certificate's direction.
- Report: one page with a Language filter (always set; each language is its own table) and a quick
  language switch, legacy columns plus ref. no., To and certificate date.
- Sidebar: Human resources → **Letters** (new sub-module, between Employee services and Reports).
- Permissions: route `HR.SALARY_CERTIFICATES:VIEW`; saving checks `CREATE`/`UPDATE` of the chosen
  language's resource (`HR.SALARY_CERTIFICATES` or `HR.SALARY_CERTIFICATES_AR`). Switch:
  `VITE_FEATURE_HR_SALARY_CERTIFICATE`.

## 4. Backend fixes (both modules)

- `:size`, `:from` and `:to` are Oracle reserved words (`ORA-01745`); the list and the employee picker
  always failed. Renamed to `:pageSize`, `:fromDate`, `:toDate`. Regression test:
  `server/tests/hr-report-sql.test.js`.

## 7. Oracle TEST blockers (read-only checks, 2026-11-04)

1. **`TO_EMP_NAME` was missing** from both salary tables; the 2026-11-04 letters migration added it
   on TEST. That migration did not add the Arabic repository's `EMP_NAME_LIST` column. Apply the
   follow-up migration in
   `docs/db/migrations/2026-11-21-arabic-salary-cert-employee-name-list/` on any database where the
   precheck confirms it is absent; Arabic certificate reads and writes otherwise fail with
   `ORA-00904: "EMP_NAME_LIST": invalid identifier`.
2. **Employee identity data is empty on TEST**: of 147 current employees none has
   `NATIONAL_IDENTIFIER` or `PASSPORT_NUMBER` and one has `IQAMA_NUMBER`. The backend used to
   reject nearly every employee (`IDENTITY_REQUIRED`); it now mirrors legacy: the ID / Passport
   No. is left blank when the master has none, and a non-Saudi falls back to
   `IQAMA_NUMBER`, then `NATIONAL_IDENTIFIER`, then `PASSPORT_NUMBER`. Legacy printed a blank ID.
3. `HR.SALARY_CERTIFICATES` and `HR.SALARY_CERTIFICATES_AR` exist in the TEST catalogue (MATCH); the registry uses their Oracle names. The sidebar entry shows for roles granted `HR.SALARY_CERTIFICATES:VIEW`.

## 10. Validation

| Check | Result |
|---|---|
| `cd server; npm run check` | Passes (905 tests: 898 pass, 0 fail, 7 todo) |
| `cd client; npx eslint .`, `npm test` | No problems; 457 tests: 453 pass, 0 fail, 4 todo |
| `cd client; npx vite build` (temporary directory) | Built |
| Oracle TEST, read-only | Approvers load in both languages; lookups blocked by §7 |
| Browser | **Not performed** |
