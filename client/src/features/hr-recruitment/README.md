# HR recruitment (forms 1060, 1061, 1062, 1101, 1064) and the Periodwise Employees report

Five forms that run as one flow, and one report, under **Human resources** in the sidebar:

| Step | Screen | Route | Record route |
|---|---|---|---|
| 1 | Personnel Requisition (1060) | `/hr/recruitment/requisition` | `/hr/recruitment/requisition/:requisitionId` |
| 2 | Interview Assessment (1061) | `/hr/recruitment/interview` | `/hr/recruitment/interview/:assessmentId` |
| 3 | Employment Offer (1062) | `/hr/recruitment/offer` | `/hr/recruitment/offer/:offerId` |
| 4 | Orientation Schedule (1101) | `/hr/recruitment/orientation` | `/hr/recruitment/orientation/:scheduleId` |
| 5 | Probation Evaluation (PAF, 1064) | `/hr/recruitment/probation-evaluation` | `/hr/recruitment/probation-evaluation/:evaluationId` |
| — | Periodwise Employees (report, not part of the flow) | `/hr/reports/periodwise-employees` | — |

> **Demo data.** The owner approved demo data for this feature only (an explicit,
> feature-scoped override of ZRV-FE-005) until the backend exists. No backend module,
> Oracle object or permission row exists for these screens yet. Every person in the demo
> data is fictional ("Sample Employee 001", "Sample HR Head A" …).

## Two switches: visibility and data source

| Variable | Decides | `'true'` | `'false'` | unset |
|---|---|---|---|---|
| `VITE_FEATURE_HR_RECRUITMENT` | Whether the HR pages exist in this build | shown | hidden | shown in development builds, hidden in production builds |
| `VITE_HR_RECRUITMENT_DEMO` | Where shown pages get their data | demo adapter | `apiClient` | demo in development builds, API in production builds |

The visibility switch is the registry's generic `enabledBy` mechanism. Every entry in
`config/registry/modules/hrRecruitment.module.js` carries `enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' }`.
While it is off, the pages are absent from the sidebar, the command palette, the guard (Not
found) and the router table.

The four deliberate combinations:

| `VITE_FEATURE_HR_RECRUITMENT` | `VITE_HR_RECRUITMENT_DEMO` | Result | Use |
|---|---|---|---|
| `true` | `true` | Pages visible, demo data | Demo or UAT build without a backend |
| `true` | `false` | Pages visible, real API | **Production once the backend exists** |
| `false` | `true` or `false` | Pages hidden (the data source is irrelevant) | Production before the backend exists |
| unset | unset | Development: visible with demo data. Production: hidden | Defaults |

## What is demo, and the data-source switch

| Piece | Where | Demo or real |
|---|---|---|
| Screens, business rules, validation | `requisition/`, `interview/`, `offer/`, `orientation/`, `probation/`, `report/`, `shared/` | Real; unchanged when the backend arrives |
| Services and response contracts | `hrRecruitmentService.js`, `hrRecruitmentContract.js` | Real; the API calls below |
| In-memory adapter and sample data | `demo/demoClient.js`, `demo/demoData.js` | **Demo only** |
| Data-source flag | `hrRecruitmentConfig.js` | Remove with the demo folder |

`VITE_HR_RECRUITMENT_DEMO` selects the data source:

- `true`: the in-memory demo adapter (any build).
- `false`: the shared `apiClient` (`/api/v1`).
- unset: demo in development builds (`npm run dev`), API in production builds.

The default lives in `hrRecruitmentConfig.js` and not in a `.env.development` file,
because the repository ignores every `.env.*` file except `.env.example`, and
`tests/productionReadiness.test.mjs` pins the variables `.env.example` may list. To
override locally, put `VITE_HR_RECRUITMENT_DEMO=false` in your own `client/.env.local`.

While demo mode is on, every page shows a **Demo data** badge. The demo adapter:

- has the same interface as `apiClient`, so the services and contract readers run
  unchanged on its responses;
- keeps records **in memory only** (never browser storage). Reloading the page resets
  them to the sample records;
- behaves like the proposed backend. It assigns numbers (`PRQ-2026-0001`,
  `IA-2026-0001`, `OFR-2026-0001`, `ORT-2026-0001`, `PAF-2026-0001`), statuses, the admin
  manager, and waits 350 ms per request;
