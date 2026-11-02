# Probation Evaluation (1064) — Legacy CI3 vs New Form Comparison

**Date:** 2026-11-02 · **Branch state:** uncommitted working-tree changes on `main` (no Git writes made)
**Scope:** read-only comparison of the legacy CI3 form against the new React/Node form, mocked tests
only (no Oracle access, no database writes), and one allowed code change: new-only fields made optional.
**Masking:** no real names, e-mail addresses, credentials or employee data from the legacy code are
reproduced here. Test data is fictional (`Sample Employee 001`, `E-0001`).

Classification legend: **MATCH** · **DIFFERENT** · **MISSING IN NEW** · **NEW ONLY**.
Status of the new form: the live page (`ProbationPage.jsx`) always uses the API (`demo={false}`).
A second, richer model (`probationModel.js`) — recommendations, signatures, per-type criteria with
allocated points — is used only by the demo adapter and the contract readers. The live page cannot
reach it. Both are covered below and labelled "live" or "demo-only".

---

## 1. Files found

### 1.1 Legacy (`php-ci3-old-app/zamil_old_codebase/zpil_codebase/pmform_codebase/`)

| File | Role |
|---|---|
| `controllers/Probation.php` | Routes: `index` (create / edit by `uri segment 3`), `add_probation_data` (save), `probreport` (report), `getEmpDetails` (AJAX autofill) |
| `controllers/ProbationFlow.php` | Workflow: `submit()` (start, e-mail to direct manager), `workflow()` (approve / reject per step, e-mails), `send_email()` |
| `models/Probation_Model.php` | `add_form_data()` (insert header + 20 lines / update), `getEmpDetails()`, `fetchDirectManager()`, `fetchApprover()`, `updateRequestStatus()` |
| `models/Data_model.php` | `getEmp()` / `getAllEmp()` (employee list, l.3123/3167), `fetchFormData()` (l.3198), `getPROBRecords()` (report + HR scoping, l.5250), `getRequestedBy()` (l.5623), `getExpenseFlowRec()` (step approver lookup, l.5953) |
| `views/probation/probation.php` | Create view + inline jQuery (employee autofill) |
| `views/probation/prf_uplines.php` | Edit/view of a saved form + inline jQuery (Submit, autofill) |
| `views/probation/header.php` | Toolbar: Save, Submit (only after first save), Report, Request Form, Print, Home |
| `views/probation/prob_report.php` | Report list (DataTables) |
| Shared, referenced: `Workflow_model::callXXPHP_WORKFLOW`, `delegatedUser`, `checkRequestOpen`, `check_RFI_mode`, `Zmailer` (approve / reject / forward / reassign / request-information links) | Workflow engine (`XXPHP_WORKFLOW`, msg type `EPRBF`, lookup `XX_PROBATION_WF`) |
| **Not in the repository:** `assets/prf-new.js`, `assets/prf.css` | `showDropInfo()` (criteria per form type), rating total calculation, `one()` handlers |

No probation-specific stored procedures or packages are called. All SQL is inline in the PHP. No
probation-specific route entry exists in `config/routes.php`. CI3 default controller/method routing
applies. There is no print/PDF view: the toolbar **Print** link is `javascript:void(0)`.

### 1.2 New

| Layer | File |
|---|---|
| Page | `client/src/features/hr-recruitment/probation/ProbationPage.jsx` (live) |
| Model | `client/src/features/hr-recruitment/probation/probationModel.js` (demo adapter + contract only) |
| Service | `client/src/features/hr-recruitment/hrRecruitmentService.js` → `createProbationService` (l.1403) |
| Contract | `client/src/features/hr-recruitment/hrRecruitmentContract.js` → `readProbation`, `readProbationListItem` (demo shape) |
| Demo adapter | `client/src/features/hr-recruitment/demo/demoClient.js`, `demo/demoData.js` |
| Text | `client/src/features/hr-recruitment/hrRecruitmentText.js` → `PROBATION_TEXT` |
| Routes / nav | `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx`, `client/src/config/registry/modules/hrForms.module.js` |
| Backend | `server/src/modules/hr/probation-evaluations/probationEvaluation.{routes,controller,service,repository,validation}.js` |
| Docs | `docs/specs/README_probation_evaluation_form.md`, `client/src/features/hr-recruitment/README.md`, `docs/handoffs/FEATURE-HR-RECRUITMENT.md` |
| Existing tests | `server/tests/probation-evaluations.test.js` (+ `helpers/probationEvaluationFakes.js`), `client/tests/hrOnboarding.test.mjs`, `client/tests/hrRecruitmentAudit.test.mjs` |
| New tests (this task) | `server/tests/probation-legacy-parity.test.js`, `client/tests/probationLegacyParity.test.mjs` |

