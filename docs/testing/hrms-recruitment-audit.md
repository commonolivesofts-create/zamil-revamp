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
| Orientation Training (1101) | ⚠️ (3 *fixed*) | ⚠️ (ownership, status guard) | ❌→⚠️ (2 *fixed*) | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ mock; line delete unreachable (no `MANAGE_LINES` grant) | ⚠️ none; out of scope per spec §11 | ✅ | ✅ (server-side constants per spec) |
| Probation Evaluation (1064) | ⚠️ (1 *fixed*) | ⚠️ (no update audit; trusts `totalRating`) | ❌→✅ (*fixed*) | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ mock | ⚠️ none; out of scope per spec §11 | ✅ | ✅ |
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
| M4 | `/api/v1/hr/interview-assessments/lookups/payroll-units` | GET | Interview `payroll` (`attribute3`) select currently shows raw IDs; the spec names them IPP/FPP | `data: [{ code: '300000003618177', name: 'IPP' }, …]` |
| M5 | `/api/v1/hr/requisitions/lookups/capabilities` (or an `isHr` flag on `/lookups/requestor`) | GET | Requisition ticket-status selector is shown to everyone; the backend rejects non-HR changes with 400 (`requisition.service.js:115,175`). The UI also locks Inprocess/Approved records that HR may still edit (`service.js:165-174`) | `data: { canManageTicket: boolean, canEditLocked: boolean }` |
| M6 | Workflow actions (`POST …/:id/submit`, `/approve`, `/reject`, `/return`) for 1060, 1061, 1062, 1064 | POST | No form has submit or approval in the API. The specs put this out of scope (§11), but the offer candidate list (Approved + Passed interviews) is fed only by the legacy CI3 workflow | Owner decision (see §6) |
| M7 | `HR.ORIENTATION_TRAININGS:MANAGE_LINES` permission registration | — | `DELETE /hr/orientation-trainings/:id/lines/:lineId` requires it (`orientationTraining.routes.js:59`). The client registry lists only VIEW/CREATE/UPDATE/DELETE (`hrForms.module.js:50`), so it cannot be granted. The page does not call the route yet | Add the action to the registry and register the row (gates G1/G3) |

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
| 1101 / 1064 | Joining and start dates are read as JS `Date` and then `slice(0,10)` of the UTC ISO string | `orientationTraining.repository.js:82,375`; `probationEvaluation.repository.js:331` | Possible one-day shift depending on the session time zone; needs an Oracle test |
| 1064 | Client status labels are `DRAFT/SUBMITTED`; the backend uses `DRAFT/INPROCESS/APPROVED/Rejected` | `hrRecruitmentText.js:120` | Cosmetic (the raw value is shown) |
| 1064 | The server trusts the client `totalRating` | `probationEvaluation.service.js:54-55` | The spec allows the server to recompute it; recommended |
| Periodwise | The page calls `/hr/recruitment/lookups` and `/hr/reports/periodwise-employees`, neither of which exists. A 404 renders the misleading text "form options" | `PeriodwiseEmployeesPage.jsx:42-48` | Page not routed |

### Backend findings (not contract shape)
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

1. **Periodwise report:** should `/hr/reports/periodwise-employees` keep showing the contractor `EmployeeReportPage` (the registry title is "Employee report"), with `PeriodwiseEmployeesPage` deleted? Or should M1 be built and the page routed? There is no legacy spec for the periodwise report in `docs/specs/`.
2. **Workflow:** none of the five forms has submit, approve or reject in the API (the specs put it out of scope). Interview `STATUS` is never advanced by this app, so the offer candidate list depends on CI3. Is the coexistence with CI3 intended long term?
3. **Ownership scoping** for 1101/1064 by-id routes, and whether non-Draft records may be updated (all of 1061, 1101 and 1064 allow it today).
4. **Probation update audit:** the spec table has no update-audit columns. Is that acceptable? (No DDL was proposed.)
5. **`MANAGE_LINES`** for orientation (M7): register it, or drop the route?
6. **Date handling:** request Oracle `DATE` values as strings (or `TO_CHAR`) to rule out the UTC one-day shift. `DD-Mon-YY` input and output assumes 20YY and an English month language.
7. **Stale README:** `client/src/features/hr-recruitment/README.md:95-204` should be rewritten to describe the live 1101/1064 endpoints, the `HR` RBAC module and the remaining scope of `VITE_HR_RECRUITMENT_DEMO`. I left it unchanged to keep this change focused.
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