- records the **signed-in user's name** as requester, "Scheduled by" and "Prepared by".
  It cannot see the session, so `RecruitmentLoader` passes the name to it
  (`identifyDemoUser`). The real API takes these values from the session; the call is
  a no-op for `apiClient`;
- has real error paths: unknown record → **404**, change to a submitted, issued or
  scheduled record → **409**, incomplete submission or invalid report parameters →
  **422** with details;
- serves a seeded set of about 160 fictional employees for the Periodwise Employees
  report (with leavers, missing national IDs, 60+ employees and one implausible birth
  date, so every flag and KPI has data).

Attachments are demo-only. The drop zone keeps file name and size in memory; nothing
is uploaded. With the real API the drop zone is hidden until an upload endpoint exists.

## Proposed API contract (TODO for the backend)

None of these endpoints exist. Paths are relative to `/api/v1`. Responses use the
standard envelope, and lists use the standard `pagination`. The readers in
`hrRecruitmentContract.js` define the exact fields and reject anything else.

| Method and path | Purpose | Response |
|---|---|---|
| `GET /hr/recruitment/lookups` | Departments, divisions, interview types, certificates, marital statuses, education levels (with level 1–5), experience bands, approval route (`steps`, `unbudgetedStep`), interview payroll default, offer settings (currency, report format, probation default in English and Arabic, HR manager and general manager signatories) | `readLookups` |
| `GET /hr/recruitment/requisitions?page&limit&number&status` | Report list; `number` + `status=SUBMITTED` finds the requisition an interview links to | page of `readRequisitionListItem` |
| `GET /hr/recruitment/requisitions/{id}` | One requisition | `readRequisition` |
| `POST /hr/recruitment/requisitions` | Create a draft (server sets status `DRAFT`, requester, request date) | 201, `readRequisition` |
| `PUT /hr/recruitment/requisitions/{id}` | Save a draft (409 once submitted) | `readRequisition` |
| `POST /hr/recruitment/requisitions/{id}/submit` | Validate (422), assign the requisition number, set `SUBMITTED` (read-only) | `readRequisition` |
| `GET /hr/recruitment/interview-assessments?page&limit` | Report list | page of `readInterviewListItem` |
| `GET /hr/recruitment/interview-assessments/{id}` | One assessment | `readInterview` |
| `POST` / `PUT /hr/recruitment/interview-assessments[/{id}]` | Save: all four tabs required (422), assigns the number, `COMPLETE`, fills `positionTitle` from the submitted requisition and `adminManagerName` from the workflow | `readInterview` |
| `POST /hr/recruitment/interview-assessments/{id}/submit` | Set `SUBMITTED` (read-only) | `readInterview` |
| `GET /hr/recruitment/employment-offers?page&limit` | Report list | page of `readOfferListItem` |
| `GET /hr/recruitment/employment-offers/{id}` | One offer | `readOffer` |
| `POST` / `PUT /hr/recruitment/employment-offers[/{id}]` | Save a draft (409 once issued) | `readOffer` |
| `POST /hr/recruitment/employment-offers/{id}/issue` | Validate position, candidate name, basic salary, starting date (422); assign the offer number; `ISSUED`, or `ACCEPTED` when the applicant signed (read-only) | `readOffer` |
| `GET /hr/recruitment/employees?search&page&limit` | Employee search for the pickers (orientation, probation): number, name, type, start date, section, division, position, grade, department, suggested evaluation form type | page of `readEmployee` |
| `GET /hr/recruitment/orientation-schedules?page&limit` | Report list | page of `readOrientationListItem` |
| `GET /hr/recruitment/orientation-schedules/{id}` | One schedule (with the employee snapshot) | `readOrientation` |
| `POST /hr/recruitment/orientation-schedules` | Save **is** schedule: validate Name, From, at least one dated session and no clash or reversed date/time (422); assign the Ref #, To (latest session end) and Scheduled by; `SCHEDULED` (read-only, so there is no PUT or submit) | 201, `readOrientation` |
| `GET /hr/recruitment/probation-evaluations?page&limit` | Report list (with total points) | page of `readProbationListItem` |
| `GET /hr/recruitment/probation-evaluations/{id}` | One evaluation | `readProbation` |
| `POST` / `PUT /hr/recruitment/probation-evaluations[/{id}]` | Save a draft: form type, employee, period (end ≥ start, not before joining) and every criterion scored (422); assigns the number and Prepared by; 409 once submitted | `readProbation` |
| `POST /hr/recruitment/probation-evaluations/{id}/submit` | Also needs the recommendation (and extension months when extending), a justification when it contradicts the result, and the evaluator signature (422); `SUBMITTED` (read-only) | `readProbation` |
| `GET /hr/reports/periodwise-employees?department&from&to` | Every employee attached to the department (`ALL` or a department code) at any point in [from, to]: start ≤ to and (no end or end ≥ from). 422 for missing dates, to < from or an unknown department. Not paginated: the page derives KPIs and charts from all rows | `readReport` |

