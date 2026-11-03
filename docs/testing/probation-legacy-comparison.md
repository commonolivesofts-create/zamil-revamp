# Probation Evaluation (1064) — Legacy CI3 vs New Form Comparison

**Date:** 2026-11-03 · **Branch:** `test/probation-legacy-parity` (from `main`)
**Rule for this round:** the CI3 application is the source of truth. Every API, flow and UI behaviour of
the legacy form was compared with the new React / Node.js form, and every difference was fixed.

The security rules of `CLAUDE.md` and `docs/SECURITY-ESSENTIALS.md` still win over CI3:
- bind variables, CSRF, RBAC and record-level access;
- values computed on the server;
- no fake data.

Where CI3 itself saved unusable data, the new form saves correct data, and the deviation is listed
in §7 for the owner.

**Masking:** no real names, e-mail addresses, credentials or employee data appear here. Test data is
fictional (`Sample Employee 001`, `E-0001`, `Criterion 1`). Oracle TEST was used **read only**: counts and
flags, and `DBMS_SQL.PARSE` for DML. Nothing was written.

Classification: **MATCH** · **DIFFERENT** · **MISSING IN NEW** · **NEW ONLY**.

---

## 1. Files

### 1.1 Legacy (`php-ci3-old-app/zamil_old_codebase/zpil_codebase/pmform_codebase/`, not modified)

| File | Role |
|---|---|
| `controllers/Probation.php` | `index` (create, or edit by URL segment 3), `add_probation_data` (save), `probreport` (report), `getEmpDetails` (AJAX autofill) |
| `models/Probation_Model.php` | `add_form_data` (insert header + 20 lines, or the edit update), `getEmpDetails`, `fetchDirectManager`, `updateRequestStatus` |
| `models/Data_model.php` | `getEmp` / `getAllEmp` (employee select), `fetchFormData`, `getPROBRecords` (report, HR scope), `getRequestedBy` (prepared by) |
| `views/probation/probation.php` | Create view |
| `views/probation/prf_uplines.php` | Edit view of a saved evaluation; Submit button |
| `views/probation/header.php` | Toolbar: Save, Submit (after the first save), Report, Request Form, Print (dead link), Home |
| `views/probation/prob_report.php` | Report |
| `controllers/ProbationFlow.php` | Workflow `EPRBF` (submit, approve / reject, e-mail); not built here |
| **Missing:** `assets/prf-new.js`, `assets/prf.css` | `showDropInfo()`: the criteria of each form type and the total |

### 1.2 New (changed in this round)

| Layer | File |
|---|---|
| Server | `server/src/modules/hr/probation-evaluations/probationEvaluation.{routes,controller,service,repository,validation,rules}.js` |
| Server tests | `server/tests/probation-evaluations.test.js`, `server/tests/probation-legacy-parity.test.js`, `server/tests/helpers/probationEvaluationFakes.js`, `server/tests/api-docs.test.js` |
| API docs | `server/docs/openapi/openapi.yaml` |
| Client | `client/src/features/hr-recruitment/probation/ProbationPage.jsx`, `probation/probationRules.js`, `hrRecruitmentService.js` (`createProbationService`) |
| Client tests | `client/tests/probationLegacyParity.test.mjs`, `client/tests/hrOnboarding.test.mjs`, `client/tests/hrRecruitmentAudit.test.mjs` |
| Docs | `client/src/features/hr-recruitment/README.md`, this report, `docs/handoffs/FEATURE-PROBATION-LEGACY-PARITY.md` |

No shared component changed. The demo-only model `probation/probationModel.js` is not used by the live page and is unchanged.

---

## 2. Field matrix

"Create" is `probation.php`, "Edit" is `prf_uplines.php`. Legacy edit shows every header field but its
UPDATE saves only the total, Comments, Suggestion and the ratings.

