# HR recruitment: forms 1060, 1061, 1062, 1101, 1064 and the HR reports

Five forms make up the recruitment flow (the step bar under **Human resources**):

1. Personnel Requisition (1060)
2. Interview Assessment (1061)
3. Employment Offer (1062)
4. Orientation Training (1101)
5. Probation Evaluation (1064)

**Every form uses the real backend through the shared authenticated `apiClient`, in every
environment.** No form reads demo data. The backend authorizes every request and the
frontend only hides controls. Audit findings and open items are in
[`docs/testing/hrms-recruitment-audit.md`](../../../../docs/testing/hrms-recruitment-audit.md).

| Form | Route (record route) | API base (`/api/v1`) | Permission resource | Visibility switch |
|---|---|---|---|---|
| Personnel Requisition (1060) | `/hr/recruitment/requisition` (`/:requisitionId`) | `/hr/requisitions` | `REQUISITIONS.REQUISITIONS` | always |
| Interview Assessment (1061) | `/hr/recruitment/interview` (`/:assessmentId`) | `/hr/interview-assessments` | `INTERVIEW_ASSESSMENTS.INTERVIEW_ASSESSMENTS` | always |
| Employment Offer (1062) | `/hr/recruitment/offer` (`/:offerId`) | `/hr/employment-offers` | `EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS` | always |
| Orientation Training (1101) | `/hr/recruitment/orientation` (`/:scheduleId`) | `/hr/orientation-trainings` | `HR.ORIENTATION_TRAININGS` | `VITE_FEATURE_HR_RECRUITMENT` |
| Probation Evaluation (1064) | `/hr/recruitment/probation-evaluation` (`/:evaluationId`) | `/hr/probation-evaluations` | `HR.PROBATION_EVALUATIONS` | `VITE_FEATURE_HR_RECRUITMENT` |
| Employee report (contractor employees) | `/hr/reports/contractor-employees` | `/hr/contractor-employees` | `HR.CONTRACTOR_EMPLOYEES` | `VITE_FEATURE_HR_RECRUITMENT` |
| Periodwise Employees report | `/hr/reports/periodwise-employees` | `/hr/reports/periodwise-employees` | `HR.PERIODWISE_EMPLOYEES` (VIEW only) | `VITE_FEATURE_HR_RECRUITMENT` |

**Registry:**
- The routes are registered in `config/registry/modules/requisitions.module.js`, `interviewAssessments.module.js`, `employmentOffers.module.js` and `hrForms.module.js` (module `HR`).
- The router table is `app/router.jsx`.
- Each record route is hidden from the sidebar and shares its form's permission.

**Code layout:**
- Services and response mappers: `hrRecruitmentService.js`.
- Strict response readers: `hrRecruitmentContract.js`.
- Visible text: `hrRecruitmentText.js`.
- Frontend action keys: `hrRecruitmentActions.js`.
- Per-form pages and models: `requisition/`, `interview/`, `offer/`, `orientation/`, `probation/`.
- Shared shell, loader, inputs and dialogs: `shared/`.

## Endpoints used per form

All list endpoints take `page` and `pageSize` and return the standard envelope with
`pagination{page,limit,total,totalPages,hasNextPage}`. Writes need the session's
`X-CSRF-Token`, which the shared client sends.

### Personnel Requisition (1060)

**Lookups** (`GET /hr/requisitions/lookups/…`):
- `job-titles`, `departments`, `requestor` and `replacement-for`.
- `budget?fullName=`: the replacement's salary (the page trims the name).
- `capabilities`: returns `{ canManageTicket }`. The ticket-status selector is shown only when this is true. The backend refuses ticket changes from non-HR users with 400, using the same `XXZP_HR` check.

**Records:**
- `GET /` (list) and `GET /:id`.
- `POST /` and `PUT /:id`: JSON, or multipart with `files` parts when uploading.
- `DELETE /:id`: Draft only.
- `DELETE /:id/attachments/:attachmentId`.

**Field mapping:**

| Frontend value | Backend field / value |
|---|---|
| Job title, department | `jobId`/`jobName`, `deptId`/`deptName` |
| Needed date | `dateNeeded` (`YYYY-MM-DD`) |
| Replacement / addition | `reasonOfReq`: `Replacement` / `Addition`; `replacementFor` / `reason` |
| Budget and education answers | `Y` / `N` (`budgeted`, `highSchool`, `diploma`, `higherDiploma`, `degree`, `masterDegree`) |
| Experience | `gccExp`, `workExp`: `0 - 2`, `2 - 5`, `5 - 10`, `> 10` |
| Skills, other, remarks, package | `skills`, `other`, `remark`, `totalPackage` |

