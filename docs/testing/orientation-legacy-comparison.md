# Orientation Training (New Hire Training, 1101) — Legacy CI3 vs New Form

Branch `test/orientation-legacy-parity` (from `origin/main`). Date 2026-11-02.

**Rule for this comparison (owner):** the CI3 application is the source of truth. The security rules
of `docs/SECURITY-ESSENTIALS.md` still apply (bind variables, CSRF, RBAC, record access,
server-computed values). Where CI3 itself is broken, the new form does what CI3 evidently intends,
and the deviation is listed in §7 for your decision.

**How it was checked**
- Oracle TEST, read only (`SET TRANSACTION READ ONLY`, rolled back). Only metadata, counts, null
  flags and value-format classes were printed: no names, employee numbers or salaries.
- Write statements were only **parsed** (`DBMS_SQL.PARSE`), never executed.
- `php-ci3-old-app` was not modified.

Classifications: **MATCH**, **DIFFERENT**, **MISSING IN NEW**, **NEW ONLY**. "Before" is
`origin/main`; "after" is this branch.

---

## 1. Files found

### 1.1 Legacy (`php-ci3-old-app/zamil_old_codebase/zpil_codebase/`)

The form lives in the main CI3 app, not in `pmform_codebase`.

| Kind | File | Status |
|---|---|---|
| Controller | `controllers/Newhiretrain.php` | **Current** methods: `form`, `newaddtrainee`, `index` (list), `submitWorkflow`, `pdf`. **Legacy edit view** methods, still reachable from the list: `addNewhiretrain`, `addtrainee`, `deleteRow` |
| Model | `models/Newhiretrain_model.php` | all SQL, string-concatenated |
| Workflow | `controllers/NHT_Flow.php` (`workflow`), shared `Zmailer`, `Workflow_model`, `Data_model` | |
| Views | `views/ZPIL/nht-new.php` (current form, inline JS), `views/ZPIL/nht_list.php` (report), `views/ZPIL/partials/__NHT_header.php`, `views/ZPIL/nhtpdf.php` (PDF), `views/update/newhiretrain.php` (legacy edit view) | |
| Dead | `views/ZPIL/nht.php`, `nhtplant.php`, `controllers/nht_old.php`, `nht_flow_old.php`, `models/Newhiretrain_model_old.php`, the commented-out second `submitWorkflow` / `workflow` | |
| Spec | `README_orientation_training_form.md` (also `docs/specs/`) | Wrong on several points (§9) |

**Referenced but missing from the folder:**
- `assets/images/ZPI.png` (navbar and list) and `assets/images/zamillogo.jpg` (PDF banner).
- `controllers/vendor/autoload.php` (mPDF, needed by `pdf()`).
- The Bootstrap Icons CSS (the views use `bi bi-trash-fill` but never load it).

There are no missing local JS files; all scripts are inline or loaded from CDNs.

**Credentials:** `Newhiretrain.php` and `NHT_Flow.php` hard-code an SMTP password (16 characters,
not reproduced here). No tracked file contains it. Rotate it.

### 1.2 New

| Kind | File |
|---|---|
| Page | `client/src/features/hr-recruitment/orientation/OrientationPage.jsx` |
| Rules | **new** `client/src/features/hr-recruitment/orientation/orientationLegacy.js` |
| Demo-only model | `orientation/orientationModel.js` (five-session design; used only by the demo adapter and contract) |
| Service | `client/src/features/hr-recruitment/hrRecruitmentService.js` (`createOrientationService`) |
| Text / CSS | `hrRecruitmentText.js` (`ORIENTATION_TEXT`), `client/src/styles/hr-recruitment.css` |
| Shared component | `shared/components/RecruitmentDialogs.jsx` (`ReportDialog`) |
| Backend | `server/src/modules/hr/orientation-trainings/orientationTraining.{routes,controller,service,repository,validation}.js`, **new** `orientationTraining.rules.js` |
| Tests | `server/tests/orientation-trainings.test.js`, `server/tests/helpers/orientationTrainingFakes.js`, `client/tests/hrOnboarding.test.mjs` (+ `hrRecruitmentAudit`, `hrSharedComponents`) |

