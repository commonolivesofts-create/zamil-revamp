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
  once saved; a record id carries it (`/hr/employee-services/salary-certificate/en-12`, `…/ar-7`).
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

1. **`TO_EMP_NAME` is missing** from `XXZP.XX_DIGI_SALARY_CERT` and `XX_DIGI_SALARY_CERT_ARABIC`
   (and `EMP_NAME_LIST` from the Arabic table). The legacy models and the backend read and write it,
   so list, read, create and update fail with `ORA-00904`. Owner decision: the columns are added on
   TEST by the owner/DBA (no DDL from this change). Suggested definition for the DBA to confirm
   against production: `TO_EMP_NAME VARCHAR2(1000)` on both tables, `EMP_NAME_LIST VARCHAR2(2000)` on
   the Arabic table (sizes from the API validation).
2. **Employee identity data is empty on TEST**: of 147 current employees none has
   `NATIONAL_IDENTIFIER` or `PASSPORT_NUMBER` and one has `IQAMA_NUMBER`, so the backend rejects
   nearly every employee (`IDENTITY_REQUIRED`). The form shows that message. Legacy printed a blank
   ID; the backend rule was not relaxed.
3. `HR.SALARY_CERTIFICATES` and `HR.SALARY_CERTIFICATES_AR` exist in the TEST catalogue (MATCH); the registry uses their Oracle names. The sidebar entry shows for roles granted `HR.SALARY_CERTIFICATES:VIEW`.

## 10. Validation

| Check | Result |
|---|---|
| `cd server; npm run check` | Passes (905 tests: 898 pass, 0 fail, 7 todo) |
| `cd client; npx eslint .`, `npm test` | No problems; 457 tests: 453 pass, 0 fail, 4 todo |
| `cd client; npx vite build` (temporary directory) | Built |
| Oracle TEST, read-only | Approvers load in both languages; lookups blocked by §7 |
| Browser | **Not performed** |
