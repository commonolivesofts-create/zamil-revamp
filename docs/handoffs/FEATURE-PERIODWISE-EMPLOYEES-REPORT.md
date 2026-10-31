# Feature handoff — `Periodwise Employees report`

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Periodwise Employees report |
| Business purpose | Lists the employees attached to a department at any point in a period, with headcount, joiner/leaver, turnover, Saudization, age and service KPIs and charts. |
| Business owner | Project owner (HRMS audit, `docs/testing/hrms-recruitment-audit.md` §8.2, §9.3) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Implemented (backend + frontend). Permission row and live TEST read pending (see §8, §10) |
| Replaces CI3 feature | New. There is no legacy spec in `docs/specs/`; the page existed with demo data only |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `docs/hrms-recruitment-audit` |
| Commit(s) | Not yet committed: round 3 of the HRMS audit (local, unpushed) |
| Pull Request | Not opened |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Department is the current `XX_DIGI_EMP_MASTER` department (owner decision; no legacy spec used history) | Yes | `periodwiseEmployee.repository.js` `listScope`; `docs/specs` search |
| 2 | Filters: dateFrom/dateTo (required, to ≥ from), department, status; paginated; bind variables; permission check | Yes | `server/tests/periodwise-employees.test.js` (validation, 403, repository SQL binds) |
| 3 | Totals and chart data in the same response as a `summary` block, computed server-side for the full filtered set | Yes | Same test: `summary.total` = scope while rows are refined and paged |
| 4 | `hasNationalId` (boolean) only, never the number | Yes | Test asserts no `nationalId` key; the SQL selects only `NATIONAL_IDENTIFIER IS NULL` |
| 5 | New permission `HR.PERIODWISE_EMPLOYEES` in the registry | Yes (code) | `hrForms.module.js`; registration preview shows it as MISSING (to be applied by the owner) |
| 6 | Contractor report moved to `/hr/reports/contractor-employees`; each menu link opens its own page | Yes | `client/tests/hrOnboarding.test.mjs` (`findAppRoute`), `registry.test.mjs` |
| 7 | Page wired to the API only; demo adapter follows the same contract | Yes | `hrOnboarding.test.mjs` report tests (real-client request, demo parity, refinements, `allRows`) |

## 4. Files

| New / Modified / Deleted | Path | Purpose |
|---|---|---|
| New | `server/src/modules/hr/periodwise-employees/periodwiseEmployee.{routes,controller,service,repository,validation}.js` | Endpoint, rules, SQL |
| Modified | `server/src/routes/api.routes.js` | Mount at `/hr/reports/periodwise-employees` |
| Modified | `server/docs/openapi/openapi.yaml` | Two operations, tag |
| New | `server/tests/periodwise-employees.test.js` | API, validation, permission, SQL tests |
| Modified | `client/src/features/hr-recruitment/report/PeriodwiseEmployeesPage.jsx` | Uses the API (rows, summary, departments) |
| Modified | `client/src/features/hr-recruitment/{hrRecruitmentService,hrRecruitmentContract,hrRecruitmentText}.js` | Service, readers, `PERIODWISE_TEXT` |
| Modified | `client/src/features/hr-recruitment/demo/demoClient.js` | Same contract in demo mode |
| Modified | `client/src/config/registry/modules/hrForms.module.js`, `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx` | Resource, navigation, routes |

## 5. Frontend routes and navigation

| Route id | Path | Permission | `alsoRequires` | MFA | In sidebar? |
|---|---|---|---|---|---|
| `hr-periodwise-report` | `/hr/reports/periodwise-employees` | `HR.PERIODWISE_EMPLOYEES:VIEW` | — | No | Yes (behind `VITE_FEATURE_HR_RECRUITMENT`) |
| `hr-employee-report` (contractor) | `/hr/reports/contractor-employees` (moved) | `HR.CONTRACTOR_EMPLOYEES:VIEW` | — | No | Yes |

The page has no permission-gated buttons beyond the route permission. Export CSV and Print load every filtered row through the same API.

## 6. API endpoints and contracts

