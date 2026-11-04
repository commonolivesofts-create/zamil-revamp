# Feature handoff — Employee Clearance (form 1063)

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Employee Clearance — React form and report |
| Business purpose | Raise and edit the clearance of an employee leaving on vacation or final exit: IT access handling, sign-off and the five department returns |
| Business owner | HR (project owner) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Implemented (frontend on the existing backend); workflow submit not built |
| Replaces CI3 feature | `Empclearance` / `Welcome::empClearance()` (`views/ZPIL/empclearance.php`, `views/update/empClearance.php`, `views/ZPIL/empclearance_list.php`) |

## 2. Source control

| Item | Value |
|---|---|
| Branch | Not committed (working tree of `feat/employee-services-insight-reports`) |
| Commit(s) | None yet |
| Pull Request | None yet |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Every legacy field is present with the same labels, required rules and defaults | Yes (code review against CI3) | `docs/testing/employee-clearance-legacy-comparison.md` §2 |
| 2 | Client validation mirrors the backend write schema | Yes | `hrEmployeeClearance.test.mjs` "validation…" |
| 3 | Tabs and signatures disabled until the first save (legacy create screen) | Yes | `hrEmployeeClearance.test.mjs` "source…" |
| 4 | Only Draft / Rejected requests are editable; save needs CREATE / UPDATE | Yes | `ClearancePage.jsx`, shared `isEditable` tests |
| 5 | Form, report and record routes appear only with the switch on and `VIEW` | Yes | `hrEmployeeClearance.test.mjs` "sidebar…" |
| 6 | Stored computer signature survives an edit | Yes (mocked) | `server/tests/employee-clearance.test.js` |
| 7 | Works against Oracle TEST in a browser | **Not verified** | — |

## 4. Files

| New / Modified / Deleted | Path | Purpose |
|---|---|---|
| New | `client/src/features/hr-employee-services/clearance/ClearancePage.jsx` | Form (create / edit) |
| New | `client/src/features/hr-employee-services/clearance/ClearanceReportPage.jsx` | Report |
| New | `client/src/features/hr-employee-services/clearance/clearanceModel.js` | Rules, validation |
| New | `client/src/features/hr-employee-services/clearance/clearanceContract.js` | Readers, request body |
| New | `client/src/features/hr-employee-services/clearance/clearanceService.js` | API service |
| New | `client/src/styles/hr-employee-clearance.css` | Styles |
| New | `client/src/config/registry/modules/hrForms.module.js` | Permission resource, navigation |
| New | `client/tests/hrEmployeeClearance.test.mjs` | Tests |
| Modified | `client/src/config/registry/index.js`, `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx` | Registration and routes |
| Modified | `client/src/features/hr-employee-services/employeeServicesPaths.js`, `…/README.md` | Paths, docs |
| Modified | `client/tests/{registry,navigation,securityAdministration,hrOnboarding,hrRecruitment}.test.mjs` | Pinned route / module lists |
| Modified | `server/src/modules/hr/employee-clearance/employee_clearance_service.js` | Read returns `computerSignature` |
| Modified | `server/docs/openapi/openapi.yaml`, `server/tests/employee-clearance.test.js` | Contract and test for the above |

| New | `docs/testing/employee-clearance-legacy-comparison.md` | Legacy comparison |

## 5. Frontend routes and navigation

| Route id | Path | Permission | `alsoRequires` | MFA | In sidebar? |
|---|---|---|---|---|---|
| `hr-clearance` | `/hr/employee-services/clearance` | `HR.EMPLOYEE_CLEARANCE:VIEW` | — | No | Yes (Employee services) |
| `hr-clearance-report` | `/hr/employee-services/clearance/report` | same | — | No | No |
| `hr-clearance-record` | `/hr/employee-services/clearance/:clearanceId` | same | — | No | No |

All three are switched by `VITE_FEATURE_HR_EMPLOYEE_CLEARANCE` (unset = development builds only).

| Button / action | Permission |
|---|---|
| Save (new) | `HR.EMPLOYEE_CLEARANCE:CREATE` |
| Save (existing) | `HR.EMPLOYEE_CLEARANCE:UPDATE` |
| Report "New clearance" | `HR.EMPLOYEE_CLEARANCE:CREATE` |

## 6. API endpoints and contracts

Existing endpoints under `/api/v1/hr/employee-clearance` (list, create, read, update, lookups for
employees, employee details, approvers and computer destinations). Change: the read response adds
`computerSignature`. OpenAPI updated (`EmployeeClearanceDetail`); `server/tests/api-docs.test.js` passes.

