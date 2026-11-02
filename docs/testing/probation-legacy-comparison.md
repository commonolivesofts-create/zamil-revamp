# Probation Evaluation (1064) — Legacy CI3 vs New Form Comparison

**Date:** 2026-11-02 · **Branch:** `test/probation-legacy-comparison` (committed, not pushed)
**Scope:**
- Round 1: read-only comparison of the legacy CI3 form against the new React/Node form, mocked tests,
  and new-only fields made optional.
- Round 2 (owner-approved): credential redaction, status filter, joining date, evaluation result,
  list columns, submit rules, employee-list exclusion, and the criteria design (design only).
- Round 3 (owner-approved): server-computed total and result, read-only TEST dictionary checks
  (exclusion table, FORM_DATE nullability, joining-date count), NULL for a blank joining date,
  Job Title in Records, and the unpushed `main` commits (§10).

Rounds 1–2 had no Oracle access. Round 3 ran **read-only** `SELECT`s on TEST (`zpadwtest_*`) inside
`SET TRANSACTION READ ONLY` + rollback, printing only owners, types, nullability and counts.
No database writes in any round.
**Masking:** no real names, e-mail addresses, credentials or employee data from the legacy code are
reproduced here. Test data is fictional (`Sample Employee 001`, `E-0001`).

Classification legend: **MATCH** · **DIFFERENT** · **MISSING IN NEW** · **NEW ONLY**.
Status of the new form: the live page (`ProbationPage.jsx`) always uses the API (`demo={false}`).
A second, richer model (`probationModel.js`) — recommendations, signatures, per-type criteria with
allocated points — is used only by the demo adapter and the contract readers. The live page cannot
reach it. Both are covered below and labelled "live" or "demo-only".
Rows changed in round 2 are marked **(R2)**.

---

## 1. Files found

### 1.1 Legacy (`php-ci3-old-app/zamil_old_codebase/zpil_codebase/pmform_codebase/`)

| File | Role |
|---|---|
| `controllers/Probation.php` | Routes: `index` (create / edit by `uri segment 3`), `add_probation_data` (save), `probreport` (report), `getEmpDetails` (AJAX autofill) |
| `controllers/ProbationFlow.php` | Workflow: `submit()` (start, e-mail to direct manager), `workflow()` (approve / reject per step, e-mails), `send_email()` |
| `models/Probation_Model.php` | `add_form_data()` (insert header + 20 lines / update), `getEmpDetails()`, `fetchDirectManager()`, `fetchApprover()`, `updateRequestStatus()` |
| `models/Data_model.php` | `getEmp()` / `getAllEmp()` (employee list), `fetchFormData()`, `getPROBRecords()` (report + HR scoping), `getRequestedBy()`, `getExpenseFlowRec()` (step approver lookup) |
| `views/probation/probation.php` | Create view + inline jQuery (employee autofill) |
| `views/probation/prf_uplines.php` | Edit/view of a saved form + inline jQuery (Submit, autofill) |
| `views/probation/header.php` | Toolbar: Save, Submit (only after first save), Report, Request Form, Print, Home |
| `views/probation/prob_report.php` | Report list (DataTables) |
| Shared, referenced: `Workflow_model::callXXPHP_WORKFLOW`, `delegatedUser`, `checkRequestOpen`, `check_RFI_mode`, `Zmailer` (approve / reject / forward / reassign / request-information links) | Workflow engine (`XXPHP_WORKFLOW`, msg type `EPRBF`, lookup `XX_PROBATION_WF`) |
| **Not in the repository:** `assets/prf-new.js`, `assets/prf.css` | `showDropInfo()` (criteria per form type), rating total calculation |

No probation-specific stored procedures or packages are called. All SQL is inline in the PHP. No
probation route entry exists in `config/routes.php`; CI3 default routing applies. There is no
print/PDF view: the toolbar **Print** link is `javascript:void(0)`.

### 1.2 New

| Layer | File |
|---|---|
| Page | `client/src/features/hr-recruitment/probation/ProbationPage.jsx` (live) |
| Live rules (R2) | `client/src/features/hr-recruitment/probation/probationRules.js` (result band, `validateForSubmit`) |
| Model | `client/src/features/hr-recruitment/probation/probationModel.js` (demo adapter + contract only) |
| Service | `client/src/features/hr-recruitment/hrRecruitmentService.js` → `createProbationService` |
| Contract | `client/src/features/hr-recruitment/hrRecruitmentContract.js` → `readProbation`, `readProbationListItem` (demo shape) |
| Demo adapter | `client/src/features/hr-recruitment/demo/demoClient.js`, `demo/demoData.js` |
| Shared dialog | `client/src/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx` → `ReportDialog` |
| Backend | `server/src/modules/hr/probation-evaluations/probationEvaluation.{routes,controller,service,repository,validation,rules}.js` (`rules` new in R2) |
| Docs | `docs/specs/README_probation_evaluation_form.md`, `client/src/features/hr-recruitment/README.md`, `server/docs/openapi/openapi.yaml`, `docs/handoffs/FEATURE-PROBATION-LEGACY-PARITY.md` |
| Tests | `server/tests/probation-evaluations.test.js`, `server/tests/probation-legacy-parity.test.js`, `server/tests/hr-date-only.test.js`, `client/tests/probationLegacyParity.test.mjs`, `client/tests/hrOnboarding.test.mjs`, `client/tests/hrRecruitmentAudit.test.mjs` |