---

## 2. Field matrix

Conventions: "Req." is the **effective** required-ness: legacy client (HTML `required`) or server,
new client or server. Legacy server validation is none. Every empty value is replaced by `-`, `0` or
`01-JAN-00`. "Edit after save" means legacy `prf_uplines.php`, whose `UPDATE` persists **only**
`TOTAL_RATING`, `PREPARED_BY_CMNT`, `APPROVED_BY_CMNT` and line ratings. Every other header input is shown
but ignored. The new form persists every field while the record is `DRAFT`.

### 2.1 Header (`XXZP.XXZP_PAF_PROBATION_HEADER`)

| # | Label (legacy → new) | DB column | Legacy: type · req. · default · editable · source | New: type · req. (client/server) · default · max · editable · source | Class. |
|---|---|---|---|---|---|
| 1 | Form type → Form type | `FORM_NAME` | select, 5 values · **not required** · `''`→`-` · create only (ignored on update) | select from `GET lookups/form-types` (same 5 values) · **required / required** · `''` · editable in DRAFT | **DIFFERENT** (required) |
| 2 | Employee Name → Employee | `EMP_NAME` | select of subordinates (hierarchy query) · not required (option value `0`) · create only | searchable picker, same hierarchy query · **required / required** · max 200 · editable in DRAFT | **DIFFERENT** (required; list lacks PAF exclusion, see D7) |
| 3 | Employee Number | `EMP_NUMBER` | read-only, autofill · not required | read-only, autofill · required (via employee) / required · max 50 | **DIFFERENT** (required) |
| 4 | **Joining Date** → **Form date** | `FORM_DATE` | text, autofilled with the employee's `JOINING_DATE` · optional · blank→`01-JAN-00` · create only | `date`, **defaults to today** · **required / required** · not autofilled | **DIFFERENT** (meaning, default, required) |
| 5 | Job Title | `JOB_T` | read-only autofill · optional | read-only autofill · optional · max 200 | **MATCH** |
| 6 | Job Grade → Grade | `GRADE` | read-only, **never filled** (autofill commented out) → stored `0` | **editable** number ≥ 0 integer · optional · default 0 | **DIFFERENT** (editable, new rule) |
| 7 | Department | `DEPARTMENT` | read-only autofill · optional | read-only autofill · optional · max 200 | **MATCH** |
| 8 | Evaluation Period From | `FROM_DATE` | `date` · required (HTML) · create only | `date` · required / required (real calendar date) · DRAFT | **MATCH** |
| 9 | Evaluation Period To | `TO_DATE` | `date` · required (HTML) · create only | `date` · required / required · DRAFT | **MATCH** |
| 10 | Prepared & Agreed by | `USER_NAME`, `USER_MAIL` | hidden, from the session user (`getRequestedBy`) | read-only display; server takes it from the session (body field rejected) | **MATCH** |
| 11 | Total | `TOTAL_RATING` | hidden, computed by `prf-new.js` (source missing) | computed live (sum of ratings); server sums lines when absent; 0–100 | **MATCH** (assumed sum, see §8) |
| 12 | Comments (Prepared by) → Comment | `PREPARED_BY_CMNT` | textarea · **read-only on create**, **required on edit** | textarea · optional · max 4000 · DRAFT | **DIFFERENT** (required on edit) |
| 13 | Suggestion (Approved by) → Additional comments | `APPROVED_BY_CMNT` | textarea under "Approved by" · read-only on create, **required on edit** (used by approvers during workflow) | textarea "Additional comments" · optional · max 4000 · DRAFT only | **DIFFERENT** (label, required, stage) |
| 14 | Evaluation Result (Acceptable 71–100 / Not acceptable 0–70) | derived from `TOTAL_RATING` | coloured band on edit view; also in report and e-mail | **not shown** on the live page (`resultFor` exists only in the demo model) | **MISSING IN NEW** |
| 15 | Approved by: "HR SUPERVISOR" | derived from `REQUEST_STATUS` | shown when `APPROVED` | not shown (no workflow) | **MISSING IN NEW** |
| 16 | Request number | `HEADER_ID` | URL segment; header ID | "Evaluation no." = `HEADER_ID` (identity column) | **MATCH** |
| 17 | Evaluation period (free text) | `EVALUATION_PERIOD` | input exists only in a commented-out block → always `-` | optional text, max 200 | **NEW ONLY** (optional ✔) |
| 18 | (hidden) Employee person ID | `EMP_ID` | no input (`e_id` never posted) → always `-` | filled from `PERSON_ID` on employee selection · server optional · **client required → made optional** | **NEW ONLY** (made optional, §7) |