`requestDate` is sent only on create. The backend sets the requester, the number and the status (`Draft`, `Inprocess`, `Approved`, `Rejected`). There is no submit or approval action in the API, so the page saves drafts and treats `Inprocess` and `Approved` as read-only.

### Interview Assessment (1061)

**Lookups** (`GET /hr/interview-assessments/lookups/…`):
- `nationalities` and `requisitions` (approved only).
- `employees` (interviewers).
- `payroll-units`: `[{ code, name }]`, e.g. IPP and FPP. Business units are shown by name and sent as `attribute3`.

**Records:** `GET /`, `GET /:id`, `POST /`, `PUT /:id` and `DELETE /:id`.

**Payload notes:**
- The position (`positionName`) comes from the linked approved requisition, and the backend requires it.
- `managingDirector` and `hrRepresentative` are read and sent back unchanged.
- Ratings are 1–5 or `N/A`. Remarks are limited to 500 characters, as on the backend.
- The backend sets the status; the API has no submit or approval action.

### Employment Offer (1062)

**Lookups** (`GET /hr/employment-offers/lookups/…`):
- `candidates` (approved, passed interviews), `titles` and `business-units` (raw IDs, as specified).
- `allowances?type=` for `housing`, `transportation`, `annual-vacation`, `ticket`, `medical` and `contract-period`.
- `number-to-arabic?number=` and `hijri-date?date=`.

**Records:** `GET /`, `GET /:id`, `POST /`, `PUT /:id` and `DELETE /:id`.

The bilingual package rows map to the single `line` object. The status is always `Incomplete`: the API supports only create, read, update and delete.

### Orientation Training (1101)

**Lookups** (`GET /hr/orientation-trainings/lookups/…`):
- `employees` and `managers`.
- `employee-details?empNo=`, `flag?empNo=` (shared-service `Y` / production `N` table) and `skills?empType=` (the default sessions).

**Records:**
- `GET /?flag=Y|N` (list for one table) and `GET /:id`.
- `POST /` and `PUT /:id`: the update replaces all lines. Header, line and flag-registry IDs come from Oracle identity columns.
- `DELETE /:id`: Draft only.
- `DELETE /:id/lines/:lineId`: needs `MANAGE_LINES`.

**Payload notes:**
- `startDate` is sent only when the employee has a joining date.
- `orientationPeriod` is sent blank so the server recomputes the hours from the session times.

### Probation Evaluation (1064)

