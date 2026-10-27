# Feature handoff — HR recruitment forms (1060, 1061, 1062)

## 1. Summary

| Item | Value |
|---|---|
| Feature name | HR recruitment: Personnel Requisition (1060), Interview Assessment (1061), Employment Offer (1062) |
| Business purpose | Request a position, assess candidates and issue a bilingual employment offer as one guided flow |
| Business owner | Project owner (HR forms) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | **Partially implemented.** The frontend is complete and runs on owner-approved **demo data**. No backend, Oracle object or permission row exists yet. |
| Replaces CI3 feature | HR forms 1060–1062 (the CI3 controllers and tables were **not inspected**) |

The owner explicitly approved demo data for this feature only, overriding ZRV-FE-005 and the
new-feature guide's "no invented data" rule. Everything demo-specific lives in
`client/src/features/hr-recruitment/demo/` and the `VITE_HR_RECRUITMENT_DEMO` flag; see the
feature README.

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/hr-recruitment-forms` (from `main` at `65ec208`) |
| Commit(s) | `002a21a`: forms, services, demo adapter, registration, pinned test updates. A follow-up commit adds `tests/hrRecruitment.test.mjs`, a demo seed fix and this handoff. |
| Pull Request | Not opened (owner reviews before push or PR) |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Requisition: required answers; replacement or addition question; budgeted salary only when budgeted; basic salary read-only | Yes | `hrRecruitment.test.mjs`: requisition tests, conditional-field source checks |
| 2 | Needed date lead time: past, today, under 30 days = warning, otherwise "N days" | Yes | `requisition: lead time …` |
| 3 | Not budgeted adds a Finance step to the approval route | Yes | `requisition: a position that is not budgeted …` |
| 4 | Submitting sets "Submitted for approval" and locks the form | Yes, against demo data | Demo adapter tests (409 after submit), `fieldset disabled` source check |
| 5 | Interview: HR required fields, age 18–70, experience 0–50, totals ≥ basics, joining ≥ pre-screening | Yes | `interview: HR required fields …` |
| 6 | A submitted requisition number fills "Position apply for" | Yes | `interview: "Position apply for" …`, full-flow test, browser screenshot |
| 7 | Bands: specification /40 (0–19, 20+, 35+), competency /30 (0–14, 15+, 25+) | Yes | `interview: score bands and totals` |
| 8 | Save requires all four tabs, with the exact message, and opens the first tab with a problem | Yes | `interview: save needs all four tabs …`, demo 422 test |
| 9 | Interview status Incomplete → Complete → Submitted; Submitted is read-only | Yes | `interview: status …`, full-flow test |
| 10 | Offer: four required fields to issue; 9 bilingual benefits; probation default; package = basic + housing + transport, yearly × 12 | Yes | offer tests |
| 11 | Arabic auto-fills from English with AUTO/MANUAL; Arabic renders RTL | Yes (logic and markup) | offer tests and source checks; browser screenshot |
| 12 | Print outputs the letter only (offer) | Rules verified; **printing not verified** | CSS check in `offer page …` |
| 13 | Server-assigned number, status, requester, admin manager; no client-made numbers | Yes, against demo data | demo adapter tests; static check (no `makeNumber`, no `Math.random`) |
| 14 | No browser storage | Yes | `forbidBrowserStorage` in demo test; static scan of the feature folder |

## 4. Files

| New / Modified / Deleted | Path | Purpose |
|---|---|---|
| New | `client/src/features/hr-recruitment/**` | Pages, models, contract, services, strings, demo adapter, README |
| New | `client/src/styles/hr-recruitment.css` | Feature styles, scoped to `.zrv-hr`, theme tokens |
| New | `client/src/config/registry/modules/hrRecruitment.module.js` | Session-only module `HR_RECRUITMENT` |
| Modified | `client/src/config/registry/index.js`, `navigationGroups.js` | Module registration; "Human resources" group |
| Modified | `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx` | Six routes, three lazy pages |
| New | `client/tests/hrRecruitment.test.mjs` | 36 tests |
| Modified | `client/tests/navigation.test.mjs`, `registry.test.mjs`, `sidebarAccess.test.mjs`, `securityAdministration.test.mjs` | Pinned route and sidebar expectations extended with the HR entries; no assertion removed |

## 5. Frontend routes and navigation

| Route id | Path | Permission | `alsoRequires` | MFA | In sidebar? |
|---|---|---|---|---|---|
| `hr-requisition` | `/hr/recruitment/requisition` | None (session-only) | — | No | Yes |
| `hr-requisition-record` | `/hr/recruitment/requisition/:requisitionId` | None | — | No | No (`nav: false`) |
| `hr-interview` | `/hr/recruitment/interview` | None | — | No | Yes |
| `hr-interview-record` | `/hr/recruitment/interview/:assessmentId` | None | — | No | No |
| `hr-offer` | `/hr/recruitment/offer` | None | — | No | Yes |
| `hr-offer-record` | `/hr/recruitment/offer/:offerId` | None | — | No | No |

Buttons are not permission-gated, because no permission is registered (see §8). The approved
codes for later gating are in `hrRecruitmentActions.js`.

## 6. API endpoints and contracts

**Proposed only; nothing exists in the backend.** The full table is in
`client/src/features/hr-recruitment/README.md`. In short: `GET /hr/recruitment/lookups`, and
for `requisitions`, `interview-assessments` and `employment-offers`: `GET` (list, by id),
`POST` (create), `PUT /{id}` (save), `POST /{id}/submit` (or `/issue` for offers). OpenAPI is
not updated, because no endpoint was built.

## 7. Oracle database

Not applicable. No table, column, script or write. The CI3 tables of forms 1060–1062 still
need read-only inspection before the backend is designed (gates G1 and G4).

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | Approved, **not registered**: `HR_RECRUITMENT.{PERSONNEL_REQUISITIONS, INTERVIEW_ASSESSMENTS, EMPLOYMENT_OFFERS}:{VIEW, CREATE, UPDATE, SUBMIT/ISSUE, PRINT}` |
| Created in the catalogue by | Not created (`db:rbac-register` was not run, as instructed) |
| Access today | Session-only (`rbac: false`): **every signed-in user, in every build**, can open the pages |
| Record-level / organizational rules | None. The future backend must enforce them. |
| Security approval (gate G2) | Not applicable (no security code changed) |

## 9. Shared components and services reused

- Frontend: `apiClient` / `ApiError`; `AdminUi.jsx` (`Field`, `Feedback`, `Badge`, `Dialog`,
  `ConfirmDialog`, `ResourceState`, `Pagination`); `useResource` and `useAdminAction`;
  `fieldProps`; `describeFailure`; `formatInstant`; `OrvexaIcon`; Orvexa `ux-*` and `btn-*`
  classes; theme tokens; module registry and route guards.
- New shared code introduced (gate G3): None. No shared file changed behaviour; registration
  used the documented extension points.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed |
|---|---|---|---|
| Baseline before changes | lint / test / build / `npm run check` | client lint clean, 267/267, build PASS; server 500/500 | 27 Oct 2026 |
| Backend lint, format, tests | `cd server; npm run check` | exit 0, 500/500, Prettier clean | 27 Oct 2026 |
| Frontend lint | `cd client; npm run lint` | No errors, no warnings | 27 Oct 2026 |
| Frontend tests | `cd client; npm test` | 303/303 (267 existing + 36 new) | 27 Oct 2026 |
| Frontend build + release check | `npm run build; node scripts/verify-production.mjs` | Built; "Release checks: PASS" | 27 Oct 2026 |
| Browser verification | Headless Edge screenshots, Vite dev server in `VITE_AUTH_DEV_PREVIEW` mode, demo data: new requisition, draft requisition, interview record, offer record | Rendered correctly (light theme). Typing, validation, focus, dialogs, print, dark mode and mobile width were **not verified** in a browser | 27 Oct 2026 |
| Oracle TEST verification | — | Not performed (no backend) | — |

There are no component, axe or end-to-end tests: the project has no DOM or browser test
tooling, and adding it would need new dev dependencies (declined for this change). JSX
behaviour is covered by source checks, as in the rest of the project.

## 11. Screenshots

Taken locally, not committed (the repository is public). Ask the developer for them.

## 12. Known limitations and dependencies

- Demo data only until the backend exists. Demo records reset on reload.
- Session-only access: the pages are visible to all signed-in users, including in production
  builds. With the flag unset there, they call the not-yet-existing API and show the error state.
- `VITE_HR_RECRUITMENT_DEMO` defaults in `hrRecruitmentConfig.js` (on in development builds), not
  in `.env.development`: `.env.*` files are gitignored, and `.env.example` variables are pinned by a test.
- Attachments: demo keeps file name and size in memory; the real upload needs a multipart
  endpoint and shared-client support (G3).
- Signatories (Saad AL Essa, Bader Alsulaim), currency SAR, payroll default "IPP BU" and report
  format "FPP BU" are demo lookup values, to come from the backend. The signatory names are now
  in a public repository: the owner should confirm that is acceptable.
- Requester and admin manager show "Assigned on save" until the server assigns them.
- Offer: an issued offer is read-only, as requested (the incoming app allowed editing an
  Issued offer until Accepted). Acceptance is recorded only when the applicant signed before issue.
- Panel transitions: the 3D-tilt and blur step entrance from the incoming app is now a plain
  slide, because in headless Edge the blurred, rotated keyframes left the step invisible.

## 13. Follow-up work

- Backend module, OpenAPI and Oracle design (G1/G4 approval), then switch the flag off.
- Convert `HR_RECRUITMENT` to an RBAC module, register permissions (G1) and gate the buttons.
- Browser checks: keyboard, dialogs, print, dark mode, mobile, real backend.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Pending |
| Review outcome | Pending |
| Handoff accepted by | Pending |
| Date | — |