### 2.2 Lines (`XXZP.XXZP_PAF_PROBATION_LINES`)

| # | Label | DB column | Legacy | New | Class. |
|---|---|---|---|---|---|
| 19 | Evaluation criterion | `PARAM_NAME` | **predefined per form type** (`showDropInfo()`), hidden input, not editable | **free text typed by the user** · required / required · max 500 (client) | **DIFFERENT** |
| 20 | Criterion (Arabic) | `PARAMA_NAME_AR` | predefined, hidden, not editable | optional free text, max 500 | **DIFFERENT** |
| 21 | Points / Rating | `RATING_LINE` | select 1–5; **required on edit view**; blank → 0 | select 1–5 · optional (blank stored as 0) · server rejects 0 or >5 if sent | **DIFFERENT** (required on edit) |
| 22 | Allocated points per criterion | — (display) | constant "5" per line, total 100 | label "Rating (1–5)", total `/100` | **MATCH** |
| 23 | Number of criteria | — | always **20 lines** inserted (`for $i < 20`) | 1–20, user adds/removes (remove only before first save) | **DIFFERENT** |

### 2.3 Demo-only redesign fields (`probationModel.js`, contract, demo adapter; not on the live page)

| Field | Before this task | Now | Class. |
|---|---|---|---|
| Recommendation (Confirm / Extend / End) | required on submit | optional | **NEW ONLY** (made optional) |
| Extend by (1–3 months) | required when Extend | optional | **NEW ONLY** (made optional) |
| Justification | required when recommendation contradicts result | optional | **NEW ONLY** (made optional) |
| Evaluator signature | required on submit | optional | **NEW ONLY** (made optional) |
| Employee signature | optional | optional | **NEW ONLY** ✔ |
| Key strengths / Areas for improvement / Training needs | optional | optional | **NEW ONLY** ✔ |
| Evidence note per criterion | optional | optional | **NEW ONLY** ✔ |
| Probation end date (joining + 3 months + extension) | derived, display | unchanged | **NEW ONLY** (derived) |
| Allocated points per criterion + quick picks, rating scale bands | from demo lookups | unchanged | **NEW ONLY** (demo data) |

### 2.4 Counts

