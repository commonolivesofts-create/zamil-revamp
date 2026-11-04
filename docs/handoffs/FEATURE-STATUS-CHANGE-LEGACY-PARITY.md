# Feature handoff — Personal Status Change (1110) legacy parity

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Personal Status Change / Personnel Record Change (form 1110) — legacy CI3 parity |
| Business purpose | Make the new form behave like the legacy `Rec_change` form (fields, auto-fill, rules, list, print) under the audit rules; document the legacy approval workflow for the shared design |
| Business owner | HR (owner of the request) |
| Developer(s) | Claude Code session for the repository owner |
| Status | Implemented; approval workflow blocked (not built, by instruction) |
| Replaces CI3 feature | `pmform_codebase` `Rec_change` (+ `Rec_flow`, workflow `RCF`) |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `test/status-change-legacy-parity` (from `origin/main` `63e7d6f`) |
| Commit(s) | see `git log origin/main..test/status-change-legacy-parity` |
| Pull Request | Not opened (not pushed, by instruction) |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Field, dependency and flow comparison with classification | Yes | `docs/testing/status-change-legacy-comparison.md` §2–4 |
| 2 | Every DIFFERENT/MISSING item fixed or listed with a proposal | Yes | Report §5 and §7 |
| 3 | Server-computed snapshot, dates, totals, REF_NO; identity IDs; bind variables; CSRF; RBAC; record access; drafts only | Yes | `server/tests/personal-status-change*.test.js` |
| 4 | Validate-for-submit on client and server, workflow documented | Yes | `submitProblems`, `validateRecordChangeForSubmit`, report §8 |
| 5 | Read and auto-fill work on TEST legacy rows | Yes (read only) | Report §5 item 1: read 49/49, auto-fill 49/49 |

## 4. Files

| New / Modified / Deleted | Path | Purpose |
|---|---|---|
| New | `server/src/modules/hr/personal-status/personalStatusChange.rules.js` | Legacy rules, Hijri date, REF_NO, validate-for-submit |
| Modified | `server/src/modules/hr/personal-status/personalStatusChange.{service,repository,validation,controller}.js` | Parity, access, draft lock, identity, VARCHAR2 dates |
| Modified | `server/src/routes/api.routes.js` | `holds` wired into the service |
| Modified | `server/docs/openapi/openapi.yaml` | Personnel record change operations and schemas |
| Modified | `server/tests/personal-status-change.test.js`, `server/tests/personal-status-change-repository.test.js` | Tests |
| Modified | `client/src/features/hr-employee-services/recordChange/*`, `hrEmployeeServicesService.js`, `hrEmployeeServicesText.js`, `README.md` | Parity on the page, list and mapping |
| Modified | `client/src/styles/hr-employee-services.css` | Rejected tone, print sheet |
| Modified | `client/tests/hrEmployeeServices.test.mjs` | Tests |
| New | `docs/testing/status-change-legacy-comparison.md`, this file | Report and handoff |
| Modified | `docs/specs/README_personal_status_change_form.md` | Note on superseded decisions |

## 5. Frontend routes and navigation

| Route id | Path | Permission | `alsoRequires` | MFA | In sidebar? |
|---|---|---|---|---|---|
| `hr-record-change` | `/hr/employee-services/record-change` | `HR.PERSONNEL_RECORD_CHANGES:VIEW` | — | No | Yes |
| `hr-record-change-requests` | `/hr/employee-services/record-change/requests` | `HR.PERSONNEL_RECORD_CHANGES:VIEW` | — | No | Yes |
| `hr-record-change-record` | `/hr/employee-services/record-change/:requestId` | `HR.PERSONNEL_RECORD_CHANGES:VIEW` | — | No | No |

Routes unchanged. Buttons: Save (`CREATE` new / `UPDATE` saved, drafts only), New request (`CREATE`),
Export CSV and Print (VIEW).

## 6. API endpoints and contracts

