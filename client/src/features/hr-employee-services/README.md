# HR employee services: Personnel Record Change (1110), Transfer Request (ZPI.TCN.FM.01), Performance Appraisal

Three screens under **Human resources** in the sidebar. They are not part of the recruitment flow
(no step bar), and they run on owner-approved **demo data** until their backend exists.

| Screen | Route | Record route | List view |
|---|---|---|---|
| Personnel Record Change (form 1110) | `/hr/employee-services/record-change` | `/hr/employee-services/record-change/:requestId` | `/hr/employee-services/record-change/requests` (Change requests) |
| Transfer Request (ZPI.TCN.FM.01) | `/hr/employee-services/transfer` | `/hr/employee-services/transfer/:transferId` | `/hr/employee-services/transfer/report` (Transfer report) |
| Performance Appraisal (annual) | `/hr/performance/appraisal` | `/hr/performance/appraisal/:appraisalId` | Report dialog on the page |

The list paths are matched before the record paths (a record id is digits only).

> **Demo data.** The owner approved demo data for these screens only (a feature-scoped override of
> ZRV-FE-005) until the backend exists. No backend module, Oracle object or permission row exists
> for them yet. Every person in the demo data is fictional ("Sample Employee 001", "Sample
> Director A", "Sample Requester"); the requester and the appraiser are the signed-in user.

## Switches

Four build-time switches control the HR screens: two decide whether pages exist, two decide where
shown pages get their data. Each follows the same rule.

| Variable | Decides | `'true'` | `'false'` | unset |
|---|---|---|---|---|
| `VITE_FEATURE_HR_RECRUITMENT` | Whether the onboarding pages (orientation, probation, employee report) exist | shown | hidden | shown in development builds, hidden in production builds |
| `VITE_FEATURE_HR_EMPLOYEE_SERVICES` | Whether these three screens and their list views exist | shown | hidden | shown in development builds, hidden in production builds |
| `VITE_HR_RECRUITMENT_DEMO` | Data source of the recruitment screens that still use the demo adapter | demo adapter | `apiClient` | demo in development builds, API in production builds |
| `VITE_HR_EMPLOYEE_SERVICES_DEMO` | Data source of these three screens | demo adapter | `apiClient` | demo in development builds, API in production builds |

- **Visibility** uses the registry's `enabledBy` mechanism. Every entry of the session-only module
  `HR_EMPLOYEE_SERVICES` (`config/registry/modules/hrEmployeeServices.module.js`) carries
  `enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' }`. While it is off, the pages are absent
  from the sidebar, the command palette, the guard (Not found) and the router table.
- **Data source**: `VITE_HR_EMPLOYEE_SERVICES_DEMO` is resolved in `hrEmployeeServicesConfig.js`. It
  is separate from `VITE_HR_RECRUITMENT_DEMO` because recruitment is moving to real APIs (#32, #33):
  turning its demo flag off must not point these screens at endpoints that do not exist.
- `.env.example` lists `VITE_HR_EMPLOYEE_SERVICES_DEMO=` (empty: the default rule), pinned by
  `tests/productionReadiness.test.mjs`. Override locally in your own `client/.env.local`.

| `VITE_FEATURE_HR_EMPLOYEE_SERVICES` | `VITE_HR_EMPLOYEE_SERVICES_DEMO` | Result | Use |
|---|---|---|---|
| `true` | `true` | Pages visible, demo data | Demo or UAT build without a backend |
| `true` | `false` | Pages visible, real API | **Production once the backend exists** |
| `false` | `true` or `false` | Pages hidden (the data source is irrelevant) | Production before the backend exists |
| unset | unset | Development: visible with demo data. Production: hidden | Defaults |

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

## Proposed API contract (TODO for the backend)

None of these endpoints exist. Paths are relative to `/api/v1`. Responses use the standard envelope;
lists use the standard `pagination`. The readers in `hrEmployeeServicesContract.js` define the exact
fields and reject anything else. Writes carry the session CSRF token.

| Method and path | Purpose | Reader |
|---|---|---|
| `GET /hr/employee-services/lookups` | Positions, grades, levels, family statuses, departments with their sections, job titles, directors (`directorId`, name, area), blood types, companies, the transfer document strip (title, control number, version, issue date, pages) | `readEmployeeServicesLookups` |
| `GET /hr/employee-services/employees?search&page&limit` | Employee search with the current record: position, the six monthly pay items, grade, level, family status; nationality, department, section, start date, job title, blood type | page of `readServiceEmployee` |
| `GET /hr/employee-services/record-change-requests?page&limit` | Change requests list (with server-computed change types and total change) | page of `readRecordChangeListItem` |
| `GET /hr/employee-services/record-change-requests/{id}` | One request | `readRecordChange` |
| `POST` / `PUT /hr/employee-services/record-change-requests[/{id}]` | Save a draft: employee required; amounts 0 or more with 2 decimals; effective date not before the start date; remarks and views ≤ 2000 (422). Assigns the Ref #, requester, request date; snapshots the current record. 409 once submitted | `readRecordChange` |
| `POST /hr/employee-services/record-change-requests/{id}/submit` | Also needs the effective date, position, all six pay items and at least one change (422); `SUBMITTED`, approvals Pending / Waiting | `readRecordChange` |
| `POST /hr/employee-services/record-change-requests/{id}/attachments` | Supporting documents (multipart). **Stub**: not called; the demo keeps file names only | — |
| `GET /hr/employee-services/transfers?page&limit` | Transfer report | page of `readTransferListItem` |
| `GET /hr/employee-services/transfers/{id}` | One transfer, with the five approvals and the three IT & HR approvals (state and date) | `readTransfer` |
| `POST` / `PUT /hr/employee-services/transfers[/{id}]` | Save a draft: employee required; a section must belong to its department; effective date not before the date of joining (422). Assigns the Ref #, requester and date. 409 once submitted | `readTransfer` |
| `POST /hr/employee-services/transfers/{id}/submit` | Also needs job title, department, section (at least one different from now), effective date, director, salary change and budgeted salary (422); `SUBMITTED` | `readTransfer` |
| `GET /hr/performance/lookups` | The 20 criteria, the rating scale with grade letters, the grade distribution (percent per grade, total 100) and the review periods | `readPerformanceLookups` |
| `GET /hr/performance/team?periodCode` | The signed-in appraiser and the team, with the grades already given in that period | `readAppraisalTeam` |
| `GET /hr/performance/appraisals?page&limit` | Appraisals report | page of `readAppraisalListItem` |
| `GET /hr/performance/appraisals/{id}` | One appraisal with the server-computed rating and grade | `readAppraisal` |
| `POST` / `PUT /hr/performance/appraisals[/{id}]` | Save a draft: employee of the appraiser's team, one appraisal per employee and period (422). Assigns the number and appraiser. 409 once submitted | `readAppraisal` |
| `POST /hr/performance/appraisals/{id}/submit` | Also needs all 20 ratings, explanations for 1 and 5, 3 to 5 goals, the appraiser's remark when a grade is over its share, and the appraiser's signature (422); `SUBMITTED` | `readAppraisal` |

Server-assigned values: Ref #, request, transfer and appraisal numbers; status; approval states;
requester or appraiser with employee number; employee snapshot; rating and grade.

## Business rules (where they live)

- **Personnel Record Change** (`recordChangeModel.js`): Total SR = basic + house + transport +
  other + communication + car; per-row difference (amount and percent, none from 0) with reset;
  change types detected automatically; a lower total shows a reminder, not a block; remarks and
  views ≤ 2000 with a live counter; route HR & Admin. Manager → President.
- **Transfer Request** (`transferModel.js`): sections depend on the department; at least one of
  job title, department, section must differ; effective date not before D.O.J.; blood type
  prefilled when known; "Yes" to salary change reminds to raise a Personnel Record Change; chain
  of five approvers; IT & HR approvals read-only.
- **Performance Appraisal** (`appraisalModel.js`): rating = average of the 20 criteria to two
  decimals; scale 4.25+ A, 3.5–4.24 B, 2.5–3.49 C, 1.6–2.49 D, below E; allowed per grade =
  ceil(% × team size), at least 1; allocated = grades already given plus this one; over a share
  warns and needs the appraiser's remark; years to the period end or today, whichever is earlier
  (one decimal); 3–5 goals; the appraiser signs to submit.

> **Placeholders and assumptions.**
> - The **A–E grade letters per rating band are assumed**: the form shows the bands and the
>   letters separately. The scale and the letters come from the lookup, so they stay configurable.
> - The demo criteria, distribution, periods, departments, sections, job titles, directors,
>   companies, document metadata and pay figures are taken from the incoming prototype; they are
>   **not approved HR content** and must come from the backend.
> - Signatures are recorded as dates. Who may sign which role must be enforced by the backend.

## Permissions (open item)

No permission codes have been agreed for these screens. The module is session-only (`rbac: false`):
every signed-in user can open them wherever `VITE_FEATURE_HR_EMPLOYEE_SERVICES` shows them, and no
button is permission-gated. When the backend exists: turn `HR_EMPLOYEE_SERVICES` into an RBAC module,
register its rows under an owner-authorized plan (gate G1), gate the buttons with
`usePermissions().can(…)`, update the pinned route tests, and remove `enabledBy` or set the switch to
`true` in the production build.

## Removing the demo

1. Delete `demo/` and `hrEmployeeServicesConfig.js`, and `VITE_HR_EMPLOYEE_SERVICES_DEMO` from
   `.env.example` and its pinned test.
2. In `hrEmployeeServicesService.js`, use `apiClient` and remove `selectEmployeeServicesClient`,
   `employeeServicesDemo` and `identifyEmployeeServicesUser` (and `shared/useEmployeeServicesUser.js`).
3. Remove the `demo` props from the pages, and the demo tests from `tests/hrEmployeeServices.test.mjs`.