| Classification | Live form | Demo-only | Total |
|---|---|---|---|
| MATCH | 8 (#5, 7, 8, 9, 10, 11, 16, 22) | — | **8** |
| DIFFERENT | 11 (#1, 2, 3, 4, 6, 12, 13, 19, 20, 21, 23) | — | **11** |
| MISSING IN NEW | 2 (#14, 15) | — | **2** |
| NEW ONLY | 2 (#17, 18) | 9 | **11** |

---

## 3. Dependency matrix

| # | Legacy dependency (source) | New client | New server | Class. |
|---|---|---|---|---|
| D1 | Employee select → AJAX `getEmpDetails` fills employee number, job title, department, **joining date → `prf_date`**, person ID (`probation.php` l.341–386) | fills number, job title, department, person ID; fetches `startDate` but **does not use it** | `GET lookups/employee-details` returns the same data | **DIFFERENT** (joining date not filled) |
| D2 | Form type change → `showDropInfo()` renders that type's criteria (EN/AR) into the table (`prf-new.js`, **not in repo**) | form type has no effect on lines; user types criteria | form types only, no criteria | **MISSING** |
| D3 | Rating change → total recalculated (`.cal-rating`, `prf-new.js`) | total recomputed live | sums lines when `totalRating` absent; **trusts a client total** otherwise | **MATCH** (client) / note: server trusts client, as legacy did |
| D4 | Total → result band: ≤70 Not acceptable, ≥71 Acceptable (`prf_uplines.php` l.380–400; report; e-mail "Status") | not shown | none | **MISSING** |
| D5 | `REQUEST_STATUS = APPROVED` → "Approved by: HR SUPERVISOR" | — | — | **MISSING** (needs workflow) |
| D6 | Employee list = logged-in user's reporting hierarchy (`CONNECT BY PRIOR full_name = supervisor_name`, `LEVEL != 1`, active employees) | same | same query | **MATCH** |
| D7 | Employee list **excludes** employees with a non-rejected annual PAF this year (`NOT EXISTS … XXZPI_HR_PAF_HEADER_TAB`) | — | condition absent in `listEmployees` | **DIFFERENT** (see open question Q4) |
| D8 | Prepared by = session user (`getRequestedBy`) | display from `lookups/requestor` | from session on create | **MATCH** |
| D9 | Submit button only after first save (`flag_update == 1`); confirm dialog; refused if `INPROCESS`/`APPROVED` | no Submit | no submit endpoint | **MISSING** |
| D10 | Edit view: Comments & Suggestion `required`; each rating `required` | optional | optional | **DIFFERENT** |
| D11 | Cross-field date order | none in legacy | `toDate ≥ fromDate` | `toDate ≥ fromDate` | **NEW ONLY** rule (kept; see Q6) |
| D12 | Grade | read-only, never filled | integer ≥ 0 when entered | integer ≥ 0, default 0 | **NEW ONLY** rule (optional field) |
| D13 | Years in company / years in position computed in `getEmpDetails`, written to non-existent elements (no visible effect) | not shown | `yearsInCompanay` returned, unused | **MATCH** (unused in both) |
| D14 | "Already Rating Given" alert on an `exist` response; reset of `#rating-block`, `#rate20` | — | — | N/A: dead code in legacy (server never returns `exist`; elements do not exist) |
| D15 | Joining date month parsing (`jdt`) | — | — | N/A: computed but unused in legacy |
| D16 | Demo-only: recommendation suggested from score (≥71 Confirm, 51–70 Extend, <51 End); probation end = joining + 3 (+ extension) months; form type change clears scores | demo model only | — | **NEW ONLY** |

Counts: MATCH 4 (D3, D6, D8, D13) · DIFFERENT 3 (D1, D7, D10) · MISSING 4 (D2, D4, D5, D9) · NEW ONLY 3 (D11, D12, D16) · N/A 2.

---

## 4. Flow comparison

| # | Step | Legacy (who · editable · buttons · status) | New | Class. |
|---|---|---|---|---|
| F1 | Open new form | any logged-in session (`FormsSession`); toolbar Save, Report, Request Form, Print, Home | `HR.PROBATION_EVALUATIONS:VIEW` to open, `CREATE` to save; Save draft, Print, Records, New form | **DIFFERENT** (RBAC, intended) |
| F2 | First save | inserts header `DRAFT` + exactly 20 lines; redirects to the edit view | `POST` header + 1–20 lines in one transaction, `DRAFT`; IDs from identity columns | **DIFFERENT** (line count) |
| F3 | Edit / save again | Save at **any** status, by anyone with the URL; only ratings, Comments, Suggestion persist | `PUT` only while `DRAFT` (409 otherwise); owner, HR (`XXZP_HR`) or same-department user with VIEW; `UPDATE` permission; every field persists | **DIFFERENT** |
| F4 | Submit | Submit (after first save) → e-mail to the preparer's direct manager (with delegation), `XXPHP_WORKFLOW` row, status `INPROCESS` | none | **MISSING** |
| F5 | Approval step 1 (direct manager) | e-mail links: Approve, Reject, Forward, Reassign, Request Information; approve → next approver from lookup `XX_PROBATION_WF` step 2 (delegation honoured); reject → `REJECTED`, e-mail to preparer | none | **MISSING** |
| F6 | Approval step 2 (final) | approve → `APPROVED`, e-mail to preparer; reject → `REJECTED` | none | **MISSING** |
| F7 | Return / request information | no "return for correction"; Request Information (RFI) blocks actions until answered; Forward / Reassign via shared `Zmailer` | none | **MISSING** |
| F8 | Approver adds Suggestion during workflow | approver opens the form link and saves (no status check) | not possible (DRAFT only) | **MISSING** |
| F9 | Final status | `APPROVED` / `REJECTED` | only `DRAFT` exists | **MISSING** |
| F10 | Notifications | HTML e-mail at submit and each action, incl. history table | none | **MISSING** |
| F11 | List / search | Report: HR (`XXZP_HR`) sees all, others their own; columns #, Emp. #, Name, Job Title, Department, Total Rating, Evaluation, Status, Date, Pending At; client-side DataTables search | same scoping; server paging, search, filters (status, form type, emp no., department, dates), sort; dialog columns: number, Employee, Form type, Total rating, Status | **DIFFERENT** (missing columns; status filter bug, see M13) |
| F12 | View a record | any header ID by URL, no access check | record-level authorization (404 unknown, 403 others) | **DIFFERENT** (intended hardening) |
| F13 | Print | link does nothing (`javascript:void(0)`) | browser print | **DIFFERENT** (new works) |
| F14 | Delete | not available | `DELETE` while `DRAFT` (`DELETE` permission) | **NEW ONLY** |
| F15 | New form | "Request Form" link | "New form" with unsaved-changes confirmation | **MATCH** |

Counts: MATCH 1 · DIFFERENT 6 · MISSING 7 · NEW ONLY 1.

Note: the spec `docs/specs/README_probation_evaluation_form.md` §11 marks the whole workflow
(F4–F10) as **explicitly out of scope** for the current module. These rows are missing by design, not by
oversight. They still need an owner decision.

---

## 5. Test results

All tests are mocked (fake repository / fake HTTP client / page source). No Oracle connection, no
database writes, no browser, no screenshots. Executed on 2026-11-02.

| Command | Result |
|---|---|
| Baseline before changes: `server> node --import ./tests/setup.js --test tests/probation-evaluations.test.js` | 14 pass, 0 fail |
| Baseline: `client> node --test --test-name-pattern="[Pp]robation" tests/hrOnboarding.test.mjs tests/hrRecruitmentAudit.test.mjs` | 12 pass, 0 fail |
| `server> node --import ./tests/setup.js --test tests/probation-evaluations.test.js tests/probation-legacy-parity.test.js` | **30 tests: 26 pass, 0 fail, 4 todo** |
| `client> node --test tests/probationLegacyParity.test.mjs` | **20 tests: 14 pass, 0 fail, 6 todo** |
| `client> node --test tests/hrOnboarding.test.mjs tests/hrRecruitmentAudit.test.mjs` (contain the probation model/demo/service tests; whole files run because the demo adapter is shared) | **48 pass, 0 fail** |
| `eslint` on all changed/new files (client `src/features/hr-recruitment`, both new test files) | clean |

`todo` tests encode a legacy behaviour the new form does not have. Each one was run and fails, which
confirms the gap. They do not fail the suite.

### 5.1 What the new parity tests cover

**Server (`server/tests/probation-legacy-parity.test.js`)**: required set (employee name/number,
form type, from/to); exactly the 5 legacy form types; all other header fields optional, grade
default 0; legacy placeholders (`-`, `01-JAN-00`, `DD-Mon-YYYY`) stored; prepared-by taken from
the session (body field rejected); max 20 lines, rating 1–5, missing rating → 0; criterion text and
LINE_ID on update; TOTAL_RATING = sum of lines when absent, capped at 100; date order; employee
details autofill and years-in-company; DRAFT update of header + line ratings.
**Todo (gaps confirmed):** FORM_DATE optional as joining date · server derives total even when the
client sends one · approver can save Suggestion while INPROCESS · list filter by stored `REJECTED`.

**Client (`client/tests/probationLegacyParity.test.mjs`)**: `-`/0 placeholders read back as empty;
legacy date formats → ISO; header fields map to legacy columns; prepared-by not sent; line payload
(blank rating omitted); LINE_IDs on update; total = sum (20 × 5 = 100); employee autofill fields
(grade not filled, as legacy); result threshold 70/71 (model); page required/optional set, date
order, 20-line cap, 1–5 options; the 5 form types from the lookup; new-only fields optional
(recommendation, extension, justification, signatures, EMP_ID incl. saving a legacy record with
`EMP_ID '-'`); DRAFT list mapping; Save draft, Print, Records present.
**Todo (gaps confirmed):** result band on the page · criteria loaded by form type · joining date
autofill · Comments/Suggestion required on edit · Submit/workflow · report columns.

---

## 6. Missing items — proposed implementation (awaiting approval; nothing implemented)

Effort: XS < 2 h · S ≤ 1 day · M 2–4 days · L ≥ 1 week. Gates per `docs/FEATURE-DELIVERY-WORKFLOW.md`.

| ID | Item | Priority | UI | API | DB | Effort / gate |
|---|---|---|---|---|---|---|
| M1 | **Predefined criteria per form type** (D2, #19–20, #23) | **P1** | On form-type change, load that type's criteria (EN/AR, read-only labels) and show a rating per line; confirm before replacing rated lines | `GET lookups/form-types` returns `{ code, name, criteria: [{ param, paramAr }] }`; create/update validate that the params match the type | none if the catalogue is a server constant; seeding `XX_DIGI_LOOKUP_VALUES` would need **G1** | M after the criteria are supplied. **Blocked:** `assets/prf-new.js` is not in the repository |
| M2 | **Evaluation result** Acceptable / Not acceptable (#14, D4) | **P1** | Show the band next to the total (≥71 Acceptable, ≤70 Not acceptable) and in Records | optional `evaluation` field in list rows (derived) | none | XS–S |
| M3 | **Joining date / FORM_DATE meaning** (#4, D1) | **P1 (decision)** | A: relabel "Joining date", autofill from employee `startDate`, optional (legacy). B: keep "Form date" and show joining date read-only | A: make `formDate` optional server-side | none (same column) | S |
| M4 | **Submit + 2-step approval** (F4–F9, D9) | P1 if CI3 is to be retired for 1064, else P3 | Submit button after first save; status pill; approver inbox / action screen with Approve / Reject (+ comment) | `POST /:id/submit`, `POST /:id/approve`, `POST /:id/reject`; statuses `INPROCESS` / `APPROVED` / `REJECTED` in existing `REQUEST_STATUS`; approver = preparer's supervisor, then `XX_PROBATION_WF` step 2; delegation | existing columns; writing `XXPHP_WORKFLOW` for CI3 coexistence | L · **G2, G3, G4** (out of scope in the spec §11) |
| M5 | **E-mail notifications** (F10) | P2 (with M4) | — | notification service | — | M · needs SMTP configuration (secrets) and **G2** |
| M6 | **Approver Suggestion during workflow** (#13, F8) | P2 (with M4) | Suggestion editable by the current approver only | allow `comments` update when `INPROCESS` and the actor is the pending approver | none | S (after M4) |
| M7 | **Report columns** Emp. #, Job title, Department, Evaluation, Date (+ Pending at) (F11) | P2 | add columns to the Records dialog | data already returned except Pending at; Pending at = read-only subquery on `XXPHP_WORKFLOW` | none | XS without Pending at; S with it (**G4**, excluded by spec §7) |
| M8 | **Approved by: "HR SUPERVISOR"** display (#15, D5) | P3 (with M4) | show when `APPROVED` | none | none | XS |
| M9 | **Employee list exclusion** of employees with an active annual PAF this year (D7) | P3 (decision, Q4) | — | add the legacy `NOT EXISTS` to `listEmployees` | read-only | XS |
| M10 | **Comments, Suggestion and each rating required when editing a saved form** (#12, #13, #21, D10) | P3 (decision) | required markers on update | conditional `required` in `updateBodySchema` | none | S |
| M11 | Always 20 lines (#23) | P3 (falls out of M1) | — | — | — | — |

Defects found during the comparison (not legacy features; also awaiting approval):

| ID | Defect | Priority | Fix | Effort |
|---|---|---|---|---|
| M12 | **Hard-coded SMTP credential** of the legacy workflow mailbox appears in two **tracked** docs (`docs/specs/README_probation_evaluation_form.md` §11 and `docs/specs/README_orientation_training_form.md`). The repository is public | **P0** | Redact both docs, ask the mailbox owner to rotate the password, and consider history clean-up (owner decision, history rewrite not done) | XS + owner action |
| M13 | List filter `requestStatus` accepts `Rejected`, but the legacy workflow stores `REJECTED` (`Probation_Model::updateRequestStatus`) — filtering rejected records returns nothing | P2 | `valid('DRAFT','INPROCESS','APPROVED','REJECTED')` (optionally also accept the old casing) | XS |
| M14 | Server trusts a client-sent `totalRating` (legacy did the same) | P3 | always compute from lines on the server | XS |

---

## 7. Changes made (new-only fields made optional)

| File | Change |
|---|---|
| `client/src/features/hr-recruitment/probation/ProbationPage.jsx` | Save no longer requires `employee.employeeId` (EMP_ID = person ID, new-only; legacy always stored `-`). This also fixes saving any legacy-created record, which read back with an empty EMP_ID and was blocked with "Select an employee with complete employee details". Employee name and number stay required. |
| `client/src/features/hr-recruitment/probation/probationModel.js` | `validateProbation` no longer requires, on submit: recommendation, extension period (when Extend), justification (when contradicting the result), evaluator signature. Removed the `submit` option. The comment on `contradictsResult` now says a justification is useful, not required. |
| `client/src/features/hr-recruitment/demo/demoClient.js` | Demo "backend" checks call `validateProbation` without `submit`, so the demo server also treats these fields as optional. |
| `client/src/features/hr-recruitment/hrRecruitmentText.js` | Justification label: "(required when …)" → "(optional; when …)". The now-unused error strings for those fields are left in place. |
| `client/tests/hrOnboarding.test.mjs` | Submit assertions updated to the optional rule (formatted with Prettier). |
| `server/tests/probation-legacy-parity.test.js`, `client/tests/probationLegacyParity.test.mjs` | New parity tests (§5). |

Server: no change needed. The API has no recommendation, signature or similar fields. `evaluationPeriod`,
`empId` and `grade` were already optional.
Not changed (not new-only, so out of the allowed change): `formDate` (repurposed legacy column, see
M3), the `toDate ≥ fromDate` rule and the grade integer rule (rules, not fields).
Nothing in `php-ci3-old-app` was modified. No dependency was added. Nothing was committed.

---

## 8. Assumptions and open questions

**Assumptions**
1. `prf-new.js` (missing) sums the 20 line ratings into `total` and renders the criteria for the
   selected type with 1–5 selects, consistent with the edit view (20 lines × max 5 = 100, "Allocated 5").
2. Classification uses the effective required-ness (client or server). Adding server validation
   to a field that legacy required only in HTML counts as MATCH.
3. The demo-only model (`probationModel.js`) holds "new requirements", so its extra fields count as NEW ONLY.
4. The legacy edit view's header inputs (employee, type, dates) look editable but are not persisted. The
   new form making them editable in DRAFT is treated as an intended improvement.

**Open questions for the owner**
- Q1 Can you supply the per-form-type criteria (EN/AR) from production `assets/prf-new.js`? M1 is blocked without them.
- Q2 `FORM_DATE`: joining date (legacy) or form date (new)? (M3)
- Q3 Is the approval workflow (M4–M6) in scope now, given the spec §11 exclusion? If yes: coexist with CI3 `XXPHP_WORKFLOW`, or a new engine?
- Q4 The legacy employee list excludes employees with an active **annual** PAF (`XXZPI_HR_PAF_HEADER_TAB`). Is that intended for probation, or copied from the annual form? (M9)
- Q5 Should Comments / Suggestion / ratings become required at a later stage (edit or submit), as on the legacy edit view? (M10)
- Q6 Keep the new `toDate ≥ fromDate` and grade-integer rules? They are stricter than legacy.
- Q7 May I redact the credential from the two spec docs (M12)? Rotation must be done by the mailbox owner.
- Q8 The demo-only redesign (recommendation, signatures, allocated points) is not reachable from the live page. Keep it, or remove it?
- Q9 These changes sit uncommitted on `main`. Should I create a `fix/` or `test/` branch for them?
