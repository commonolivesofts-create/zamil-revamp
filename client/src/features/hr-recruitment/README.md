# HR recruitment (forms 1060, 1061, 1062)

Three forms that run as one flow, under **Human resources** in the sidebar:

| Form | Route | Record route |
|---|---|---|
| Personnel Requisition (1060) | `/hr/recruitment/requisition` | `/hr/recruitment/requisition/:requisitionId` |
| Interview Assessment (1061) | `/hr/recruitment/interview` | `/hr/recruitment/interview/:assessmentId` |
| Employment Offer (1062) | `/hr/recruitment/offer` | `/hr/recruitment/offer/:offerId` |

> **Demo data.** The owner approved demo data for this feature only (an explicit,
> feature-scoped override of ZRV-FE-005) until the backend exists. No backend module,
> Oracle object or permission row exists for these forms yet.

## What is demo, and the switch

| Piece | Where | Demo or real |
|---|---|---|
| Screens, business rules, validation | `requisition/`, `interview/`, `offer/`, `shared/` | Real; unchanged when the backend arrives |
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
  `IA-2026-0001`, `OFR-2026-0001`), statuses, requester and admin manager, and waits
  350 ms per request;
- has real error paths: unknown record → **404**, change to a submitted or issued
  record → **409**, incomplete submission → **422** with details.

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

Further backend TODOs:

- **Tables.** Oracle tables for the three forms. The CI3 tables of forms 1060–1062 must be
  inspected first (gates G1 and G4).
- **Approval route.** The real route (line manager, HR manager, Finance when not budgeted,
  general manager) comes from the lookups endpoint. The frontend inserts the unbudgeted
  step before the final approval.
- **Attachments.** `POST /hr/recruitment/requisitions/{id}/attachments` needs a
  multipart upload, and the shared API client sends JSON only. Adding multipart support
  is a shared-architecture change (gate G3).
- **Signatures.** Signatures are recorded as timestamps per role (`hrManager`,
  `generalManager`, `applicant`). Who may sign which role must be enforced by the backend.

## Permissions (approved, not registered)

`hrRecruitmentActions.js` holds the approved codes:
`HR_RECRUITMENT.PERSONNEL_REQUISITIONS | INTERVIEW_ASSESSMENTS | EMPLOYMENT_OFFERS`
with `VIEW`, `CREATE`, `UPDATE`, `SUBMIT`/`ISSUE`, `PRINT`.

They are not in the Oracle catalogue. The module is therefore registered **session-only**
(`rbac: false` in `config/registry/modules/hrRecruitment.module.js`). Every signed-in user
can open these pages, in every build, and no button is permission-gated. When the
backend exists:

1. Turn the module into an RBAC module with the three resources and their actions.
2. Register the rows with `npm run db:rbac-register` under an owner-authorized plan (gate G1).
3. Gate each button with `usePermissions().can(HR_RECRUITMENT_ACTIONS.…)`.
4. Update the pinned route expectations in the navigation, registry and sidebar tests.

## Removing the demo

1. Delete `demo/`.
2. Delete `hrRecruitmentConfig.js`.
3. In `hrRecruitmentService.js`, use `apiClient` directly and remove `selectClient`,
   `hrRecruitmentDemo` and `attachmentsSupported` (or set them from real capabilities).
4. Remove the demo badge from `shared/components/RecruitmentShell.jsx`, and the demo
   tests from `tests/hrRecruitment.test.mjs`.