---

## 2. Field matrix

Tables, by variant:
- **Shared Services** (flag Y): `XXZP_NEW_HIRETRAINING_SS_HDR_T` (headers) and
  `XXZP_NEW_HIRETRAIN_SS_LINE_T` (lines).
- **Production** (flag N): `XXZP_NEW_HIRETRAIN_PROD_HDR_T` and `XXZP_NEW_HIRETRA_PROD_LINES_T`.
- Registry: `XXZP_NHT_MASTER_FLAG`.

All IDs are identity columns. TEST holds 28 SS headers (130 lines) and 7 PROD headers (35 lines),
but the registry has only 7 rows, all PRODUCTION. Legacy shows the same fields for both variants; no
field depends on status or role, and legacy has no Arabic labels.

| # | Legacy label · column | Legacy behaviour | New after | Before | After |
|---|---|---|---|---|---|
| 1 | Ref # · `ATTRIBUTE5` | read only; `division/yy/%03d id` | same. Before, `LPAD(id, 3)` **cut** IDs above 999 (`1006` became `100`) | DIFFERENT | MATCH |
| 2 | From * · `ORIENTATION_DURATION_FROM` | date, `required` | required | MATCH | MATCH |
| 3 | Section · `DIVISION` (holds COST_CENTER) | read only, auto-fill | server fills it from the employee master | MATCH | MATCH |
| 4 | Status | display; list labels: Inprocess / Approved / Rejected / anything else Draft | same labels from the mixed-case stored values. Before, `INPROCESS`, `REJECTED` and `Rejected` were unknown and could not be filtered | DIFFERENT | MATCH |
| 5 | Name * · `EMPLOYEE_NUMBER` + `EMPLOYEE_NAME` | select. HR: every current employee; others: only themselves (`getEmpNum`) | same, also enforced on create/update/details (403). Before, an extra eligibility filter for everyone: **5 of 147** employees on TEST | DIFFERENT | MATCH |
| 6 | To * · `ORIENTATION_DURATION_TO` | read only; JS copies From into To, so **To = From** | To = From (server). Before: the latest line end date | DIFFERENT | MATCH |
| 7 | Division · `ATTRIBUTE4` (org ID) | read only; legacy list and edit view show IPP BU (`300000003618177`) / FPP BU | value stored as is; `divisionName` shown | MATCH | MATCH |
| 8 | Scheduled By · `ORIENTATION_SCHEDULE_BY` | signed-in user's name (`returnRec`, fallback "IT"); stored value on edit | server: actor name or "IT" on create, stored value on update. Before: taken from the body | DIFFERENT | MATCH |
| 9 | Type · `EMP_TYPE` | read only; WORKER_CATEGORY → Supervisor / Manager / Employee | server fills it | MATCH | MATCH |
| 10 | Start Date · `STARTING_DATE` | read only, JOINING_DATE | server fills it; blank stays NULL. Before: placeholder 2000-01-01 when blank | DIFFERENT | MATCH |
| 11 | Position · `EMP_POSITION` | read only, POSITION_NAME | server fills it | MATCH | MATCH |
| 12 | (hidden) · `ATTRIBUTE2` | PERSON_ID | server fills it | MATCH | MATCH |
| 13 | (hidden) flag · table pair | new requests go to PRODUCTION (the JS sets `employee.FLAG`, which is undefined) | PRODUCTION. Before, the variant SQL read `APPS.HR_ALL_ORGANIZATION_UNITS`, which **does not exist** (ORA-00942): **every create failed** | DIFFERENT | MATCH (B1) |
| 14 | Training · `DEPARTMENT` | fixed rows per employee type (Manager 7, Supervisor 7, Employee 5), read only, regenerated on employee change | same; any other type gives the Employee rows (the legacy CASE). Before: unknown type gave the unused "plant" list | MATCH | MATCH |
| 15 | Department Head · `DEPARTMENT_HEAD` | select (manager union), **optional** | optional. Before: required | DIFFERENT | MATCH |
| 16 | From / To Date · `FROM_DATE`, `TO_DATE` | optional dates | optional. Before: required and inside the header window | DIFFERENT | MATCH |
| 17 | Orientation Days · `ORIENTATION_DAYS` (V100) | computed `ceil(to − from)`: same day = 0 (TEST 47/47 rows) | same, server-computed. Before: inclusive (+1), and 0 blocked saving | DIFFERENT | MATCH |
| 18 | Time From / To · `TIME_FROM`, `TIME_TO` | `type=time step=1`, stored `HH:MM:SS` (TEST 72/72), optional | same. Before: required, `HH:MM` | DIFFERENT | MATCH |
| 19 | Orientation Time · `ORIENTATION_PERIOD` | computed `H.MM Hrs` (minutes: 1 h 30 = "1.30 Hrs") | same, server-computed. Before: decimal hours ("1.50 Hrs") | DIFFERENT | MATCH |
| 20 | Remark · `REMARKS` (V1000) | free text | max 1000. Before: max 2000, so a long remark would fail on the column | DIFFERENT | MATCH |
| 21 | Header delete | none in legacy | draft-only delete | NEW ONLY | NEW ONLY |
| 22 | Line delete | hidden on the current form | `DELETE /:id/lines/:lineId` (editable records) | NEW ONLY | NEW ONLY |
| 23 | Steps, timeline, side card | — | UI aids, no data | NEW ONLY | NEW ONLY |

