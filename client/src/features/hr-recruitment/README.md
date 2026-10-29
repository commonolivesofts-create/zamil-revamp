# HR recruitment (forms 1060, 1061, 1062, 1101, 1064) and the Periodwise Employees report

Five forms run as one flow (the step bar), plus one report, under **Human resources**. The three
recruitment forms are live; the onboarding screens are described in
[HR onboarding screens](#hr-onboarding-screens-1101-1064-and-the-report) below.

The three recruitment forms:

| Form | Route | Record route | Data source |
|---|---|---|---|
| Personnel Requisition (1060) | `/hr/recruitment/requisition` | `/hr/recruitment/requisition/:requisitionId` | Live `/api/v1/hr/requisitions` API |
| Interview Assessment (1061) | `/hr/recruitment/interview` | `/hr/recruitment/interview/:assessmentId` | Live `/api/v1/hr/interview-assessments` API |
| Employment Offer (1062) | `/hr/recruitment/offer` | `/hr/recruitment/offer/:offerId` | Live `/api/v1/hr/employment-offers` API |

## Personnel Requisition API

This form always uses the shared authenticated `apiClient`, including in development. It does not
read seeded/sample requisitions. A new form starts blank; its request date is supplied as the
current business date when the user first saves because the backend requires `requestDate` on
insert. The backend supplies requester details, record number and status.

The frontend maps its form values to the existing backend contract:

| Frontend value | Backend field/value |
|---|---|
| Job title and department selections | `jobId`/`jobName`, `deptId`/`deptName` |
| Needed date | `dateNeeded` (`YYYY-MM-DD`) |
| Replacement / addition choice | `reasonOfReq`: `Replacement` / `Addition` |
| Replacement person / addition explanation | `replacementFor` / `reason` |
| Budget and education answers | `Y` / `N` values (`budgeted`, `highSchool`, `diploma`, `higherDiploma`, `degree`, `masterDegree`) |
| Experience | `gccExp`, `workExp`: `0 - 2`, `2 - 5`, `5 - 10`, `> 10` |
| Skills, other requirements, remarks, package | `skills`, `other`, `remark`, `totalPackage` |

Lookups come from `GET /hr/requisitions/lookups/{job-titles,departments,requestor,replacement-for}`;
the replacement salary uses `GET /hr/requisitions/lookups/budget?fullName=...`. Records use `GET`
list/detail, `POST` create and `PUT` update. Save responses contain an ID, so the frontend loads
the saved record with `GET /:requisitionId`. Lists use `pageSize` and the backend's actual
requisition filters. Uploads use multipart `files` parts on create/update; saved attachments can be
removed through the existing attachment route. The shared client handles `FormData` without
setting a JSON content type. Drafts can be deleted through the backend delete route. Ticket-status
changes are optional and HR-only; the frontend sends them only when explicitly changed, and the
backend's existing role check remains authoritative.

The existing backend only creates and updates requisitions. It has no submit or approval action;
statuses are `Draft`, `Inprocess`, `Approved` and `Rejected`. The frontend therefore saves drafts
and honors the backend's read-only states (`Inprocess` and `Approved`) instead of calling a
nonexistent submit route. The backend's ticket status is HR-only and remains server-controlled by
its existing authorization and validation rules.

## Interview Assessment API

This form uses the shared authenticated API client in every environment. It loads nationalities,
approved requisitions and interviewers from the backend lookup routes, and maps the existing form
to the backend's `requisitionNo`, `positionName`, `attribute3`, candidate fields, rating sections
and evaluation object. The two allowed `attribute3` business-unit codes are provided as a select
because the backend exposes no friendly labels. Rating rows support 1–5 and `N/A`.

Records use `GET /hr/interview-assessments` and `GET /:headerId`, `POST /` to create, `PUT /:headerId`
to update and `DELETE /:headerId` to delete. The form preserves backend-owned evaluation fields
when loading and saving existing records. The backend has no submit or approval action, so the
last form action saves the assessment; the backend controls its status.

## Employment Offer API

This form uses the shared authenticated API client in every environment. It loads approved and
passed interview candidates, titles, business-unit IDs and benefit allowances from the backend.
Candidate selection fills the interview number, requisition number and position. The form maps its
bilingual package rows to the backend's single `line` object and uses the number-to-Arabic and
Hijri-date helpers for basic salary and starting date. Business-unit values remain raw IDs because
the backend deliberately does not provide labels.

Records use `GET /hr/employment-offers` and `GET /:headerId`, `POST /` to create, `PUT /:headerId`
to update and `DELETE /:headerId` to delete. The backend only supports CRUD: status is always
`Incomplete`, and there is no issue, signature or acceptance action. The form therefore saves the
offer record and does not present a workflow action that the API cannot perform.

## Permissions and follow-up

The requisition routes use the existing `REQUISITIONS.REQUISITIONS:VIEW` permission. Save and
inline attachment upload controls check `CREATE` or `UPDATE` for the current record. The backend
continues to authorize every request, and its standalone attachment endpoints use
`MANAGE_ATTACHMENTS`. Interview Assessment uses the backend's `INTERVIEW_ASSESSMENTS` resource;
Employment Offer uses `EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS`. Both check view, create, update and
delete permissions.

All three recruitment forms are connected to their existing backend APIs. The demo adapter serves
only the onboarding screens below.

## HR onboarding screens (1101, 1064) and the report

| Step | Screen | Route | Record route |
|---|---|---|---|
| 4 | Orientation Schedule (1101) | `/hr/recruitment/orientation` | `/hr/recruitment/orientation/:scheduleId` |
| 5 | Probation Evaluation (PAF, 1064) | `/hr/recruitment/probation-evaluation` | `/hr/recruitment/probation-evaluation/:evaluationId` |
| — | Periodwise Employees (report, not part of the flow) | `/hr/reports/periodwise-employees` | — |

> **Demo data.** The owner approved demo data for these screens only (an explicit,
> feature-scoped override of ZRV-FE-005) until their backend exists. No backend module,
> Oracle object or permission row exists for them yet. Every person in the demo data is
> fictional ("Sample Employee 001", "Sample HR Head A" …).

They are registered in `config/registry/modules/hrOnboarding.module.js` (module
`HR_ONBOARDING`, session-only: `rbac: false`) and use `hrRecruitmentServices.onboardingClient`.
The three recruitment forms above always use `apiClient` and are not affected by either switch.

### Switches: visibility and data source

Four build-time switches control the HR screens; the two `*_EMPLOYEE_SERVICES*` switches belong to
the employee services screens (see `features/hr-employee-services/README.md`).

| Variable | Decides | `'true'` | `'false'` | unset |
|---|---|---|---|---|
| `VITE_FEATURE_HR_RECRUITMENT` | Whether the onboarding pages exist in this build | shown | hidden | shown in development builds, hidden in production builds |
| `VITE_FEATURE_HR_EMPLOYEE_SERVICES` | Whether the employee services screens (record change, transfer, appraisal) exist | shown | hidden | shown in development builds, hidden in production builds |
| `VITE_HR_RECRUITMENT_DEMO` | Where shown onboarding pages get their data | demo adapter | `apiClient` | demo in development builds, API in production builds |
| `VITE_HR_EMPLOYEE_SERVICES_DEMO` | Where the employee services screens get their data | demo adapter | `apiClient` | demo in development builds, API in production builds |

The visibility switch is the registry's generic `enabledBy` mechanism: every entry of the
`HR_ONBOARDING` module carries `enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' }`. While it is
off, the pages are absent from the sidebar, the command palette, the guard (Not found) and the
router table.

| `VITE_FEATURE_HR_RECRUITMENT` | `VITE_HR_RECRUITMENT_DEMO` | Result | Use |
|---|---|---|---|
| `true` | `true` | Pages visible, demo data | Demo or UAT build without a backend |
| `true` | `false` | Pages visible, real API | **Production once the backend exists** |
| `false` | `true` or `false` | Pages hidden (the data source is irrelevant) | Production before the backend exists |
| unset | unset | Development: visible with demo data. Production: hidden | Defaults |

The data-source default lives in `hrRecruitmentConfig.js` and not in a `.env.development` file,
because the repository ignores every `.env.*` file except `.env.example`, and
`tests/productionReadiness.test.mjs` pins the variables `.env.example` may list. To override
locally, put the variable in your own `client/.env.local`.

### The demo adapter

While demo mode is on, the onboarding pages show a **Demo data** badge (the opt-in `demo` prop
of `RecruitmentHeader`, `RecruitmentShell` and `RecruitmentLoader`). The adapter
(`demo/demoClient.js`, `demo/demoData.js`):

- has the same interface as `apiClient`, so the services and contract readers run unchanged on
  its responses;
- keeps records **in memory only** (never browser storage); reloading resets them;
- assigns numbers (`ORT-2026-0001`, `PAF-2026-0001`) and statuses, and waits 350 ms per request;
- records the **signed-in user's name** as "Scheduled by" and "Prepared by". It cannot see the
  session, so `RecruitmentLoader` passes the name to it (`identifyDemoUser`); the call is a
  no-op for `apiClient`;
- has real error paths: unknown record → **404**, change to a scheduled or submitted record →
  **409**, incomplete submission or invalid report parameters → **422** with details;
- serves about 160 fictional employees for the report (with leavers, missing national IDs,
  60+ employees and one implausible birth date, so every flag and KPI has data).

### Proposed API contract (TODO for the backend)

None of these endpoints exist. Paths are relative to `/api/v1`. Responses use the standard
envelope, and lists use the standard `pagination`. The readers in `hrRecruitmentContract.js`
define the exact fields and reject anything else.

| Method and path | Purpose | Response |
|---|---|---|
| `GET /hr/recruitment/lookups` | Departments, `orientation.departmentHeads` (suggested heads per session: `hr`, `safety`, `it`, `tour`, `meet`), `probation.formTypes` (five form types with criteria and allocated points totalling 100 per type) and `probation.ratingScale` (`[{ min, label, labelAr }]`) | `readLookups` |
| `GET /hr/recruitment/employees?search&page&limit` | Employee search for the pickers: number, name, type, start date, section, division, position, grade, department, suggested evaluation form type | page of `readEmployee` |
| `GET /hr/recruitment/orientation-schedules?page&limit` | Report list | page of `readOrientationListItem` |
| `GET /hr/recruitment/orientation-schedules/{id}` | One schedule (with the employee snapshot) | `readOrientation` |
| `POST /hr/recruitment/orientation-schedules` | Save **is** schedule: validate Name, From, at least one dated session and no clash or reversed date/time (422); assign the Ref #, To (latest session end) and Scheduled by; `SCHEDULED` (read-only, so there is no PUT or submit) | 201, `readOrientation` |
| `GET /hr/recruitment/probation-evaluations?page&limit` | Report list (with total points) | page of `readProbationListItem` |
| `GET /hr/recruitment/probation-evaluations/{id}` | One evaluation | `readProbation` |
| `POST` / `PUT /hr/recruitment/probation-evaluations[/{id}]` | Save a draft: form type, employee, period (end ≥ start, not before joining) and every criterion scored (422); assigns the number and Prepared by; 409 once submitted | `readProbation` |
| `POST /hr/recruitment/probation-evaluations/{id}/submit` | Also needs the recommendation (and extension months when extending), a justification when it contradicts the result, and the evaluator signature (422); `SUBMITTED` (read-only) | `readProbation` |
| `GET /hr/reports/periodwise-employees?department&from&to` | Every employee attached to the department (`ALL` or a code) at any point in [from, to]: start ≤ to and (no end or end ≥ from). 422 for missing dates, to < from or an unknown department. Not paginated: the page derives KPIs and charts from all rows | `readReport` |

> **Placeholders.** The demo criteria and points are **not approved HR content**. The rating
> scale (91+ Outstanding, 81+ Very good, 71+ Good, 51+ Needs improvement, below Unsatisfactory)
> is **assumed**: the original form shows a Rating box without a scale. Both must come from the
> backend. The pass mark (71 %), the 3-month probation and the 1–3 month extensions are
> business rules in `probation/probationModel.js`.

Further backend TODOs: Oracle tables for both forms and the report source (inspect the CI3
tables of forms 1064 and 1101 and the employee master first, gates G1 and G4); for very large
periods the report backend may need to compute KPIs and chart groups itself and page the table.

### Export

The report's **Export CSV** builds the file in the browser from the filtered rows and the visible
columns: a UTF-8 byte order mark, CRLF line ends, quoting as needed, and an apostrophe before
cells that start with `=`, `+`, `-` or `@`, so a spreadsheet never runs them as formulas.
Printing lists every filtered row, not only the current page.

### Permissions (open item)

Permission codes for the orientation schedules, probation evaluations and the report have
**not** been agreed. Until they are, the module stays session-only: every signed-in user can open
these pages wherever `VITE_FEATURE_HR_RECRUITMENT` shows them, and no button is
permission-gated. When the backend exists, turn `HR_ONBOARDING` into an RBAC module, register its
rows under an owner-authorized plan (gate G1), gate the buttons with `usePermissions().can(…)`,
update the pinned route tests, and remove `enabledBy` or set the switch to `true` in production.

### Removing the demo

1. Delete `demo/` and `hrRecruitmentConfig.js`.
2. In `hrRecruitmentService.js`, pass `apiClient` as `onboardingClient` and remove `selectClient`,
   `hrRecruitmentDemo` and `identifyDemoUser` (and its call in `RecruitmentLoader.jsx`).
3. Remove the `demo` props from the onboarding pages, and the demo tests from
   `tests/hrOnboarding.test.mjs`.