| Method | Path | Permission | CSRF | Request | Success response | Documented errors |
|---|---|---|---|---|---|---|
| GET | `/api/v1/hr/reports/periodwise-employees` | `HR.PERIODWISE_EMPLOYEES:VIEW` | No | `dateFrom`, `dateTo`, `department`, `status`, `search`, `nationality`, `ageBand`, `flagged`, `sortBy`, `sortDir`, `page`, `pageSize` (≤100) | `200` with `data: { rows, summary }` and `pagination` | `400`, `401`, `403`, `500`, `503` |
| GET | `/api/v1/hr/reports/periodwise-employees/lookups/departments` | `HR.PERIODWISE_EMPLOYEES:VIEW` | No | none | `200` `[{ code, name }]` | `400`, `401`, `403`, `500` |

**Response shape:**
- The summary travels inside `data` because the shared client keeps only `data` and `pagination`.
- The summary covers the scope: period, department and status.
- Search, nationality, age band and "needs checking" narrow only `rows`.

OpenAPI updated: Yes (`getPeriodwiseEmployeesReport`, `listPeriodwiseEmployeesDepartments`). Listed in `server/tests/api-docs.test.js`: No (that test lists other modules; the API is covered by `periodwise-employees.test.js`).

## 7. Oracle database

| Object | Type | Access (read / write) | Existing or new | Pool |
|---|---|---|---|---|
| `XX_DIGI_EMP_MASTER` | Table | Read | Existing | LOW |
| `XX_DIGI_PERSON_INFO` | Table | Read (leaving reason) | Existing | LOW |

| Item | Value |
|---|---|
| SQL changes (DDL/DML scripts) | None |
| Approval reference (gate G1/G4) | Owner approval of the planned tables (audit §8.2), 2026-10-31 |
| Applied to TEST | Not applicable (read-only) |
| Transactions | None (read-only) |

**How the work is split:**
- One scope query with bind variables selects the rows.
- The service derives age (today), service years, active/60+/flags, the summary, the refinements, the sort and the page.
- `XX_DIGI_EMP_MASTER` holds one row per employee (162 on TEST), so the scope is bounded.

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | `HR.PERIODWISE_EMPLOYEES:VIEW` |
| Created in the catalogue by | Not yet. The owner runs the `db:rbac-register --apply` command in the audit report §9.2, then grants it to roles in Security Administration |
| Record-level / organizational rules | None (report over the employee master); the national ID is never returned |
| Security approval (gate G2) | Not applicable |

## 9. Shared components and services reused

**Frontend:**
- `apiClient` and `useResource`;
- `ResourceState`, `Dialog` and `Feedback`;
- the existing report charts and CSV helpers (`periodwiseModel.js`).

**Backend:** `authorize`, `validate` (Joi), `withConnection` (LOW) and `sendPaginated`.

**New shared code:** none. An `extra` member on `sendPaginated` was tried and reverted.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed by, date |
|---|---|---|---|
| Backend tests (affected suites) | `node --import ./tests/setup.js --test …` (see audit §9.7) | All passed | Claude Code, 2026-10-31 |
| Backend lint/format (changed files) | `eslint`, `prettier --check` | Clean | Claude Code, 2026-10-31 |
| Frontend tests | `cd client; node --test tests/*.mjs` | All passed | Claude Code, 2026-10-31 |
| Frontend lint / build | `npx eslint src tests`; `vite build` | Clean / built | Claude Code, 2026-10-31 |
| Oracle TEST verification | `npm run hr:live-crud` (report read) | Pending the owner's session; see audit §9.4 | — |

## 11. Screenshots

None taken (not requested).

## 12. Known limitations and dependencies

- The department is the current one. Employees who moved departments appear under their current department for past periods.
- "Today" for ages is the server's UTC date.
- The scope is loaded in full per request (bounded by the employee master). If the master grows a lot, move the summary into SQL.

## 13. Follow-up work

- Register `HR.PERIODWISE_EMPLOYEES:VIEW` (owner) and grant it.
- Run the live read in `npm run hr:live-crud`.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Project owner |
| Review outcome | Pending |
| Handoff accepted by | Pending |