---

## 2. Field matrix

Conventions: "Req." is the **effective** required-ness: legacy client (HTML `required`) or server,
new client or server. Legacy has no server validation and replaces every empty value with `-`,
`0` or `01-JAN-00`. "Edit after save" means legacy `prf_uplines.php`. Its `UPDATE` persists
**only** `TOTAL_RATING`, `PREPARED_BY_CMNT`, `APPROVED_BY_CMNT` and the line ratings. Every other
header input is shown but ignored. The new form persists every field while the record is `DRAFT`.

### 2.1 Header (`XXZP.XXZP_PAF_PROBATION_HEADER`)

| # | Label (legacy → new) | DB column | Legacy | New | Class. |
|---|---|---|---|---|---|
| 1 | Form type | `FORM_NAME` | select, 5 values · **not required** · `''`→`-` · create only | select from `GET lookups/form-types` (same 5 values) · **required / required** · editable in DRAFT | **DIFFERENT** (required) |
| 2 | Employee Name → Employee | `EMP_NAME` | select of subordinates (hierarchy query, minus employees with an annual appraisal this year) · not required | searchable picker, same hierarchy + exclusion (R2) · **required / required** · max 200 | **DIFFERENT** (required) |
| 3 | Employee Number | `EMP_NUMBER` | read-only autofill · not required | read-only autofill · required (via employee) / required · max 50 | **DIFFERENT** (required) |
| 4 | **Joining Date** (R2) | `FORM_DATE` | text input, autofilled with the employee's `JOINING_DATE` · optional · blank→`01-JAN-00` | read-only "Joining date", autofilled from `employee-details` · optional / optional · blank stored as **NULL** (R3; column is nullable on TEST); NULL and the legacy 2000-01-01 both read back as blank · `YYYY-MM-DD` | **MATCH** (meaning, autofill, optional; read-only by owner decision, legacy input was editable) |
| 5 | Job Title | `JOB_T` | read-only autofill · optional | read-only autofill · optional · max 200 | **MATCH** |
| 6 | Job Grade → Grade | `GRADE` | read-only, **never filled** → stored `0` | **editable** number ≥ 0 integer · optional · default 0 | **DIFFERENT** (editable, new rule) |
| 7 | Department | `DEPARTMENT` | read-only autofill · optional | read-only autofill · optional · max 200 | **MATCH** |
| 8 | Evaluation Period From | `FROM_DATE` | `date` · required (HTML) | `date` · required / required (real calendar date) | **MATCH** |
| 9 | Evaluation Period To | `TO_DATE` | `date` · required (HTML) | `date` · required / required | **MATCH** |
| 10 | Prepared & Agreed by | `USER_NAME`, `USER_MAIL` | hidden, from the session user | read-only display; server takes it from the session (body field rejected) | **MATCH** |
| 11 | Total (R3) | `TOTAL_RATING` | hidden, computed by `prf-new.js` (source missing); server trusted it | page previews the sum; **the server always computes it from the ratings** on create/update and on detail reads; a client `totalRating` / `evaluationResult` is accepted and discarded; 0–100 | **MATCH** (assumed sum, see §8; stricter server) |
| 12 | Comments (Prepared by) (R2) | `PREPARED_BY_CMNT` | textarea · read-only on create, **required on edit save** | textarea "Comments" · optional on draft save · **required on submit** (`validateForSubmit` / `submitProblems`, ready, not wired) | **DIFFERENT** (stage: submit instead of edit save, by owner decision) |
| 13 | Suggestion (Approved by) (R2) | `APPROVED_BY_CMNT` | textarea · read-only on create, **required on edit save**; used by approvers during the workflow | textarea "Suggestion" · optional on draft save · **required on submit** (ready, not wired) · DRAFT only | **DIFFERENT** (stage; approver editing needs the workflow) |
| 14 | Evaluation Result (R2) | derived from `TOTAL_RATING` | Acceptable 71–100 / Not acceptable 0–70 on edit view, report, e-mail | Acceptable / Not acceptable on the ratings step, the review step, the ticket, the side card and the Records list (list value from the API's `evaluationResult`) | **MATCH** |
| 15 | Approved by: "HR SUPERVISOR" | derived from `REQUEST_STATUS` | shown when `APPROVED` | not shown (no workflow) | **MISSING IN NEW** |
| 16 | Request number | `HEADER_ID` | URL segment | "Evaluation no." = `HEADER_ID` | **MATCH** |
| 17 | Evaluation period (free text) | `EVALUATION_PERIOD` | input only in a commented-out block → always `-` | optional text, max 200 | **NEW ONLY** (optional ✔) |
| 18 | (hidden) Employee person ID | `EMP_ID` | no input → always `-` | filled from `PERSON_ID` · optional (made optional in R1) | **NEW ONLY** (optional ✔) |
| 19 | Created date (R2) | `CREATED_AT` | report "Date" column | ticket "Created" and Records "Created" column, `YYYY-MM-DD` | **MATCH** |

### 2.2 Lines (`XXZP.XXZP_PAF_PROBATION_LINES`)

| # | Label | DB column | Legacy | New | Class. |
|---|---|---|---|---|---|
| 20 | Evaluation criterion | `PARAM_NAME` | **predefined per form type** (`showDropInfo()`), not editable | free text typed by the user · required / required · max 500 | **DIFFERENT** (design in §9) |
| 21 | Criterion (Arabic) | `PARAMA_NAME_AR` | predefined, not editable | optional free text, max 500 | **DIFFERENT** (design in §9) |
| 22 | Points / Rating (R2) | `RATING_LINE` | select 1–5; **required on edit save**; blank → 0 | select 1–5 · optional on draft save · **required on submit** (ready, not wired) | **DIFFERENT** (stage, by owner decision) |
| 23 | Allocated points per criterion | — (display) | constant "5", total 100 | "Rating (1–5)", total `/100` | **MATCH** |
| 24 | Number of criteria | — | always **20 lines** | 1–20, user-defined | **DIFFERENT** (design in §9) |

### 2.3 Demo-only redesign fields (`probationModel.js`, contract, demo adapter; not on the live page)

| Field | Status | Class. |
|---|---|---|
| Recommendation (Confirm / Extend / End), Extend by, Justification, Evaluator signature | made optional in R1 | **NEW ONLY** |
| Employee signature; Key strengths / Areas for improvement / Training needs; evidence note per criterion | optional | **NEW ONLY** |
| Probation end date; allocated points per criterion and quick picks; rating scale bands | derived / demo data | **NEW ONLY** |

### 2.4 Counts

| Classification | Round 1 | Now (R2) | Rows now |
|---|---|---|---|
| MATCH | 8 | **11** | #4, 5, 7, 8, 9, 10, 11, 14, 16, 19, 23 |
| DIFFERENT | 11 | **10** | #1, 2, 3, 6, 12, 13, 20, 21, 22, 24 |
| MISSING IN NEW | 2 | **1** | #15 |
| NEW ONLY | 11 | **11** | #17, 18 + 9 demo-only |

Round 2 added row 19 (created date, now shown) and renumbered the line rows.

---

## 3. Dependency matrix

| # | Legacy dependency (source) | New (client / server) | Class. |
|---|---|---|---|
| D1 (R2) | Employee select → AJAX `getEmpDetails` fills employee number, job title, department, **joining date → `prf_date`**, person ID | fills number, job title, department, person ID **and the joining date** (`formDate` ← `startDate`, cleared while loading) | **MATCH** |
| D2 | Form type change → `showDropInfo()` renders that type's criteria (`prf-new.js`, **not in repo**) | form type has no effect on lines | **MISSING** (design in §9) |
| D3 (R3) | Rating change → total recalculated | page recomputes live (preview); the server computes `TOTAL_RATING` and the result from the ratings and ignores any client value | **MATCH** |
| D4 (R2) | Total → result band: ≤70 Not acceptable, ≥71 Acceptable | `formResult(lines)` on the page (shown once a criterion is rated); server `evaluationResult(total)` in list rows | **MATCH** |
| D5 | `REQUEST_STATUS = APPROVED` → "Approved by: HR SUPERVISOR" | — | **MISSING** (needs workflow) |
| D6 | Employee list = the user's reporting hierarchy | same query | **MATCH** |
| D7 (R2) | Employee list excludes employees with a non-rejected annual PAF this year (`XXZPI_HR_PAF_HEADER_TAB`) | `NOT EXISTS` on `XXZP.XXZPI_HR_PA_HEADER_TAB`, current year (`TO_CHAR(SYSDATE,'YYYY')`), status not `REJECTED` (case-insensitive) | **DIFFERENT table — pending HR confirmation.** R3 dictionary check: legacy really reads `XXZP.XXZPI_HR_PAF_HEADER_TAB`, a separate table (§10.1); code not changed yet |
| D8 | Prepared by = session user | from session on create | **MATCH** |
| D9 | Submit button only after first save; refused if `INPROCESS`/`APPROVED` | no Submit (workflow not started) | **MISSING** |
| D10 (R2) | Edit view: Comments, Suggestion and each rating `required` on save | required on **submit** (`validateForSubmit`, `submitProblems`), lenient on draft save | **DIFFERENT** (owner decision) |
| D11 | Cross-field date order | `toDate ≥ fromDate` client + server | **NEW ONLY** rule |
| D12 | Grade | integer ≥ 0 when entered | **NEW ONLY** rule |
| D13 | Years in company / in position computed, not displayed | returned, unused | **MATCH** |
| D14–D15 | "Already Rating Given" alert, rating-block resets, joining-date month parsing | — | N/A: dead code in legacy |
| D16 | Demo-only: recommendation suggestion, probation end, form-type reset | demo model only | **NEW ONLY** |

Counts now: MATCH 6 (D1, D3, D4, D6, D8, D13) · DIFFERENT 2 (D7 table, D10) · MISSING 3 (D2, D5,
D9) · NEW ONLY 3 · N/A 2. (Round 1: 4 · 3 · 4 · 3. Round 2 counted D7 as MATCH; the R3 dictionary
check shows legacy reads a different table.)

---

## 4. Flow comparison

| # | Step | Legacy | New | Class. |
|---|---|---|---|---|
| F1 | Open new form | any logged-in session | `HR.PROBATION_EVALUATIONS:VIEW` / `CREATE` | **DIFFERENT** (RBAC, intended) |
| F2 | First save | header `DRAFT` + exactly 20 lines | `POST` header + 1–20 lines, `DRAFT` | **DIFFERENT** (line count) |
| F3 | Edit / save again | at **any** status, by anyone with the URL; only ratings and comments persist | `PUT` only while `DRAFT`; record-level access; every field persists | **DIFFERENT** |
| F4 | Submit | e-mail to the preparer's direct manager, `XXPHP_WORKFLOW`, `INPROCESS` | none; submit rules ready (`validateForSubmit` / `submitProblems`) | **MISSING** |
| F5 | Approval step 1 (direct manager) | Approve / Reject / Forward / Reassign / Request Information | none | **MISSING** |
| F6 | Approval step 2 (final, `XX_PROBATION_WF`) | `APPROVED` / `REJECTED` | none | **MISSING** |
| F7 | Request information / forward / reassign | shared `Zmailer` | none | **MISSING** |
| F8 | Approver adds Suggestion during workflow | yes (no status check) | no (DRAFT only) | **MISSING** |
| F9 | Final status | `APPROVED` / `REJECTED` | only `DRAFT` is written | **MISSING** |
| F10 | Notifications | HTML e-mail at each step | none | **MISSING** |
| F11 (R2) | List / search | HR sees all, others their own; Emp. #, Name, Job Title, Department, Total, Evaluation, Status, Date, Pending At | same scoping; server paging/search/filters; Records: number, Employee, Emp. no., Job title (R3), Department, Form type, Total, Evaluation, Pending at (blank until the workflow exists), Status, Created. Status filter uses the stored uppercase values | **DIFFERENT** (pending-at blank until the workflow) |
| F12 | View a record | any header ID, no access check | record-level authorization | **DIFFERENT** (intended) |
| F13 | Print | link does nothing | browser print | **DIFFERENT** (new works) |
| F14 | Delete | not available | `DELETE` while `DRAFT` | **NEW ONLY** |
| F15 | New form | "Request Form" link | "New form" with unsaved-changes confirmation | **MATCH** |

Counts: MATCH 1 · DIFFERENT 6 · MISSING 7 · NEW ONLY 1 (unchanged; the workflow was not started by
instruction). The workflow is explicitly out of scope in `docs/specs/README_probation_evaluation_form.md` §11.

**Status values (R2).** Legacy writes exactly four `REQUEST_STATUS` values, all uppercase:
- `DRAFT`, on insert (`Probation_Model::add_form_data`).
- `INPROCESS`, `APPROVED` and `REJECTED`, all through `Probation_Model::updateRequestStatus`
  (called from `ProbationFlow`).

No other legacy code writes the column. The legacy report's colour check compares against
`Inprocess` / `Rejected`; that is a legacy display bug, not stored data. The new code now uses
`REQUEST_STATUSES = ['DRAFT','INPROCESS','APPROVED','REJECTED']` (validation and OpenAPI). The
probation spec doc is corrected to match.

---

## 5. Test results

All tests are mocked (fake repository / fake HTTP client / fake connection / page source). Tests
use no Oracle connection, no database writes, no browser, no screenshots. Executed on 2026-11-02.

**Round 3 results (current):**

| Command | Result |
|---|---|
| `server> node --import ./tests/setup.js --test tests/probation-legacy-parity.test.js` | **26 tests: 25 pass, 0 fail, 1 todo** |
| `server> npm test` · `npm run lint` · `npm run format:check` | 758 tests: 757 pass, 0 fail, 1 todo · clean · clean |
| `client> node --test tests/probationLegacyParity.test.mjs` | **24 tests: 22 pass, 0 fail, 2 todo** |
| `client> npm test` · `npm run lint` · `npm run build` | 397 tests: 395 pass, 0 fail, 2 todo · clean · built |

Round 3 test changes:
- Server todo → real: "derives TOTAL_RATING from the lines and ignores a total or result sent by the
  client" (create, update, schema strip, and a direct service call).
- Server, new: "returns the total and result computed from the stored ratings on read".
- Server, replaced: "stores a blank joining date as NULL" and "reads both NULL and the legacy blank
  2000-01-01 as a blank joining date" replace the round-2 sentinel test. "caps TOTAL_RATING at 100"
  is now computed from 20 × 5.
- Client: "the client sends no total or result", the preview total test, and Job Title in the list
  mapping and column test.

Remaining todos: server — approver Suggestion while `INPROCESS` (workflow); client — criteria by
form type, Submit / workflow.

**Round 2 results (history):**

| Command | Result |
|---|---|
| `server> node --import ./tests/setup.js --test tests/probation-legacy-parity.test.js` | **24 tests: 22 pass, 0 fail, 2 todo** |
| `server> npm test` (full suite, includes `probation-evaluations`, `hr-date-only`, `api-docs`) | 756 tests: 754 pass, 0 fail, 2 todo |
| `server> npm run lint` · `npm run format:check` | clean · clean |
| `client> node --test tests/probationLegacyParity.test.mjs` | **23 tests: 21 pass, 0 fail, 2 todo** |
| `client> npm test` (full suite; `ReportDialog` is shared) | 396 tests: 394 pass, 0 fail, 2 todo |
| `client> npm run lint` · `npm run build` · `node scripts/verify-production.mjs` | clean · built · "Release checks: PASS" |

Round 1 todos that became real tests in round 2:

| Was todo | Now |
|---|---|
| Server: FORM_DATE optional as joining date | pass, plus blank-date storage and `YYYY-MM-DD` SQL tests |
| Server: list filter by stored `REJECTED` | pass, all four statuses accepted; mixed-case values rejected |
| Client: result band shown on the page | pass (form, ticket, side card) + result computation tests |
| Client: joining date fills from the employee | pass (read-only field, autofill, cleared while loading, omitted when blank) |
| Client: Comments/Suggestion required on edit | replaced by the owner's rule: required on **submit**, lenient on draft (pass) |
| Client: report columns | pass (Emp. no., Department, Evaluation, Pending at, Created; API-only values) |

New tests in round 2:
- Server: employee-list exclusion SQL; list `evaluationResult` / `pendingAt`; `submitProblems`.
- Client: list mapping from the API (unknown result ignored); `validateForSubmit`; created date on the record.

**Remaining todos (4).** They fail as expected and do not fail the run:
- Server: the server derives the total even when the client sends one (M14).
- Server: an approver saves the Suggestion while `INPROCESS` (workflow).
- Client: criteria load by form type (§9).
- Client: Submit / workflow.

---

## 6. Missing items — status and proposals

Effort: XS < 2 h · S ≤ 1 day · M 2–4 days · L ≥ 1 week. Gates per `docs/FEATURE-DELIVERY-WORKFLOW.md`.

| ID | Item | Priority | Status | Notes / proposal |
|---|---|---|---|---|
| M1 | Predefined criteria per form type (D2, #20–21, #24) | **P1** | **Design only** (§9) | Blocked on `prf-new.js`; needs G1 for the table |
| M2 | Evaluation result (#14, D4) | P1 | **Done (R2)** | Form, side card, ticket, list |
| M3 | Joining date / FORM_DATE (#4, D1) | P1 | **Done (R2)** | Owner option A: legacy meaning, read-only |
| M4 | Submit + 2-step approval (F4–F9, D9) | P1/P3 | **Not started** (by instruction) | `POST /:id/submit`, `/approve`, `/reject`; statuses in `REQUEST_STATUS`; supervisor then `XX_PROBATION_WF` step 2; G2, G3, G4. Submit rules are ready to plug in |
| M5 | E-mail notifications (F10) | P2 | Not started | With M4; needs SMTP config and G2 |
| M6 | Approver Suggestion during workflow (#13, F8) | P2 | Not started | With M4 |
| M7 | Report columns (F11) | P2 | **Done (R2)** | Pending at is `null` from the API until M4; Job Title not added (not requested) |
| M8 | "Approved by: HR SUPERVISOR" (#15, D5) | P3 | Not started | With M4 |
| M9 | Employee list exclusion (D7) | P3 | **Done (R2) — pending HR confirmation; table differs (R3)** | Code uses `XXZPI_HR_PA_HEADER_TAB`; legacy reads `XXZP.XXZPI_HR_PAF_HEADER_TAB` (§10.1). Not changed, by instruction |
| M10 | Comments / Suggestion / ratings required (D10) | P3 | **Done (R2) as submit rules** | `validateForSubmit` (client), `submitProblems` (server); not wired until M4 |
| M11 | Always 20 lines (#24) | P3 | Falls out of M1 | — |
| M12 | Hard-coded SMTP credential in tracked docs | **P0** | **Done (R2)** | Redacted in commit "chore(security): redact legacy credentials from docs"; history not rewritten; rotation by the owner |
| M13 | Status filter `Rejected` vs stored `REJECTED` | P2 | **Done (R2)** | Validation, OpenAPI, spec doc |
| M14 | Server trusts a client-sent `totalRating` | P3 | **Done (R3)** | Server computes total and result from the ratings; client values stripped; the client no longer sends a total |
| M15 | Job Title in Records (F11) | P3 | **Done (R3)** | From the API's `jobTitle` |

### 6.1 Credential sweep (R2)

I searched all tracked files for SMTP, database, wallet and API-key credentials, private keys and
access tokens. Only values were inspected; none are reproduced here.

| File | Finding | Action |
|---|---|---|
| `docs/specs/README_probation_evaluation_form.md` | legacy SMTP mailbox + password | **[REDACTED]** |
| `docs/specs/README_orientation_training_form.md` | same legacy SMTP mailbox + password | **[REDACTED]** |
| `server/.env.example` | password / key variables | empty placeholders — no action |
| `server/tests/*.test.js`, `client/tests/*.mjs` | short fictional fixture values (e.g. lowercase "x-secret" style) | test fixtures, not credentials — no action |
| `server/src/config/index.js`, `server/src/database/oracle.js` | variable names / `process.env` reads | no values — no action |

The legacy folder `php-ci3-old-app/` is git-ignored and was not modified. Git history still contains
the old values; it was not rewritten, by instruction.

---

## 7. Changes made

### 7.1 Round 1 (new-only fields made optional)

| File | Change |
|---|---|
| `client/.../probation/ProbationPage.jsx` | Save no longer requires `EMP_ID` (new-only; legacy stores `-`). Fixes saving legacy-created records |
| `client/.../probation/probationModel.js`, `demo/demoClient.js`, `hrRecruitmentText.js` | Demo model: recommendation, extension, justification, evaluator signature optional |
| `client/tests/hrOnboarding.test.mjs`, new parity tests | Tests |

### 7.2 Round 2 (owner-approved)

| Item | Server | Client | Docs |
|---|---|---|---|
| 1 Credentials | — | — | Two spec docs redacted (separate commit) |
| 2 Status filter | `validation.js`: `REQUEST_STATUSES` uppercase | — | OpenAPI enum; spec doc |
| 3 Joining date | `formDate` optional. Every probation date bound with `TO_DATE(:x,'YYYY-MM-DD')` and selected with `TO_CHAR(…,'YYYY-MM-DD')`, including `CREATED_AT` (was `DD-Mon-YY`). A blank joining date is stored as the legacy 2000-01-01 and read back as `null` (`rules.js`) | Read-only "Joining date" filled from `employee-details`, not required. Ticket shows "Created". Blank joining date omitted from the payload | OpenAPI; spec; README |
| 4 Evaluation result | `evaluationResult(total)` in list rows | `probationRules.js`: `formResult`, shown on the ratings step, review step, ticket, side card; list column | OpenAPI; README |
| 5 List view | `pendingAt: null`, `employeeNumber`, `department` already returned | Records columns Emp. no., Department, Evaluation, Pending at, Created (`ReportDialog` gets an optional `dateColumn`; default unchanged for other forms) | — |
| 6 Submit rules | `submitProblems()` in `rules.js` (not wired) | `validateForSubmit()` in `probationRules.js` (not wired); labels "Comments" / "Suggestion" | — |
| 7 Employee list | `listEmployees` adds the annual-appraisal `NOT EXISTS` | — | Marked pending HR confirmation |
| 8 Criteria | — | — | Design in §9 |

Not done, by instruction: workflow (submit / approve / reject / notifications), criteria code.
No new dependency, no DDL, no database writes, no change in `php-ci3-old-app`.

---

## 8. Assumptions and open questions

**Assumptions**
1. `prf-new.js` (missing) sums the line ratings into `total` and renders the criteria for the
   selected type with 1–5 selects (20 lines × max 5 = 100).
2. Classification uses the effective required-ness (client or server).
3. The demo-only model holds "new requirements", so its extra fields count as NEW ONLY.
4. Legacy header inputs on the edit view look editable but are not persisted. Making them editable in
   DRAFT is treated as an intended improvement.
5. (R2, revised R3) The legacy blank date `'01-JAN-00'` was stored as 2000-01-01. `FORM_DATE` is
   nullable on TEST (`DATE`, `NULLABLE=Y`, no check constraints), so the new code stores **NULL**
   for a blank joining date. On read, NULL and 2000-01-01 are both blank, so an employee who really
   joined on 2000-01-01 would still show blank. Production nullability is assumed to match TEST
   (not verified).
6. (R2) Records created by the new form before this change hold a *form date* (default today) in
   FORM_DATE. They show it as the joining date until the employee is re-selected and saved.

**Open questions**
- Q1 Please supply `assets/prf-new.js` from production (M1, §9).
- Q3 Approval workflow (M4–M6): when, and coexisting with CI3 `XXPHP_WORKFLOW` or a new engine?
- Q4 **Pending HR confirmation:** should probation exclude employees who already have an annual
  appraisal this year? It is implemented as in legacy for now.
- Q6 Keep the new `toDate ≥ fromDate` and grade-integer rules?
- Q8 Keep or remove the unreachable demo-only redesign (recommendation, signatures, allocated points)?
- Q10 (R3, open) The dictionary shows two separate real tables (§10.1). Legacy probation excludes
  using `XXZPI_HR_PAF_HEADER_TAB`. The legacy *annual appraisal* form writes only
  `XXZPI_HR_PA_HEADER_TAB`, and no legacy code writes the `PAF` table. Which table should
  probation use: the legacy `PAF` table (parity), the `PA` table (where annual appraisals are
  actually written), or none (Q4)?
- Q12 (R3) One TEST record has the created date in `FORM_DATE` (§10.2). Correct it (a data change
  needing authorization), or leave it as TEST data?

Answered in round 2: Q2 (joining date), Q5 (required on submit), Q7 (redact), Q9 (branch).
Answered in round 3: Q11 (Job Title added).

---

## 9. Criteria per form type — design (no code)

**Goal.** Choosing a form type fills that type's criteria (English + Arabic, ordered) as legacy
`showDropInfo()` did. The evaluator only rates. Evaluation lines keep copying the text into
`XXZP_PAF_PROBATION_LINES.PARAM_NAME` / `PARAMA_NAME_AR`, as today. Past evaluations therefore never
change when the catalogue changes.

### 9.1 Oracle lookup table (proposed; DDL needs G1 approval)

`XXZP.XXZP_PAF_PROBATION_CRITERIA`

| Column | Type | Rule |
|---|---|---|
| `CRITERION_ID` | `NUMBER GENERATED ALWAYS AS IDENTITY` | primary key |
| `FORM_TYPE` | `VARCHAR2(50)` NOT NULL | `CHECK` in the five legacy codes (`Workers_Technicians`, `Trainee`, `Engineers_Staff`, `Department_Managers`, `Supervisors_and_Foremens`) |
| `SEQ_NO` | `NUMBER(3)` NOT NULL | `CHECK (SEQ_NO BETWEEN 1 AND 20)`: display order and line number |
| `PARAM_NAME` | `VARCHAR2(n)` NOT NULL | English text; `n` = the deployed length of `LINES.PARAM_NAME` (verify in the dictionary) |
| `PARAM_NAME_AR` | `VARCHAR2(n)` | Arabic text; `n` = deployed length of `LINES.PARAMA_NAME_AR` |
| `ACTIVE_FLAG` | `CHAR(1)` NOT NULL DEFAULT `'Y'` | `CHECK IN ('Y','N')` |
| `CREATED_AT`, `CREATED_BY`, `UPDATED_AT`, `UPDATED_BY` | `TIMESTAMP` (UTC) / user ID | audit, project UTC convention |

- Unique active order: a function-based unique index on
  `(FORM_TYPE, CASE WHEN ACTIVE_FLAG = 'Y' THEN SEQ_NO END)`. Inactive history may repeat a sequence.
- Alternative without DDL: rows in the existing `XX_DIGI_LOOKUP_VALUES`
  (`LOOKUP_TYPE = 'XX_PROBATION_CRITERIA_<FORM_TYPE>'`, `LOOKUP_CODE` = order,
  `MEANING` = English, `DESCRIPTION` = Arabic). This avoids DDL but still seeds rows (needs
  authorization), mixes concerns, has no active flag per row unless an existing column fits, and
  depends on `MEANING` / `DESCRIPTION` lengths. **The dedicated table is recommended.**

### 9.2 API

`GET /api/v1/hr/probation-evaluations/lookups/form-types/:formType/criteria`
- Permission `HR.PROBATION_EVALUATIONS:VIEW`. `formType` is validated with Joi against the five
  codes. `Cache-Control: no-store`, as the module does.
- `200`: `{ formType, criteria: [{ seqNo, param, paramAr }] }`, active rows ordered by `SEQ_NO`
  (LOW pool, bind variables).
- An empty list means the type has no catalogue yet; the page then keeps today's free-text entry.
- Create/update validation: when the type has active criteria, the lines must match them by
  `seqNo` + `param` (text is not taken from the client for catalogued types). Ratings stay 1–5 /
  blank on draft and are required on submit (`submitProblems`).
- OpenAPI + `api-docs.test.js` entry; Supertest tests with a fake repository.

**UI.** On a new record, choosing a form type loads its criteria into read-only rows (English, Arabic,
rating select). Changing the type after rating asks for confirmation before replacing the lines.
Saved records keep their stored lines.

### 9.3 Seed script (after `prf-new.js` is provided)

`server/scripts/seed-probation-criteria.js <path-to-prf-new.js> [--apply --confirm]`
- **Treat the file as untrusted data:** read it as text and never `eval`, `import` or `vm`-run it.
  Extract the per-type criteria by static parsing: locate the `showDropInfo()` branches per
  `dropSelect` value, then the English/Arabic cell texts or array literals. The exact parser is
  written once the file's shape is known.
- Validate: exactly the five form types, 1–20 rows each, non-empty English, lengths within the
  columns, no control characters. Any surprise aborts with a count-only message.
- **Dry run (default):** prints counts per type and writes a JSON preview (scratch location,
  not committed) for the owner to review. No database connection.
- **`--apply --confirm`:** only after G1 approval and explicit authorization for that run.
  `withTransaction` + `MERGE` on `(FORM_TYPE, SEQ_NO)` for active rows (idempotent re-runs).
  Logs counts only, never secrets.
- Tests: parser on a fictional fixture file; `MERGE` SQL shape with a fake connection.
- CI3 coexistence (G4): CI3 keeps rendering from `prf-new.js` until it is retired, so the two
  sources must stay in sync. The seed script is the one-way sync.

**Effort:** table + endpoint + UI M (2–4 days); seed script S–M once the file is available.
**Gates:** G1 (DDL, seed rows), G4 (CI3 coexistence).

---

## 10. Round 3 findings (read-only TEST checks and Git)

Method: a standalone Node script using the server's configured pool (alias `zpadwtest_low`).
- Every statement was a `SELECT` with bound values, inside `SET TRANSACTION READ ONLY`, followed by
  a rollback.
- Output was limited to owners, object types, nullability and counts.
- The script lived in a scratch location and is not committed.

### 10.1 Exclusion table

| Name | `ALL_TABLES` | `ALL_VIEWS` | `ALL_SYNONYMS` | `ALL_OBJECTS` | Rows (TEST) | Rule columns |
|---|---|---|---|---|---|---|
| `XXZPI_HR_PAF_HEADER_TAB` | owner `XXZP` | none | none | `TABLE`, `VALID` | 467 | `EMPLOYEE_NUMBER` (VARCHAR2), `YEAR` (NUMBER), `STATUS` (VARCHAR2) |
| `XXZPI_HR_PA_HEADER_TAB` | owner `XXZP` | none | none | `TABLE`, `VALID` | 624 | same three columns |

**Which one the legacy rule uses:** `XXZP.XXZPI_HR_PAF_HEADER_TAB`.
- Legacy `getEmp` / `getAllEmp` name it without a schema, and other legacy models name it as
  `XXZP.XXZPI_HR_PAF_HEADER_TAB`.
- No synonym exists, so the unqualified name can only resolve to the `XXZP` table. For the app's
  TEST user, both unqualified names resolve, since that user's current schema owns them.
- It is a real, separate table, not a stale name. However, the legacy annual appraisal form writes
  only to `XXZPI_HR_PA_HEADER_TAB`; no legacy code inserts into or updates the `PAF` table.

The new code currently uses `XXZPI_HR_PA_HEADER_TAB` and was **not changed**, by instruction.
Decision: Q10.

### 10.2 FORM_DATE nullability and contents

- `XXZP.XXZP_PAF_PROBATION_HEADER.FORM_DATE`: `DATE`, `NULLABLE = Y`, no check constraints.
  `FROM_DATE`, `TO_DATE` and `CREATED_AT` are also nullable.
- **Applied (R3):** a blank joining date is now stored as `NULL`. Reads treat `NULL` and the legacy
  `2000-01-01` as blank.

Counts on TEST (no values read out):

| Measure | Count |
|---|---|
| Probation headers | 5 |
| `FORM_DATE` is NULL | 0 |
| `FORM_DATE` = 2000-01-01 (legacy blank) | 0 |
| **`FORM_DATE` = the record's created date** (same day, also within ±1 day) | **1** |
| …of which differ from the employee's joining date | 1 |
| `FORM_DATE` equals the employee's joining date | 0 |
| Headers whose `EMP_NUMBER` has no current employee row | 5 |
| Headers changed by the new API (`UPDATED_AT`/`UPDATED_BY` set) | 0 |
| Headers whose stored `TOTAL_RATING` ≠ sum of their line ratings | 0 (2 headers have no lines) |

All five TEST headers point to employee numbers with no current `XX_DIGI_EMP_MASTER` row. A
joining date therefore cannot be compared for any of them. One record holds its created date
(Q12). No data was changed.

### 10.3 Local `main` commits not on `origin/main`

| Hash | Message | Author | Date | Files |
|---|---|---|---|---|
| `1448779` | `feat(hr-recruitment): identity IDs for requisitions, interviews and attachments` | Nauman Mirza | 2026-11-02 | 23 files (+748 / −283): requisition and interview-assessment repositories/services and fakes; `hr-identity-concurrency.test.js` (new) and `hr-identity-ids.test.js`; OpenAPI; HR recruitment README; `docs/testing/hrms-recruitment-audit.md`; DB migration docs under `docs/db/migrations/` (duplicate-cleanup scripts `00`–`04`, new interview-677 scripts `10`–`13`, identity-constraint migration and README) |
| `298d70a` | `it Merge branch 'main' of https://github.com/commonolivesofts-create/zamil-revamp` | Nauman Mirza | 2026-11-02 | Merge of `origin/main` (`cfb24a6`, #45) into local `1448779`. Clean merge, no own changes (combined diff empty). Against `origin`'s side it brings exactly `1448779`'s 23 files |

Notes:
- The merge message starts with a stray `it`.
- `origin/main` has since moved to `d9fe99e` (#46, English salary certificate), so local `main` is
  2 ahead and 1 behind.
- This branch is based on local `main`, so a PR from it would include `1448779` and the merge.
- Nothing was pushed.
