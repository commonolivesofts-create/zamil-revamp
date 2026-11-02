# HR employee services: Personnel Record Change (1110), Transfer Request (ZPI.TCN.FM.01), Performance Appraisal

Three screens under **Human resources** in the sidebar. They are not part of the recruitment flow
(no step bar). Personal Status Change, Transfer Request and Performance Appraisal connect to their
existing backend APIs.

| Screen | Route | Record route | List view |
|---|---|---|---|
| Personnel Record Change (form 1110) | `/hr/employee-services/record-change` | `/hr/employee-services/record-change/:requestId` | `/hr/employee-services/record-change/requests` (Change requests) |
| Transfer Request (ZPI.TCN.FM.01) | `/hr/employee-services/transfer` | `/hr/employee-services/transfer/:transferId` | `/hr/employee-services/transfer/report` (Transfer report) |
| Performance Appraisal (annual) | `/hr/performance/appraisal` | `/hr/performance/appraisal/:appraisalId` | Report dialog on the page |

The list paths are matched before the record paths (a record id is digits only).

> These screens use live backend data. Transfer Request can save, update and list drafts; its
> backend does not expose a submit endpoint. Performance Appraisal creates a complete appraisal
> directly in process because its backend does not expose draft or submit endpoints.

## Switches

Four build-time switches control the HR screens: two decide whether pages exist, two decide where
shown pages get their data. Each follows the same rule.

| Variable | Decides | `'true'` | `'false'` | unset |
|---|---|---|---|---|
| `VITE_FEATURE_HR_RECRUITMENT` | Whether the onboarding pages (orientation, probation, employee report) exist | shown | hidden | shown in development builds, hidden in production builds |
| `VITE_FEATURE_HR_EMPLOYEE_SERVICES` | Whether these three screens and their list views exist | shown | hidden | shown in development builds, hidden in production builds |
| `VITE_HR_RECRUITMENT_DEMO` | Data source of the recruitment screens that still use the demo adapter | demo adapter | `apiClient` | demo in development builds, API in production builds |
| `VITE_HR_EMPLOYEE_SERVICES_DEMO` | Legacy demo mode for remaining employee service screens | demo adapter | `apiClient` | demo in development builds, API in production builds |

- **Visibility** uses the registry's `enabledBy` mechanism. Every entry of the session-only module
  `HR_EMPLOYEE_SERVICES` (`config/registry/modules/hrEmployeeServices.module.js`) carries
  `enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' }`. While it is off, the pages are absent
  from the sidebar, the command palette, the guard (Not found) and the router table.
- **Data source**: Personal Status Change, Transfer Request and Performance Appraisal use their
  real APIs. The switch remains for the legacy shared demo adapter.
- `.env.example` lists `VITE_HR_EMPLOYEE_SERVICES_DEMO=` (empty: the default rule), pinned by
  `tests/productionReadiness.test.mjs`. Override locally in your own `client/.env.local`.

| `VITE_FEATURE_HR_EMPLOYEE_SERVICES` | `VITE_HR_EMPLOYEE_SERVICES_DEMO` | Result | Use |
|---|---|---|---|
| `true` | `true` | Pages visible; all three use APIs | Development or UAT |
| `true` | `false` | Pages visible; all three use APIs | Production when all three backends are ready |
| `false` | `true` or `false` | Pages hidden (the data source is irrelevant) | Production before the backend exists |
| unset | unset | Development: visible with live API data. Production: hidden | Defaults |

## Structure

| Piece | Where |
|---|---|
| Business rules (pure, tested) | `recordChange/recordChangeModel.js`, `transfer/transferModel.js`, `performance/appraisalModel.js`, `shared/approvals.js`, `shared/esFormat.js` |
| Pages | `recordChange/RecordChangePage.jsx`, `recordChange/RecordChangeRequestsPage.jsx`, `transfer/TransferPage.jsx`, `transfer/TransferReportPage.jsx`, `performance/AppraisalPage.jsx` |
| List view (search, status tabs, sortable columns) | `shared/RecordList.jsx` |
| Services and response contracts | `hrEmployeeServicesService.js`, `hrEmployeeServicesContract.js` |
| Screen text | `hrEmployeeServicesText.js` |
| Demo adapter and data (**demo only**) | `demo/employeeServicesDemoClient.js`, `demo/employeeServicesDemoData.js` |
| Styles | `src/styles/hr-employee-services.css` (on top of `hr-recruitment.css`) |