**Lookups** (`GET /hr/probation-evaluations/lookups/…`):
- `form-types` and `employees` (the caller's hierarchy).
- `requestor` and `employee-details?empName=`.

**Records:**
- `GET /` and `GET /:id`.
- `POST /` and `PUT /:id`: Draft only. The update records `UPDATED_BY` and `UPDATED_AT`. Header and line IDs come from Oracle identity columns.
- `DELETE /:id`: Draft only.

An unrated criterion is omitted from the payload, and the backend stores it as 0. A stored 0 is shown as "Not rated".

## Record access and status rules (backend)

**Orientation and probation records by ID** (`GET`/`PUT`/`DELETE /:id`, and orientation's line delete) are open only to:
- the creator;
- an HR user (the `XXZP_HR` lookup, which also widens the lists); or
- a user in the employee's department (`XX_DIGI_EMP_MASTER.ORGANIZATION_ID`) who holds the resource's `VIEW` permission.

Anyone else gets 403 `FORBIDDEN`. Changing a non-draft record returns 409 (`ORIENTATION_TRAINING_NOT_DRAFT` / `PROBATION_EVALUATION_NOT_DRAFT`).

**Requisitions:** records outside the caller's scope return 404. Non-HR users cannot change `Inprocess` or `Approved` records (409).

## Dates

Date-only values travel as `YYYY-MM-DD` strings in both directions. The backend selects Oracle `DATE` columns with `TO_CHAR(…, 'YYYY-MM-DD')`. It must not return them as JS `Date`s: a JS `Date` is serialised in UTC and appears a day early on servers east of UTC. Legacy `DD-Mon-YY` values that some endpoints still return are converted by `legacyDate` in the service.

## Permissions in the frontend

Pages use `usePermissions().can(…)` with the keys in `hrRecruitmentActions.js` to show the save, delete and attachment controls. The backend re-checks every request.

The registry's module and resource names, descriptions (none) and display orders match the Oracle catalogue exactly; `hrRecruitmentAudit.test.mjs` pins them. Two registry entries are new: `HR.ORIENTATION_TRAININGS:MANAGE_LINES` and `HR.PERIODWISE_EMPLOYEES:VIEW`. Their Oracle rows are added by the owner with `npm run db:rbac-register -- --target=TEST --apply --fingerprint=…` from `server/`. The preview (without `--apply`) shows the plan; the steps are in the audit report §9.2.

## Switches

| Variable | Decides | `'true'` | `'false'` | unset |
|---|---|---|---|---|
| `VITE_FEATURE_HR_RECRUITMENT` | Whether the Orientation, Probation, Employee report and Periodwise report entries exist in this build (registry `enabledBy`) | shown | hidden | shown in development, hidden in production |
| `VITE_HR_RECRUITMENT_DEMO` | Data source of the Periodwise Employees report only (`onboardingClient`) | demo adapter | `apiClient` | demo in development, API in production |

The three recruitment forms (1060–1062) have no switch. The demo switch changes only the Periodwise report's data source; every form always uses the API. The demo default lives in `hrRecruitmentConfig.js`, because the repository ignores `.env.*` files other than `.env.example`. To override it locally, set the variable in your own `client/.env.local`.

## Periodwise Employees report

`/hr/reports/periodwise-employees` opens `report/PeriodwiseEmployeesPage.jsx`, and the contractor **Employee report** has its own path, `/hr/reports/contractor-employees`. Handoff: `docs/handoffs/FEATURE-PERIODWISE-EMPLOYEES-REPORT.md`.

**Endpoints** (`HR.PERIODWISE_EMPLOYEES:VIEW`):
- `GET /hr/reports/periodwise-employees/lookups/departments` returns `[{ code, name }]`, the employee master's `ORGANIZATION_ID` and `DEPARTMENT`.
- `GET /hr/reports/periodwise-employees` takes `dateFrom`, `dateTo` (required), `department` (`ALL` or a code), `status` (`ALL`/`ACTIVE`/`LEFT`), `search`, `nationality`, `ageBand`, `flagged`, `sortBy`, `sortDir`, `page` and `pageSize` (≤100).

**Response:** `data: { rows, summary }` plus `pagination`. The summary sits inside `data` because the shared client keeps only `data` and `pagination`.
- **Scope:** the period, department and status select the scope. `summary` holds the KPIs and chart data of the whole scope.
- **Refinements:** search, nationality, age band and "needs checking" narrow only the rows. Rows are then sorted and paged on the server.
- **National ID:** rows carry `hasNationalId`, never the number.
- **Department:** the employee's current department.

**On the page:**
- It renders the server's rows, page and summary.
- Clicking a department bar narrows the scope; the other charts filter the table.
- Export CSV and Print load every filtered row with `reports.allRows`.
- `periodwiseModel.js` keeps the CSV helpers and the rules the demo adapter uses.

**The demo adapter** (`demo/demoClient.js`, `demo/demoData.js`) is used only while `VITE_HR_RECRUITMENT_DEMO` selects it:
- it serves the same contract, including numeric department codes and 400 validation errors;
- it has the same interface as `apiClient`;
- it keeps fictional records in memory only (never browser storage) and waits 350 ms per request.

While the page uses it, the page shows a **Demo data** badge. To remove the demo, delete `demo/` and `hrRecruitmentConfig.js`, and remove `selectClient`, `hrRecruitmentDemo` and `identifyDemoUser`.

## Tests

- **Client** (`client/tests`, mocked client, no Oracle):
  - `hrRecruitment.test.mjs`: mappings and permissions.
  - `hrRecruitmentAudit.test.mjs`: contract regressions and lookup loading for every form.
  - `hrOnboarding.test.mjs`: orientation, probation, the report and the demo adapter.
  - `hrSharedComponents.test.mjs`.
- **Server** (`server/tests`, Supertest with fake repositories): `requisitions`, `interview-assessments`, `employment-offers`, `orientation-trainings`, `probation-evaluations`, `periodwise-employees`, `hr-date-only` and `hr-identity-ids`.
- **Live TEST check** (writes and deletes its own `ZZTEST` records; owner-run session): `npm run hr:live-crud` in `server/`, see `server/scripts/hr-live-crud.js`.