| # | Label | Column | Legacy | New (now) | Before this round | Now |
|---|---|---|---|---|---|---|
| 1 | Form Type | `FORM_NAME` | select (5 values), not required, create only | select with the legacy labels, required (§7 B4), read only after save | required, editable in Draft | **DIFFERENT** (required) |
| 2 | Employee Name | `EMP_NAME` | select of the user's hierarchy, not required | searchable picker of the same hierarchy, required (§7 B4); read only after save | editable in Draft | **DIFFERENT** (required) |
| 3 | Employee Number | `EMP_NUMBER` | read only, autofilled | read only, autofilled; the server reads it from the employee master | sent by the client | MATCH |
| 4 | Joining Date | `FORM_DATE` | text input, autofilled with the joining date, **editable** | date input, autofilled, **editable**, optional; read only after save | read only | MATCH |
| 5 | Job Title | `JOB_T` | read only, autofilled | read only, autofilled; server reads it from the master | sent by the client | MATCH |
| 6 | Job Grade | `GRADE` | read only, **never filled**, stored 0 | read only, never filled, stored 0 | editable number | MATCH |
| 7 | Department | `DEPARTMENT` | read only, autofilled | read only, autofilled; server reads it from the master | sent by the client | MATCH |
| 8 | Evaluation Period From | `FROM_DATE` | date, required | date, required; read only after save | editable in Draft | MATCH |
| 9 | Evaluation Period To | `TO_DATE` | date, required | date, required, not before From (§7 B5) | same | MATCH |
| 10 | Prepared & Agreed by | `USER_NAME`, `USER_MAIL` | the session user; edit shows the stored name | the session user; a saved record shows the stored name | stored name not returned | MATCH |
| 11 | Total / 100 | `TOTAL_RATING` | sum of the points (`prf-new.js`) | live preview; the server computes it | MATCH | MATCH |
| 12 | Evaluation Result | from the total | Not Acceptable 0–70 %, Acceptable 71–100 % | same bands and labels | "Not acceptable" | MATCH |
| 13 | Comments | `PREPARED_BY_CMNT` | read only on create; **required** on edit | read only until the first save; required on edit; max 500 | optional, editable on create | MATCH |
| 14 | Suggestion | `APPROVED_BY_CMNT` | read only on create; **required** on edit | same | optional, editable on create | MATCH |
| 15 | Approved by | from `REQUEST_STATUS` | "HR SUPERVISOR" when APPROVED | same | missing | MATCH |
| 16 | Request number | `HEADER_ID` | URL segment | "Evaluation no." | MATCH | MATCH |
| 17 | Evaluation period (free text) | `EVALUATION_PERIOD` | no input, stored `-` | no input, stored `-` | optional text input | MATCH |
| 18 | Person ID | `EMP_ID` | no input, stored `-` | stored `-` | person ID stored | MATCH |
| 19 | Date (report) | `CREATED_AT` | report column | ticket and report "Date" | MATCH | MATCH |
| 20 | Evaluation Criteria | `PARAM_NAME` | the form type's criteria, read only | the form type's criteria, read only (§7 B1) | free text typed by the user | MATCH |
| 21 | معايير التقييم | `PARAMA_NAME_AR` | the form type's criteria, read only | same | optional free text | MATCH |
| 22 | Points | `RATING_LINE` | select blank / 1–5; blank → 0; required on edit | same | optional on edit | MATCH |
| 23 | Allocated | — | 5 for every criterion | 5 | "Rating (1–5)" | MATCH |
| 24 | Number of criteria | — | always 20 | the form type's set (20) | 1–20, user defined | MATCH |