The screens reuse the HR shared components of `features/hr-recruitment/shared/` (`RecruitmentShell`,
`RecruitmentLoader`, `RecruitmentHeader`, `EmployeePicker`, `HrField`, `RadioCards`, `FileDrop`,
`Review`, `Ticket`, `Tilt`, `Orbit`, `RouteCard`, `useRecruitmentForm`, the dialogs). Their names say
"Recruitment" although employee services use them too; renaming them is a possible later cleanup.
The options added for these screens:

- `RecruitmentShell`: `flow={false}` (no recruitment step bar), `compact` (denser layout), `banner`
  (content between the ticket strip and the step track), `breadcrumb`.
- `RecruitmentLoader`: `flow`, `identify` (these screens identify the demo user themselves) and
  `breadcrumb`.
- `EmployeePicker`: `tight` (no avatar, list under the input) and `cacheKey`.
- Every HR page title wraps between words only; the step track has one column per step.

## The demo adapter

- Same interface as `apiClient`; the services and contract readers run unchanged on its responses.
- Records in memory only (never browser storage); reloading resets them to the seeded records
  (4 change requests, 3 transfers, 1 appraisal of 2025).
- Waits 350 ms per request; assigns numbers (`PCR-2026-…`, `TRF-2026-…`, `EPA-2026-…`), statuses,
  requester or appraiser, approval states, rating and grade.
- Error paths: unknown record → **404**; change to a submitted record → **409**; save or submit with
  a problem (validation, unknown director or company, a second appraisal of the same employee and
  period, unknown review period) → **422** with details.
- Supporting documents keep file name and size only; nothing is uploaded.

## API contracts

Paths are relative to `/api/v1`. Responses use the standard envelope; writes carry the session CSRF
token. Personal Status Change and Transfer Request use their existing backend-specific contracts.

Personal Status Change uses `/hr/personnel-record-changes` (see the OpenAPI document): lookups of
employee numbers and positions, the employee auto-fill, the list (legacy report columns including
requestor and pending-at), read, and draft-only create, update and delete. The request body carries
only the answers (employee number, effective date, the editable current family status, the revised
record, remarks and views); the server computes the employee snapshot, `FORM_DATE`, the Hijri
`ARB_DATE`, the Ref # and the totals. The `/hr/employee-services/record-change-requests` rows below
are the earlier proposed contract that only the demo adapter serves.
Performance Appraisal uses its existing backend-specific contract below.

