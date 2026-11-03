# Feature handoff — Probation Evaluation (1064) legacy parity

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Probation Evaluation legacy parity (first batch) |
| Business purpose | Bring the new Probation Evaluation form closer to the legacy CI3 behaviour. This batch covers the joining date, the evaluation result, the list columns, the status filter, the employee-list exclusion and the submit rules. |
| Business owner | Project owner (HR forms) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Partially implemented: workflow and per-type criteria are not started (see §12) |
| Replaces CI3 feature | `Probation` / `ProbationFlow` controllers (form code 1064) |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `test/probation-legacy-comparison` |
| Commit(s) | See `git log main..test/probation-legacy-comparison`: comparison + parity tests; credential redaction; this parity batch |
| Pull Request | Not opened (not pushed) |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Status filter accepts the values legacy stores (`DRAFT`, `INPROCESS`, `APPROVED`, `REJECTED`) and rejects other casings | Yes | `probation-legacy-parity.test.js` › "filters the list by the four statuses the legacy form stores" |
| 2 | FORM_DATE = joining date, read-only "Joining date", auto-filled from the employee, optional; dates as `YYYY-MM-DD` | Yes | server: "keeps FORM_DATE optional…", "stores a blank joining date…", "binds and selects every probation date as YYYY-MM-DD…"; client: "FORM_DATE is the joining date…", "the joining date is sent when known…" |
| 3 | Created date shown where a form date was shown (ticket, list) | Yes | client: "a blank joining date … the created date is kept", "the records list shows … the created date" |
| 4 | Evaluation result: Acceptable 71+, Not acceptable 70 and below, on the form, side card and list | Yes | server: "derives Acceptable from 71…", "returns … the evaluation result and pending-at in list rows"; client: "the result band is computed…", "the page shows the result…" |
| 5 | List: employee number, department, evaluation result, pending-at (null until the workflow exists), from the API only | Yes | server and client list tests above |
| 6 | Comments, Suggestion and every rating required on submit, not on draft save | Yes (function only; no Submit yet) | server: "submit rules (ready for the workflow)"; client: "Comments, Suggestion and every rating are required to submit, not to save a draft" |
| 7 | Employee list keeps the legacy annual-appraisal exclusion (pending HR confirmation) | Yes (SQL shape; not run against Oracle) | server: "lists the hierarchy without employees who have a non-rejected annual appraisal this year" |

## 4. Files

| New / Modified / Deleted | Path | Purpose |
|---|---|---|
| New | `server/src/modules/hr/probation-evaluations/probationEvaluation.rules.js` | Result band, stored blank date, `submitProblems` |
| Modified | `server/src/modules/hr/probation-evaluations/probationEvaluation.repository.js` | `YYYY-MM-DD` dates; employee-list exclusion |
| Modified | `server/src/modules/hr/probation-evaluations/probationEvaluation.service.js` | Joining date, list `evaluationResult` / `pendingAt` |
| Modified | `server/src/modules/hr/probation-evaluations/probationEvaluation.validation.js` | `REQUEST_STATUSES`; optional `formDate` |
| Modified | `server/docs/openapi/openapi.yaml` | Status enum, optional `formDate`, list fields |
| Modified | `server/tests/helpers/probationEvaluationFakes.js`, `server/tests/probation-legacy-parity.test.js` | Fakes and tests |
| New | `client/src/features/hr-recruitment/probation/probationRules.js` | Result band, `validateForSubmit` |
| Modified | `client/src/features/hr-recruitment/probation/ProbationPage.jsx` | Joining date, result, created date, labels, list columns |
| Modified | `client/src/features/hr-recruitment/hrRecruitmentService.js` | Record/list mapping, optional joining date |
| Modified | `client/src/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx` | Optional `dateColumn` on `ReportDialog` (default unchanged) |
| Modified | `client/tests/probationLegacyParity.test.mjs` | Tests |
| Modified | `client/src/features/hr-recruitment/README.md`, `docs/specs/README_probation_evaluation_form.md`, `docs/testing/probation-legacy-comparison.md` | Docs |

## 5. Frontend routes and navigation

No route or navigation change. Existing routes `hr-probation` and `hr-probation-record` (`HR.PROBATION_EVALUATIONS`).

| Button / action | Permission |
|---|---|
| Save draft | `HR.PROBATION_EVALUATIONS:CREATE` / `UPDATE` (unchanged) |
| Records | `HR.PROBATION_EVALUATIONS:VIEW` (unchanged) |

## 6. API endpoints and contracts

