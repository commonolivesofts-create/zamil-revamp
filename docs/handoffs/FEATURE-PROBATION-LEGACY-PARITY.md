# Feature handoff — Probation Evaluation (1064) legacy parity

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Probation Evaluation: legacy CI3 parity (CI3 is the source of truth) |
| Business purpose | Make the new form behave like the legacy `Probation` form: APIs, flows and UI |
| Business owner | Project owner (HR forms) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Implemented; the approval workflow is not built (by instruction) |
| Replaces CI3 feature | `controllers/Probation.php` (form code 1064); workflow `ProbationFlow.php` not replaced yet |

Earlier rounds (1–4) were merged as #48; this round supersedes several of their owner decisions (report §7 B10).

## 2. Source control

| Item | Value |
|---|---|
| Branch | `test/probation-legacy-parity` (from `main`) |
| Commit(s) | Not committed yet (awaiting owner instruction) |
| Pull Request | Not opened |
| Merged into `main` | No |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Every API, flow and UI behaviour compared with CI3 | Yes | `docs/testing/probation-legacy-comparison.md` §2–4 |
| 2 | Differences fixed, or listed for decision | Yes | Report §5, §7 |
| 3 | Create and save work on the TEST schema | Yes (parse only) | Report §5.1, §6.2: ORA-01745 fixed, 6 / 6 DML parse |
| 4 | Criteria come from the form type | Yes | `GET lookups/criteria`; report §6.2 |
| 5 | Edit save requires Comments, Suggestion and every point, on client and server | Yes | `validateForSubmit`, `submitProblems`, update schema |

## 4. Files

Report §1.2. New endpoint `GET /api/v1/hr/probation-evaluations/lookups/criteria`. No shared component change; no new file.

## 5. Frontend routes and navigation

No change: `hr-probation`, `hr-probation-record` (`HR.PROBATION_EVALUATIONS`).

| Button / action | Permission |
|---|---|
| Save | `HR.PROBATION_EVALUATIONS:CREATE` / `UPDATE` |
| Report, Print, Request Form | `HR.PROBATION_EVALUATIONS:VIEW` |

## 6. API endpoints and contracts

| Method | Path | Change |
|---|---|---|
| GET | `/lookups/criteria?formType=` | New: the 20 criteria of a form type |
| POST | `/` | Legacy create: form type, employee number, joining date, period, points by position; the server adds criteria, employee details, `-` placeholders, grade 0 and the total. 403 outside the hierarchy, 422 without criteria |
| PUT | `/:headerId` | Legacy edit: Comments, Suggestion and every line's points, required; nothing else saved; Draft and Rejected editable; status kept |
| GET | `/` | `pendingAt` from the CI3 workflow table |
| GET | `/:headerId` | `preparedBy` |
| GET | `/lookups/employee-details` | Hierarchy only (403) |

OpenAPI updated; `api-docs.test.js` passes.

## 7. Oracle database

| Item | Value |
|---|---|
| Objects | `XXZP_PAF_PROBATION_HEADER` / `_LINES` (read / write); `XX_DIGI_EMP_MASTER`, `XXZPI_HR_PA_HEADER_TAB`, `XX_DIGI_LOOKUP_VALUES`, `XXPHP_WORKFLOW` (read) |
| SQL changes (DDL) | None |
| Applied to TEST | Nothing written. Read-only checks and `DBMS_SQL.PARSE` (report §6.2) |
| Transactions | create, update, delete (unchanged) |

## 8. Authentication and permissions

No new permission codes. Record access is unchanged. New: the employee must be in the user's hierarchy (save, details).

## 9. Shared components and services reused

`RecruitmentShell` (`locked`), `ReportDialog` (`dateColumn`), `EmployeePicker`, `HrField`, `Pill`; the existing `zrv-hr-criteria` styles. Backend: `authorize`, `validate`, CSRF, `withTransaction`.

## 10. Validation and test evidence

| Check | Result |
|---|---|
| Server `npm test`, lint, format | 879 tests: 878 pass, 0 fail, 1 todo; clean; clean |
| Client `npm test`, lint, build, release check | 426 tests: 425 pass, 0 fail, 1 todo; clean; built; PASS |
| Oracle TEST (read only) | report §6.2 |
| Browser verification | **not verified** |

## 11. Screenshots

None.

## 12. Known limitations and dependencies

Report §7:
- B1: criteria from the latest complete legacy evaluation (`prf-new.js` is missing). On TEST only Department Managers has criteria.
- B2: no workflow.
- B3–B8: deviations from CI3, kept for security or data quality.
- B9: annual-appraisal table.
- B10: earlier owner decisions reversed.

## 13. Follow-up work

- Q1: the same ORA-01745 `:comment` bind in Employment Offer and Interview Assessment.
- Q2: `prf-new.js`.
- Q3–Q6: report §8.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Owner |
| Review outcome | Pending |
| Date | 2026-11-03 |
