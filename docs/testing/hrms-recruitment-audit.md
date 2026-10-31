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
| Orientation Training (1101) | ⚠️ (3 *fixed*) | ✅ record access and draft guard *fixed* (round 2); ⚠️ create ID conflict (§8.5) | ❌→⚠️ (2 *fixed*) | ⚠️ mock; likely 409 on TEST (§8.5) | ⚠️ mock | ⚠️ mock | ⚠️ mock; line delete needs the `MANAGE_LINES` row (§8.3) | ⚠️ none; out of scope per spec §11 | ✅ | ✅ (server-side constants per spec) |
| Probation Evaluation (1064) | ⚠️ (1 *fixed*) | ✅ record access, draft guard, update audit *fixed* (round 2); ⚠️ trusts `totalRating` | ❌→✅ (*fixed*) | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ none; out of scope per spec §11 | ✅ | ✅ |
| Periodwise Employees report | ❌ page not routed | ❌ no API | ❌ (calls nonexistent routes) | n/a (report) | ❌ | n/a | n/a | n/a | ❌ | ❌ (KPI rules in client) |

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
| M1 | `/api/v1/hr/reports/periodwise-employees` | GET | Periodwise Employees report (`PeriodwiseEmployeesPage`, `createReportService`) | Query: `department` (`ALL` or a code), `from`, `to` (YYYY-MM-DD, `to ≥ from`; otherwise 422). Response `data: { rows: [{ employeeNumber, name, birthDate\|null, nationality, nationalityCode, job, departmentCode, position, nationalId\|null, startDate, endDate\|null, leavingReason }] }`; `employeeNumber` unique. Not paginated today. For large periods, prefer server-computed KPIs plus a paged table. Needs an Oracle source (employee master and assignment history; gates G1/G4) and a permission resource |
| M1a | `/api/v1/hr/reports/periodwise-employees/lookups/departments` | GET | Department filter for M1. Replaces the large `readLookups` aggregate, which requires unrelated keys | Response `data: [{ code, name }]` |
| M2 | `/api/v1/hr/recruitment/lookups` | GET | Default `loadLookups` in `RecruitmentLoader`; only the Periodwise page uses it | Shape of `readLookups` (`hrRecruitmentContract.js:59-102`). **Recommendation:** do not build it; remove the default and use M1a |
| M3 | `/api/v1/hr/recruitment/employees` | GET | Default `searchService` in `EmployeePicker` (unused by routed pages) | `search,page,limit` → page of `{employeeId, employeeNumber, name, employmentType, startDate, section, division, position, grade, departmentName, evaluationFormCode\|null}`. **Recommendation:** remove the default |
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