| Count | Before (round 4) | Now |
|---|---|---|
| MATCH | 11 | **22** |
| DIFFERENT | 10 | **2** (#1, #2: required) |
| MISSING IN NEW | 1 | **0** |
| NEW ONLY (live page) | 2 | **0** |

The unreachable demo model (`probationModel.js`) still holds 9 NEW ONLY fields (recommendation,
signatures and so on). The live page cannot reach them (§8 Q3).

---

## 3. Dependency matrix

| # | Legacy dependency | New | Class. |
|---|---|---|---|
| D1 | Employee → number, job title, department, joining date (`getEmpDetails`) | same (`employee-details`); the joining date stays editable | MATCH |
| D2 | Form type → its criteria (`showDropInfo`) | `GET lookups/criteria?formType=` replaces the rows | MATCH (was MISSING) |
| D3 | Points → total | live preview; server computes `TOTAL_RATING` | MATCH |
| D4 | Total → result band | same | MATCH |
| D5 | APPROVED → "HR SUPERVISOR" | same | MATCH (was MISSING) |
| D6 | Employee select = the user's reporting hierarchy | same query | MATCH |
| D7 | Select excludes employees with an annual appraisal this year (`XXZPI_HR_PAF_HEADER_TAB`) | same rule on `XXZPI_HR_PA_HEADER_TAB` (owner decision R4, §7 B9) | DIFFERENT |
| D8 | Prepared by = session user | same | MATCH |
| D9 | Submit after the first save; refused when INPROCESS / APPROVED | no Submit (workflow not built); INPROCESS / APPROVED are read only | MISSING (§7 B2) |
| D10 | Edit save requires Comments, Suggestion and every point | same, client and server | MATCH (was DIFFERENT) |
| D11 | Edit save stores only the total, comments and points | same (UPDATE sets only those columns) | MATCH (new row) |
| D12 | After the first save the form opens the saved record | same | MATCH |
| D13 | Report Pending At = open `EPRBF` step | same subquery on `XXPHP_WORKFLOW` | MATCH (was null) |
| D14 | — | To not before From | NEW ONLY (§7 B5) |
| D15 | — | server refuses employees outside the hierarchy (save and details) | NEW ONLY (§7 B6, security) |

Counts: MATCH 11 · DIFFERENT 1 · MISSING 1 · NEW ONLY 2. Round 4 had 6 · 2 · 3 · 3.

---

## 4. Flow comparison

| # | Step | Legacy | New | Class. |
|---|---|---|---|---|
| F1 | Open the form | any session | `HR.PROBATION_EVALUATIONS:VIEW` / `CREATE` | DIFFERENT (RBAC, intended) |
| F2 | First save | DRAFT header + 20 lines (criteria + points) | same; 422 when the form type has no criteria (§7 B1) | MATCH |
| F3 | Save again | any status, anyone with the URL; comments and points only | Draft / Rejected, record access; comments and points only | DIFFERENT (§7 B3, security) |
| F4–F10 | Submit, approve / reject, forward, request information, approver Suggestion, e-mails | `ProbationFlow`, `EPRBF`, `XX_PROBATION_WF` | not built (by instruction) | MISSING (§7 B2) |
| F11 | Report | HR (`XXZP_HR` MEANING = employee number) sees all, others their own; legacy columns | same scope and columns, Pending At filled | MATCH |
| F12 | View a record | any ID | record-level access | DIFFERENT (security, intended) |
| F13 | Print | link does nothing | browser print | DIFFERENT (§7 B7) |
| F14 | Delete | none | no button; API `DELETE` (Draft) remains | MATCH on the page (§7 B8) |
| F15 | Request Form / Report links | yes | "Request Form" / "Report" | MATCH |

---

## 5. Changes made

### 5.1 Defect found: create and update failed on Oracle (ORA-01745)

`COMMENT` is an Oracle reserved word, so the bind `:comment` in the INSERT and the UPDATE of
`XXZP_PAF_PROBATION_HEADER` is invalid. `DBMS_SQL.PARSE` on TEST refused both statements with
ORA-01745. So every create and every save of a probation evaluation from the new app failed.
This matches the data: none of the 5 TEST headers was created by an application user.

Mocked tests cannot see this. The binds are now `:preparedComment` / `:approvedComment`, all 6 DML
statements parse on TEST, and a test makes sure `:comment` never comes back.

**The same `:comment` bind is in other forms, not changed here:**
- `employment-offers/employmentOffer.repository.js` (insert and update);
- `interview-assessments/interviewAssessment.repository.js` (insert and update).

They very likely fail the same way (§8 Q1).

### 5.2 Server

| Item | Change |
|---|---|
| Criteria | `GET lookups/criteria?formType=`. `findCriteria` reads the criteria (English, Arabic, in line order) of the latest evaluation of that type that holds all 20 named criteria |
| Create | Lines are the form type's criteria with the points by position; texts never come from the client. Employee number, name, job title and department come from the master. The employee must be in the actor's hierarchy (403). Comments, Suggestion, evaluation period and person ID are stored as `-`, the grade as 0. 422 `PROBATION_CRITERIA_UNAVAILABLE` without criteria |
| Update | Body is Comments, Suggestion and `{lineId, rating}` for every stored line, all required. The UPDATE sets only `TOTAL_RATING`, both comments, `UPDATED_*` and `RATING_LINE`. Draft and Rejected are editable; the status is kept |
| Validation | Ignored fields from older clients are stripped; the text limit is 500 (all columns are `VARCHAR2(500)`) |
| Report | `pendingAt` from `XXPHP_WORKFLOW` (`EPRBF`, open, `TYPE_PARAM` null) |
| Detail | `preparedBy` (`USER_NAME`) |
| Employee details | Limited to the actor's hierarchy (403) |

### 5.3 Client

- Steps are kept (Employee & period → Evaluation criteria → Comments) with the legacy labels.
- **Choosing a form type** loads its criteria. Each row shows the English and Arabic text, Allocated 5 and a Points select. Before a type is chosen, the step shows "Select Form name".
- **Create:** the joining date is editable; Job Grade is read only; Comments and Suggestion are read only until the first save.
- **Saved record:** the header is read only; Comments, Suggestion and every point are required.
- **Locks and labels:**
  - Inprocess and Approved records are locked.
  - "Approved by" shows HR SUPERVISOR once approved.
  - The result reads "Not Acceptable", with the legacy bands.
- **Toolbar:** Save, Print, Report, Request Form.
- **Report columns:** Emp. #, Name, Job Title, Department, Total Rating, Evaluation, Status, Date, Pending At. The Form type column is removed.
- **Payloads:**
  - Create sends only form type, employee number, joining date, period and points.
  - Edit sends only Comments, Suggestion and the points.

---

## 6. Verification

### 6.1 Tests (mocked; executed 2026-11-03)

| Command | Result |
|---|---|
| `server> node --import ./tests/setup.js --test tests/probation-legacy-parity.test.js` | 36 tests: 35 pass, 0 fail, 1 todo |
| `server> node --import ./tests/setup.js --test tests/probation-evaluations.test.js` | 18 tests: 18 pass |
| `server> npm test` · `npm run lint` · `npm run format:check` | 879 tests: 878 pass, 0 fail, 1 todo · clean · clean |
| `client> node --test tests/probationLegacyParity.test.mjs` | 24 tests: 23 pass, 0 fail, 1 todo |
| `client> npm test` · `npm run lint` · `npm run build` · `node scripts/verify-production.mjs` | 426 tests: 425 pass, 0 fail, 1 todo · clean · built · "Release checks: PASS" |
| Browser | **not verified** |

The two todos are the workflow:
- server: an approver edits the Suggestion while INPROCESS;
- client: Submit.

### 6.2 Oracle TEST, read only (counts and flags only)

| Check | Result |
|---|---|
| DML (`insertHeader`, `insertLine`, `updateHeader`, `updateLine`, delete × 2) via `DBMS_SQL.PARSE` | 6 / 6 parse (before the fix: 4 / 6, ORA-01745) |
| Bind names | only `:comment` is refused; `:comments` and the new names parse |
| Headers on TEST | 5. Form types: 1 `Department_Managers`, 4 without a type (`-`). Statuses: DRAFT 3, INPROCESS 1, APPROVED 1. Created by an application user: 0 |
| Lines per header | 20, 20, 20, 0, 0. The 2 typeless headers with lines have 40 blank criteria in total (legacy saved 20 lines without a type) |
| Criteria per type (`findCriteria`) | `Department_Managers` 20 (20 with Arabic); the other four types 0 |
| Detail read of every header | 5 / 5 open; `preparedBy` set on 5 |
| Report Pending At | 1 of 5 rows (one open `EPRBF` step, one approver per key) |
| Employee select / hierarchy check | 5 accounts list 6, 50, 1, 50, 0 employees; each listed employee is found again by number and by name; the user is never in their own list |
| Dictionary | Every text column is `VARCHAR2(500)`; `GRADE` is `VARCHAR2`. `XX_DIGI_EMP_MASTER` has no grade column (so Job Grade stays unfilled, as legacy) |

---

## 7. Deviations and decisions for the owner

| ID | Item | What the new form does | Why |
|---|---|---|---|
| B1 | Criteria source | `prf-new.js` is not in the repository. Legacy copied each criterion into every saved evaluation, so the criteria are read from the latest evaluation of the type holding all 20. TEST has a set only for Department Managers; the other four types answer "criteria not available" (422) until a legacy evaluation of that type exists | Real legacy data, no invented text. Supplying `prf-new.js` would allow a fixed catalogue (design in git history of this report, round 2 §9) |
| B2 | Workflow | Submit, approval steps, e-mails and the approver Suggestion are not built | By instruction. The submit checks exist (`submitProblems`, `validateForSubmit`) |
| B3 | Editing by status | Draft and Rejected only; Inprocess and Approved are read only | Legacy lets anyone edit at any status; with no workflow here, changing a request under approval would bypass it |
| B4 | Form type and employee required | Required | Legacy saved a record without them (4 of 5 TEST headers have no type, and 2 hold 20 blank criteria), which can never be completed |
| B5 | To before From | Refused | New rule kept from earlier rounds |
| B6 | Employee check | The server accepts only an employee of the user's hierarchy, on save and for the details lookup | Legacy trusted the browser |
| B7 | Print | Browser print | The legacy Print link does nothing |
| B8 | Delete | The API `DELETE` (Draft only) remains; no button | Legacy has no delete. Remove the endpoint? |
| B9 | Annual-appraisal exclusion | Reads `XXZPI_HR_PA_HEADER_TAB` | Owner decision R4; still pending HR confirmation whether to exclude at all |
| B10 | Earlier owner decisions reversed by "CI3 is the source of truth" | Joining date editable again (was read only, R2); Comments / Suggestion / points required on the edit save (was "on submit only", R2); free-text criteria removed; Grade read only; evaluation period input removed | Please confirm |

---

## 8. Open questions

- Q1 Fix the same ORA-01745 `:comment` bind in Employment Offer and Interview Assessment (separate task)?
- Q2 Please supply `assets/prf-new.js` from the production server, so every form type has its criteria on TEST too (B1).
- Q3 Remove the unreachable demo model fields (recommendation, signatures) from `probationModel.js`?
- Q4 B8: remove the probation `DELETE` endpoint?
- Q5 Still open from earlier rounds: should probation exclude employees with an annual appraisal this year at all (B9)?
- Q6 The legacy SMTP password in `ProbationFlow.php` was redacted from tracked docs in round 2; please rotate it.

---

## 9. Earlier rounds (summary)

Rounds 1–4 were on `test/probation-legacy-comparison`, merged as #48. Their full text is in the Git
history of this file. What still applies:
- Statuses are the four uppercase values legacy writes: `DRAFT`, `INPROCESS`, `APPROVED`, `REJECTED`.
- All dates are `YYYY-MM-DD`. A blank joining date is stored as NULL (`FORM_DATE` is nullable on TEST); NULL and the legacy 2000-01-01 both read as blank.
- The total and the result are computed by the server.
- The user is found by employee number, because `XX_DIGI_EMP_MASTER.USER_ID` is the legacy EBS ID.
- Credential redaction of the spec docs (round 2).