| Method | Path | Permission | CSRF | Change in this branch |
|---|---|---|---|---|
| GET | `/api/v1/hr/personnel-record-changes` | `VIEW` | No | Scoped (HR all; else own + same department); `pendingAt` column |
| POST | `/api/v1/hr/personnel-record-changes` | `CREATE` | Yes | Identity ID; server snapshot/dates; amount and grade/level rules |
| GET | `/api/v1/hr/personnel-record-changes/{headerId}` | `VIEW` | No | Record access (403) |
| PUT | `/api/v1/hr/personnel-record-changes/{headerId}` | `UPDATE` | Yes | Drafts only (409), record access |
| DELETE | `/api/v1/hr/personnel-record-changes/{headerId}` | `DELETE` | Yes | Drafts only (409), record access |
| GET | `/lookups/employees`, `/lookups/positions`, `/lookups/employees/{empNo}` | `VIEW` | No | Auto-fill uses `TOTAL_SALARY`; revised defaults are position and family status only |

OpenAPI updated: Yes. `api-docs.test.js`: passes.

## 7. Oracle database

| Object | Type | Access | Existing or new | Pool |
|---|---|---|---|---|
| `XXZP.XX_REC_CHANGE` | Table | Read / write | Existing | LOW |
| `XX_DIGI_EMP_MASTER`, `XX_DIGI_LOOKUP_VALUES`, `XX_ZRV_USERS` | Tables | Read | Existing | LOW |
| `XXPHP_WORKFLOW` | Table | Read (pending at) | Existing | LOW |

| Item | Value |
|---|---|
| SQL changes (DDL/DML scripts) | None |
| Approval reference (gate G1/G4) | Not applicable; G4 coexistence questions in the report §7 (B3, B4) |
| Applied to TEST | Nothing applied. Read-only checks and `DBMS_SQL.PARSE` of the DML only |
| Transactions | create (insert + REF_NO), update, delete use `withTransaction` |

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | None (`HR.PERSONNEL_RECORD_CHANGES:*` existing) |
| Created in the catalogue by | Existing |
| Record-level / organizational rules | `personalStatusChange.service.js` `authorizeRecord` and list scope; fail-closed `isHrUser` in the repository |
| Security approval (gate G2) | Record access follows this request's audit rules; the list scope supersedes the spec's earlier "unscoped" decision — confirmation requested (report B5) |

## 9. Shared components and services reused

- Frontend: `RecruitmentShell` (`banner` slot for the print sheet), `RecordList`, `EmployeePicker`,
  `HrField`, `toCsv`/`withBom` (`hr-recruitment/report/periodwiseModel.js`), `ApprovalSigns`.
- Backend: `authorize`, `validate`, CSRF middleware, `withConnection`/`withTransaction`,
  `authorizationService.holds`.
- New shared code introduced (gate G3): None. A `REJECTED` label was added to the shared approval text.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed by, date |
|---|---|---|---|
| Backend lint, format, tests | `npm run lint`, `npm run format:check`, `npm test` | clean; 839 pass, 0 fail, 5 todo | Claude Code, 2026-11-02 |
| Frontend lint | `npm run lint` | clean | Claude Code, 2026-11-02 |
| Frontend tests | `npm test` | 416 pass, 0 fail, 4 todo | Claude Code, 2026-11-02 |
| Frontend build + release check | `npm run build; node scripts/verify-production.mjs` | PASS | Claude Code, 2026-11-02 |
| Browser verification | — | **not verified** (no browser run) | — |
| Oracle TEST verification | read-only scripts (report §6) | PASS (read only) | Claude Code, 2026-11-02 |

## 11. Screenshots

None (not requested).

## 12. Known limitations and dependencies

- Approval workflow, e-mails and the Submit button are not built (report §7 B1, §8).
- Attachments drop zone is still a disabled stub (B2).
- `CREATED_BY` / requestor identity and CI3 `MAX+1` coexistence are open G4 items (B3, B4).

## 13. Follow-up work

- Owner decisions B1–B9 in the report.
- Rotate the SMTP password hard-coded in the legacy `Rec_flow.php` (untracked folder).

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Pending |
| Review outcome | Pending |
| Handoff accepted by | Pending |
| Date | 2026-11-02 |
