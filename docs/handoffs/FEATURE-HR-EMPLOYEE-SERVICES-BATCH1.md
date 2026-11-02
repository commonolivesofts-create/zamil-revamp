# Feature handoff — HR employee services batch 1: Reward Nomination (1113), Share an Idea (1097), Sick Leave (1076)

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Employee Reward Nomination (form 1113, "Employee of the Month"), Share an Idea (form 1097) and Sick Leave Request (form 1076), each with a server-paged report; the HR sidebar sub-groups with a flyout |
| Business purpose | Nominate an employee for recognition, propose an improvement with its feasibility, and request sick leave with the medical certificate |
| Business owner | Project owner (HR forms) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | **Partially implemented.** The three forms run on their existing backends (create, read, update and list). Submit/approval, some audit rules and every prototype-only field wait for your approval (§13). |
| Replaces CI3 feature | `Emp_mon` (1113), `IDEA` (1097), `sickleave` (1076) |
| Source reference | Prototype `nauman.zip` (unpacked outside the repository, not committed; UI and new rules only); legacy `php-ci3-old-app/…/pmform_codebase`; spec `docs/specs/README_employee_of_the_month_form.md` |

**Owner decisions in this task (2026-11-02):**
- Sidebar: build the sub-group flyout. HR is now split into Recruitment, Employee services and Reports.
- Prototype fields with no column or API are left out of the forms and listed as gaps (§12.2).
- Edit guard: DRAFT and REJECTED are editable, INPROCESS and APPROVED are read-only. The employee-of-the-month reset from APPROVED back to DRAFT is removed.

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/hr-employee-services-batch1` (from `origin/main` at `59645ce`) |
| Commit(s) | See `git log origin/main..feat/hr-employee-services-batch1` (backend fixes; sidebar sub-groups; the three forms; tests; documentation) |
| Pull Request | Not opened (not pushed, as instructed) |
| Merged into `main` | Not yet |

## 3. Inventory (Step 0)

| Form | Prototype files | Existing backend (before this branch) | Existing frontend | Oracle objects |
|---|---|---|---|---|
| Reward Nomination 1113 | `forms/reward/RewardForm.jsx`, `rewardData.js`, `styles/reward.css` | `server/src/modules/hr/employee-of-the-month/*` at `/api/v1/hr/employee-of-the-month`: list, get, create, update, delete, lookups (employees, requestor, criteria). Uses `HR.EMPLOYEE_OF_THE_MONTH`. HR check through the `XXZP_HR` lookup. | None | `XXZP.XX_EMP_RATING_EOM_HEADER`, `XXZP.XX_EMP_RATING_EOM_LINES`, `XX_DIGI_EMP_MASTER`, `XX_DIGI_LOOKUP_VALUES` (`XXZP_HR`), `XX_ZRV_USERS` |
| Share an Idea 1097 | `forms/idea/IdeaForm.jsx`, `ideaData.js`, `styles/idea.css` | `server/src/modules/hr/ideas/idea form *.js` at `/api/v1/ideas`: list, get, create, update, feasibility, lookups (employees, divisions, categories). Delete and attachments always return 409. **No permission check.** HR check through `XXZP_HR`. | None | `XXZP.XXZP_IDEA`, `XXZP.XXZP_ALL_ATTACHMENTS` (`FORM_NAME='IDEA'`, read only), `XX_DIGI_EMP_MASTER`, `XX_DIGI_LOOKUP_VALUES`, `XXPHP_WORKFLOW` (pending-at, read) |
| Sick Leave 1076 | `forms/sickleave/SickLeaveForm.jsx`, `sickData.js`, `styles/sickleave.css` | `server/src/modules/hr/sick-leave/*` at `/api/v1/hr/sick-leave`: list, get, create (multipart), update, delete, attachments upload/delete, lookups (employees). Resource came from `SICK_LEAVE_RESOURCE_KEY` (otherwise 503). The leave type had to exist under `SICK_LEAVE_LOOKUP_TYPE` (otherwise 503). | None | `XXZP.XXZP_SICK_LEAVE`, `XXZP.XXZP_ALL_ATTACHMENTS` (`FORM_NAME='SICKLEAVE'`), `XX_DIGI_EMP_MASTER`, `XX_ZRV_USERS`; files on disk storage |

Legacy: `controllers/Emp_mon.php`, `IDEA.php`, `sickleave.php` (+ the `*flow` workflow controllers, which are out of scope); models `Emp_mon_model.php`, `idea_model.php`, `Leave_model.php`; views `Emp_mon/*`, `idea/*`, `sickleave/*`.

## 4. Field mapping (Step 1)

Legend: **L** = legacy field, **P** = prototype only, **B** = backend only.

### 4.1 Reward Nomination 1113 (`XX_EMP_RATING_EOM_HEADER` / `_LINES`)

| Screen field | API field | Oracle column | Source | Rule (client + server) |
|---|---|---|---|---|
| Department (Production / Shared Services) | `department` (`production`, `shared-services`) | `DEPT_TYPE` (`Production`, `Shared-services`) | L | Required; cannot change after saving |
| Employee (search by number, name or email) | `employee.number/name/email/position/departmentName` | `EMPLOYEE_NUMBER/NAME/EMAIL/POSITION/DEPARTMENT` | L | Required. The server re-reads the master and rejects a mismatch. Self-nomination is blocked. The email, position and department must be present. |
| Effective date | `activityDate` | `ACTIVITY_DATE` | L | Required, YYYY-MM-DD, defaults to today |
| Criterion rating (4 or 6 lines) | `lines[n].rating` (A, AS, BS, CS) | `_LINES.RATING` | L | Required per line. **Legacy scale replaces the prototype's 1–5 stars.** |
| Criterion evidence | `lines[n].remark` | `_LINES.REMARK` | L | Required, ≤ 500 |
| Overall feedback | `overallRating` (A, AS, BS, CS) | `OVERALL_RATING` | L | Required. **Legacy scale replaces the prototype's four feedback options.** |
| Remark | `remark` | `REMARK` | L | Required; ≤ 500 assumed (column length unverified) |
| Request no., status, created, requestor | server | `REQUEST_NO` (`PROD-`/`SS-` + id), `STATUS`, `CREATED_AT`, `CREATED_BY(_EMP_NUM)` | L | Server-owned |
| One nomination per employee per month | — | — | P | Client check against the user's visible nominations only; the server does not enforce it (§13) |
| Headline achievement, supporting files, average score | — | none | P | **Not shown** (no column, no attachments in this module; the scale is not numeric) |

### 4.2 Share an Idea 1097 (`XXZP_IDEA`)

| Screen field | API field | Oracle column | Source | Rule |
|---|---|---|---|---|
| EMP # | `empNo` | `EMP_NO` | L | Required. Any active employee (legacy). The server fills `EMP_NAME` and `DEPARTMENT`. |
| Division | `division` (BU id) | `DIVISION` | L | Required; from `/lookups/divisions`; suggested from the employee |
| Investment category | `investmentCategory` | `INV_CATEGORY` | L | Required; from `/lookups/categories` (9 values) |
| Project type | `projectType` | `CATERGORY` | L | Required; from `/lookups/categories` (4 values) |
| Idea title | `title` | `TITLE` | L | Required, ≤ 200 (backend). The prototype's 120 is not used. |
| Your idea | `idea` | `IDEA` | L (rule P) | Client: at least 40 characters (prototype rule), ≤ 4000 assumed. Server: optional (legacy). |
| Investment needed | `hasInvestment` (yes/no) | `VALUE` | L | Required; "yes" needs an amount > 0 (client and server) |
| Estimated investment | `investmentValue` | `AMOUNT` | L | Number ≥ 0 with ≤ 2 decimals; 0 when "no" |
| Saving value (SAR/year) | `saving` | `SAVING` | L | Optional (legacy). The prototype's "saving or a benefit" rule is not kept because benefits have no column. |
| Depreciation, IRR, NPV, ROI | server | `DEP_VAL`, `ATTRIBUTE1`, `NPV_VAL`, `ROI_VAL` | L | **Server-computed on every save**; shown after saving |
| Idea no., status, created | server | `ID_NO`, `STATUS`, `CREATION_DATE` | L | Server-owned |
| Attachments | read only | `XXZP_ALL_ATTACHMENTS` (`IDEA`) | L | Existing files are listed by name. Upload returns 409 in the backend (§13). |
| Problem today, benefits, effort, area/line, co-contributors, payback, similar-ideas check | — | none | P | **Not shown** (no column or API) |

### 4.3 Sick Leave 1076 (`XXZP_SICK_LEAVE`)

| Screen field | API field | Oracle column | Source | Rule |
|---|---|---|---|---|
| Employee # | `empNumber` | `EMP_ID` (+ `EMP_NAME` by server) | L | Required; self or a direct report (legacy rule, enforced by the server) |
| Leave type | `leaveType` | `LEAVE_TYPE` | L | Fixed "Sick Leave" (legacy) |
| From / To date | `fromDate`, `toDate` | `FROM_DATE`, `TOO_DATE` | L | Required, YYYY-MM-DD; To ≥ From (client and server) |
| First / last day type | `fromDayType`, `toDayType` (FULL/HALF) | `FROM_DAY_TYPE`, `TO_DAY_TYPE` | **B** | Required by the backend; default Full; on one date both must match |
| No. of days | server | `LEAVE_DAYS` | L | Server-computed (calendar days inclusive, a half day counts 0.5); preview shown |
| Comments | `comments` | `COMMENTS` | L | Required, ≤ 2000 (legacy and backend; the prototype's optional ≤ 500 is not used) |
| Attachments (medical certificate) | multipart `files` | `XXZP_ALL_ATTACHMENTS` (`SICKLEAVE`) + disk | L | ≥ 1 on a new request (legacy); backend file types; ≤ 10 MB; ≤ 10 per upload; add and remove while editable |
| Working days, back-to-work date, mini calendar | — | — | P | Display only (Friday and Saturday off) |
| Up to 30 days back | — | — | P | Client-only rule on new requests |
| No overlap with other requests | — | — | P | Client check against the employee's visible requests |
| Reason, work-related, clinic, certificate no./date, covering colleague, contact number, balance and pay bands, entitlement | — | none | P | **Not shown** (no column or API) |

## 5. Files

| New / Modified | Path | Purpose |
|---|---|---|
| Modified | `server/src/modules/hr/ideas/idea form routes .js`, `server/src/routes/api.routes.js` | `HR.IDEAS` permission on every ideas route |
| Modified | `server/src/modules/hr/sick-leave/sickLeave.routes.js`, `.validation.js`, `.service.js`, `.repository.js` | Fixed resource `HR.SICK_LEAVE` (was the env key or 503); fixed leave type "Sick Leave" (the env lookup is removed); camelCase attachments with YYYY-MM-DD |
| Modified | `server/src/modules/hr/employee-of-the-month/employeeOfTheMonth.service.js`, `.controller.js` | DRAFT/REJECTED edit guard, no APPROVED→DRAFT reset; standard paginated list envelope |
| Modified | `server/docs/openapi/openapi.yaml` | Matches the above |
| New | `server/tests/hr-employee-services-batch1.test.js` | 14 mocked tests |
| Modified (G3, owner-approved) | `client/src/config/registry/navigationGroups.js`, `defineModule.js`, `client/src/components/layout/Sidebar.jsx`; New `SidebarFlyout.jsx`; `client/src/styles/workspace.css` | Sub-groups and flyout |
| Modified | `client/src/config/registry/modules/{hrForms,requisitions,interviewAssessments,employmentOffers,hrEmployeeServices}.module.js` | `subgroup` on every HR entry; resources `SICK_LEAVE`, `EMPLOYEE_OF_THE_MONTH`, `IDEAS` |
| Modified (shared fix) | `client/src/features/hr-recruitment/shared/components/RecruitmentInputs.jsx` | `FileDrop` takes an optional `text` (it said "uploaded with the requisition"); the default is unchanged |
| New | `client/src/features/hr-employee-services/{reward,idea,sickLeave}/*`, `shared/{formRecords.js,ServerRecordList.jsx,FormParts.jsx}`, `demo/{formsDemoKit,rewardDemoClient,ideaDemoClient,sickLeaveDemoClient}.js`, `employeeServicesFormsConfig.js` | The three forms, reports, contracts, services, demo adapters |
| Modified | `client/src/features/hr-employee-services/employeeServicesPaths.js`, `README.md`; `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx`; `client/.env.example` | Paths, docs, routes, demo switches |
| New | `client/src/styles/hr-employee-services-forms.css` | Prototype design on the app tokens |
| New / Modified | `client/tests/hrEmployeeServicesForms.test.mjs` (15 tests); pins in `registry`, `navigation`, `hrOnboarding`, `securityAdministration`, `productionReadiness` tests | Tests |

## 6. Frontend routes and navigation

| Route id | Path | Permission | MFA | In sidebar? |
|---|---|---|---|---|
| `hr-sick-leave` | `/hr/employee-services/sick-leave` | `HR.SICK_LEAVE:VIEW` | No | Yes (Employee services) |
| `hr-sick-leave-report` | `/hr/employee-services/sick-leave/report` | `HR.SICK_LEAVE:VIEW` | No | No (from the form) |
| `hr-sick-leave-record` | `/hr/employee-services/sick-leave/:leaveId` | `HR.SICK_LEAVE:VIEW` | No | No |
| `hr-reward` | `/hr/employee-services/reward-nomination` | `HR.EMPLOYEE_OF_THE_MONTH:VIEW` | No | Yes |
| `hr-reward-report` / `-record` | `…/report`, `…/:nominationId` | same | No | No |
| `hr-idea` | `/hr/employee-services/ideas` | `HR.IDEAS:VIEW` | No | Yes |
| `hr-idea-report` / `-record` | `…/report`, `…/:ideaId` | same | No | No |

**Sidebar.** Human resources → **Recruitment** (requisition, interview, offer, orientation, probation) · **Employee services** (personal status change and its report, transfer and its report, performance appraisal, sick leave, reward nomination, share an idea) · **Reports** (employee report, periodwise employees).
- Each sub-group is a button showing how many pages the user may open and, when it applies, the current page.
- The button opens a flyout beside the sidebar. On a phone the flyout is a sub-panel over the sidebar, with a Back button.
- Keyboard: Escape closes the flyout and returns focus to the button; the arrow keys move between pages.
- The flyout lives inside `#sidebar`, so the icon sidebar stays expanded while it is open.
- Active state: NavLink plus the sub-group's current page.
- An entry appears only when its switch is on **and** the user holds its `VIEW` permission. Empty sub-groups are hidden.
- Each link opens its own page (tested).

Buttons: Save draft needs `CREATE` (new) or `UPDATE` (saved). Adding or removing sick leave files on a saved request needs `HR.SICK_LEAVE:MANAGE_ATTACHMENTS`. New-record buttons in the reports need `CREATE`.

## 7. API endpoints and contracts

All endpoints existed already. Contract fixes on this branch:

| Endpoint | Change |
|---|---|
| `/api/v1/ideas/**` | Now requires `HR.IDEAS:VIEW` (reads), `CREATE`, `UPDATE` (update, feasibility), `DELETE`, `MANAGE_ATTACHMENTS`, plus CSRF on writes (already present) |
| `/api/v1/hr/sick-leave/**` | Resource is fixed to `HR.SICK_LEAVE`: 403 without the permission, instead of 503 when unconfigured. `leaveType` is optional, must be "Sick Leave" and is stored as "Sick Leave". `GET /:id` attachments are `{ attachmentId, fileName, attachedOn: 'YYYY-MM-DD' }` (were uppercase Oracle keys). |
| `PUT /api/v1/hr/employee-of-the-month/:id` | 409 unless DRAFT or REJECTED; the status is never changed by an update |
| `GET /api/v1/hr/employee-of-the-month` | Standard `pagination` + `meta.requestId` (was a custom `meta` that the shared client dropped) |

Not changed:
- The ideas and sick leave lists return `data: { items, page, pageSize, total }`, which the client reads as is.
- Those two APIs have no sort parameter, so their reports sort newest first and their columns are not sortable.
- The reward report sorts on the server.

## 8. Oracle database

| Item | Value |
|---|---|
| SQL changes (DDL/DML scripts) | **None.** No new SQL. One existing query was removed (the sick leave leave-type lookup). |
| Oracle access in this run | None (no reads, no writes) |
| Approval reference | §13 lists what needs G1/G4 approval |

## 9. Authentication, permissions and RBAC registration

| Item | Value |
|---|---|
| New permission codes (code registry) | `HR.SICK_LEAVE:{VIEW,CREATE,UPDATE,DELETE,MANAGE_ATTACHMENTS}` ("Sick Leave Form"); `HR.EMPLOYEE_OF_THE_MONTH:{VIEW,CREATE,UPDATE,DELETE}` ("Employee Reward Nomination Form"); `HR.IDEAS:{VIEW,CREATE,UPDATE,DELETE,MANAGE_ATTACHMENTS}` ("Idea Form") |
| Created in the catalogue | **Not yet.** The registration commands are below; they were not run. |
| Record-level rules | Owner or HR (`XXZP_HR` lookup) for reward and idea. Sick leave: the employee, the creator, or HR through `SICK_LEAVE_HR_RESOURCE_KEY` (fail-closed when unset). Same-department access is not implemented (§13). |

Registration (from `server/`, see `server/docs/RBAC-REGISTRATION.md`):

```bash
# 1. Read-only preview (Oracle TEST): lists MISSING rows and prints the fingerprint
npm run db:rbac-register -- --target=TEST
#    (if npm swallows --target: node --env-file-if-exists=.env ./scripts/rbac-register.js --target=TEST)

# 2. Apply — owner only, interactive, with the fingerprint printed by step 1. NOT run.
npm run db:rbac-register -- --target=TEST --apply --fingerprint=<fingerprint from step 1>
```

Expected new rows: 3 resources and 14 permissions.
- If `HR.EMPLOYEE_OF_THE_MONTH` already exists in Oracle under another name, the preview reports a **CONFLICT** and the registry name must be changed to match.
- After applying, grant the `VIEW` permissions (and the actions you want) to roles in Security Administration.
- Until then, every request from these screens returns 403 and the entries stay hidden.

## 10. Shared components reused

`RecruitmentShell` (compact, flow off), `RecruitmentLoader`, `useRecruitmentForm`, `EmployeePicker`, `HrField`, `ChoiceCards`, `FileDrop`, `Review`, `Ticket`, `Tilt`, `Orbit`, `NewFormDialog`, `ResourceState`, `Pagination`, `useResource`, `fieldProps`, the shared `apiClient` (JSON and multipart), the registry `enabledBy` switch, `usePermissions().can`.

## 11. Validation and test evidence

Baseline on `main` at `59645ce`: server 812 tests (811 pass, 1 documented legacy-difference todo); client 397 tests (395 pass, 2 todo).

| Check | Command | Result | Executed by, date |
|---|---|---|---|
| Backend lint, format, tests | `cd server; npm run check` | Exit 0; 826 tests, 825 pass, 0 fail (the same todo) | Claude Code, 2026-11-02 |
| Frontend lint | `cd client; npm run lint` | Clean | Claude Code, 2026-11-02 |
| Frontend tests | `cd client; npm test` | 412 tests, 410 pass, 0 fail, 2 todo | Claude Code, 2026-11-02 |
| Frontend build + release check | `npm run build; node scripts/verify-production.mjs` | Built (the existing >500 kB chunk warning); release checks PASS | Claude Code, 2026-11-02 |
| Browser / screenshots | — | **Not done** (as instructed) | |
| Oracle TEST | — | **Not done**; all tests are mocked (in-memory RBAC store, stub repositories, demo adapters) | |

## 12. Known limitations, assumptions and gaps

### 12.1 Assumptions
- Reward header remark ≤ 500 and idea text ≤ 4000: the column lengths were not verified.
- The section and rating texts come from the backend lookups. The legacy "Managemnet" typo is kept, as in the spec.
- The FPP division id: the backend lookup uses `…3618190`; legacy `getEmpDetails` also maps `…2689307`. The backend mapping is used.
- Sick leave writes require `FROM_DAY_TYPE`, `TO_DAY_TYPE`, a fractional `LEAVE_DAYS` and identity `HEADER_ID` columns. The backend checks them at run time and answers 503 when they are missing. They are **not in the legacy code** and were not verified on TEST in this run.

### 12.2 Prototype fields not built (no column or API)
- **Reward:** headline achievement, supporting files, 1–5 stars, feedback options, average score.
- **Idea:** problem today, benefits, effort, area/line, co-contributors, payback, similar-ideas check, file upload.
- **Sick leave:** reason, work-related (HSE route), hospital/clinic, certificate no./date, covering colleague, contact number, yearly balance and pay bands, existing non-sick leave on the calendar.

### 12.3 Backend fields not in the prototype
- Sick leave first/last day type (half days): added.
- Idea division as a BU id, and the server feasibility values: shown.
- Reward requestor: used for the self-nomination check.

## 13. Waiting for your approval (missing APIs and SQL) — not implemented

| # | Need | Proposed request → response | SQL / tables | Gate |
|---|---|---|---|---|
| 1 | **Submit** for each form (prototype "Submit"; legacy workflow) | `POST /hr/employee-of-the-month/:id/submit`, `POST /ideas/:id/submit`, `POST /hr/sick-leave/:id/submit` (CSRF, `UPDATE`) → the record with `status: 'INPROCESS'`; 409 unless DRAFT or REJECTED; 422 when incomplete | `UPDATE … SET STATUS='INPROCESS', UPDATED_BY/AT` where those columns exist, plus the approval route in `XXPHP_WORKFLOW` (spec: workflow is out of scope, so this needs a decision) | G1, G4 |
| 2 | **Same-department VIEW** access (audit rule) | No new endpoint. GET/PUT/DELETE by id also allowed when the user's `ORGANIZATION_ID` equals the record employee's and the user holds `VIEW` (as orientation/probation) | `SELECT` on `XX_DIGI_EMP_MASTER` (`ORGANIZATION_ID`) joined to each header's employee number | G2 |
| 3 | `UPDATED_BY` / `UPDATED_AT` on idea and sick leave updates | No API change | `XXZP_IDEA` and `XXZP_SICK_LEAVE` have no such columns (legacy). DDL `ADD (UPDATED_BY NUMBER, UPDATED_AT DATE)` | G1, G4 |
| 4 | One reward nomination per employee per month (server-side) | `POST`/`PUT` → 409 `DUPLICATE_MONTH` | `SELECT 1 FROM XX_EMP_RATING_EOM_HEADER WHERE EMPLOYEE_NUMBER=:n AND TRUNC(ACTIVITY_DATE,'MM')=TRUNC(:d,'MM') AND HEADER_ID<>:id AND UPPER(STATUS)<>'REJECTED'` (spec decision 1: no period column) | G1 |
| 5 | Reward employee search within the chosen section | `GET …/lookups/employees?department=production` | `XX_DIGI_DEPT_MAPPING.DEPARTMENT_MODULE` (spec §6.1); mapping unverified | G1 |
| 6 | Idea attachments (upload/delete) | `POST /ideas/:id/attachments` multipart → `{ attachments: [{ attachmentId, fileName }] }` (as sick leave) | `INSERT INTO XXZP_ALL_ATTACHMENTS … RETURNING HEADER_ID` with `FORM_NAME='IDEA'` (identity confirmed in audit §11.2) | G1 |
| 7 | Sick leave balance, entitlement and other leave | `GET /hr/sick-leave/lookups/balance/:empNumber?year` → `{ entitlement, used, bands: [{ label, days }] }` | Source table unknown (HR policy / Fusion absence data) | G1, G4 |
| 8 | Prototype-only fields (§12.2) | Added to the existing write bodies | New columns, e.g. on `XXZP_SICK_LEAVE`: `REASON`, `WORK_RELATED`, `CLINIC`, `CERT_NO`, `CERT_DATE`, `RELIEVER_EMP`, `CONTACT_PHONE`; on `XXZP_IDEA`: `PROBLEM`, `BENEFITS`, `EFFORT`, `AREA`, plus a co-contributors line table; on `XX_EMP_RATING_EOM_HEADER`: `HEADLINE` | G1, G4 |
| 9 | Sick leave day-type columns if missing on TEST | — | Verify `ALL_TAB_COLUMNS` read-only; otherwise DDL `FROM_DAY_TYPE`, `TO_DAY_TYPE` | G1 |
| 10 | Sick leave HR-wide view | — | Set `SICK_LEAVE_HR_RESOURCE_KEY` (e.g. a new `HR.SICK_LEAVE:VIEW_ALL`), or switch to the `XXZP_HR` lookup like the sibling modules | G2 |
| 11 | Idea delete | `DELETE /ideas/:id` still returns 409 | `XXZP_IDEA` has no deletion marker | G1 |

## 14. Flags to see the forms

`client/.env.local` (development):

```
VITE_FEATURE_HR_SICK_LEAVE=true
VITE_FEATURE_HR_REWARD_NOMINATION=true
VITE_FEATURE_HR_IDEAS=true
# Optional, development builds only: in-memory demo data instead of the API
VITE_HR_SICK_LEAVE_DEMO=true
VITE_HR_REWARD_NOMINATION_DEMO=true
VITE_HR_IDEAS_DEMO=true
```

Unset feature switches already show the pages in development builds. The user also needs the `VIEW` permissions (§9).

## 15. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Project owner |
| Review outcome | Pending |