| | MATCH | DIFFERENT | MISSING IN NEW | NEW ONLY |
|---|---|---|---|---|
| Before (23 rows) | 7 | 13 | 0 | 3 |
| After | 20 | 0 | 0 | 3 |

---

## 3. Dependency / script matrix

| # | Legacy behaviour | New after | Before | After |
|---|---|---|---|---|
| D1 | Employee change: fill Section, Division, Start Date, Position, Type, Person ID; regenerate the training rows of the type | same | MATCH | MATCH |
| D2 | From change copies into the read-only To | same | DIFFERENT | MATCH |
| D3 | Row date change → Orientation Days = `ceil(to − from)` | same | DIFFERENT | MATCH |
| D4 | Row time change → Orientation Time `H.MM Hrs` | same | DIFFERENT | MATCH |
| D5 | Save: only From is required (and an employee, or the SQL breaks); no row field is required | same; a row with To before From or Time To before Time From is **refused** (legacy saved "Select To Date" / "-2.-30 Hrs") | DIFFERENT | DIFFERENT (B4) |
| D6 | Every save writes Status = Draft, whatever the status (a Rejected request is corrected and re-submitted) | Draft and Rejected are editable and saved as Draft. **Inprocess and Approved are read only** (409); legacy reset them to Draft, which breaks their workflow | DIFFERENT | DIFFERENT (B3) |
| D7 | New requests are saved as PRODUCTION | same | DIFFERENT (create failed) | MATCH |
| D8 | A record opens as `form/{id}/{Y\|N}` | `GET /:id?flag=Y\|N`; without a flag: registry, then the table holding the ID. Before: registry, else PRODUCTION, so **0 of 28** SS records opened; now 27/28 without a flag and 28/28 with it | DIFFERENT | MATCH |
| D9 | Read-only header fields are posted by the browser | computed by the server from the employee master (same values; security rule) | MATCH | MATCH |
| D10 | Scheduled By = signed-in user (create), stored value (edit) | same | MATCH | MATCH |
| D11 | Submit button (status ∉ INPROCESS/Approved/Accepted) → `submitWorkflow` | `submitProblems` (server) and `validateOrientationForSubmit` (client); no button (workflow not built) | MISSING | MISSING (B2) |
| D12 | Status filter / labels over mixed-case values | case-insensitive, legacy labels | DIFFERENT | MATCH |
| D13 | PDF of the schedule (`pdf/{id}`) | print sheet in the legacy PDF layout (header block, Department / Head / Period / Time From / Time To / Remarks / Signatures, Scheduled by, HR Supervisor and Manager signatures with status). Before: printed only the open step | DIFFERENT | MATCH |
| D14 | Add / Delete row hidden on the current form | no add-row; rows fixed by type | MATCH | MATCH |