| Method | Path | Change |
|---|---|---|
| GET | `/api/v1/hr/probation-evaluations` | `requestStatus` enum is now `DRAFT, INPROCESS, APPROVED, REJECTED`; rows add `evaluationResult` and `pendingAt` (null); `formDate` and `createdAt` are `YYYY-MM-DD` (`formDate` null when blank) |
| GET | `/api/v1/hr/probation-evaluations/:headerId` | `formDate` (joining date) null when blank; `createdAt` is `YYYY-MM-DD` |
| POST / PUT | `/api/v1/hr/probation-evaluations[/:headerId]` | `formDate` is optional |
| GET | `/api/v1/hr/probation-evaluations/lookups/employees` | Excludes employees with a non-rejected annual appraisal this year |

OpenAPI updated: Yes (`listProbationEvaluations`, write/list/detail schemas). `server/tests/api-docs.test.js`: passing.

## 7. Oracle database

| Object | Type | Access (read / write) | Existing or new | Pool |
|---|---|---|---|---|
| `XXZP.XXZP_PAF_PROBATION_HEADER` | Table | Read / write (unchanged statements, date formats changed) | Existing | LOW |
| `XXZP.XXZPI_HR_PA_HEADER_TAB` | Table | Read (new `NOT EXISTS`) | Existing (already used by the performance-appraisal module) | LOW |

| Item | Value |
|---|---|
| SQL changes (DDL/DML scripts) | None |
| Approval reference (gate G1/G4) | No DDL. Exclusion table choice is pending HR confirmation (see report §6, M9) |
| Applied to TEST | Not applied. Round 3 ran read-only dictionary checks and counts on TEST (report §10); no writes |
| Transactions | Unchanged (`create`, `update`, `remove`) |

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | None |
| Created in the catalogue by | Not applicable |
| Record-level / organizational rules | Unchanged (`probationEvaluation.service.js` `authorizeRecord`) |
| Security approval (gate G2) | Not applicable |

## 9. Shared components and services reused

- Frontend: `apiClient` (via the probation service), `ReportDialog`, `Pill`, `HrField`, `EmployeePicker`.
- Backend: `validate`, `withConnection` / `withTransaction`, `sendPaginated`.
- New shared code (gate G3): `ReportDialog` gains an optional `dateColumn` prop inside the HR recruitment feature folder. The default (Last updated) is unchanged for all other forms.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed by, date |
|---|---|---|---|
| Backend lint, format, tests | `cd server; npm run lint; npm run format:check; npm test` | lint clean; format clean; 756 tests: 754 pass, 0 fail, 2 todo | Claude Code, 2026-11-02 |
| Frontend lint | `cd client; npm run lint` | clean | Claude Code, 2026-11-02 |
| Frontend tests | `cd client; npm test` | 396 tests: 394 pass, 0 fail, 2 todo | Claude Code, 2026-11-02 |
| Frontend build + release check | `npm run build; node scripts/verify-production.mjs` | build OK; "Release checks: PASS" | Claude Code, 2026-11-02 |
| Browser verification | Not performed | **not verified** | — |
| Oracle TEST verification | Not performed | **not verified** (mocked tests only) | — |

## 11. Screenshots

None (not requested).

## 12. Known limitations and dependencies

- No approval workflow: `pendingAt` is always null; `validateForSubmit` / `submitProblems` are not wired to any route or button.
- Criteria per form type are not implemented. The design is in the report §9 and waits for `prf-new.js`.
- Employee-list exclusion uses `XXZPI_HR_PA_HEADER_TAB`. Legacy reads `XXZP.XXZPI_HR_PAF_HEADER_TAB`, a separate real table (467 rows on TEST, round 3), which no legacy code writes. Pending HR confirmation (report Q10).
- Round 3: a blank joining date is stored as NULL (`FORM_DATE` is nullable on TEST). NULL and the legacy 2000-01-01 both read as blank, so an employee who really joined on 2000-01-01 would show a blank joining date.
- Round 3: the server computes `TOTAL_RATING` and the evaluation result from the ratings and discards client values. The Records list shows Job Title.
- Records created by the new form before this change hold the form date (not the joining date) in FORM_DATE. Re-selecting the employee refills it.
- Employee field: the picker lists the signed-in user's reporting hierarchy, searched on the server by name or employee number (max 50). The user is resolved by employee number (the application user ID is not the EBS `USER_ID`). An account with no reports sees an empty list, as in legacy. See report §12.

## 13. Follow-up work

- Workflow (submit / approve / reject), criteria lookup (report §9), server-side total recomputation (report M14).

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Owner |
| Review outcome | Pending |
| Handoff accepted by | Pending |
| Date | 2026-11-02 |