## 7. Oracle database

| Item | Value |
|---|---|
| SQL changes (DDL/DML scripts) | None |
| Approval reference (gate G1/G4) | Not applicable |
| Applied to TEST | Not applicable; no Oracle verification performed |
| Transactions | Unchanged (create / update use `withTransaction`) |

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | None new; the client now references the backend's `HR.EMPLOYEE_CLEARANCE:VIEW/CREATE/UPDATE/DELETE`. `VIEW_ALL` is checked by the server only (not a standard client action) |
| Created in the catalogue by | **Not verified** whether the catalogue rows exist in Oracle. Because the module is now in the client registry, the read-only `scripts/rbac-register.js --target=TEST` preview will report it (MATCH or MISSING); inserting missing rows needs the owner's separate `--apply` authorization (gate G1). `VIEW_ALL` is not proposed by that CLI |
| Record-level rules | Server: self and direct reports unless `VIEW_ALL` (`employee_clearance_service.js`) |
| Security approval (gate G2) | Not applicable (no security behaviour changed) |

## 9. Shared components and services reused

- Frontend: `RecruitmentLoader`, `RecruitmentShell`, `useRecruitmentForm`, `EmployeePicker`, `HrField`,
  `Review`, `InsightReport` and its cards, `apiClient`, `usePermissions`, `formRecords.js`, the
  employee-services chip and row styles.
- New shared code (gate G3): None.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed by, date |
|---|---|---|---|
| Frontend lint | `cd client; npx eslint .` | No problems | Claude Code, 2026-11-04 |
| Frontend tests | `cd client; npm test` | 442 tests: 438 pass, 0 fail, 4 todo (pre-existing) | Claude Code, 2026-11-04 |
| Frontend build | `npx vite build` (to a temporary directory) | Built; clearance chunks emitted | Claude Code, 2026-11-04 |
| Backend clearance + OpenAPI tests | `node --import ./tests/setup.js --test tests/employee-clearance.test.js tests/api-docs.test.js` | 32 / 32 pass | Claude Code, 2026-11-04 |
| Backend full suite | `cd server; npm test` | 895 tests: 888 pass, 0 fail, 7 todo | Claude Code, 2026-11-04 |
| Browser verification | — | **Not performed** | — |
| Oracle TEST verification | — | **Not performed** | — |

## 11. Screenshots

None (not run in a browser in this round).

## 12. Known limitations and dependencies

- No Submit: the workflow is not built; requests stay drafts.
- No Delete button (legacy has none, although the backend supports it).
- The legacy HR report (`empclearance_list_hr.php`) is not ported.
- Workflow columns of the legacy report (Pending At, start/end, last action) are not shown.

## 13. Follow-up work

- Verify the permission catalogue rows and role grants in Oracle TEST.
- Browser check against the backend on Oracle TEST.
- Owner decisions listed in `docs/testing/employee-clearance-legacy-comparison.md` §7–8.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Pending |
| Review outcome | Pending |
| Handoff accepted by | Pending |
| Date | — |

## Addendum (2026-11-04): defects found on Oracle TEST, layout

- **List, employee lookup and record read failed** (`NJS-098`): the count and page queries shared one
  bind object. The repository's query helper now sends each statement only the binds it references.
- **Department-manager list was empty**: only the approval-authority branch had been ported, and on
  TEST it matches no current employee. The full legacy `getDepartmentManager()` (three branches) is
  restored; TEST returns 4 managers.
- Verified read-only on Oracle TEST: list, lookups and record read succeed, and their output passes
  the client readers. Regression tests: `server/tests/hr-report-sql.test.js`.
- The form now follows the recruitment layout (full width, sub-headed 4-column sections, counted step
  hints, side card in the Interview structure); the duplicate Name field and the review list (repeats
  the side card) were removed.
- **Report overview cards did not load** (503 after 10 s): the service checked `VIEW_ALL` while
  already holding a pooled connection, and that check takes a second one. The overview sends about a
  dozen count requests at once, so all of them held one connection and waited for another until the
  pool queue timed out. `VIEW_ALL` is now resolved before a connection is taken (every method).
  Oracle TEST, read-only: 14 concurrent list requests failed 14/14 before, 0/14 after (also 0/30).
  Regression test in `server/tests/hr-report-sql.test.js`. Probation, orientation and personal status
  make the same nested call when opening one record (not changed here).