| | MATCH | DIFFERENT | MISSING | NEW ONLY |
|---|---|---|---|---|
| Before (14) | 4 | 9 | 1 | 0 |
| After | 11 | 2 | 1 | 0 |

---

## 4. Flow comparison

| Step | Legacy | New (after) | Class |
|---|---|---|---|
| Create | `Newhiretrain/form` (login only) | `HR.ORIENTATION_TRAININGS:CREATE`; HR any employee, others themselves | MATCH (+RBAC) |
| Save | `newaddtrainee` → Draft, `REQ_TYPE='new'`, Ref #, registry row | same, in one transaction, identity IDs | MATCH |
| Edit | any status; resets to Draft | Draft / Rejected; resets to Draft; Inprocess / Approved 409 | DIFFERENT (B3) |
| Submit | `submitWorkflow` | not built; validate-for-submit only | MISSING (B2) |
| Approve / reject | `NHT_Flow::workflow`, 2 steps | not built | MISSING (B2) |
| Final statuses | `INPROCESS`, `REJECTED` (step 1), `Rejected` (step 2), `Approved` | read as Inprocess / Rejected / Approved | MATCH |
| List | type select Shared / Plant (none = empty); HR all, others own; columns S.No, Emp No, Ref No, Division (IPP/FPP BU), Section, Emp Name, Orient From, Orient To, Start Date, Orient By, Status, Pending At, Start Date (workflow), End Date, Last Action; DataTables 20 rows, copy / CSV / Excel / PDF / print | Report dialog with Type (Shared / Plant), same columns, server paging; row opens `…/{id}?flag=` | MATCH, except export buttons (B5) |
| View | row click → legacy edit view | the form, in its variant | MATCH |
| Print | mPDF file | browser print of the legacy PDF layout | MATCH (B10) |
| Employee list | HR: every current employee; others: themselves | same | MATCH |
| HR recognition | `XXZP_HR` TAG = session user ID (master USER_ID) | fail-closed TAG = the one master USER_ID of the application user's employee number; TEST: 3 of 5 application users are HR | MATCH |
| Tables read | the four NHT tables, registry, `XX_DIGI_EMP_MASTER`, `XX_DIGI_LOOKUP_VALUES`, `XX_DIGI_JOB_MASTER`, `XXPHP_WORKFLOW`, routing rules | same minus routing rules (workflow); plus `XX_ZRV_USERS` | — |
| Tables written | NHT header / lines / registry, `XXPHP_WORKFLOW` | NHT header / lines / registry only | — |

---

## 5. What was changed

**Server** (`server/src/modules/hr/orientation-trainings/`)
1. **Create works again.** The variant lookup no longer queries the missing
   `APPS.HR_ALL_ORGANIZATION_UNITS`; new requests are PRODUCTION, as in legacy.
2. **Records open in their variant:** an optional `?flag=Y|N` on GET/PUT/DELETE/line DELETE, then
   the registry, then the table holding the ID.
3. **Server-filled header:** the employee fields come from the master; To = From; Scheduled By is
   the actor (or "IT") on create and kept on update; body values are ignored.
4. **Legacy row formulas:** days `to − from`, `H.MM Hrs`, `HH:MM:SS`; every row field is optional;
   remarks ≤ 1000; reversed ranges are refused.
5. **Status:** legacy labels in responses (`status`) plus the stored `rawStatus`; case-insensitive
   filter including Rejected; Draft and Rejected are editable and saved as Draft.
