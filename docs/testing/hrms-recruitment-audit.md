# HRMS recruitment audit: forms 1060, 1061, 1062, 1101, 1064 and the Periodwise Employees report

- **Date:** 2026-10-31
- **Scope:** the frontend (`client/src/features/hr-recruitment/`), the backend (`server/src/modules/hr/`), the API contracts between them, CRUD behaviour, lookups and hardcoded data.
- **Method:**
  - The legacy specs (`docs/specs/README_*`) were read and compared field by field with the pages, the service mappers in `hrRecruitmentService.js`, the contract readers in `hrRecruitmentContract.js`, and the backend routes, Joi schemas, services and repositories.
  - Every finding marked as fixed or confirmed was re-checked against the source.

> **What was not executed.** No CRUD was run against Oracle. A dev backend was reachable on
> `127.0.0.1:7381`, but every HR route requires an authenticated, MFA-verified session with the
> form's RBAC grants, and no test credentials were available to this audit. No database rows were
> created, changed or deleted. The CRUD and workflow columns below are therefore based on the
> backend's **mocked** Supertest suites (repository stubbed) and on static analysis. They are not
> live round-trips. See [§7](#7-how-to-finish-the-live-crud-pass).

## 1. Status per form

Legend:
- ✅ verified OK
- ⚠️ works with caveats, or verified only with mocks
- ❌ broken or missing
- *fixed* marks something broken before this audit and fixed in it

| Form | Frontend | Backend | Contract match | Create | Read | Update | Delete | Workflow | Lookups | No hardcoded data |
|---|---|---|---|---|---|---|---|---|---|---|
| Personnel Requisition (1060) | ✅ | ✅ | ⚠️ (2 *fixed*, 2 open) | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ mock (Draft only) | ⚠️ none; out of scope per spec §11 | ✅ | ✅ (fixed DB enums) |
| Interview Assessment (1061) | ❌→*fixed* (every save returned 400) | ✅ | ❌→⚠️ (3 *fixed*, 4 open) | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ none; status set only by legacy CI3 | ⚠️ payroll BUs shown as raw IDs | ⚠️ enum constants |
| Employment Offer (1062) | ✅ | ✅ | ⚠️ (probation period ignored on PUT) | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ none; spec is CRUD only | ✅ | ✅ |
| Orientation Training (1101) | ⚠️ (3 *fixed*) | ✅ record access, draft guard (round 2); identity IDs, ISO dates (round 3) | ❌→⚠️ (2 *fixed*) | ⚠️ mock; 409 *fixed* (round 3); live pending §9.4 | ⚠️ mock | ⚠️ mock | ⚠️ mock; line delete needs the `MANAGE_LINES` grant (§9.2) | ⚠️ none; out of scope per spec §11 | ✅ | ✅ (server-side constants per spec) |
| Probation Evaluation (1064) | ⚠️ (1 *fixed*) | ✅ record access, draft guard, update audit (round 2); identity IDs (round 3); ⚠️ trusts `totalRating` | ❌→✅ (*fixed*) | ⚠️ mock; live pending §9.4 | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ none; out of scope per spec §11 | ✅ | ✅ |
| Periodwise Employees report | ✅ routed, API-driven (round 3) | ✅ built (round 3) | ✅ | n/a (report) | ⚠️ mock; live pending §9.4 and the permission row | n/a | n/a | n/a | ✅ departments lookup | ✅ rules on the server |

**Common to all forms:**
- **Permission checks:** every route has `authenticate` and `authorize(<module.resource>, action)`, and every write also has the CSRF check.
- **SQL:** every user value is a bind variable. The interpolated SQL pieces are frozen table maps, allowlisted sort and filter columns, and `ASC`/`DESC`.
- **Errors:** errors that are not `AppError` become a generic 500 (`server/src/middleware/errorHandler.js:25`), so no Oracle text or stack trace reaches the client.
- **Pagination:** list responses use the standard envelope with `pagination{page,limit,total,totalPages,hasNextPage}`. The frontend sends `page`/`pageSize`.
- **List views:** the report dialogs page through the API, but **none sends the filters or sort the backends support** (requisition, interview, offer, orientation and probation all accept search, status and date filters and sort keys).
- **Step tracks, progress rings, side cards and score gauges:** all are computed on the client from live form state, never from demo values. No form has an API-driven approval route, because no backend exposes one. See [§6](#6-open-questions-and-assumptions).

**Note on the stale feature README:** `client/src/features/hr-recruitment/README.md:95-204` still describes 1101 and 1064 as demo-only screens with no backend, in a module `hrOnboarding.module.js` that no longer exists. In fact:
- Both screens use `apiClient` against `/hr/orientation-trainings` and `/hr/probation-evaluations` (`hrRecruitmentService.js:741-742,757-758`).
- Both are RBAC resources of module `HR` (`client/src/config/registry/modules/hrForms.module.js:38-53`).
- `VITE_HR_RECRUITMENT_DEMO` now affects only `onboardingClient`, which serves the orphaned Periodwise page and two default fallbacks that every routed page overrides (see §2).

### Inventory

| Form | Page / model | Service (client) | Response reader | Demo adapter | Registry entry and switch | Backend module | Oracle objects (per spec / repository) |
|---|---|---|---|---|---|---|---|
| 1060 | `requisition/RequisitionPage.jsx`, `requisitionModel.js` | `createBackendRequisitionService`, `/hr/requisitions` | `requisitionRecord` (in service) | none (always `apiClient`) | `requisitions.module.js`, always on | `modules/hr/requisitions/` (`REQUISITIONS.REQUISITIONS`) | requisition header, `xxzp_all_attachments`, employee master |
| 1061 | `interview/InterviewPage.jsx`, `interviewModel.js`, `Scores.jsx` | `createInterviewService`, `/hr/interview-assessments` | `interviewRecord` → `readInterview` | none | `interviewAssessments.module.js`, always on | `modules/hr/interview-assessments/` (`INTERVIEW_ASSESSMENTS.INTERVIEW_ASSESSMENTS`) | interview header/spec/competency, `XXZP.XXZP_INTERVIEW_EVAL_T` |
| 1062 | `offer/OfferPage.jsx`, `offerModel.js` | `createOfferService`, `/hr/employment-offers` | `offerRecord` → `readOffer` | none | `employmentOffers.module.js`, always on | `modules/hr/employment-offers/` (`EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS`) | `XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T` and lines |
| 1101 | `orientation/OrientationPage.jsx` (`orientationModel.js` is demo-era and unused by the page) | `createOrientationService`, `/hr/orientation-trainings` | inline `readRecord` | none on the page path | `hrForms.module.js` `HR.ORIENTATION_TRAININGS`, `VITE_FEATURE_HR_RECRUITMENT` | `modules/hr/orientation-trainings/` | two header/line table pairs chosen by `flag` (`TABLES`, repository :11) |
| 1064 | `probation/ProbationPage.jsx` (`probationModel.js` is demo-era and unused by the page) | `createProbationService`, `/hr/probation-evaluations` | inline `readRecord` | none on the page path | `hrForms.module.js` `HR.PROBATION_EVALUATIONS`, `VITE_FEATURE_HR_RECRUITMENT` | `modules/hr/probation-evaluations/` | `XXZP.XXZP_PAF_PROBATION_HEADER` and lines |
| Periodwise | `report/PeriodwiseEmployeesPage.jsx`, `periodwiseModel.js`, `ReportCharts.jsx` (**not routed**) | `createReportService`, `/hr/reports/periodwise-employees` via `onboardingClient` | `readReport` | `demo/demoClient.js:295-304` (`VITE_HR_RECRUITMENT_DEMO`) | none. The URL `/hr/reports/periodwise-employees` is registered as `hr-employee-report` (`hrForms.module.js:35`) and renders **`EmployeeReportPage`**, the contractor employee report on `/hr/contractor-employees` (`client/src/app/router.jsx:129`) | **none** | none named. `docs/specs/README_employee_report_form.md` specifies the contractor report, not this one |

## 2. Hardcoded or client-side data

| File:line | What | Assessment / replacing API |
|---|---|---|
| `client/src/features/hr-recruitment/hrRecruitmentService.js:26` | `INTERVIEW_PAYROLL_BUS`: two payroll business-unit IDs, shown to users as raw IDs (`:403`) | Matches backend Joi `BU_VALUES`. Needs a labelled lookup: **missing API M4** |
| `hrRecruitmentService.js:30-34` | Interview division, interview type, marital status, certificate check and education options | Match the backend Joi enums exactly; the spec defines them as fixed values. Acceptable, but should come from a lookup if HR can change them |
| `hrRecruitmentService.js:216` | `backendOfferStatus = () => 'INCOMPLETE'` ignores `data.status` | Correct today (status is written once as `Incomplete`). It should map the real value once a workflow exists |
| `requisition/requisitionModel.js:6-13`; `RequisitionPage.jsx:~267` | Experience bands, education fields, reasons, statuses, ticket options `Open/Accepted/Close` | Fixed database values in the spec and the Joi enums. Acceptable |
| `probation/ProbationPage.jsx:137` | Rating options `1–5` | Matches Joi `valid(1..5)`. Acceptable |
| `probation/ProbationPage.jsx:110` | The ticket shows `total/100` | 100 is the Joi ceiling for `totalRating` (20 criteria × 5). Cosmetic; the actual maximum is `criteria × 5` |
| `orientation/OrientationPage.jsx:27` | Weekend days `[5,6]` | Display only |
| server `orientationTraining.validation.js:31-71`; `orientationTraining.repository.js:408-413` | `SKILLS_BY_TYPE`, plus job IDs and employee numbers inside the managers SQL | Copied from the spec (§8.5); server-side, so the client renders only API data |
| server `probationEvaluation.validation.js:28-34` | `FORM_TYPES` | Spec §8.1; served through `/lookups/form-types` |
| `report/periodwiseModel.js:8-16, 64-99, 135-143` | Retirement age 60, minimum age 16, age bands, turnover and saudization formulas, 6-year flow window, quick ranges (including `'2000-01-01'`) | Business rules held in the client. Should move to the report API (**M1**) or an approved HR-configuration source |
| `report/ReportCharts.jsx:32` | Saudi share computed by comparing nationality with a UI label | Should use a nationality code from **M1** |
| `hrRecruitmentService.js:6` | `createDemoClient` imported into the production service module | Bundled; used only by `onboardingClient` (`:758`) |
| `hrRecruitmentService.js:374, 502` | `GET /hr/recruitment/lookups`, `GET /hr/recruitment/employees` used as defaults by `RecruitmentLoader.jsx:18` and `EmployeePicker.jsx:22` | **Not reachable from routed pages:** every page passes its own `loadLookups` / `searchService`. Remove the defaults, or implement **M2/M3** if the Periodwise page is revived |
| `hrRecruitmentText.js:513-521`; `offerModel.js:9,24` | Offer quick picks, `benefitPicks`, `issuedStatus` | Dead code: `OfferPage` uses the API lookups |
| `orientationModel.js`, `probationModel.js` (`PASS_MARK 71`, `PROBATION_MONTHS 3`, `SESSION_KEYS`); `hrRecruitmentContract.js` `readOrientation` / `readProbation` | Demo-era rules and readers | Used only by the demo adapter and tests. Not in any spec |

No `localStorage` or `sessionStorage` use was found in `features/hr-recruitment`.

## 3. Missing APIs

None of these exist. I did not create them (that needs owner approval).

| # | Endpoint | Method | Purpose / consumer | Suggested request → response |
|---|---|---|---|---|
| M1 (**done**, round 3) | `/api/v1/hr/reports/periodwise-employees` | GET | Periodwise Employees report (`PeriodwiseEmployeesPage`, `createReportService`) | Query: `department` (`ALL` or a code), `from`, `to` (YYYY-MM-DD, `to ≥ from`; otherwise 422). Response `data: { rows: [{ employeeNumber, name, birthDate\|null, nationality, nationalityCode, job, departmentCode, position, nationalId\|null, startDate, endDate\|null, leavingReason }] }`; `employeeNumber` unique. Not paginated today. For large periods, prefer server-computed KPIs plus a paged table. Needs an Oracle source (employee master and assignment history; gates G1/G4) and a permission resource |
| M1a (**done**, round 3) | `/api/v1/hr/reports/periodwise-employees/lookups/departments` | GET | Department filter for M1. Replaces the large `readLookups` aggregate, which requires unrelated keys | Response `data: [{ code, name }]` |
| M2 (**not needed**; default and service removed) | `/api/v1/hr/recruitment/lookups` | GET | Default `loadLookups` in `RecruitmentLoader`; only the Periodwise page uses it | Shape of `readLookups` (`hrRecruitmentContract.js:59-102`). **Recommendation:** do not build it; remove the default and use M1a |
| M3 (**not needed**; default and service removed) | `/api/v1/hr/recruitment/employees` | GET | Default `searchService` in `EmployeePicker` (unused by routed pages) | `search,page,limit` → page of `{employeeId, employeeNumber, name, employmentType, startDate, section, division, position, grade, departmentName, evaluationFormCode\|null}`. **Recommendation:** remove the default |
| M4 (**done**, round 2) | `/api/v1/hr/interview-assessments/lookups/payroll-units` | GET | Interview `payroll` (`attribute3`) select currently shows raw IDs; the spec names them IPP/FPP | `data: [{ code: '300000003618177', name: 'IPP' }, …]` |
| M5 (**done** as `canManageTicket` only, round 2) | `/api/v1/hr/requisitions/lookups/capabilities` | GET | Requisition ticket-status selector is shown to everyone; the backend rejects non-HR changes with 400 (`requisition.service.js:115,175`). The UI also locks Inprocess/Approved records that HR may still edit (`service.js:165-174`) | `data: { canManageTicket: boolean, canEditLocked: boolean }` |
| M6 | Workflow actions (`POST …/:id/submit`, `/approve`, `/reject`, `/return`) for 1060, 1061, 1062, 1064 | POST | No form has submit or approval in the API. The specs put this out of scope (§11), but the offer candidate list (Approved + Passed interviews) is fed only by the legacy CI3 workflow | Owner decision (see §6) |
| M7 (code **done**, Oracle row blocked; §8.3) | `HR.ORIENTATION_TRAININGS:MANAGE_LINES` permission registration | — | `DELETE /hr/orientation-trainings/:id/lines/:lineId` requires it (`orientationTraining.routes.js:59`). The client registry lists only VIEW/CREATE/UPDATE/DELETE (`hrForms.module.js:50`), so it cannot be granted. The page does not call the route yet | Add the action to the registry and register the row (gates G1/G3) |

## 4. Contract mismatches between frontend and backend

### Fixed in this audit
See §5. In short:
- Interview `positionName` was always empty, so every save returned 400.
- Interview `adminManager` was mapped from the wrong key.
- Interview `managingDirector` and `hrRep` were dropped on read and blanked on update.
- Interview remark limits were 1000 in the UI against 500 in Joi.
- A blank probation rating was sent as `0`, which Joi rejects.
- A stored probation rating of `0` was read in a way that blocked re-saving.
- Orientation sent an empty `startDate`, which Joi rejects.
- Orientation re-sent a stale `orientationPeriod`, so the backend never recomputed it.
- The orientation lookup abort signal was lost.
- The requisition list date (`DD-Mon-YY`) could not be parsed.
- The requisition budget lookup failed on untrimmed names.

### Still open

| Form | Mismatch | File:line | Effect |
|---|---|---|---|
| 1061 | `age` and `relevantYearsExperience`: the UI allows decimals (`inputMode=decimal`); Joi requires integers | `interviewModel.js:29,38`; `interviewAssessment.validation.js` | 25.5 → 400 with a server message |
| 1061 | Requisition no., nationality, location and major: UI `maxLength 200`; Joi max 100 | `InterviewPage.jsx:134` (generic for all text fields) | Text of 101–200 characters → 400 |
| 1061 | `payroll` is not in `validateInterview`; the service throws on save instead | `hrRecruitmentService.js:158`; `interviewModel.js:~133` | The error appears late, not on the field |
| 1061 | An unlinked requisition leaves `position` as `''`, so the save still returns 400 on `positionName` | `InterviewPage.jsx:58-59` | Needs a client-side "requisition must be approved/linked" message |
| 1061 | `companyName` is always overwritten with `currentEmployer` | `hrRecruitmentService.js:166-167` | The legacy `COMPANY_NAME` value is lost on update (the spec treats them as separate fields) |
| 1061 | The UI has no HR-representative input (spec §1.4 `hr_mgr`) | `InterviewPage.jsx` | The value now round-trips unchanged but cannot be edited |
| 1061 | The client lock checks `SUBMITTED`; the backend uses Incomplete/Inprocess/Approved/Rejected. The backend PUT has no status guard | `interviewModel.js:47` | Approved assessments stay editable |
| 1061 | The list maps `creationDate` to `updatedAt`. If it is null, `instant('')` throws and the whole list fails | `hrRecruitmentService.js:202` | Possible with legacy rows; not verified |
| 1061 | Backend `SELECT DISTINCT … ORDER BY INV.INTERVIEW_DATE`, with only the `TO_CHAR` form selected | `interviewAssessment.repository.js:367-370` | Likely ORA-01791 when that sort is requested (the frontend never sends it). Needs an Oracle run |
| 1062 | The probationary period can be edited, but the PUT's MATCHED branch never writes it (spec §5, by design) | `employmentOffer.repository.js:208-228` | A silent no-op on update. Make the field read-only on saved offers |
| 1062 | The list uses `lastUpdateDate \|\| creationDate`; if both are null, `instant()` throws | `hrRecruitmentService.js:249` | The same list-failure risk |
| 1060 | The ticket-status selector is visible to non-HR users; the UI locks Inprocess/Approved records that HR may edit | `RequisitionPage.jsx:~265`; `requisitionModel.js:13` | Needs **M5** |
| 1060 | If the follow-up GET fails after a successful POST, the new ID is lost; saving again creates a duplicate | `hrRecruitmentService.js:338-343` | Design change: report the created ID before the re-read |
| 1060 | Legacy rows with `gccExp`/`workExp = '0'` (spec §1.1) fail the Joi enum on re-save | `requisition.validation.js:22` | Depends on the data; not verified |
| 1101 | Null employee fields (section, division, …) become `''`; Joi `requiredText` → 400 with no client-side hint | `hrRecruitmentService.js:575-576`; `orientationTraining.validation.js:114-120` | Depends on the employee master data |
| 1101 / 1064 | Joining and start dates are read as JS `Date` and then `slice(0,10)` of the UTC ISO string | `orientationTraining.repository.js:82,375`; `probationEvaluation.repository.js:331` | **Confirmed and fixed in round 2 (§8.4)** |
| 1064 | Client status labels are `DRAFT/SUBMITTED`; the backend uses `DRAFT/INPROCESS/APPROVED/Rejected` | `hrRecruitmentText.js:120` | Cosmetic (the raw value is shown) |
| 1064 | The server trusts the client `totalRating` | `probationEvaluation.service.js:54-55` | The spec allows the server to recompute it; recommended |
| Periodwise | The page calls `/hr/recruitment/lookups` and `/hr/reports/periodwise-employees`, neither of which exists. A 404 renders the misleading text "form options" | `PeriodwiseEmployeesPage.jsx:42-48` | Page not routed |

### Backend findings (not contract shape)

> Round 2 (§8) fixed the ownership check, the status guard, the probation update audit and the
> joining-date shift. The `MAX(id)+1` finding is superseded by §8.5. The bullets below are the
> original round 1 findings.

- **No ownership check on by-id routes (1101, 1064):** `GET`/`PUT`/`DELETE /:headerId` have no ownership check (`orientationTraining.service.js:156,166,194`; `probationEvaluation.service.js:136,140,160`). The list is scoped to the creator, but a non-HR user holding VIEW/UPDATE can open or edit any ID. Requisitions return 404 out of scope (`requisition.service.js:43-57`).
- **No status guard on update (1101, 1064; also `removeLine`).** Only delete checks the status.
- **No audit fields on probation update:** the controller does not pass `req.auth` and the update writes no `LAST_UPDATED_*` columns. 1060, 1061, 1062 and 1101 do set them.
- **`MAX(id)+1` ID generation** in 1060, 1061, 1101, 1064 and contractor employees (e.g. `orientationTraining.repository.js:113`, `probationEvaluation.repository.js:42`, `interviewAssessment.repository.js:28`, `requisition.repository.js:79`). Concurrent inserts can collide. It probably mirrors CI3 for coexistence (G4).
- **Unvalidated salary exposure:** the requisition budget lookup returns `BASIC_SALARY` for any full name to any VIEW holder (`requisition.repository.js:526-535`). This follows spec §8.5; it needs a security review.

## 5. Fixes made

All fixes are frontend mapping or wiring changes. There were no backend, schema, registry or flag changes. `VITE_FEATURE_*` and `VITE_HR_RECRUITMENT_DEMO` behave as before.

| # | File | Change | Reason |
|---|---|---|---|
| F1 | `client/src/features/hr-recruitment/interview/InterviewPage.jsx` (`saveRecord`) | Pass `positionTitle: position` with `interviewPayload(form)` | `interviewPayload` never included the position, so `positionName` was `''` and Joi `requiredText` rejected **every** create and update with 400 |
| F2 | `hrRecruitmentService.js` (`backendInterviewPayload`) | `evaluation.adminManager` now reads `body.adminManagerName` (falling back to `adminManager`) | The model sends `adminManagerName`; the service read `adminManager`, so the stored value was overwritten with `'-'` on every save |
| F3 | `hrRecruitmentContract.js` (`readInterview`) | Keep `managingDirector` and `hrRepresentative` | The reader dropped them, so the form refilled them as `''` and the update overwrote the stored values |
| F4 | `interview/InterviewPage.jsx` | Remark, competency remark and HR comment `maxLength` 1000 → 500 | Joi caps `remarks`, `cRemarks` and `comment` at 500 |
| F5 | `hrRecruitmentService.js` (`createProbationService.save`) | Omit `rating` for unrated criteria instead of sending `0` | Joi `valid(1..5).default(0)` rejects an explicit `0`, so any draft with an unrated criterion returned 400 |
| F6 | `hrRecruitmentService.js` (`createProbationService` reader) | A stored rating of `0` is read as `''` (not rated) | Otherwise the page's own validation (1–5 or blank) blocked saving any record with a legacy zero |
| F7 | `hrRecruitmentService.js` (`createOrientationService.save`) | Send `startDate` only when known | Joi `isoDate` rejects `''`; employees without a joining date could not be scheduled |
| F8 | `hrRecruitmentService.js` (`createOrientationService.save`) | Always send `orientationPeriod: ''` | The server computes the period from the times only when it is blank. Re-sending the stored value meant edited times never updated the hours |
| F9 | `orientation/OrientationPage.jsx` | `loadLookups={(signal) => service.getLookups({ signal })}` | `useResource` passes an `AbortSignal`, and `getLookups({ signal })` destructured it to `undefined`, so lookups were never cancelled on navigation |
| F10 | `hrRecruitmentService.js` (requisition `list`) | `updatedAt: lastUpdateDate ?? legacyDate(creationDate)` | `CREATION_DATE` arrives as `DD-Mon-YY`, which `Date` does not parse reliably, so the "updated" column broke for rows never updated |
| F11 | `requisition/RequisitionPage.jsx` | Trim the replacement name before the budget lookup | The backend trims and echoes the name; the client then rejected the response as "unexpected" when the name had surrounding spaces |

### Tests
- **New:** `client/tests/hrRecruitmentAudit.test.mjs` has 8 tests with a mocked client. They pin F1–F11 and cover lookup loading for 1064 and 1101, including abort-signal propagation.
- **Updated:** `client/tests/hrOnboarding.test.mjs:237`. It pinned the old `loadLookups={service.getLookups}` wiring and now pins F9.
- **Already present:** the demo adapter's parity with the contract readers is covered by `client/tests/hrOnboarding.test.mjs` (the demo client is run through `readReport` / `readLookups`). Lookup loading for 1060 is covered in `client/tests/hrRecruitment.test.mjs:97`. **Gap:** interview and offer `getLookups` (including the `allSettled` → `lookupErrors` path) have no dedicated test yet.

**Executed (2026-10-31):**
- `node --test tests/hrRecruitment.test.mjs tests/hrOnboarding.test.mjs tests/hrSharedComponents.test.mjs tests/hrRecruitmentAudit.test.mjs tests/registry.test.mjs tests/routing.test.mjs`: **68/68 pass**.
- `npx eslint src/features/hr-recruitment` plus the two test files: clean.
- `vite build` (output to a temporary directory): succeeds.
- Backend, mocked (unchanged by this audit): `node --import ./tests/setup.js --test` for the requisitions, interview-assessments, employment-offers, orientation-trainings, probation-evaluations and contractor-employees tests: **131/131 pass**.
- Not run: the full client or server suites, any Oracle integration test, any live API call.

## 6. Open questions and assumptions

1. **Decided in round 2: build M1 and route the page (§8.2); the SQL is waiting for approval.** **Periodwise report:** should `/hr/reports/periodwise-employees` keep showing the contractor `EmployeeReportPage` (the registry title is "Employee report"), with `PeriodwiseEmployeesPage` deleted? Or should M1 be built and the page routed? There is no legacy spec for the periodwise report in `docs/specs/`.
2. **Workflow:** none of the five forms has submit, approve or reject in the API (the specs put it out of scope). Interview `STATUS` is never advanced by this app, so the offer candidate list depends on CI3. Is the coexistence with CI3 intended long term?
3. **Resolved in round 2 (§8.1, §8.2).** **Ownership scoping** for 1101/1064 by-id routes, and whether non-Draft records may be updated (all of 1061, 1101 and 1064 allow it today).
4. **Resolved in round 2:** the deployed table has `UPDATED_AT`/`UPDATED_BY` (the spec omitted them); updates now set them.
5. **Resolved in code in round 2; the Oracle row is blocked (§8.3).** **`MANAGE_LINES`** for orientation (M7): register it, or drop the route?
6. **Resolved in round 2 (§8.4).** **Date handling:** request Oracle `DATE` values as strings (or `TO_CHAR`) to rule out the UTC one-day shift. `DD-Mon-YY` input and output assumes 20YY and an English month language.
7. **Resolved in round 2:** the README was rewritten (§8.7).
8. **Assumption:** the demo adapter is still wanted for the Periodwise page only. It was left intact.
9. **Repository checklist:** no "form testing checklist" exists in the repository, so no checklist rows were updated.

## 7. How to finish the live CRUD pass

This needs a dev or UAT account with MFA and the `REQUISITIONS`, `INTERVIEW_ASSESSMENTS`, `EMPLOYMENT_OFFERS`, `HR.ORIENTATION_TRAININGS` and `HR.PROBATION_EVALUATIONS` grants, and explicit owner authorization for writes in that run. For each form:
1. Create a record using fictional values ("Test Applicant A").
2. Re-open it and compare every field, including dates, numbers, lookups and attachments.
3. Edit it and confirm `LAST_UPDATED_BY` / `LAST_UPDATE_DATE`.
4. Delete it, which allows Draft only for 1060.
5. Run the negative cases: a missing required field (400), an out-of-range rating (400), and a user without the grant (403).
6. Delete every record created.

For orientation, also verify F7 and F8 against Oracle. For 1101 and 1064, check the joining date for the one-day shift.

## 8. Round 2 follow-up (2026-10-31)

Work is on branch `docs/hrms-recruitment-audit`, created from `main` after `git pull --ff-only`
(`4477cf7`).

**Commit blocked:** the round 1 commit could not be created. The repository has no Git identity
(`user.name`/`user.email` unset), and the project rules forbid changing Git configuration or
choosing an author. The round 1 files are staged and nothing is committed.

**Oracle access in this round:** read-only, against the `ZPADWTEST` test database. I queried only
dictionary metadata (`ALL_TAB_COLUMNS`, `ALL_TAB_IDENTITY_COLS`, `ALL_SEQUENCES`, `ALL_TRIGGERS`,
constraints), row counts, `MAX(id)` aggregates and one literal-date probe. No employee values were
read or printed, and nothing was written.

### 8.1 Record access, draft guard and audit (Orientation 1101, Probation 1064): done

**Access rule** for read, update and delete by ID (and orientation's line delete). Access is allowed for:
1. the creator (`CREATED_BY`);
2. an HR user, using each module's existing `XXZP_HR` lookup check (the same check that already widens the lists);
3. a user whose current `XX_DIGI_EMP_MASTER.ORGANIZATION_ID` equals the record employee's **and** who holds the resource's `VIEW` permission. This is checked through `authorizationService.holds`, the same injection `employeeClearanceService` uses.

Anyone else gets `403 FORBIDDEN` in the standard error envelope. Unknown IDs remain 404. No role or permission was invented. I applied the rule to delete as well, because it is the same by-ID gap.

**Draft guard:**
- An update (and an orientation line delete) of a non-draft record returns `409 ORIENTATION_TRAINING_NOT_DRAFT` or `409 PROBATION_EVALUATION_NOT_DRAFT`.
- The guard runs after the access check, so the status of other people's records is not revealed.

**Audit:**
- The deployed `XXZP_PAF_PROBATION_HEADER` has `UPDATED_AT`/`UPDATED_BY` (the spec omits them), and probation updates now set `UPDATED_AT = SYSDATE, UPDATED_BY = <user>`.
- Orientation already set `LAST_UPDATED_BY`/`LAST_UPDATE_DATE`.

**Files changed:**
- `orientationTraining.service.js`, `.repository.js` (adds `isSameDepartment`; removes the now-unused `findStatus`) and `.controller.js`.
- `probationEvaluation.service.js`, `.repository.js` (adds `findAccessFacts` and `isSameDepartment`; removes `findHeaderStatus`; adds the audit columns) and `.controller.js`.
- `server/src/routes/api.routes.js` (injects `holds`).
- The two fake repositories and the OpenAPI descriptions, with new 409 responses.

**Tests** (mocked, `server/tests/orientation-trainings.test.js` and `probation-evaluations.test.js`):
- Another user's ID returns 403 on GET, PUT, DELETE (and line DELETE).
- The owner and same-department `VIEW` holders are allowed. An explicit `DENY` of `VIEW` removes department access.
- A non-draft edit returns 409 and leaves the record unchanged.
- `UPDATED_BY`/`UPDATED_AT` are set.

### 8.2 Periodwise Employees report: waiting for your approval of the Oracle source

**Done:**
- The unused `RecruitmentLoader` default (`/hr/recruitment/lookups`) and `EmployeePicker` default (`/hr/recruitment/employees`) were removed. Both props are now required.
- `createEmployeeService` and its demo handler were removed.

**Not started** (per your instruction to wait for an OK on the tables): the SQL, the endpoint, the menu change and the page wiring.

**Proposed Oracle sources** (all `XXZP`, read-only, bind variables only):

| Object | Use | Columns | Verified facts |
|---|---|---|---|
| `XX_DIGI_EMP_MASTER` (table) | Report rows | `EMPLOYEE_NUMBER`, `FULL_NAME`, `DATE_OF_BIRTH`, `NATIONALITY`, `NATIONAL_IDENTIFIER`, `JOB_TITLE`, `POSITION_NAME`, `ORGANIZATION_ID`, `DEPARTMENT`, `JOINING_DATE`, `TERMINATION_DATE`, `CURRENT_EMP_FLAG`, `PERSON_ID` | One row per employee number. TEST holds 147 current and 15 former employees; every former employee has a `TERMINATION_DATE`. `JOINING_DATE` has no time part. 27 departments |
| `XX_DIGI_PERSON_INFO` (table) | Leaving reason | `PERSON_ID`, `LEAVING_REASON`, `ACTUAL_TERMINATION_DATE`, `EFFECTIVE_START_DATE`, `EFFECTIVE_END_DATE` | Joined on `PERSON_ID`, latest effective row |
| Departments lookup, option 1 (recommended) | `SELECT DISTINCT ORGANIZATION_ID, DEPARTMENT FROM XX_DIGI_EMP_MASTER` | — | Matches the rows' own department values |
| Departments lookup, option 2 | `XX_DIGI_DEPT_MASTER` (`ORGANIZATION_ID` VARCHAR2, `NAME`, `STATUS`, effective dates) | — | Its `ORGANIZATION_ID` is VARCHAR2, while the employee master's is NUMBER |
| Optional: department history | `XX_DIGI_ASSIGNMENT_INFO` (`PERSON_ID`, `ORGANIZATION_ID`, `EFFECTIVE_START_DATE`, `EFFECTIVE_END_DATE`) | — | Needed only if "attached to the department **at any point** in the period" must use history. The employee master holds the current (or last) department only |

**Planned query** (option 1, current department):

```sql
SELECT e.EMPLOYEE_NUMBER, e.FULL_NAME,
       TO_CHAR(e.DATE_OF_BIRTH, 'YYYY-MM-DD') AS BIRTH_DATE, e.NATIONALITY,
       e.JOB_TITLE, e.POSITION_NAME, e.ORGANIZATION_ID, e.DEPARTMENT,
       CASE WHEN e.NATIONAL_IDENTIFIER IS NULL THEN 'N' ELSE 'Y' END AS HAS_NATIONAL_ID,
       TO_CHAR(e.JOINING_DATE, 'YYYY-MM-DD') AS START_DATE,
       TO_CHAR(e.TERMINATION_DATE, 'YYYY-MM-DD') AS END_DATE,
       (SELECT MAX(p.LEAVING_REASON) KEEP (DENSE_RANK LAST ORDER BY p.EFFECTIVE_START_DATE)
          FROM XX_DIGI_PERSON_INFO p WHERE p.PERSON_ID = e.PERSON_ID) AS LEAVING_REASON
  FROM XX_DIGI_EMP_MASTER e
 WHERE e.JOINING_DATE <= TO_DATE(:dateTo, 'YYYY-MM-DD')
   AND (e.TERMINATION_DATE IS NULL OR e.TERMINATION_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD'))
   AND (:department = 'ALL' OR e.ORGANIZATION_ID = :department)
   AND (:status = 'ALL'
        OR (:status = 'ACTIVE' AND (e.TERMINATION_DATE IS NULL OR e.TERMINATION_DATE > TO_DATE(:dateTo, 'YYYY-MM-DD')))
        OR (:status = 'LEFT' AND e.TERMINATION_DATE <= TO_DATE(:dateTo, 'YYYY-MM-DD')))
 ORDER BY <allowlisted column> <ASC|DESC>, e.EMPLOYEE_NUMBER
 OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
```

**Planned contract:**

`GET /api/v1/hr/reports/periodwise-employees?dateFrom&dateTo&department=ALL|<id>&status=ALL|ACTIVE|LEFT&page&pageSize&sortBy&sortDir`

- **Errors:** 400 when `dateTo < dateFrom` or a value is invalid.
- **Response:** standard paginated envelope; rows of `{ employeeNumber, name, birthDate, nationality, jobTitle, position, departmentId, departmentName, hasNationalId, startDate, endDate, leavingReason, status }`.
- **Departments lookup:** `GET /api/v1/hr/reports/periodwise-employees/lookups/departments` returns `[{ code, name }]`.

**Decisions needed with the OK:**
1. **Department rule:** use the current department (option 1), or assignment history (`XX_DIGI_ASSIGNMENT_INFO`)?
2. **Permission:** create a new resource `HR.PERIODWISE_EMPLOYEES` (`VIEW`; registry plus gate G1 registration), or reuse `HR.CONTRACTOR_EMPLOYEES:VIEW`?
3. **KPIs and charts:** the page currently derives them from **all** rows. With pagination they must come from the server. Should that be a `summary` object in the same response, or a `…/summary` endpoint?
4. **Contractor report path:** it moves from `/hr/reports/periodwise-employees` to `/hr/reports/contractor-employees` (same permission). Is that path OK?
5. **Personal data:** the plan returns `hasNationalId` instead of the national ID number, plus the birth date (for age bands). Is that acceptable?


### 8.3 Small gaps

- **Payroll units: done.**
  - `GET /hr/interview-assessments/lookups/payroll-units` returns `[{ code: '300000003618177', name: 'IPP' }, { code: '300000003618190', name: 'FPP' }]` from one server constant, which also drives the Joi `attribute3` check.
  - The spec's `APP_BU_INFO` table does not exist in ADW.
  - The page lists the units by name; the client's hardcoded IDs were removed.
- **`canManageTicket`: done.**
  - `GET /hr/requisitions/lookups/capabilities` returns `{ canManageTicket }`, using the same `XXZP_HR` check that the existing create and update enforcement uses (non-HR ticket changes still return 400 on `ticketStatus`).
  - The selector renders only when `canManageTicket` is true. If the lookup fails, the selector stays hidden.
- **`MANAGE_LINES`: code done; the Oracle row is blocked.**
  - Added to the standard action vocabulary (`client/src/config/registry/actions.js`, a shared G3 change) and to `HR.ORIENTATION_TRAININGS`.
  - The read-only preview `npm run db:rbac-register -- --target=TEST` reports `CONFLICT HR.ORIENTATION_TRAININGS`: Oracle names the resource "Orientation Training Form", the registry says "Orientation Trainings", and the descriptions differ. So `PERMISSION HR.ORIENTATION_TRAININGS:MANAGE_LINES — parent resource is in conflict`. The script never edits existing rows.
  - Eleven other HR, requisition and offer rows have the same kind of name drift: 12 conflicts in total.
  - **Your decision:** align the registry names and descriptions with Oracle, or have an administrator correct Oracle. Then run `--apply`, which needs your interactive confirmation (gate G1).

### 8.4 Joining-date shift: confirmed and fixed

**Confirmed empirically:**
- In this Node process (`Asia/Calcutta`, +05:30), `SELECT DATE '2026-01-15' FROM DUAL` arrives as a JS `Date` and serialises as `"2026-01-14T18:30:00.000Z"`.
- The client's `slice(0,10)` therefore shows **2026-01-14**.
- This affects every server east of UTC (Saudi Arabia is +03:00). The probe uses a literal date, not employee data.

**Affected:**
- orientation `findEmployeeDetails` and `listEmployees` (`JOINING_DATE`);
- probation `findEmployeeDetails` (`hire.startDate`).

Header dates were already returned as strings.

**Fix (end to end as `YYYY-MM-DD`):**
- Those selects now use `TO_CHAR(JOINING_DATE, 'YYYY-MM-DD')`.
- Orientation writes bind `TO_DATE(:x, 'YYYY-MM-DD')` instead of `'DD-Mon-YY'`. The old format turned 1999 into 2099 and depended on the session's month language.
- A missing date keeps the legacy placeholder `2000-01-01` (previously `01-JAN-00`).
- The client already reads `YYYY-MM-DD` strings unchanged.

**Test:** `server/tests/hr-date-only.test.js` runs the real repository functions against a recording connection.

### 8.5 IDs: proposal only, waiting for your approval (no schema or code change made)

**Finding (read-only dictionary):** every `MAX+1` table **already has an Oracle IDENTITY column**. Most tables also have no primary or unique key:

| Table | ID column | Identity | `MAX(id)` | Identity `LAST_NUMBER` (cache 20) | PK/UK |
|---|---|---|---|---|---|
| `XXZPI_PER_REQUISITIONS_ALL` | `REQUISITION_ID` | BY DEFAULT (`ISEQ$$_196033`) | 105020 | 105373 | none |
| `XXZP_ALL_ATTACHMENTS` | `HEADER_ID` | BY DEFAULT (`ISEQ$$_196276`) | 48573 | 48581 | none |
| `XXZP_INTERVW_ASSESMNT_HEADER_T` | `HEADER_ID` | BY DEFAULT (`ISEQ$$_196230`) | 1571 | 1590 | none |
| `XXZP_PAF_PROBATION_HEADER` | `HEADER_ID` | **ALWAYS** (`ISEQ$$_196258`) | 1023 | 1040 | none |
| `XXZP_PAF_PROBATION_LINES` | `LINE_ID` | **ALWAYS** (`ISEQ$$_196260`) | 1059 | 1060 | none |
| `XXZP_NEW_HIRETRAINING_SS_HDR_T` | `HEADER_ID` | BY DEFAULT (`ISEQ$$_196223`) | **38** | **1100** | none |
| `XXZP_NEW_HIRETRAIN_PROD_HDR_T` | `HEADER_ID` | BY DEFAULT (`ISEQ$$_194023`) | 1021 | 1041 | PK |
| `XXZP_NEW_HIRETRAIN_SS_LINE_T` | `DEP_LINE_ID` | BY DEFAULT (`ISEQ$$_196225`) | 148 | 1221 | none |
| `XXZP_NEW_HIRETRA_PROD_LINES_T` | `DEP_LINE_ID` | BY DEFAULT (`ISEQ$$_194026`) | 83 | 99 | PK |
| `XXZP_EMPLOYMENT_OFFER_HEADER_T` (reference) | `HEADER_ID` | ALWAYS | 1020 | 1040 | none |

**Probable live defect:**
- Probation and orientation **do not insert the ID**. They predict `MAX+1`, let the identity assign the real value, read it back by UUID, and return `409 *_ID_CONFLICT` when the two differ (`probationEvaluation.service.js` and `orientationTraining.service.js`, `create`).
- **Shared-services orientation (`MAX` 38, identity at ≥1081):** the values can never match, so **every** shared-services orientation create on TEST should currently fail with 409.
- **Probation and production orientation:** these work only while the identity cache happens to sit just above `MAX`. Any cache loss (an instance restart) breaks them permanently, because failed inserts roll back while the identity keeps advancing.
- I did not reproduce this with a write; that needs your authorization for a test-record run.

**Option A (recommended): use the existing identity columns. Code only, no DDL.**
- **Probation** (header and lines, `ALWAYS`) and **orientation** headers: delete `generateHeaderId` and the `*_ID_CONFLICT` check; keep the UUID read-back (or use `RETURNING … INTO`).
- **Orientation lines** (`DEP_LINE_ID`) and **interview, requisition and attachment** IDs: stop sending the ID and read it back.
- **Employment Offer** already works this way.
- **Safe today:** in every BY DEFAULT table, `LAST_NUMBER` is greater than `MAX`, so identity values cannot collide with existing rows.
- **Coexistence (G4):** if CI3 keeps inserting explicit `MAX+1` (or requisition `MAX+20`) IDs into the BY DEFAULT tables, those values can later collide with identity values. CI3 must also omit the ID, or the two must use disjoint ranges.
- **Rollback:** revert the code. Nothing in the database changes.

**Option B (as requested): named sequences.**
- Not possible for the `ALWAYS` identity tables (probation header and lines, offer) without dropping the identity, so A applies there.
- For the BY DEFAULT tables and the orientation flag registry (run by the schema owner under G1):

```sql
-- Migration (XXZP). Each sequence starts above both the table maximum and the identity high-water
-- mark. Re-read ALL_SEQUENCES.LAST_NUMBER immediately before running; the figures below are this
-- audit's readings.
DECLARE
  PROCEDURE make(p_seq VARCHAR2, p_table VARCHAR2, p_col VARCHAR2, p_identity NUMBER,
                 p_step NUMBER DEFAULT 1) IS
    n NUMBER;
  BEGIN
    EXECUTE IMMEDIATE 'SELECT NVL(MAX(' || p_col || '), 0) FROM XXZP.' || p_table INTO n;
    EXECUTE IMMEDIATE 'CREATE SEQUENCE XXZP.' || p_seq || ' START WITH '
      || (GREATEST(n, p_identity) + p_step) || ' INCREMENT BY ' || p_step || ' NOCACHE NOCYCLE';
  END;
BEGIN
  make('XXZP_PER_REQUISITIONS_S',     'XXZPI_PER_REQUISITIONS_ALL',     'REQUISITION_ID', 105373, 20);
  make('XXZP_ALL_ATTACHMENTS_S',      'XXZP_ALL_ATTACHMENTS',           'HEADER_ID',      48581);
  make('XXZP_INTERVW_ASSESMNT_HDR_S', 'XXZP_INTERVW_ASSESMNT_HEADER_T', 'HEADER_ID',      1590);
  make('XXZP_NHT_SS_HDR_S',           'XXZP_NEW_HIRETRAINING_SS_HDR_T', 'HEADER_ID',      1100);
  make('XXZP_NHT_PROD_HDR_S',         'XXZP_NEW_HIRETRAIN_PROD_HDR_T',  'HEADER_ID',      1041);
  make('XXZP_NHT_SS_LINE_S',          'XXZP_NEW_HIRETRAIN_SS_LINE_T',   'DEP_LINE_ID',    1221);
  make('XXZP_NHT_PROD_LINE_S',        'XXZP_NEW_HIRETRA_PROD_LINES_T',  'DEP_LINE_ID',    99);
  make('XXZP_NHT_MASTER_FLAG_S',      'XXZP_NHT_MASTER_FLAG',           'HEADER_ID',      0);
END;
/

-- Rollback
DROP SEQUENCE XXZP.XXZP_PER_REQUISITIONS_S;
DROP SEQUENCE XXZP.XXZP_ALL_ATTACHMENTS_S;
DROP SEQUENCE XXZP.XXZP_INTERVW_ASSESMNT_HDR_S;
DROP SEQUENCE XXZP.XXZP_NHT_SS_HDR_S;
DROP SEQUENCE XXZP.XXZP_NHT_PROD_HDR_S;
DROP SEQUENCE XXZP.XXZP_NHT_SS_LINE_S;
DROP SEQUENCE XXZP.XXZP_NHT_PROD_LINE_S;
DROP SEQUENCE XXZP.XXZP_NHT_MASTER_FLAG_S;
```

- **Code change:** `SELECT XXZP.<seq>.NEXTVAL FROM DUAL` replaces each `MAX+1` query.
- **Coexistence:** the same CI3 caveat applies, and the sequences would sit beside identity generators that nothing uses.
- **Not inspected:** the `XXZP_NHT_MASTER_FLAG` identity and keys; check them before running.

**Either way (recommended, separate approval):** add unique constraints on the ID columns that have none, so a collision fails loudly instead of creating duplicates. That is DDL under G1.

### 8.6 Lookup-loading tests (Interview 1061, Employment Offer 1062): done

`client/tests/hrRecruitmentAudit.test.mjs` now covers:
- the success path for each form: every endpoint, the mapping, labelled payroll units, all six allowance types, and the abort signal;
- partial failure, with the per-lookup `lookupErrors` keys;
- `canManageTicket`, including hidden-on-failure;
- the removed loader and picker defaults.

### 8.7 README: done

`client/src/features/hr-recruitment/README.md` was rewritten. It covers the real backend for all five forms, endpoints per form, the record access and status rules, date handling, permissions, the two switches, and the unrouted Periodwise page.

### 8.8 Tests executed in round 2

- **Server** (mocked; requisitions, interview-assessments, employment-offers, orientation-trainings, probation-evaluations, contractor-employees, hr-date-only, api-docs, rbac-register): **194/194 pass**.
  - ESLint and Prettier are clean on the changed files.
- **Client:**
  - Full suite run once, because the shared action vocabulary changed: **371/371 pass**.
  - ESLint clean; `vite build` succeeds.
  - Pinned tests updated for intended changes: `catalogActions.test.mjs` (45 → 46 standard actions), `hrRecruitment.test.mjs` (requisition lookups now include `capabilities`) and `server/tests/api-docs.test.js` (the two new routes).
- **Not run:** live CRUD against Oracle, and any database write.

### 8.9 Waiting for your approval

1. **Git identity:** provide the identity to commit with. Nothing is committed yet.
2. **Periodwise SQL source and contract:** the five decisions in §8.2.
3. **ID generation:** Option A (code only, recommended), Option B (sequences, DDL), and whether to add unique constraints (§8.5).
4. **RBAC name conflicts:** how to resolve the 12 conflicts so that `MANAGE_LINES` can be registered with `--apply` (§8.3).
5. **Live CRUD run:** authorization for writes against TEST, with a dev account that has MFA and the five HR grants. This would also confirm the orientation create 409 in §8.5.

## 9. Round 3 (2026-10-31): owner decisions on §8

**Branch:** `docs/hrms-recruitment-audit`, committed and **not pushed**.
- Round 1: `345c6c3` "fix(hr-recruitment): HRMS recruitment audit + 11 fixes".
- Round 2: `6543ab7` "feat(hr-recruitment): HRMS audit round 2: record access, lookups, date fix, README".
- Your messages were kept, with the conventional-commit prefix that `CONTRIBUTING.md` requires.
- Author: `Nauman Mirza`.
- Round 3: `3071dfe` "feat(hr-recruitment): HRMS audit round 3: identity IDs, RBAC names, Periodwise report" (committed after your approval; the unrelated `.gitignore` change stays unstaged).
- RBAC target: `481e7fb` "chore(rbac): approve TEST DB_NAME for RBAC registration" (§9.2).
- §9.4 results, §10 and the HRMS-DUP-CLEAN-001 scripts are later changes and are not committed yet.

**Oracle access this round:** read-only against `ZPADWTEST`: dictionary metadata, aggregate counts, `MAX(id)`, the RBAC catalogue's names and the `rbac-register` preview. Nothing was written to Oracle.

### 9.1 IDs: Option A (identity columns): done

**Probation:**
- `insertHeader` uses `INSERT … RETURNING HEADER_ID INTO :headerId` (an out bind, as a string).
- `insertLine` no longer sends `LINE_ID`. `LINE_ID` is `GENERATED ALWAYS`, so the old code's explicit `LINE_ID` would have been rejected by Oracle (ORA-32795) on every create with lines.
- `generateHeaderId`, `findHeaderIdByUuid`, `generateLineId` and the `PROBATION_EVALUATION_ID_CONFLICT` 409 were removed (also from the OpenAPI document).

**Orientation:**
- `insertHeader` uses `RETURNING HEADER_ID INTO`.
- `insertLine` no longer sends `DEP_LINE_ID`. The old per-header `MAX+1` gave every new header line 1, which collides with the production line table's primary key on `DEP_LINE_ID`.
- `registerFlag` no longer computes `MAX(HEADER_ID)+1`; the registry's identity column (BY DEFAULT, PK) assigns it.
- `ORIENTATION_TRAINING_ID_CONFLICT` was removed.

**Tests:**
- `server/tests/hr-identity-ids.test.js`: SQL shape, the out bind, no `MAX(` and no ID helpers.
- `orientation-trainings.test.js`: a shared-service create with the identity at 1081 above `MAX` 38 returns **201, not 409**.
- `probation-evaluations.test.js`: a create with the identity above `MAX` assigns IDs 1040/1041 to the lines.
- The fake repositories now model identity columns (never reused, unaffected by rollbacks) and refuse an explicit line ID.

**Unique constraints:** `docs/db/migrations/2026-10-31-hrms-id-unique-constraints/` (change ID **HRMS-ID-UK-001**, **not applied**):
- `00-duplicate-check.sql`: read-only, run on TEST.
- `01-migration.sql`: 5 `UNIQUE` constraints, for the DBA.
- `02-rollback.sql`.
- `README.md`.

**TEST results (read-only):**
- **Clean:** probation header and lines, the shared-services orientation header and lines, and the employment offer header.
- **Blocked by duplicates:**
  - `XXZPI_PER_REQUISITIONS_ALL.REQUISITION_ID` 100800: 2 rows.
  - `XXZP_INTERVW_ASSESMNT_HEADER_T.HEADER_ID` 677: 2 rows.
  - `XXZP_ALL_ATTACHMENTS.HEADER_ID`: 3,564 IDs with exactly 2 rows each (7,201 rows), probably a duplicated load. These three need your data decision; their constraints are commented out in `01`.
- **Already keyed:** the production orientation header and lines, and the flag registry.
- **Related risk (recorded, not changed):** the two orientation header tables have separate identities, so the same header ID can later appear in both tables and make the flag registry (`FORM_HEADER_ID`) ambiguous. This does not happen today.

### 9.2 RBAC names: done; registration ready for you

**What changed:**
- The registry now matches the Oracle catalogue exactly (read on TEST): names "Personal Requisitions", "Transfer Request Form", "Personal Status Change Form", "Employee report", "Probation Evaluation Form" and "Orientation Training Form".
- No descriptions, since they are NULL in Oracle.
- Module display orders REQUISITIONS 0, INTERVIEW_ASSESSMENTS 20, EMPLOYMENT_OFFERS 0, HR 0.
- `client/tests/hrRecruitmentAudit.test.mjs` pins these values.

**Preview** (`npm run db:rbac-register -- --target=TEST`, read-only): **CONFLICT 0**, MATCH 76, UNREGISTERED 46 (Oracle-only rows; untouched), MISSING 4:
- `PERMISSION REQUISITIONS.REQUISITIONS:MANAGE_ATTACHMENTS` (was blocked by the old name conflict; the backend already requires it);
- `RESOURCE HR.PERIODWISE_EMPLOYEES`;
- `PERMISSION HR.PERIODWISE_EMPLOYEES:VIEW`;
- `PERMISSION HR.ORIENTATION_TRAININGS:MANAGE_LINES`.

**To register (you, gate G1):**
1. Approve the TEST database identity. The registration script refuses `--apply` until `APPROVED_TARGETS.TEST.dbName` in `server/scripts/lib/rbacRegistration.js` holds the approved value; it is `null` today, and `server/docs/RBAC-REGISTRATION.md` forbids guessing it. **Done in `481e7fb`** after your confirmation: `dbName: 'G480281AE328134_ZPADWTEST'`. `rbac-register.test.js` pins the value, and the refusal tests now use an explicit unconfigured target (31/31 pass). `server/docs/RBAC-REGISTRATION.md` records the approval.
2. Preview re-run after the change (read-only): `DB_NAME: G480281AE328134_ZPADWTEST (matches the approved DB_NAME)`, CONFLICT 0, MATCH 76, MISSING 4 (the same four rows), UNREGISTERED 46, **same fingerprint** `7c061a8f…c5095`.
3. Run, in an interactive terminal:
   `npm run db:rbac-register -- --target=TEST --apply --fingerprint=7c061a8fd4c0b096a63cfa6de140c8ea78e5abcc011b05fd9b137d70f89c5095`
   It asks for a typed confirmation. If the catalogue changed since this preview, the fingerprint will differ; use the new one the preview prints.
4. Grant `HR.PERIODWISE_EMPLOYEES:VIEW` (and `HR.ORIENTATION_TRAININGS:MANAGE_LINES` where wanted) to the right roles in Security Administration. Registration creates catalogue rows only, not grants.

### 9.3 Periodwise Employees report: done

- **Source:** `XX_DIGI_EMP_MASTER` (current department) and `XX_DIGI_PERSON_INFO` (leaving reason). `docs/specs` contains no legacy periodwise report and nothing pointing to department history, so I kept the current department as decided.
- **Endpoints:**
  - `GET /api/v1/hr/reports/periodwise-employees` takes `dateFrom`, `dateTo`, `department`, `status`, `search`, `nationality`, `ageBand`, `flagged`, `sortBy`, `sortDir`, `page` and `pageSize` (≤100).
  - `GET …/lookups/departments`.
  - Both require `HR.PERIODWISE_EMPLOYEES:VIEW`. Every value is a bind variable. Validation errors are 400.
- **Response:**
  - `data: { rows, summary }` with `pagination`. The summary sits inside `data` because the shared `apiClient` keeps only `data` and `pagination`; changing that shared client (G3) was not needed.
  - `summary` (KPIs, department, nationality, age-band and yearly-flow data) is computed on the server for the full scope: period, department and status.
  - Search, nationality, age band and "needs checking" narrow only the rows.
  - Rows carry `hasNationalId` and never the number; the SQL never selects it.
- **Checks on TEST data (aggregates only):** the nationality label is exactly `Saudi`. `ORGANIZATION_ID` to `DEPARTMENT` is one-to-one. 2 rows have no department and 2 no birth date (handled as null). The master holds one row per employee, 162 in total.
- **Menu:** the contractor report moved to `/hr/reports/contractor-employees` (same permission); `/hr/reports/periodwise-employees` opens the Periodwise page. Each has its own registry entry.
- **Page:**
  - It renders server rows and summary, with server sort and pages.
  - A department chart click narrows the scope; the other charts filter the table.
  - Export and Print load every filtered row with `reports.allRows`.
- **Demo adapter:** serves the same contract (numeric department codes, 400 errors), and the tests compare it with the real-client path.
- **Removed:** `createLookupService` (`/hr/recruitment/lookups`, the last unused default).
- **Docs:** handoff `docs/handoffs/FEATURE-PERIODWISE-EMPLOYEES-REPORT.md`; OpenAPI updated. `server/docs/08-IMPLEMENTATION_STATUS.md` was not changed: it tracks the platform phases and has no HR feature rows.

### 9.4 Live CRUD on TEST: script ready; not run yet

**Script:** `server/scripts/hr-live-crud.js`, run as `npm run hr:live-crud` from `server/`.

**Inputs:** `LIVE_TEST_COOKIE` and `LIVE_TEST_CSRF` in `server/.env.local`.
- All three possible `.env.local` locations are confirmed gitignored.
- The script never prints, logs or stores the values.
- `LIVE_TEST_COOKIE` accepts `name=value` or the value alone.
- `LIVE_TEST_BASE_URL` is optional.

**Refusal guards** (checked before any API request):
- both secrets set;
- the base URL is loopback;
- `NODE_ENV` is not production;
- a read-only Oracle check that the backend's configuration connects to `G480281AE328134_ZPADWTEST`;
- `GET /auth/me` accepts the session.

Verified: without `.env.local` it refuses before any request.

**Order:**
1. Orientation, starting with the **shared-services create** (the old 409 case).
2. Then Probation, Requisition, Interview, Offer, and the Periodwise read.

**Per form:**
- create, read with field round-trips (including the joining date for the day-shift fix), update with read-back;
- a read-only check that the update audit columns hold the session user (on its own records only);
- negative cases: missing or invalid fields (400), unknown ID (404), no CSRF (403), no session (401), non-HR ticket change (400);
- delete, then read (404).

**Data:**
- All free text uses the `ZZTEST` prefix.
- Probation and Offer use a fictional employee or applicant.
- Orientation must use a real shared-services employee; only that employee's ID number is printed.
- Interview uses a real approved requisition number.

**Cleanup:**
- Every created ID is recorded.
- Each record is deleted in a `finally` block, with a retry pass at the end.
- The script prints created IDs and cleanup results and exits non-zero if anything is left.

**Not testable with one session:** "another user's ID → 403" (it needs a second, non-HR account; the mocked tests in §8.1 cover it).

**Server:** the dev server on `127.0.0.1:7381` runs this branch. Its new routes answer 401 unauthenticated, and an unknown route answers 404.

**Results (2026-10-31): not run.** After your go-ahead I checked for the session values first:
- `server/.env.local` does not exist;
- no `LIVE_TEST_*` key is in `server/.env` or `client/.env` (checked by name only);
- no `.env.local` exists anywhere in the repository.

The script was **not started**, so no request was sent and no record was created; there is nothing to clean up. The one authorized run is still unused. Once the file exists, say so and I will run it once.

### 9.5 Tests executed in round 3 (2026-10-31)

- **Server:**
  - Full `npm test`: **725/725 pass** (mocked Oracle).
  - Affected suites (requisitions, interview-assessments, employment-offers, orientation-trainings, probation-evaluations, periodwise-employees, contractor-employees, hr-date-only, hr-identity-ids, api-docs, rbac-register, http-foundation): 214/214.
  - ESLint and Prettier clean on the changed files.
- **Client:**
  - Full `node --test tests/*.mjs`: **372/372 pass**.
  - `eslint src tests` clean; `vite build` succeeds.
  - Pinned tests updated for intended changes: `registry`, `navigation`, the onboarding route and switch lists, and the two report tests.
- **Not run:** the live CRUD script (`server/.env.local` was missing; §9.4).
- **After the approvals:** `rbac-register.test.js` 31/31; ESLint and Prettier clean on the two changed files.

### 9.6 Waiting for you

Updated after the round 3 approvals:
1. **Live run:** create `server/.env.local` with `LIVE_TEST_COOKIE` and `LIVE_TEST_CSRF` (it did not exist), then tell me to run `npm run hr:live-crud` once.
2. **RBAC registration:** the `DB_NAME` is set. Run the `--apply` command in §9.2 and grant the new permissions. Until then the Periodwise report and the line delete return 403 for everyone.
3. **Duplicate IDs:** see §10. The DBA reviews HRMS-DUP-CLEAN-001, and you decide on the ID generation fixes in §10.4.
4. **DBA review** of HRMS-ID-UK-001 (`01-migration.sql` / `02-rollback.sql`).

## 10. Duplicate IDs: read-only analysis (2026-10-31)

**Method:**
- Only SELECTs on `ZPADWTEST`. Each script first checks `DB_NAME`.
- Rows were compared in memory. Only column names, match flags, counts and month ranges were printed; no row value appears here or in any log.
- Nothing was written. No sequence `NEXTVAL` was taken.

### 10.1 Requisition 100800: an exact copy

| | Columns |
|---|---|
| **Differ** | none |
| **Same** (31) | `REQUISITION_ID`, `REQUISITION_NUMBER`, `REQUISITION_STATUS`, `REQUESTED_BY`, `REQUESTER_NAME`, `REQUEST_DATE`, `JOB_ID`, `JOB_NAME`, `DEPT_ID`, `DEPT_NAME`, `DATE_NEEDED`, `REASON_OF_REQ`, `REPLACEMENT_FOR`, `REASON`, `BUDGETED`, `BUDGETED_SAL`, `HIGH_SCHOOL`, `DIPLOMA`, `HIGHER_DIPLOMA`, `DEGREE`, `MASTER_DEGREE`, `GCC_EXP`, `WORK_EXP`, `SKILLS`, `OTHER`, `ATTRIBUTE1`, `CREATION_DATE` (to the second), `CREATED_BY`, `LAST_UPDATE_DATE`, `LAST_UPDATED_BY`, `LAST_UPDATE_LOGIN` |
| **Null in both** | the other 19 |

- No attachment and no interview references 100800.
- Neighbouring IDs step by both +20 and +1 (…780, …781, …800, …801, …820–…824). So more than one ID generator has written to this table.
- **Verdict:** a double insert or double load of one requisition. Deleting one copy loses nothing.

### 10.2 Interview 677: two different interviews

| | Columns |
|---|---|
| **Differ** (31) | `UUID`, `CANDIDATE_NAME`, `POSITION_NAME`, `MARITAL_STATUS`, `AGE`, `INTERVIEW_DATE`, `INTERVIEW_TIME`, `DIPLOMA_CHK`, `COLLEGE_CHK`, `LAST_POSITION_HELD`, `COMPANY_NAME`, `INTERVIEWED_BY`, `PERSONAL_SPEC_TOTAL`, `CREATED_BY`, `STATUS`. Set in one row only: `SECONDARY_EDUCATION`, `DIPLOMA`, `COLLEGE`, `MASTER_DEGREE`, `TOTAL_YEARS_EXPERIENCE`, `RELEVANT_YEARS_EXPERIENCE`, `NOT_RELEVANT_EXPERIENCE`, `PERSONAL_SPEC_RESULT`, `JOB_COMPETENCY_TOTAL`, `JOB_COMPETENCY_RESULT`, `LAST_UPDATED_BY`, `LAST_UPDATE_LOGIN`, `LAST_UPDATE_DATE`, `INTERVIEWEDBY2`, `INTERVIEWEDBY3`, `INT_NO` |
| **Same** (8) | `HEADER_ID`, `NATIONALITY`, `INTERVIEW_TYPE`, `SECONDARY_EDUCATION_CHK`, `MASTER_DEGREE_CHK`, `CREATION_DATE` (to the second), `ATTRIBUTE3`, `ATTRIBUTE4` |
| **Null in both** | 23 |

- Two users created two different candidates' interviews in the **same second**. This is the `MAX+1` race.
- One row is `Approved` and has `INT_NO`; the other is `InProcess` without one.
- **Child rows:** `XXZP_INTERVIEW_EVAL_T`, `XXZP_PERSONAL_SPEC_T` and `XXZP_JOB_COMPETENCY_T` each have 3 rows on 677. By `CREATED_BY`, 2 belong to the `Approved` interview's creator and 1 to the `InProcess` creator.
  - Child `UUID`s never match their header's `UUID` (0 matches across each whole table), so `CREATED_BY` is the only usable link.
- **Not affected:**
  - No employment offer references an `INT_NO` of 677.
  - The attachments with `FORM_HEADER_ID` 677 belong to other forms (`ECR` 2, `ETS` 4), not to the interview.
- **Effect today:** the Node read and list join the children on `HEADER_ID` alone, so both interviews show each other's children, and the list shows duplicated rows.
- **Side finding (not in the cleanup):** other interviews also have more than one child row: `EVAL` 5 headers, `PERSONAL_SPEC` 15, `JOB_COMPETENCY` 19. This needs a separate decision.

### 10.3 Attachments: the legacy history loaded twice

**Counts:**
- 7,201 rows and 3,637 distinct `HEADER_ID`s.
- 3,564 IDs have exactly 2 rows (7,128 rows); 73 IDs have one row.

**Per pair (3,564 pairs):**

| Column | Pairs with equal values |
|---|---|
| `UUID` | 3,564: null in all 7,128 rows |
| `FORM_HEADER_ID` | 3,564 |
| `FORM_NAME` | 3,564 |
| `FILE_NAME` | 3,564 |
| `ATTACHED_ON` | 120; differs in 3,444 |
| All columns | 120 pairs are byte-for-byte equal rows |

No pair disagrees on anything but `ATTACHED_ON`.

**File content hash:** not computable here.
- The table holds only `FILE_NAME`; there is no BLOB column.
- The files are in the CI3 `./attachments/` folder and the Node `server/attachments/` folder. Neither is in this workspace: `php-ci3-old-app/` is empty and `server/attachments/` does not exist.
- Both rows of every pair name the same file of the same form record, so they point to **one** physical file and the content is the same by construction.
- A hash pass on the file server would only confirm that each file exists. I can prepare the file list and a `sha256sum` command for operations if you want it.

**Dates (month ranges only):**
- The duplicated IDs run from 1 to 3,654.
- Earlier row of each pair: 2001-01 to 2025-03. Later row: 2022-03 to 2031-12.
- Gaps within a pair are 0 to 8,742 whole days, with only 43 distinct values.
- The 73 single rows are IDs 48,442–48,573, attached 2025-08 to 2025-10, across 18 forms. These are recent, normal inserts.

**Caveat:** TEST dates look masked or shifted. 488 attachment rows, 32 requisitions and 84 interviews are dated in the future (up to 2031), so the dates cannot say *when* the duplicates were made. The pattern does point to the old ID range being loaded twice in a migration or refresh rather than to user activity:
- every old ID appears exactly twice;
- each pair names the same file;
- none of the recent rows is affected.

Whether production has the same duplicates is unknown: run HRMS-ID-UK-001 `00-duplicate-check.sql` there.

**Forms affected:** the pairs span every form that uses the table, for example `ECR` 1,901, `SICKLEAVE` 618, `Requisition` 181, `ETS` 169 and `TTR-*` at least 316. The cleanup therefore touches attachments of other modules too (G4). For the 181 requisition pairs, the requisition screen lists each file twice today.

### 10.4 Can current inserts still create duplicates? Yes

**CI3:**
- I could not read the current CI3 code: `php-ci3-old-app/` is empty in this workspace.
- The specs, which cite the CI3 code, show read-then-insert IDs with no lock and no sequence:
  - requisition `NVL(MAX(REQUISITION_ID + 20), 100000)` (`models/Requisition_model.php:583`);
  - attachments `NVL(MAX(HEADER_ID)+1, 1)` per row (`:626-635`);
  - interview `NVL(MAX(HEADER_ID + 1), 636)`.
- Someone with access to the CI3 code should confirm that it still does this.

**Oracle (TEST dictionary):** none of the three tables has a primary key, unique key, unique index or trigger. Nothing stops a duplicate, so two concurrent saves or a double submit still store one. Interview 677 is exactly that case.

**Node backend:** it uses the same pattern, kept in round 1 for legacy parity:
- `requisition.repository.js` `generateRequisitionId` (`MAX+20`) and `generateAttachmentId` (`MAX+1`);
- `interviewAssessment.repository.js` (`MAX+1`);
- also `personalStatusChange.repository.js` (`MAX+1`), outside this audit.

**Mixed generators on `XXZP_ALL_ATTACHMENTS`:**
- Sick leave inserts through the identity: `LAST_NUMBER` 48,581, cache 20.
- CI3 and the Node requisition API use `MAX+1`; `MAX` is 48,573.
- When a `MAX+1` writer takes a value that the identity still holds in its cache, the identity later hands out the same value again, which creates a duplicate.
- Requisitions (identity 105,373 vs `MAX` 105,020) and interviews (1,590 vs 1,571) carry the same risk as soon as anything uses their identity.

**Recommendation (nothing below is changed yet):**
1. **Clean up** with HRMS-DUP-CLEAN-001 (§10.5).
2. **Add the three `UNIQUE` constraints straight after**, by uncommenting them in HRMS-ID-UK-001 `01-migration.sql`.
   - A race then fails with `ORA-00001` for CI3 and Node alike, instead of being stored.
   - CI3 users would see an error when a race happens (G4 decision).
3. **Switch the Node requisition, interview and requisition-attachment inserts to the identity column with `RETURNING`**, as done for Probation and Orientation in §9.1. This needs your approval because it changes legacy-parity behaviour:
   - requisition numbers would step by 1 instead of 20;
   - `INT_NO` embeds the interview ID.
4. **CI3:** move to the identity or a sequence, or retire these screens.
   - Until then the constraint is the only guard.
   - CI3's `MAX+20` can land on values the identity hands out later. The Node insert would then get `ORA-00001` and needs a retry.

### 10.5 Cleanup plan for the DBA: HRMS-DUP-CLEAN-001 (not applied)

Location: `docs/db/migrations/2026-10-31-hrms-duplicate-cleanup/`.

| File | What it does |
|---|---|
| `00-precheck.sql` | Read-only. Expected values are in the comments. **Run on TEST today: every value matched.** |
| `01-backup.sql` | `XXZP_DUPFIX_*` backup tables (CTAS) of every touched row, and the interview ID map |
| `02-cleanup.sql` | One PL/SQL block, **no commit**:<br>• delete one copy of requisition 100800;<br>• move the `InProcess` interview and its 3 children (`CREATED_BY`) from 677 to a new ID from the identity sequence;<br>• keep the earliest `ATTACHED_ON` row of each agreeing attachment pair and delete the other (3,564 rows).<br>Every step checks its row count and raises if it is off. |
| `03-verify.sql` | Same-session checks before `COMMIT` |
| `04-rollback.sql` | Restores from the backup tables after a commit. Drop the unique constraints first if they were added. |

- Only `00` was executed. `01`–`04` were reviewed but not run anywhere.
- The DBA should confirm on TEST that the owner may select `NEXTVAL` from the interview identity's `ISEQ$$_…` sequence; the README gives the fallback.
- Production needs its own precheck first.