| Method and path | Purpose | Reader |
|---|---|---|
| `GET /hr/employee-services/lookups` | Positions, grades, levels, family statuses, departments with their sections, job titles, directors (`directorId`, name, area), blood types, companies, the transfer document strip (title, control number, version, issue date, pages) | `readEmployeeServicesLookups` |
| `GET /hr/employee-services/employees?search&page&limit` | Employee search with the current record: position, the six monthly pay items, grade, level, family status; nationality, department, section, start date, job title, blood type | page of `readServiceEmployee` |
| `GET /hr/employee-services/record-change-requests?page&limit` | Change requests list (with server-computed change types and total change) | page of `readRecordChangeListItem` |
| `GET /hr/employee-services/record-change-requests/{id}` | One request | `readRecordChange` |
| `POST` / `PUT /hr/employee-services/record-change-requests[/{id}]` | Save a draft: employee required; amounts 0 or more with 2 decimals; effective date not before the start date; remarks and views ≤ 2000 (422). Assigns the Ref #, requester, request date; snapshots the current record. 409 once submitted | `readRecordChange` |
| `POST /hr/employee-services/record-change-requests/{id}/submit` | Also needs the effective date, position, all six pay items and at least one change (422); `SUBMITTED`, approvals Pending / Waiting | `readRecordChange` |
| `POST /hr/employee-services/record-change-requests/{id}/attachments` | Supporting documents (multipart). **Stub**: not called; the demo keeps file names only | — |
| `GET /hr/transfer-requests/?page&pageSize&sort&order` | Transfer report, paged under `meta` and `rows` | Transfer API adapter |
| `GET /hr/transfer-requests/lookups/{jobs,sections,departments,directors,blood-types,requestor}` | Transfer form options and signed-in requestor | Transfer API adapter |
| `GET /hr/transfer-requests/lookups/employees` and `GET /lookups/employees/{name}` | Employee names and current transfer snapshot | Transfer API adapter |
| `GET /hr/transfer-requests/{headerId}` | One transfer request with current, destination, signatures and status | Transfer API adapter |
| `POST` / `PUT /hr/transfer-requests[/{headerId}]` | Create or update a draft. Server requires plant, employee, job title, department, section, effective date, blood type, director and both salary flags. Draft and rejected requests are editable; Inprocess and Approved requests are locked. | Transfer API adapter |
| `DELETE /hr/transfer-requests/{headerId}` | Delete an editable draft or rejected request | Transfer API adapter |
| `GET /hr/performance-appraisals/lookups/employees?year` and `GET /lookups/employees/{name}?year` | Eligible direct reports and each employee snapshot | Performance appraisal adapter |
| `GET /hr/performance-appraisals/lookups/requestor` | Signed-in appraiser identity | Performance appraisal adapter |
| `GET /hr/performance-appraisals/lookups/grade-stats` | Grade quotas and allocations | Performance appraisal adapter |
| `GET /hr/performance-appraisals/?year&page&pageSize&sort&order` | Appraisals report for a year; standard paginated response | Performance appraisal adapter |
| `GET /hr/performance-appraisals/{headerId}` | One appraisal, including the server-computed rating and grade | Performance appraisal adapter |
| `POST /hr/performance-appraisals/` | Creates the appraisal directly in `Inprocess`; requires an eligible employee snapshot, all 20 ratings, at least one development goal and one training need. Only one non-rejected appraisal per employee/year is allowed | Performance appraisal adapter |
| `PUT /hr/performance-appraisals/{headerId}` | Backend supports updating rejected/non-Inprocess records; `Inprocess` records return 409 | Performance appraisal adapter |
| `PUT /hr/performance-appraisals/{headerId}/employee-remarks` | Appraised employee can update their remarks | Performance appraisal adapter |
| `DELETE /hr/performance-appraisals/{headerId}` | Deletes an appraisal | Performance appraisal adapter |

The appraisal backend has no draft or submit endpoint and does not persist signature strokes. Creating the complete form with `POST` moves it straight to `Inprocess`; the frontend locks that record after creation. Criteria labels and grade bands follow the server's calculation rules, while employee eligibility, employee snapshots, grade percentages, grade allocations, rating, and grade come from the server.

Server-assigned values: status, approval states, requester or appraiser and employee snapshot.
The transfer endpoint returns `headerId`, which the report displays as its reference number.

## Business rules (where they live)

- **Personnel Record Change** (`recordChangeModel.js`, legacy CI3 parity; see
  `docs/testing/status-change-legacy-comparison.md`): required on save: employee, effective date,
  revised position, the six revised amounts and the revised family status; amounts digits with up to
  2 decimals and at most 7 characters; Total SR = basic + house + transport + other + communication +
  car; choosing the employee fills the current information and record and sets the revised position
  and family status (revised amounts stay, 0 on a new form); the current family status is editable;
  grade and level are optional free text (new only); an effective date before the start date and a
  lower total are reminders, not blocks; no change is required; only drafts are editable;
  `validateRecordChangeForSubmit` holds the legacy submit rules (not wired: no workflow yet); per-row
  difference with reset and change types are new-only aids; remarks and views ≤ 2000; route HR &
  Admin. Manager → President. Print shows the whole form; the list exports CSV.
- **Transfer Request** (`transferModel.js`): at least one of job title, department, section must
  differ; effective date not before D.O.J.; "Yes" to salary change reminds to raise a Personnel
  Record Change. The backend supplies a global section list without department associations and has
  no submit endpoint; drafts are saved only after all server-required fields are complete.
- **Performance Appraisal** (`appraisalModel.js`): rating = average of the 20 criteria to two
  decimals; scale 4.25+ A, 3.5–4.24 B, 2.5–3.49 C, 1.6–2.49 D, below E; allowed per grade =
  ceil(% × team size), at least 1; allocated = grades already given plus this one; over a share
  warns and needs the appraiser's remark; years to the period end or today, whichever is earlier
  (one decimal); 3–5 goals; the appraiser signs to submit.