6. **Employee scope:** HR any current employee, others themselves (list, details, create, update).
7. **List:** `divisionName`, `pendingAt`, `workflowStart`, `workflowEnd`, `lastAction` (read-only
   XXPHP_WORKFLOW subqueries).
8. **Ref #** no longer cuts IDs above 999. Legacy blank dates (1970 / 2000-01-01) read as null.
9. **Training rows:** an unknown employee type gives the Employee rows.
10. `orientationTraining.rules.js`: the legacy formulas and `submitProblems`. OpenAPI updated.

**Client**
1. **Page:**
   - To = From;
   - optional row fields, time inputs with seconds, remark max 1000;
   - legacy days and Orientation Time on each row;
   - read only when Inprocess or Approved;
   - legacy status labels, with Rejected in red;
   - record loaded in its variant (`?flag=`).
2. **Report:** Type selector (Shared / Plant) and the legacy columns. This needed an optional
   `filters` slot on the shared `ReportDialog`, the only shared component changed; it is additive.
3. **Print sheet:** the legacy PDF layout. It uses the shell's `banner` slot, so the guard test now
   allows `banner` for this page only.
4. **Service:** sends only the answers and carries the variant on read, update and delete.
5. `orientationLegacy.js`: the legacy rules and `validateOrientationForSubmit`. README and texts
   updated.

---

## 6. Test results

| Run | Result |
|---|---|
| `server`: `npm test -- tests/orientation-trainings.test.js` | 17 pass, 0 fail, 2 todo |
| `server`: `npm test` (full) | 838 tests: 835 pass, 0 fail, 3 todo |
| `server`: `npm run lint`, `npm run format:check` | clean |
| `client`: `npm test` (full) | 416 tests: 413 pass, 0 fail, 3 todo |
| `client`: `npm run lint`, `npm run build`, `node scripts/verify-production.mjs` | clean, build OK, release checks PASS |
| Oracle TEST, read only | see below |

**Oracle TEST checks (read only):**
- 9/9 write statements parse.
- Records open through the service: SS 27/28 without a flag and 28/28 with it; PROD 7/7.
- List labels:
  - SS: Approved 18, Inprocess 5, Rejected 5;
  - PROD: Draft 6, Approved 1.
- Every status filter count matches the labels.
- Workflow columns are filled where XXPHP_WORKFLOW has data (SS: Pending At 4, Last Action 16, End Date 11).
- Employee list: HR 147, non-HR 1.
- Variant lookup returns N; managers 5.

**Not done:** no browser run; no Oracle writes. Insert/update were only parsed.

**Todo (blocked):** the submit route and the 2-step approve/reject with e-mails (server), and the
Submit button (client).

---

## 7. Items needing your decision

| # | Item | Proposal |
|---|---|---|
| B1 | **Variant of new requests.** Legacy means to save Shared Services employees in the SS tables, but its JS bug sends every request to PRODUCTION. The marker it once read (`XX_DIGI_ORG_INFO.ATTRIBUTE1` = 'SHARED SERVICE') does not exist on TEST. New requests are PRODUCTION, as legacy actually does. | Keep, or give a source for "shared service" (e.g. a lookup of organization IDs) and the server will route by it |
| B2 | **Workflow** (submit, 2 approval steps, e-mails, delegation, FYI to department heads) | Build on the shared workflow; §8 has the legacy behaviour; `submitProblems` / `validateOrientationForSubmit` are ready |
| B3 | **Editing Inprocess / Approved requests.** Legacy allows it and resets them to Draft, which breaks their workflow. They are read only here. | Keep read only |
| B4 | **Reversed rows refused.** Legacy saved "Select To Date" as days and "-2.-30 Hrs" as time. | Keep refusing |
| B5 | **Export buttons** (copy, CSV, Excel, PDF on the legacy list) are not in the report dialog | Add CSV export to the shared report dialog (no new dependency); Excel/PDF would need one |
| B6 | **ID overlap (G4).** SS and PROD headers number independently; the registry and XXPHP_WORKFLOW (USER_KEY) cannot tell them apart. Legacy wrote registry IDs as MAX+1, so one SS record's ID is registered as PRODUCTION. CI3 MAX+1 writers can also collide with identity values. | Always open records with `?flag=` (done); CI3 to stop MAX+1 or be retired; key the workflow by variant when it is built |
| B7 | **CREATED_BY identity (G4).** Legacy stored its session user ID, the new app stores the application user ID, so non-HR users see none of their legacy requests (TEST: 0) | As in `docs/testing/hr-identity-mapping.md` §4 |
| B8 | **PDF.** Legacy produced a print-protected mPDF file; the new page prints the same layout through the browser (save as PDF) | Confirm |