The lookups (`GET /hr/recruitment/lookups`) also carry:

- `orientation.departmentHeads`: suggested heads per session (`hr`, `safety`, `it`, `tour`, `meet`);
- `probation.formTypes`: the five form types with their criteria and allocated points,
  which must total 100 per type (the reader rejects anything else);
- `probation.ratingScale`: `[{ min, label, labelAr }]`.

> **Placeholders.** The demo criteria and points (`demo/demoData.js`, from the incoming
> prototype) are **not approved HR content**. The rating scale (91+ Outstanding, 81+ Very
> good, 71+ Good, 51+ Needs improvement, below Unsatisfactory) is **assumed**: the
> original form shows a Rating box without a scale. Both must come from the backend.
> The pass mark (71 %), the 3-month probation and the 1–3 month extensions are business
> rules in `probation/probationModel.js`.

Further backend TODOs:

- **Tables.** Oracle tables for the five forms and the report source. The CI3 tables of
  forms 1060–1062, 1064 and 1101 and the employee master must be inspected first (gates G1 and G4).
- **Report size.** The report returns every matching row. For very large periods the
  backend may need to compute KPIs and chart groups itself and page the table.
- **Approval route.** The real route (line manager, HR manager, Finance when not budgeted,
  general manager) comes from the lookups endpoint. The frontend inserts the unbudgeted
  step before the final approval.
- **Attachments.** `POST /hr/recruitment/requisitions/{id}/attachments` needs a
  multipart upload, and the shared API client sends JSON only. Adding multipart support
  is a shared-architecture change (gate G3).
- **Signatures.** Signatures are recorded as timestamps per role (`hrManager`,
  `generalManager`, `applicant`). Who may sign which role must be enforced by the backend.

## Export

The report's **Export CSV** builds the file in the browser from the filtered rows and the
visible columns (feature-local; the project had no download pattern):

- it starts with a UTF-8 byte order mark;
- uses CRLF line ends;
- quotes cells as needed;
- prefixes cells that start with `=`, `+`, `-` or `@` with an apostrophe, so a spreadsheet
  never runs them as formulas.

Printing lists every filtered row, not only the current page.

## Permissions (approved, not registered)

`hrRecruitmentActions.js` holds the approved codes:
`HR_RECRUITMENT.PERSONNEL_REQUISITIONS | INTERVIEW_ASSESSMENTS | EMPLOYMENT_OFFERS`
with `VIEW`, `CREATE`, `UPDATE`, `SUBMIT`/`ISSUE`, `PRINT`. Codes for the orientation
schedules, probation evaluations and the report have **not** been agreed yet.

They are not in the Oracle catalogue. The module is therefore registered **session-only**
(`rbac: false` in `config/registry/modules/hrRecruitment.module.js`). Every signed-in user
can open these pages wherever `VITE_FEATURE_HR_RECRUITMENT` shows them, and no button is
permission-gated. When the backend exists:

1. Turn the module into an RBAC module with the three resources and their actions.
2. Register the rows with `npm run db:rbac-register` under an owner-authorized plan (gate G1).
3. Gate each button with `usePermissions().can(HR_RECRUITMENT_ACTIONS.…)`.
4. Update the pinned route expectations in the navigation, registry and sidebar tests.
5. Remove `enabledBy` when the pages should always be present, or keep it and set
   `VITE_FEATURE_HR_RECRUITMENT=true` in the production build.

## Removing the demo

1. Delete `demo/`.
2. Delete `hrRecruitmentConfig.js`.
3. In `hrRecruitmentService.js`, use `apiClient` directly and remove `selectClient`,
   `hrRecruitmentDemo` and `attachmentsSupported` (or set them from real capabilities).
4. Remove `identifyDemoUser` (and its call in `shared/components/RecruitmentLoader.jsx`).
5. Remove the demo badge from `shared/components/RecruitmentShell.jsx`, and the demo
   tests from `tests/hrRecruitment.test.mjs` and `tests/hrOnboarding.test.mjs`.
