# Feature handoff — Orientation Training (1101) legacy parity

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Orientation Training / New Hire Training (1101): legacy CI3 parity |
| Business purpose | Make the new form behave like the legacy `Newhiretrain` form (CI3 is the source of truth): APIs, flows, UI |
| Business owner | HR (owner of the request) |
| Developer(s) | Claude Code session for the repository owner |
| Status | Implemented; approval workflow not built (by instruction) |
| Replaces CI3 feature | `controllers/Newhiretrain.php` + `NHT_Flow.php` (workflow `NHTF`) |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `test/orientation-legacy-parity` (from `origin/main`) |
| Commit(s) | Not committed yet (awaiting owner instruction) |
| Pull Request | Not opened |
| Merged into `main` | No |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Every API, flow and UI behaviour compared with CI3 | Yes | `docs/testing/orientation-legacy-comparison.md` §2–4 |
| 2 | Differences fixed or listed for decision | Yes | Report §5, §7 |
| 3 | Create works on TEST schema; all legacy records open | Yes (read only / parse) | Report §6 |
| 4 | Validate-for-submit on client and server | Yes | `submitProblems`, `validateOrientationForSubmit` |

## 4. Files

See report §1.2 and §5. New: `orientationTraining.rules.js`, `orientationLegacy.js`, the report and
this handoff. The one shared component change is the additive `filters` slot of `ReportDialog`.

## 5. Frontend routes and navigation

Routes unchanged. A record URL may carry `?flag=Y|N` (legacy `form/{id}/{flag}`); the report opens
records with it.

## 6. API endpoints and contracts

| Method | Path | Change |
|---|---|---|
| GET | `/api/v1/hr/orientation-trainings` | Rejected status, case-insensitive; legacy labels; `divisionName`, `pendingAt`, `workflowStart`, `workflowEnd`, `lastAction` |
| POST | `/api/v1/hr/orientation-trainings` | PRODUCTION variant; server-filled header; To = From; legacy row formulas; HR any employee, others themselves |
| GET / PUT / DELETE | `/{headerId}`, `/{headerId}/lines/{lineId}` | optional `?flag=`; Draft and Rejected editable (saved as Draft) |
| GET | `/lookups/employees`, `/lookups/employee-details` | HR all current employees, others themselves |
| GET | `/lookups/flag`, `/lookups/skills` | always N; unknown type → Employee |

OpenAPI updated; `api-docs.test.js` passes.

## 7. Oracle database

| Item | Value |
|---|---|
| Objects | the four NHT tables and `XXZP_NHT_MASTER_FLAG` (read/write); `XX_DIGI_EMP_MASTER`, `XX_DIGI_LOOKUP_VALUES`, `XX_DIGI_JOB_MASTER`, `XX_ZRV_USERS`, `XXPHP_WORKFLOW` (read) |
| SQL changes (DDL) | None |
| Applied to TEST | Nothing written; read-only checks and `DBMS_SQL.PARSE` only |
| Transactions | create, update, delete, line delete |

## 8. Authentication and permissions

No new permission codes. Record access unchanged (creator, HR, same department with VIEW); the
employee scope (HR / self) is new and follows legacy `getEmpNum`.

## 9. Shared components and services reused

`RecruitmentShell` (`banner` slot for the printout), `ReportDialog` (new optional `filters`),
`EmployeePicker`, `HrField`; backend `authorize`, `validate`, CSRF, `withTransaction`.

## 10. Validation and test evidence

| Check | Result |
|---|---|
| Server `npm test`, lint, format | 835 pass, 0 fail, 3 todo; clean |
| Client `npm test`, lint, build, release check | 413 pass, 0 fail, 3 todo; clean; PASS |
| Browser verification | **not verified** |
| Oracle TEST (read only) | report §6 |

## 11. Screenshots

None.

## 12. Known limitations and dependencies

Report §7: B1 variant source, B2 workflow, B3 Inprocess/Approved read only, B4 reversed rows refused,
B5 export buttons, B6 ID overlap, B7 CREATED_BY identity, B8 PDF.

## 13. Follow-up work

Owner decisions B1–B8; rotate the SMTP password hard-coded in the legacy NHT controllers.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Pending |
| Date | 2026-11-02 |