No new column, table or DDL was needed.

---

## 8. Legacy workflow (for the shared workflow design)

Read from `controllers/Newhiretrain.php` `submitWorkflow` and `controllers/NHT_Flow.php` `workflow`.

**Submit**
- **Guard:** refused when the status is `APPROVED`, `Approved`, `Accepted`, `Inprocess` or
  `INPROCESS` ("Request is X. Cannot Re-initialize Workflow"). Draft, `REJECTED` and `Rejected` may
  be (re)submitted. No field is checked.
- **Requestor:** the creator's profile.
- **Step-1 approver:** the creator's direct manager (master row whose PERSON_ID is the creator's
  SUPERVISOR_ID). Fallback: one hard-coded senior manager.
- **Delegation:** `WF_DIGI_ROUTING_RULES` (`STATUS='active'`, `END_DATE >= sysdate`,
  `FORM_CODE='1234'`).
- **IDs:** notification and group IDs are MAX+1.
- **Mail:** "New Hire Training Form Workflow Notification - For {requestor}". It holds the request
  summary and Form / Approve / Reject / Forward / Reassign / Request Information links (generic
  `Zmailer`).
- **Only if the mail is sent:**
  - an `XXPHP_WORKFLOW` row: MSG_TYPE `NHTF`, LOOKUP_NAME `XX_NHT_WF_REC`, 2 steps, step 1, path
    `index.php/NHT_Flow/workflow`;
  - header `STATUS='INPROCESS'`.

**Action** (`POST NHT_Flow/workflow`, JSON `header_id, gid, nid, action 1/0, workflow_comment`)
- **Guards:** the notification must be Open; an open RFI blocks the action.
- **From user:** the `XX_NHT_WF_REC` lookup person of the current step (the forwarded user when
  forwarded).
- **Step 1:**
  - Approve: mail the step-2 approver (lookup code 2, delegation applied); close the notification
    as Approved; add the step-2 row. The header stays INPROCESS.
  - Reject: mail the requester; close the notification as Reject; header `REJECTED`.
- **Step 2:**
  - Approve: mail the requester, CC "FYI" to the e-mails of the rows' department heads; add a
    closing row; header `Approved`. Bug: the step-2 notification itself stays Open.
  - Reject: header `Rejected`.
- No header column is stamped per step; only STATUS changes.
- **TEST:** 75 NHTF notifications (8 Open).

---

## 9. Assumptions and open questions

1. Form 1101 = legacy `Newhiretrain` / NHTF, matched by name and by the shared tables.
2. `README_orientation_training_form.md` is wrong where the code differs:
   - IDs come from identity columns;
   - ORIENTATION_DAYS holds text;
   - rows are generated by employee type;
   - every new request goes to PRODUCTION;
   - there is no header delete.

   The code and the TEST data were followed instead.
3. Same department = same current `ORGANIZATION_ID` (as Probation). Record access applies on top of
   legacy, which had none on save, PDF or delete.
4. On TEST, 38 lines carry the legacy blank date (01-Jan-70 or 2000-01-01) and read as empty; 97 lines have no From Date.
5. `orientationModel.js` (five fixed sessions, "Plan it for me") belongs to the demo adapter and was
   left unchanged.
