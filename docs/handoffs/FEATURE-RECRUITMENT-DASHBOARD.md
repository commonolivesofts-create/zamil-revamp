# Feature handoff — `Recruitment dashboard`

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Recruitment dashboard |
| Business purpose | One clean page showing what is happening in recruitment: headline numbers per module for a chosen period, monthly activity, the hiring funnel, the latest records of each module and the open work waiting now. |
| Business owner | HR (project owner) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Implemented (frontend only) |
| Replaces CI3 feature | New |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/recruitment-dashboard` (stacked on `feat/employee-services-insight-reports`) |
| Commit(s) | See the branch history |
| Pull Request | Not opened yet |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Every figure comes from the existing recruitment list APIs (no invented data) | Yes | `recruitmentDashboard.test.mjs` › dashboard page |
| 2 | A module (tile, chart tab, funnel stage, recent tab, attention item) appears only when the user may open its report page (routed, switched on, permitted); New requisition also needs CREATE | Yes | same test; `canAccessRoute(findAppRoute(path), permissions)` |
| 3 | Period switch: 30 days, 90 days, this year, 12 months (default), all time; change against the previous period of equal length | Yes | › dashboard periods, › dashboard figures |
| 4 | At most 6 count requests in flight; equal queries share one request; failed counts are retried on the next ask | Yes | › dashboard requests |
| 5 | Uses only the theme tokens (one accent colour, mint for good news) so light and dark mode follow the app; the activity chart has a table view | Yes | `hr-recruitment-dashboard.css`; `ColumnChart` table mode |
| 5a | Recent activity: five latest records per module, newest first, each opening its record | Yes | › dashboard page |
| 6 | Looks and behaves correctly in the browser with real data | **Not verified** | — |

## 4. Files

| New / Modified / Deleted | Path | Purpose |
|---|---|---|
| New | `client/src/features/hr-recruitment/dashboard/RecruitmentDashboardPage.jsx` | The page and its data loads |
| New | `client/src/features/hr-recruitment/dashboard/RecruitmentPanels.jsx` | Panel, stat cards with micro columns, column chart, funnel rows, recent table, attention list |
| New | `client/src/features/hr-recruitment/dashboard/dashboardModel.js` | Periods, change and ratio rules, request limiter and counter |
| New | `client/src/styles/hr-recruitment-dashboard.css` | Dashboard styles (light and dark) |
| New | `client/tests/recruitmentDashboard.test.mjs` | Unit and static tests |
| Modified | `client/src/features/hr-recruitment/hrRecruitmentText.js` | `DASHBOARD_TEXT` |
| Modified | `client/src/config/registry/modules/requisitions.module.js` | Navigation entry |
| Modified | `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx` | Route and lazy page |
| Modified | `client/tests/navigation.test.mjs`, `registry.test.mjs`, `hrOnboarding.test.mjs` | The new switched entry |
| Modified | `client/src/features/hr-recruitment/README.md` | Route table and switch |

## 5. Frontend routes and navigation

| Route id | Path | Permission | `alsoRequires` | MFA | In sidebar? |
|---|---|---|---|---|---|
| `hr-recruitment-dashboard` | `/hr/recruitment/dashboard` | `REQUISITIONS.REQUISITIONS:VIEW` | — | No | Yes (Recruitment), behind `VITE_FEATURE_HR_RECRUITMENT` |

Blocks and links:

| Block / action | Shown when the user can open |
|---|---|
| Stat, chart tab, funnel stage, recent tab, attention item | That module's report page (`…/report`) |
| New requisition | The requisition form and `REQUISITIONS.REQUISITIONS:CREATE` |
| Record link in Recent activity | The record route (guarded as usual) |

## 6. API endpoints and contracts

None new. Counts read the pagination total of the existing list endpoints with `page=1` and one row; Recent activity reads five rows sorted newest first (`sortBy` as in each report, `sortDir=desc`): `/hr/requisitions`, `/hr/interview-assessments`, `/hr/employment-offers`, `/hr/orientation-trainings` (both `flag=Y` and `flag=N`) and `/hr/probation-evaluations`. Each module's own date filter applies. Needs attention counts open items now, not the period.

## 7. Oracle database

None. No SQL, no writes.

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | None |
| Created in the catalogue by | Not applicable |
| Record-level / organizational rules | Unchanged; the backend's list scoping applies to every count |
| Security approval (gate G2) | Not applicable |

## 9. Shared components and services reused

- Frontend: `hrRecruitmentServices` list calls, `useResource`, `usePermissions`, `canAccessRoute` / `findAppRoute`, `Pill`, `CountUp` / `Skeleton` and the theme tokens of `hr-recruitment.css`.
- New shared code introduced (gate G3): None.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed by, date |
|---|---|---|---|
| Frontend lint | `cd client; npx eslint src tests/recruitmentDashboard.test.mjs` | No problems | Claude Code, 2026-11-04 |
| Frontend tests | `cd client; npm test` | 452 tests: 448 pass, 0 fail, 4 todo (pre-existing) | Claude Code, 2026-11-04 |
| Frontend build | `cd client; npm run build` | Built | Claude Code, 2026-11-04 |
| Browser verification | — | **Not performed** | — |
| Oracle TEST verification | — | Not performed (read-only feature) | — |

## 11. Screenshots

None yet.

## 12. Known limitations and dependencies

- One dashboard load makes about 80 small count requests (mostly the 12-month trend), 6 at a time. A server summary endpoint would replace them with one call.
- Each module filters dates by its own date column, so the pipeline compares stages of the same period, not the same candidates.
- Orientation recent rows merge the Shared and Plant tables by orientation date.

## 13. Follow-up work

- Browser check with real data in light and dark mode.
- Optional backend summary endpoint for the dashboard.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | |
| Review outcome | |
| Handoff accepted by | |
| Date | |
