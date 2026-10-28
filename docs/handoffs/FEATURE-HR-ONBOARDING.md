# Feature handoff — HR onboarding screens (forms 1101, 1064) and Periodwise Employees report

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Orientation Schedule (1101), Probation Evaluation (PAF, 1064), Periodwise Employees report; build-time visibility switch for registry entries |
| Business purpose | Plan a new joiner's first days, evaluate the probation period, and report who was attached to a department during a period |
| Business owner | Project owner (HR forms) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | **Partially implemented.** The frontend is complete and runs on owner-approved **demo data**. No backend, Oracle object or permission row exists yet. Registered as the session-only module `HR_ONBOARDING`; the three recruitment forms are separate RBAC modules on the live API since #28/#29. |
| Replaces CI3 feature | HR forms 1101 and 1064 and the periodwise employees report (CI3 sources **not inspected**) |
| Source reference | Incoming prototype `nauman (3).zip` (28 Oct 2026), unpacked outside the repository and not committed. Used for UI and business rules only. |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/hr-onboarding-forms` (from `main` at `d0e8f42`) |
| Commit(s) | `4e5d8b4` visibility switch (G3); `e3fce38` Orientation Schedule; `df3bb1f` Probation Evaluation; `34d5c2a` Periodwise Employees report; then this documentation commit (feature README, this handoff, test cleanup) |
| Pull Request | Opened by the owner from `feat/hr-onboarding-forms`; `main` (#28, #29) merged into the branch to resolve conflicts |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | HR onboarding pages appear only when `VITE_FEATURE_HR_RECRUITMENT` allows it: `true`, `false`, unset in development (shown), unset in production (hidden). Hidden pages are absent from the sidebar, command palette, guard and router. | Yes | `hrOnboarding.test.mjs` (switch tests); live dev server with `false` showed "Page not found" |
| 2 | Orientation: days = (To − From) + 1; time = hours per day × days; To = latest session end (read-only) | Yes | `hrOnboarding.test.mjs`; browser: 15 h, To set |
| 3 | Orientation blocking errors (end before start, end time not after start, clash) and warnings (Friday/Saturday, before joining, before From) | Yes | unit tests; browser: time-order problem shown |
| 4 | "Plan it for me": the day/time pattern, skipping Friday and Saturday, with suggested heads | Yes | unit test (Thursday start moves IT to Sunday); browser |
| 5 | Orientation save needs Name, From and one dated session; a saved schedule is read-only | Yes | unit, demo-adapter and browser (locked, Save disabled) |
| 6 | Probation: points clamped to 0..allocation, quick picks, totals; 71 % pass mark; rating scale; suggested recommendation; justification when contradicting; extension end dates | Yes | unit tests; browser (52/100, Needs improvement, extend 2 months → 02 Jan 2027) |
| 7 | Choosing an employee fills number, joining date, job, grade, department, suggests the form type and sets the probation period | Yes | unit test `withEmployee`; browser |
| 8 | Probation validation: end ≥ start, not before joining, all criteria scored, evaluator signature to submit; submit locks | Yes | unit, demo-adapter and browser |
| 9 | Official title only on the step-1 banner; elsewhere "Probation Evaluation" | Yes | source check; browser |
| 10 | Report inclusion, age, years (2 decimals), 60+ highlight, needs-checking flags, KPIs incl. turnover and Saudization | Yes | unit tests; browser |
| 11 | Report charts filter the table; search, All/Active/Left, sortable headers with `aria-sort`, column chooser (Position hidden), compact rows, 25 per page, sticky header, side panel (Escape) | Yes | browser scenario (37 checks) |
| 12 | CSV export of the filtered rows with a UTF-8 BOM | Yes | browser download: BOM bytes, header + all filtered rows |
| 13 | Flow navigation has 5 steps; the report is outside it | Yes | source checks; browser |
| 14 | Fictional names only; "Scheduled by" / "Prepared by" from the server (demo: the signed-in name) | Yes | tests (pattern check, `identifyDemoUser`) |

## 4. Files

| New / Modified | Path | Purpose |
|---|---|---|
| Modified (G3, approved) | `client/src/config/registry/defineModule.js` | `enabledBy: { env: 'VITE_FEATURE_*' }` on internal entries |
| Modified (G3, approved) | `client/src/config/appNavigation.js` | `isFeatureEnabled`, `resolveNavigationEntries` |
| Modified (G3, approved) | `client/src/app/router.jsx` | Routes only implemented entries (`implementedOnly`); new route lines |
| New | `client/src/config/registry/modules/hrOnboarding.module.js` | Session-only module `HR_ONBOARDING`: the five onboarding entries, each with `enabledBy` (the three recruitment forms are not switched) |
| Modified | `client/src/routes/RouteComponents.jsx` | Three lazy pages |
| New | `client/src/features/hr-recruitment/orientation/`, `probation/`, `report/` | Pages, rules modules, charts |
| New | `client/src/features/hr-recruitment/shared/components/EmployeePicker.jsx`, `shared/useSettled.js` | Searchable employee picker; debounce hook (moved from the interview page) |
| Modified | `client/src/features/hr-recruitment/{hrRecruitmentContract,hrRecruitmentService,hrRecruitmentText}.js`, `demo/*` | Readers, services, strings, demo adapter and data |
| Modified | `client/src/features/hr-recruitment/shared/components/{RecruitmentShell,RecruitmentInputs,RecruitmentLoader}.jsx`, `shared/recruitmentFlow.js`, `interview/Scores.jsx` | 5-step flow (`--n`), breadcrumb prop, opt-in `demo` badge prop, radio cards, signed-in name, gauge labels; `onboardingClient` (demo or API) beside the live `apiClient` of the three forms |
| Modified | `client/src/styles/hr-recruitment.css` | Scoped styles for the new screens; print rules; `--n` flow columns; 2-column grid |
| Modified | `client/docs/FRONTEND-ARCHITECTURE.md`, `SHARED-COMPONENTS-AND-PATTERNS.md`, `NEW-FEATURE-GUIDE.md` | The `enabledBy` switch |
| Modified | `client/src/features/hr-recruitment/README.md`, `docs/handoffs/FEATURE-HR-RECRUITMENT.md` (§15) | Switches, four combinations, endpoints, placeholders |
| New / Modified | `client/tests/hrOnboarding.test.mjs`; `hrRecruitment.test.mjs`, `navigation.test.mjs`, `registry.test.mjs`, `sidebarAccess.test.mjs`, `securityAdministration.test.mjs` | New tests; pinned route lists. The route tests now run as a production build with the switch unset, so the onboarding pages are pinned as switched off and the "on" state is tested explicitly. |

Two existing HR style fixes ride along in `hr-recruitment.css`:

- `font: 600 11px/1.4 inherit` and `font: 800 62px/.8 inherit` were invalid shorthand, so browsers ignored them on the existing forms. They are now longhand properties.
- `word-break: break-word` is now `overflow-wrap: anywhere`.

## 5. Frontend routes and navigation

| Route id | Path | Permission | MFA | In sidebar? |
|---|---|---|---|---|
| `hr-orientation` | `/hr/recruitment/orientation` | None (session-only) | No | Yes |
| `hr-orientation-record` | `/hr/recruitment/orientation/:scheduleId` | None | No | No |
| `hr-probation` | `/hr/recruitment/probation-evaluation` | None | No | Yes |
| `hr-probation-record` | `/hr/recruitment/probation-evaluation/:evaluationId` | None | No | No |
| `hr-periodwise-employees` | `/hr/reports/periodwise-employees` | None | No | Yes |

All are switched by `VITE_FEATURE_HR_RECRUITMENT`, like the existing HR entries. Buttons are not
permission-gated: no permission codes exist for these screens yet.

## 6. API endpoints and contracts

Proposed only; nothing exists in the backend. The full table is in the feature README:

- `GET /hr/recruitment/employees`;
- `/hr/recruitment/orientation-schedules` (list, get, POST = schedule and lock);
- `/hr/recruitment/probation-evaluations` (list, get, POST/PUT save, `/submit`);
- `GET /hr/reports/periodwise-employees?department&from&to`;
- lookups extended with orientation heads, probation form types with criteria, and the rating scale.

OpenAPI is not updated.

## 7. Oracle database

Not applicable. No table, script or write.

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | None agreed for these screens (session-only module) |
| Security approval (gate G2) | Not applicable |
| Shared architecture (gate G3) | Owner-approved: the `enabledBy` switch in `defineModule.js`, `appNavigation.js` and `router.jsx`, with no HR-specific code in those files |

## 9. Shared components and services reused

- Frontend: `apiClient` / `ApiError`; `AdminUi.jsx` (`Field`, `Feedback`, `Badge`, `Dialog`
  (also the report side panel), `ConfirmDialog`, `ResourceState`); `useResource` and
  `useAdminAction`; `fieldProps`; `useAuth`; `OrvexaIcon`; the HR feature's own shell, inputs,
  dialogs, gauge and demo adapter.
- New shared code: only the approved `enabledBy` switch. The CSV download is feature-local.
- Dependencies: none added.

## 10. Validation and test evidence

| Check | Command / method | Baseline `d0e8f42` | Now |
|---|---|---|---|
| Frontend lint | `cd client; npm run lint` | clean | clean |
| Frontend tests | `cd client; npm test` | 303/303 | **336/336** (no skip, only or todo) |
| Frontend build + release check | `npm run build; node scripts/verify-production.mjs` | PASS | PASS |
| Backend lint, format, tests | `cd server; npm run check` | 500/500 | 500/500 (exit 0); `server/` unchanged |
| Browser | Headless Edge driven over the DevTools protocol (scratch script, not committed), Vite dev server in preview mode with demo data | — | All scenarios pass: existing HR forms (render, 5-step flow); orientation (20 checks); probation (26); report (37). Includes keyboard picker and radio arrows, focus jumps, Escape, save/submit locking, 390 px width (no page-level horizontal scroll), CSV download (BOM, rows) and print to PDF (4 pages, all rows). No console errors. |
| Oracle TEST verification | — | — | Not performed |

**Load-sensitive server test.** `server/tests/shutdown.test.js` ("lets in-flight requests finish,
then closes resources and exits 0") failed once (`releaseRequest is not a function`, from a
timer). That run was under heavy machine load (it took 344 s instead of about 43 s), while
dev servers and headless Edge were running. It passed when run alone, and every later full
`npm run check` passed 500/500. No server code or test was changed on this branch.

## 11. Screenshots

Taken locally, not committed (the repository is public).

## 12. Known limitations and dependencies

- **Dark mode is broken app-wide (pre-existing).** `theme-green.css` sets light `--surface*`
  tokens on `html[data-accent-theme="green"]`, and that selector outranks `.dark`. The green
  dark block never restores them. In dark mode every page using `--surface-solid` /
  `--surface-2` (Security Administration panels and the HR screens) gets light surfaces with
  light text. The fix is to add the `--surface`, `--surface-solid`, `--surface-2` and
  `--surface-3` dark values to `html.dark[data-accent-theme="green"]`. That is a shared
  theme change (G3), so it was **not** made. The HR screens use only project tokens and will
  follow the theme once it is fixed. Dark mode was therefore not verified visually.
- Demo data only. The probation criteria and points are **placeholders**, and the rating
  scale is **assumed** (both should come from the backend).
- The report returns all matching rows (no server paging). The page derives KPIs and charts
  client-side.
- The emulated print-media screenshot shows only the current page. The real print path
  (`beforeprint`) lists every filtered row, as the PDF check confirmed.
- The offer signatory names added in PR #27 are unchanged. The new screens use only
  fictional people.

## 13. Follow-up work

- Backend module, OpenAPI, Oracle design (G1/G4), and permission codes for the new screens.
- Fix the green-theme dark tokens (G3), then verify dark mode on all HR screens.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Pending |
| Review outcome | Pending |
| Handoff accepted by | Pending |
| Date | — |