> **Placeholders and assumptions.**
> - The **A–E grade letters per rating band are assumed**: the form shows the bands and the
>   letters separately. The scale and the letters come from the lookup, so they stay configurable.
> - Transfer lookup values are read from the backend. Some appraisal criteria labels and grade-band
>   display text mirror constants used by its existing backend; grade calculations and allocations
>   are server-owned.
> - The appraisal backend does not accept signature data, so signature strokes are presentation only.

## Permissions

Personal Status Change routes use `HR.PERSONNEL_RECORD_CHANGES:VIEW`; create, update and delete
controls use the corresponding backend actions. Transfer routes use `HR.TRANSFER_REQUESTS:VIEW`,
and create/update controls use the corresponding actions. Performance Appraisal routes use
`HR.PERFORMANCE_APPRAISALS` permissions.

## Removing the demo

1. Delete `demo/` and `hrEmployeeServicesConfig.js`, and `VITE_HR_EMPLOYEE_SERVICES_DEMO` from
   `.env.example` and its pinned test.
2. In `hrEmployeeServicesService.js`, use `apiClient` and remove `selectEmployeeServicesClient`,
   `employeeServicesDemo` and `identifyEmployeeServicesUser` (and `shared/useEmployeeServicesUser.js`).
3. Remove the `demo` props from the pages, and the demo tests from `tests/hrEmployeeServices.test.mjs`.

## Reward Nomination (1113), Share an Idea (1097) and Sick Leave (1076)

Three more screens under **Human resources → Employee services** (the sidebar sub-group flyout).
Each uses its existing backend; handoff: `docs/handoffs/FEATURE-HR-EMPLOYEE-SERVICES-BATCH1.md`.

| Screen | Form route | Report | Record | API | Permission |
|---|---|---|---|---|---|
| Sick Leave | `/hr/employee-services/sick-leave` | `…/sick-leave/report` | `…/sick-leave/:leaveId` | `/hr/sick-leave` | `HR.SICK_LEAVE` |
| Reward Nomination | `/hr/employee-services/reward-nomination` | `…/reward-nomination/report` | `…/reward-nomination/:nominationId` | `/hr/employee-of-the-month` | `HR.EMPLOYEE_OF_THE_MONTH` |
| Share an Idea | `/hr/employee-services/ideas` | `…/ideas/report` | `…/ideas/:ideaId` | `/ideas` | `HR.IDEAS` |

Only the form is listed in the sidebar; the report and record pages are reached from it (`hidden`).

**Switches.** Visibility: `VITE_FEATURE_HR_SICK_LEAVE`, `VITE_FEATURE_HR_REWARD_NOMINATION`,
`VITE_FEATURE_HR_IDEAS` (`'true'` shown, `'false'` hidden, unset shown in development builds only);
an entry also needs the form's `VIEW` permission. Data source: `VITE_HR_SICK_LEAVE_DEMO`,
`VITE_HR_REWARD_NOMINATION_DEMO`, `VITE_HR_IDEAS_DEMO` — the API unless `'true'` in a development
build; a production build always uses the API (`employeeServicesFormsConfig.js`).

**Structure (per form, in `reward/`, `idea/`, `sickLeave/`).** `*Contract.js` (response readers
and the request body), `*Model.js` (pure rules), `*Service.js` (API or demo adapter), `*Page.jsx`
and `*ReportPage.jsx`. Shared: `shared/formRecords.js` (statuses, paging, guards),
`shared/ServerRecordList.jsx` (report filtered, sorted and paged by the server),
`shared/FormParts.jsx` (rating chips), demo adapters `demo/{reward,idea,sickLeave}DemoClient.js`
on `demo/formsDemoKit.js` (in memory, backend response shapes, fictional people). Styles:
`src/styles/hr-employee-services-forms.css`.

**Rules.** Drafts and rejected records are editable; in-process and approved ones are read-only
(the backends answer 409). Dates are `YYYY-MM-DD` strings. Server-computed values are shown from
the server: the request numbers, the sick leave number of days, the idea feasibility
(depreciation, NPV, IRR, ROI). Legacy rules win over the prototype (the reward A / AS / BS / CS
scale, the fixed "Sick Leave" type); prototype fields with no column or API are not shown (gaps
in the handoff). Sending a record for approval is not available: no backend has a submit endpoint.
