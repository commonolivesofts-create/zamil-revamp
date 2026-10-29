# Feature handoff — HR employee services: Personnel Record Change (1110), Transfer Request (ZPI.TCN.FM.01), Performance Appraisal

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Personnel Record Change (form 1110) with its change requests list; Transfer Request (ZPI.TCN.FM.01) with its report; annual Performance Appraisal |
| Business purpose | Request changes to an employee's position, pay, grade or family status; move an employee to a new job, department or section; appraise an employee's year against 20 criteria with the team grade distribution |
| Business owner | Project owner (HR forms) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | **Partially implemented.** The frontend is complete and runs on owner-approved **demo data**. No backend, Oracle object or permission row exists yet. |
| Replaces CI3 feature | HR forms 1110, ZPI.TCN.FM.01 and the annual appraisal (CI3 sources **not inspected**) |
| Source reference | Incoming prototype `nauman (4).zip` (29 Oct 2026), unpacked outside the repository and not committed. Used for UI and business rules only. |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/hr-employee-services` (from `main` at `78429b6`) |
| Commit(s) | `0ffc126` shared HR form options; `77b9416` Personnel Record Change; `815f0ea` Transfer Request; `8cd542f` Performance Appraisal; then this documentation commit |
| Pull Request | Not opened (owner reviews before push or PR) |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | The screens appear only when `VITE_FEATURE_HR_EMPLOYEE_SERVICES` allows it (`true`, `false`, unset in development, unset in production); hidden pages are absent from the sidebar, palette, guard and router | Yes | `hrEmployeeServices.test.mjs` (switch tests) |
| 2 | Data source `VITE_HR_EMPLOYEE_SERVICES_DEMO`, separate from `VITE_HR_RECRUITMENT_DEMO` | Yes | `hrEmployeeServices.test.mjs` "data source"; `.env.example` pin |
| 3 | Record change: header date, Ref # (server), Hijri date (Umm al-Qura, Arabic) | Yes | unit test `hijriDate`; browser |
| 4 | Record change: effective date required, not before the start date; current info and record fill from the employee | Yes | unit tests; browser |
| 5 | Record change: revised starts as current; position and six pay items required; amounts ≥ 0 with 2 decimals; Total SR; per-row difference (amount, %) and reset | Yes | unit tests; browser (+700 · +10 %, reset) |
| 6 | Record change: automatic change types; at least one change to submit; lower total reminder (no block) | Yes | unit tests; browser |
| 7 | Record change: remarks and views ≤ 2000 with live counter; documents drag-and-drop (in-memory); route HR & Admin. Manager → President; submitted/approved read-only; save keeps a draft | Yes | unit, demo-adapter tests; browser |
| 8 | Change requests list: search, status tabs with counts (`role="tab"`), sortable columns (`aria-sort`), open by Ref # | Yes | unit tests (`filterAndSort`, `ariaSort`); browser |
| 9 | Transfer: compact 3-step layout, document strip, requester and employee number from the server (demo: signed-in user) | Yes | source checks; browser |
| 10 | Transfer: current vs transfer-to; sections depend on the department; all required; at least one differs | Yes | unit tests; browser |
| 11 | Transfer: effective date ≥ D.O.J.; searchable director with ID; blood type prefilled; salary change / budgeted as radio groups; salary-change reminder | Yes | unit tests; browser |
| 12 | Transfer: approval chain of five with Draft / Pending / Waiting / Approved; IT & HR approvals with dates, read-only; report with search and tabs | Yes | unit, demo-adapter tests; browser |
| 13 | Appraisal: period from the lookup; employee details incl. years (to period end or today, one decimal) and appraiser | Yes | unit tests; browser (2.5 years) |
| 14 | Appraisal: scale and A–E mapping at 4.25, 4.24, 3.5, 3.49, 2.5, 2.49, 1.6, 1.59; average of 20 to two decimals; all 20 required; 1 or 5 explained | Yes | unit tests; browser (4.90, A) |
| 15 | Appraisal: quotas for teams of 0, 8, 20; allocation; over-quota warning needs a remark, no block | Yes | unit tests; browser |
| 16 | Appraisal: 3–5 goals to submit, training optional; meeting acknowledgement, remarks, signatures (appraiser to submit); submitted read-only | Yes | unit tests; browser |
| 17 | Shared: `compact`, `banner`, `--n` step track, title word wrap on every HR page; existing pages unchanged otherwise | Yes | `hrSharedComponents.test.mjs`; browser (requisition: flow, 4 columns, not compact; titles at 320 px) |
| 18 | Fictional people only; the prototype's hard-coded requester and appraiser (name and employee number) replaced by server values; no browser storage | Yes | source checks in `hrEmployeeServices.test.mjs` |

## 4. Files

| New / Modified | Path | Purpose |
|---|---|---|
| Modified (approved) | `client/src/features/hr-recruitment/shared/components/RecruitmentShell.jsx` | `flow`, `compact`, `banner`, `breadcrumb` options; title word groups; `--n` on the step track |
| Modified (approved) | `client/src/features/hr-recruitment/shared/components/RecruitmentLoader.jsx` | `flow`, `identify`, `breadcrumb` options |
| Modified (approved) | `client/src/features/hr-recruitment/shared/components/EmployeePicker.jsx` | `tight` variant, `cacheKey` |
| Modified | `client/src/features/hr-recruitment/shared/hrFormat.js` | `titleWords` |
| Modified | `client/src/styles/hr-recruitment.css` | Word groups, `--n` track (default 4), compact frame, tight picker |
| New | `client/src/features/hr-employee-services/**` | Pages, rules, services, contract, text, demo adapter, README |
| New | `client/src/styles/hr-employee-services.css` | Scoped styles |
| New | `client/src/config/registry/modules/hrEmployeeServices.module.js` | Session-only module `HR_EMPLOYEE_SERVICES`, switched |
| Modified | `client/src/config/registry/index.js`, `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx` | Registration, route lines, lazy pages |
| Modified | `client/.env.example`, `client/tests/productionReadiness.test.mjs` | `VITE_HR_EMPLOYEE_SERVICES_DEMO` (owner-approved) |
| Modified | `client/src/features/hr-recruitment/README.md` | Four-switch table |
| New | `client/tests/hrSharedComponents.test.mjs`, `client/tests/hrEmployeeServices.test.mjs` | 7 and 40 tests |
| Modified | `client/tests/{hrOnboarding,hrRecruitment,navigation,registry,securityAdministration}.test.mjs` | Pinned routes and modules; one loader source pin |

## 5. Frontend routes and navigation

| Route id | Path | Permission | `alsoRequires` | MFA | In sidebar? |
|---|---|---|---|---|---|
| `hr-record-change` | `/hr/employee-services/record-change` | None (session-only) | | No | Yes |
| `hr-record-change-requests` | `/hr/employee-services/record-change/requests` | None | | No | Yes |
| `hr-record-change-record` | `/hr/employee-services/record-change/:requestId` | None | | No | No (`hidden`) |
| `hr-transfer` | `/hr/employee-services/transfer` | None | | No | Yes |
| `hr-transfer-report` | `/hr/employee-services/transfer/report` | None | | No | Yes |
| `hr-transfer-record` | `/hr/employee-services/transfer/:transferId` | None | | No | No (`hidden`) |
| `hr-appraisal` | `/hr/performance/appraisal` | None | | No | Yes |
| `hr-appraisal-record` | `/hr/performance/appraisal/:appraisalId` | None | | No | No (`hidden`) |

All eight carry `enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' }`. Toolbar: Home → `/dashboard`;
"Change requests" and "Report" open the list views (appraisal: the report dialog); no logout button.

## 6. API endpoints and contracts

None exist; all are stubbed and documented in `client/src/features/hr-employee-services/README.md`
("Proposed API contract"): employee services lookups and employee search; record-change requests,
transfers and appraisals (list, get, create, save, submit); performance lookups and the appraiser's
team; the supporting-documents upload (stub only).

## 7. Oracle database

| Item | Value |
|---|---|
| SQL changes (DDL/DML scripts) | None |
| Approval reference (gate G1/G4) | Not applicable yet; the CI3 tables of the three forms must be inspected first |
| Applied to TEST | Not applied |

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | **Open item**: none agreed. The module is session-only (`rbac: false`); no button is permission-gated |
| Created in the catalogue by | Not created |
| Security approval (gate G2) | Not applicable (no backend) |

## 9. Shared components and services reused

The HR shared components (`RecruitmentShell`, `RecruitmentLoader`, `RecruitmentHeader`, `EmployeePicker`,
`HrField`, `RadioCards`, `FileDrop`, `Review`, `Ticket`, `Tilt`, `Orbit`, `RouteCard`, `useRecruitmentForm`,
`NewFormDialog`, `ReportDialog`), `AdminUi` (`ConfirmDialog`, `ResourceState`), `useResource`,
`fieldProps`, the shared `apiClient`, the registry's `enabledBy` switch.

**Naming:** the shared HR components are named "Recruitment…" but are now used by employee services
too. Renaming them is a possible later cleanup, not part of this branch.

## 10. Validation and test evidence

Baseline: `main` at `78429b6`.

| Check | Command / method | Result | Executed by, date |
|---|---|---|---|
| Backend lint, format, tests | `cd server; npm run check` | Exit 0; 637/637 (baseline 637/637; no server changes) | Claude Code, 29 Oct 2026 |
| Frontend lint | `cd client; npm run lint` | Clean (baseline clean) | Claude Code, 29 Oct 2026 |
| Frontend tests | `cd client; npm test` | 353/353 (baseline 306/306) | Claude Code, 29 Oct 2026 |
| Frontend build + release check | `npm run build; node scripts/verify-production.mjs` | Built; release checks PASS | Claude Code, 29 Oct 2026 |
| Browser verification | Headless Edge with the demo adapter and a scratch mock of the sign-in endpoints (no backend) | Full flows, save/submit locking, both list views, validation focus, 390 px and 320 px, print preview, dark mode: all checks passed, no console errors | Claude Code, 29 Oct 2026 |
| Oracle TEST verification | — | Not performed (no backend) | |

## 11. Screenshots

Taken with fictional data during browser verification (scratch folder, not committed).

## 12. Known limitations and dependencies

- No backend: every endpoint is stubbed; the demo adapter stands in.
- The A–E grade letters per rating band are assumed; demo criteria, distribution, organisation, job
  titles, directors, companies and document metadata are not approved HR content.
- Supporting documents are not uploaded (no endpoint); file names only.
- Sign-in for the browser checks was simulated (scratch mock of `/auth/me`, CSRF and permissions);
  not tested against a real session.
- The recruitment README's onboarding section still names the `HR_ONBOARDING` module, which #33
  replaced with the `HR` module (`hrForms.module.js`); not changed here.

## 13. Follow-up work

- Backend for the three forms (gates G1, G2, G4) and the attachment upload.
- Permission codes and an RBAC module; gate the buttons.
- Possible rename of the shared "Recruitment…" components.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Project owner |
| Review outcome | Pending |
| Handoff accepted by | |
| Date | |
