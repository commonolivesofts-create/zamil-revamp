# Feature handoff — Project Charter and Survey reports

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Project Charter form and report; Survey report (graphical) and responses (textual) |
| Business purpose | Raise and track project charters for approved ideas; analyse the anonymous employee survey |
| Business owner | HR (project owner) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Implemented on the existing backends; not committed |
| Replaces CI3 feature | `Charter` (`views/charter`, `report_charter.php`); `Survey` (`graph_report.php`, `survey_report.php`) |

## 2. Source control

Not committed (working tree of `feat/employee-services-insight-reports`).

## 3. Acceptance criteria

| # | Criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Charter: every legacy field, the 7 milestones (Start/Complete), idea autofill, Pending-only editing | Yes (code + mocked tests) | `client/tests/hrCharterSurvey.test.mjs` |
| 2 | Charter creation works with the database-generated `HEADER_ID` | Yes (mocked) + Oracle parse check | `server/tests/project-charter-survey.test.js`; §10 |
| 3 | Survey: question + 4 demographic filters, score, category score, 4 group charts, year comparison | Yes (code + mocked tests) | tests above |
| 4 | Survey: a filter on "All" charts every group (legacy) | Yes (mocked) | `server/tests/project-charter-survey.test.js` |
| 5 | Sidebar entries need their switch and `VIEW` | Yes | `hrCharterSurvey.test.mjs` |
| 6 | Works in a browser against Oracle TEST | **Not verified** | — |

## 4. Files

| | Path | Purpose |
|---|---|---|
| New | `client/src/features/hr-employee-services/charter/*` | Charter model, contract, service, form, report |
| New | `client/src/features/hr-employee-services/survey/*` | Survey service, graphical report, responses report |
| New | `client/src/styles/hr-project-charter.css`, `client/src/styles/hr-survey-report.css` | Styles |
| New | `client/tests/hrCharterSurvey.test.mjs`, `server/tests/project-charter-survey.test.js` | Tests |
| Modified | `client/src/config/registry/modules/hrForms.module.js`, `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx`, `client/src/features/hr-employee-services/employeeServicesPaths.js` | Registration |
| Modified | `client/tests/{registry,navigation,securityAdministration,hrOnboarding}.test.mjs` | Pinned route lists |
| Modified | `server/src/modules/hr/project-charter/projectCharter.{routes,service}.js` | Resource `HR.PROJECT_CHARTERS`; create enabled; list returns `page`/`pageSize` |
| Modified | `server/src/modules/hr/surveyReport/surveyReport.service.js`, `server/src/routes/api.routes.js` | "All" counts as a chosen chart dimension; permission key `HR.SURVEY_REPORTS` |
| Modified | `server/docs/openapi/openapi.yaml` | The above |

## 5. Routes, permissions and switches

See `client/src/features/hr-employee-services/README.md` (Project Charter and Survey reports).

## 6. API changes

- `POST /api/v1/projects/charters` now creates (201, the stored charter) instead of always returning 503.
- `GET /api/v1/projects/charters` returns `page` and `pageSize` with `total` and `items`.
- `/api/v1/projects/charters/*` require `HR.PROJECT_CHARTERS` (was `PROJECT_CHARTERS.PROJECT_CHARTERS`).
- `/api/v1/survey/*` protected routes require `HR.SURVEY_REPORTS` (before: no key was configured, so every report route failed).
- `POST /api/v1/survey/reports/distribution`: a dimension sent as `__ALL__` is `selected` and charted.

## 7. Oracle database

| Item | Value |
|---|---|
| DDL / DML | None |
| Read-only checks (Oracle TEST, 2026-11-04) | `XXZP.XXZP_PRJ_CHARTER.HEADER_ID` is an identity column (`ALL_TAB_COLUMNS.IDENTITY_COLUMN = 'YES'`), no triggers; the create INSERT parses (`DBMS_SQL.PARSE`, not executed) |
| Writes performed | None |

## 8. Permissions

`HR.PROJECT_CHARTERS` (VIEW, CREATE, UPDATE, DELETE) and `HR.SURVEY_REPORTS` (VIEW, DELETE) are
**MISSING** from the Oracle TEST catalogue (read-only `rbac-register --target=TEST` preview).
Until they are registered (owner `--apply`, gate G1) and granted, the pages stay hidden and the
APIs answer 403.

## 10. Validation

| Check | Result |
|---|---|
| `cd client; npx eslint .` | No problems |
| `cd client; npm test` | 448 tests: 444 pass, 0 fail, 4 todo (pre-existing) |
| `cd client; npx vite build` (temporary directory) | Built |
| `cd server; npm test` | 899 tests: 892 pass, 0 fail, 7 todo |
| Browser / Oracle end-to-end | **Not performed** |

## 12. Known limitations

- Charter reward screen (legacy `report_reward.php`) not built: reward grading writes are disabled in the backend pending business thresholds.
- Charter "Date" is the database creation date (legacy let the user type it).
- Survey: single-response view, category report (`categoryReportView.php`) and response delete are not built; the anonymous survey form itself is out of this task.

## Addendum (2026-11-04): defects found on Oracle TEST, layout

- **Survey responses with a date filter failed** (`ORA-01745`): `:from` is a reserved word; the binds
  are now `:fromDate` / `:toDate`. Regression test: `server/tests/hr-report-sql.test.js`.
- Verified read-only on Oracle TEST: charter list/read/lookups and every survey report endpoint
  succeed, and their output passes the client readers.
- The charter form follows the recruitment layout (sub-headed 4-column sections, counted step hints,
  Home in the toolbar, no review list). The graphical survey report uses the recruitment insight-report
  layout (header actions, filter row, four overview cards, chart cards).
- Still required for these two screens: the `HR.PROJECT_CHARTERS` and `HR.SURVEY_REPORTS`
  permissions are missing in the catalogue, so their APIs answer 403 until registered and granted.
