# Feature handoff — Dashboard Worklist and Employee Recognition

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Pending Worklist destination and Employee of the Month celebration |
| Business purpose | Let signed-in users open a pending worklist report and make approved employee recognition feel celebratory. |
| Business owner | Product owner (not recorded) |
| Developer(s) | Codex |
| Status | Partially implemented |
| Replaces CI3 feature | New |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feature/dashboard-workspace-polish` |
| Commit(s) | `d39db4a` — feature; `1eb3cc9` — merge of updated `origin/main` |
| Pull Request | Not created |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Pending Worklist is a signed-in common route and opens its report page. | Yes | `client/tests/navigation.test.mjs`, `client/tests/registry.test.mjs`, frontend build |
| 2 | Dashboard provides a Pending Worklist entry. | Yes | Frontend tests and production build |
| 3 | The report displays a live pending count. | No | Reporting integration is unavailable; page explicitly displays “Not available”. |
| 4 | Approved Employee of the Month recognition has a professional looping fireworks effect around its profile. | Yes | Frontend lint and production build; browser visual check not performed |

## 4. Files

| New / Modified / Deleted | Path | Purpose |
|---|---|---|
| Modified | `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx` | Add the lazy report route. |
| Modified | `client/src/config/registry/modules/common.module.js` | Register Pending Worklist for signed-in users. |
| New | `client/src/features/worklist/PendingWorklistPage.jsx` | Report page and unavailable-count state. |
| Modified | `client/src/features/dashboard/components/HomeView.jsx`, `FolioBook.jsx` | Dashboard worklist entry, recognition effect, and lint-safe default favorites. |
| New | `client/src/features/dashboard/components/EmployeeSpotlightFireworks.jsx` | Scoped, paced canvas celebration animation. |
| Modified | `client/src/styles/dashboard-workspace.css` | Worklist and recognition presentation. |
| Modified | `client/tests/dashboardExperience.test.mjs`, `navigation.test.mjs`, `registry.test.mjs`, `sidebarAccess.test.mjs` | Align expectations with current dashboard and route registry. |

## 5. Frontend routes and navigation

| Route id | Path | Permission | `alsoRequires` | MFA | In sidebar? |
|---|---|---|---|---|---|
| `pending-worklist` | `/worklist/pending` | Session only | None | No | Yes |

Buttons and permission:

| Button / action | Permission |
|---|---|
| Pending Worklist dashboard entry | Authenticated session |

## 6. API endpoints and contracts

| Method | Path | Permission | CSRF | Request | Success response | Documented errors |
|---|---|---|---|---|---|---|
| None | Worklist API is not connected | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable |

OpenAPI updated: No. Listed in `server/tests/api-docs.test.js`: No.

## 7. Oracle database

| Object | Type | Access | Existing or new | Pool |
|---|---|---|---|---|
| None | Not applicable | None | Not applicable | Not applicable |

| Item | Value |
|---|---|
| SQL changes | None |
| Approval reference | Not applicable |
| Applied to TEST | Not applicable |
| Transactions | None |

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | None; route requires an authenticated session. |
| Created in catalogue by | Not applicable |
| Record-level / organizational rules | Not applicable until worklist API integration. |
| Security approval | Not applicable |

## 9. Shared components and services reused

- Frontend: registry navigation, `AdminPage`, `Panel`, `usePermissions`, and `shouldReduceMotion`.
- Backend: None.
- New shared code introduced: None.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed by, date |
|---|---|---|---|
| Backend lint, format, tests | `cd server; npm run check` | Passed; 888 tests passed, 7 TODO | Codex, 2026-11-03 |
| Frontend lint | `cd client; npm run lint` | Passed | Codex, 2026-11-03 |
| Frontend tests | `cd client; npm test` | Passed; 430 tests passed, 4 TODO | Codex, 2026-11-03 |
| Frontend build | `cd client; npm run build` | Passed | Codex, 2026-11-03 |
| Formatting / whitespace | Prettier check on new JSX and `HomeView.jsx`; `git diff --check` | Prettier passed on those files; the dashboard stylesheet requires whole-file formatting to satisfy Prettier; whitespace check passed | Codex, 2026-11-03 |
| Browser verification | Not performed | Not verified | Codex, 2026-11-03 |
| Oracle TEST verification | Not applicable | Not performed | Codex, 2026-11-03 |

## 11. Screenshots

None captured.

## 12. Known limitations and dependencies

- The worklist report cannot retrieve tasks or a live count until a worklist reporting API and active workflow execution are available.
- The recognition canvas is reduced-motion aware and pauses when the section is offscreen or the tab is hidden; browser visual verification remains outstanding.

## 13. Follow-up work

- Connect `/worklist/pending` to the approved workflow API and display its live count.
- Verify fireworks appearance in both light and dark themes in a browser.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Not assigned |
| Review outcome | Pending |
| Handoff accepted by | Pending |
| Date | 2026-11-03 |
