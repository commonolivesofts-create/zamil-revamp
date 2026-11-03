# Feature handoff — Workflow Manager M1: Module foundation and form registry

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Master Workflow Manager — package M1 (Phase 1, Workflow Management) |
| Business purpose | Register existing business forms and the approved Oracle sources/handlers they use, as the verified foundation for workflow mapping (M2) and design (M3). Configuration only. |
| Business owner | Project owner (Zamil Digitalization) |
| Developer(s) | Claude Code (owner-delegated), branch below |
| Status | **Implemented** — usable on TEST after the G1 catalogue registration in §8 |
| Replaces CI3 feature | New (no CI3 equivalent; legacy `XXPHP_WORKFLOW` untouched) |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/workflow-manager-m1-foundation` (from `main` `3c7788f`, PR #54) |
| Commit(s) | See the Pull Request |
| Pull Request | See the Pull Request for this branch |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion (roadmap M1) | Verified? | Evidence |
|---|---|---|---|
| 1 | Workflow Manager navigation/route/permission catalogue proposal | Yes | `workflowManager.module.js`; `client/tests/workflowManager.test.mjs` (keys equal backend route permissions) |
| 2 | Role-guarded API to list/register/inspect forms | Yes | `server/tests/workflow-manager.test.js` — form registry + authorization suites |
| 3 | Registered source identities, source/handler allowlist | Yes | Data source suite: owner allowlist, `XX_ZRV_` protection, dictionary existence/type/VALID, handler refusal |
| 4 | No direct business-table edits; no arbitrary SQL | Yes | Static test: writes only to the two registry tables, no DELETE, no runtime tables, no `CONFIG_JSON` |
| 5 | User sees only authorized features | Yes (tests) | Default deny (`NO_GRANT`, `PERMISSION_UNKNOWN`, `EXPLICIT_DENY`); navigation listing by permission |
| 6 | Verified form identity/record scope | Partly | Form identity + owning module verified against the RBAC catalogue. **Record/organization scope has no column on `XX_ZRV_WF_FORMS`**; it belongs to `XX_ZRV_WF_FORM_VERSIONS` (M2). |
| 7 | No invented Oracle table/column mapping | Yes | Every column taken from the TEST dictionary (§7); all 24 statements validated on TEST |
| 8 | Read-only access to source/form version metadata | Yes | `GET …/forms/{id}/versions`, `GET …/data-sources/{id}/versions` (no `CONFIG_JSON`) |
| 9 | No workflow instances, tasks or e-mails | Yes | Static SQL test; no runtime table referenced; no delivery service used |
| 10 | One guide per screen | Yes | `docs/workflow-manager/user-guides/01`–`04` |

## 4. Files

| New / Modified | Path | Purpose |
|---|---|---|
| New | `server/src/modules/workflow-manager/workflowManager.{catalog,validation,repository,service,controller,routes}.js` | M1 backend |
| Modified | `server/src/routes/api.routes.js` | Mount `/workflow-manager` (routine registration) |
| Modified | `server/docs/openapi/openapi.yaml` | 18 operations, tag, schemas (insertion only) |
| New | `server/tests/workflow-manager.test.js`, `server/tests/helpers/workflowManagerFakes.js` | API, SQL-boundary and OpenAPI contract tests |
| Modified | `server/tests/rbac-register.test.js` | Registry module list includes `WORKFLOW_MANAGER` |
| New | `client/src/config/registry/modules/workflowManager.module.js` | Module, resources, navigation |
| Modified | `client/src/config/registry/index.js`, `navigationGroups.js` | Register module; *Workflow Manager* sidebar group |
| Modified | `client/src/app/router.jsx`, `client/src/routes/RouteComponents.jsx` | Five lazy routes |
| New | `client/src/features/workflow-manager/**` | Contract, service, model, action hook, pages, components |
| New | `client/src/styles/workflow-manager.css` | Feature styles (theme tokens only) |
| New | `client/tests/workflowManager.test.mjs` | Client contract/service/model/navigation tests |
| Modified | `client/tests/{registry,navigation,hrRecruitment,securityAdministration}.test.mjs` | Exhaustive route/module fixtures include the new module |
| New | `docs/workflow-manager/user-guides/01`–`04` | Screen guides |
| Modified | `docs/workflow-manager/{USER-GUIDE-INDEX,SCREEN-GUIDE-MATRIX,WORKFLOW-SETUP-USER-GUIDE,CURRENT-HANDOFF}.md`, `forms/README.md` | Status and links |

## 5. Frontend routes and navigation

| Route id | Path | Permission | MFA | In sidebar? |
|---|---|---|---|---|
| `workflow-manager` | `/workflow-manager` | `WORKFLOW_MANAGER.OVERVIEW:VIEW` | No | Yes |
| `workflow-forms` | `/workflow-manager/forms` | `WORKFLOW_MANAGER.FORM_REGISTRY:VIEW` | No | Yes |
| `workflow-form-new` | `/workflow-manager/forms/new` | `WORKFLOW_MANAGER.FORM_REGISTRY:CREATE` | No | No (`nav: false`) |
| `workflow-form` | `/workflow-manager/forms/:formId` | `WORKFLOW_MANAGER.FORM_REGISTRY:VIEW` | No | No (`nav: false`) |
| `workflow-data-sources` | `/workflow-manager/data-sources` | `WORKFLOW_MANAGER.DATA_SOURCE_REGISTRY:VIEW` | No | Yes |

| Button / action | Permission |
|---|---|
| Register form | `FORM_REGISTRY:CREATE` |
| Save changes (form) | `FORM_REGISTRY:UPDATE` |
| Activate / Deactivate (form) | `FORM_REGISTRY:ACTIVATE` / `FORM_REGISTRY:DEACTIVATE` |
| Register data source | `DATA_SOURCE_REGISTRY:CREATE` |
| Edit (data source) | `DATA_SOURCE_REGISTRY:UPDATE` |
| Activate / Deactivate (data source) | `DATA_SOURCE_REGISTRY:ACTIVATE` / `DEACTIVATE` |

## 6. API endpoints and contracts

All under `/api/v1/workflow-manager`; session cookie; CSRF on every change; `Cache-Control: no-store`.

| Method | Path | Permission | Notes / errors |
|---|---|---|---|
| GET | `/overview` | `OVERVIEW:VIEW` | Counts per registry the caller may VIEW (else `null`) |
| GET | `/lookups/modules` | `FORM_REGISTRY:VIEW` | Active catalogue modules except protected |
| GET | `/forms` | `FORM_REGISTRY:VIEW` | page, pageSize ≤ 100, search, moduleCode, status, sortBy, sortDir |
| POST | `/forms` | `FORM_REGISTRY:CREATE` | 201; 400 (module rules), 409 `FORM_CODE_EXISTS` |
| GET | `/forms/{formId}` | `FORM_REGISTRY:VIEW` | 404 |
| PUT | `/forms/{formId}` | `FORM_REGISTRY:UPDATE` | `rowVersion` required; 409 `STALE_RECORD`; code immutable |
| POST | `/forms/{formId}/activate` · `/deactivate` | `ACTIVATE` · `DEACTIVATE` | `{ rowVersion }`; 404/409 |
| GET | `/forms/{formId}/versions` | `FORM_REGISTRY:VIEW` | Read-only metadata |
| GET | `/lookups/source-policy` | `DATA_SOURCE_REGISTRY:VIEW` | Kinds, owners, protected prefixes, handlers |
| GET | `/lookups/source-objects` | `DATA_SOURCE_REGISTRY:VIEW` | `objectType` TABLE/VIEW, `search`; ≤ 50 names |
| GET | `/data-sources` | `DATA_SOURCE_REGISTRY:VIEW` | page, pageSize, search, sourceKind, status, sort |
| POST | `/data-sources` | `DATA_SOURCE_REGISTRY:CREATE` | 201; 400 `SOURCE_*` details; 409 `SOURCE_CODE_EXISTS` |
| GET | `/data-sources/{sourceId}` | `DATA_SOURCE_REGISTRY:VIEW` | 404 |
| PUT | `/data-sources/{sourceId}` | `DATA_SOURCE_REGISTRY:UPDATE` | 409 `STALE_RECORD`, `SOURCE_IDENTITY_LOCKED` |
| POST | `/data-sources/{sourceId}/activate` · `/deactivate` | `ACTIVATE` · `DEACTIVATE` | `{ rowVersion }` |
| GET | `/data-sources/{sourceId}/versions` | `DATA_SOURCE_REGISTRY:VIEW` | Read-only metadata |

OpenAPI updated: Yes (tag *Workflow Manager*, 18 operations). Contract test:
`server/tests/workflow-manager.test.js` › *OpenAPI contract* (every route documented, session
security, CSRF on changes, permission named).

## 7. Oracle database

Columns verified read-only from the Oracle TEST dictionary (`USER_TAB_COLUMNS`,
`USER_CONSTRAINTS`, `USER_INDEXES`, `USER_TRIGGERS`) on 2026-11-02.

| Object | Access | Verified columns / constraints used |
|---|---|---|
| `XX_ZRV_WF_FORMS` | Read/write | `FORM_ID` NUMBER(19) identity PK `ZWF_PK_FORM`; `FORM_CODE` VARCHAR2(80) UQ `ZWF_UQ_FORM_1`; `FORM_NAME` VARCHAR2(200); `MODULE_CODE` VARCHAR2(80); `DETAIL_ROUTE` VARCHAR2(500); `DESCRIPTION` VARCHAR2(1000); `IS_ACTIVE` Y/N `ZWF_CK_FORM_1`; `CREATED_AT/BY`, `UPDATED_AT/BY`, `ROW_VERSION` NUMBER(10) |
| `XX_ZRV_WF_DATA_SOURCES` | Read/write | `SOURCE_ID` identity PK; `SOURCE_CODE` VARCHAR2(80) UQ `ZWF_UQ_SRC_1`; `SOURCE_NAME` VARCHAR2(200); `SOURCE_KIND` TABLE/VIEW/HANDLER `ZWF_CK_SRC_1`; `OWNER_NAME`, `OBJECT_NAME`, `HANDLER_CODE` VARCHAR2(128) with `ZWF_CK_SRC_3`; `IS_ACTIVE`; audit columns; `ROW_VERSION` |
| `XX_ZRV_WF_SOURCE_VERSIONS` | Read only | `SOURCE_VERSION_ID`, `SOURCE_ID`, `VERSION_NO`, `LIFECYCLE_STATE`, `IS_DEFAULT`, `CONFIG_SHA256`, `SCHEMA_VERSION`, `VALIDATED_AT`, `PUBLISHED_AT`, `CREATED_AT`, `UPDATED_AT` (not `CONFIG_JSON`) |
| `XX_ZRV_WF_FORM_VERSIONS` | Read only | `FORM_VERSION_ID`, `FORM_ID`, `HEADER_SOURCE_VERSION_ID`, `VERSION_NO`, `LIFECYCLE_STATE`, `IS_DEFAULT`, `CONFIG_SHA256`, `SCHEMA_VERSION`, `PUBLISHED_AT`, `CREATED_AT`, `UPDATED_AT` (not `CONFIG_JSON`) |
| `XX_ZRV_APP_MODULES` | Read only | `MODULE_CODE`, `MODULE_NAME`, `IS_ACTIVE`, `DISPLAY_ORDER` (locked RBAC table, not modified) |
| `XX_ZRV_USERS`, `XX_DIGI_EMP_MASTER` | Read only | Display name of `CREATED_BY`/`UPDATED_BY` (detail responses) |
| `ALL_OBJECTS` | Read only | `OWNER`, `OBJECT_NAME`, `OBJECT_TYPE`, `STATUS` — names only |

| Item | Value |
|---|---|
| SQL changes (DDL/DML scripts) | None |
| Approval reference (G1/G4) | G1 required only for the RBAC catalogue registration (§8); no DDL; no CI3 change (G4 n/a) |
| Applied to TEST | Nothing written. Row counts at implementation time: all four WF tables 0 rows |
| Transactions | Create/update/activate/deactivate of forms and sources each run in one LOW `withTransaction`; reads use LOW `withConnection` |
| Physical-schema finding | `XX_ZRV_WF_FORMS` has no organization-scope column and no source FK; scope and header source live in `XX_ZRV_WF_FORM_VERSIONS` (M2). No triggers maintain `ROW_VERSION`/`UPDATED_AT` on the two registry tables — the application increments them. |

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | Module `WORKFLOW_MANAGER`; `OVERVIEW:VIEW`; `FORM_REGISTRY:VIEW, CREATE, UPDATE, ACTIVATE, DEACTIVATE`; `DATA_SOURCE_REGISTRY:VIEW, CREATE, UPDATE, ACTIVATE, DEACTIVATE` (1 module, 3 resources, 11 permissions; standard action vocabulary only) |
| Created in the catalogue by | **Not yet created — gate G1.** Owner runs `cd server; npm run db:rbac-register -- --target=TEST` (read-only preview: the 15 `WORKFLOW_MANAGER` records must appear as MISSING and nothing as CONFLICT; review any other MISSING entries separately), reviews the fingerprint, then `--apply --fingerprint=<sha256>`. Then grant the permissions to a role (Security administration → Role permissions). The preview could not be run in this session (blocked by the session's permission policy). |
| Record-level / organizational rules | None in M1 (registry is configuration data). Module, source allowlist, identity lock and optimistic locking in `workflowManager.service.js` |
| Security approval (G2) | Not required: no change to auth/MFA/CSRF/session/authorization. **Owner decision offered:** whether configuration changes should also write owner-approved security-audit codes (e.g. `WORKFLOW_FORM_REGISTERED`); M1 records them in the application log only (actor user ID, record ID). |

## 9. Shared components and services reused

- Frontend: `apiClient`, `usePermissions`, `AdminUi.jsx` (`AdminPage`, `Panel`, `ResourceState`, `Pagination`, `Dialog`, `ConfirmDialog`, `Field`, `Badge`, `DetailList`), `useResource`, `createSubmissionGuard`, `describeFailure`, `fieldProps`, `checkSearch`, `formatInstant`, registry/route guard.
- Backend: `authenticate`, `authorize`, `createRequireCsrfToken`, `validate`, `withConnection`/`withTransaction` (LOW), `sendSuccess`/`sendPaginated`, `AppError`, `authorizationService.holds`, `logger`.
- New shared code (G3): None.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed, date |
|---|---|---|---|
| Backend lint | `cd server; npm run lint` | Passed | Claude Code, 2026-11-02 |
| Backend format | `npx prettier --check src tests docs/openapi` | Passed | 2026-11-02 |
| Backend tests | `cd server; npm test` | 865 tests: 864 passed, 0 failed, 1 pre-existing `todo` (probation parity) — incl. 32 new M1 tests | 2026-11-02 |
| OpenAPI 3.1 validation | `server/tests/api-docs.test.js` (SwaggerParser) | Passed | 2026-11-02 |
| Frontend lint | `cd client; npm run lint` | Passed | 2026-11-02 |
| Frontend tests | `cd client; npm test` | 426 tests: 424 passed, 0 failed, 2 pre-existing `todo` — incl. 12 new M1 tests | 2026-11-02 |
| Frontend build | `cd client; npm run build` | Built. Main bundle 312 KB vs 308 KB on `main` (clean builds without local `.env.local`) | 2026-11-02 |
| Oracle TEST dictionary | Read-only `USER_TAB_COLUMNS`/constraints/indexes/triggers query | Columns in §7 | 2026-11-02 |
| Oracle TEST SQL | All 24 repository statements: SELECTs executed read-only; INSERT/UPDATE compiled with `DBMS_SQL.PARSE` only (never executed); control check (unknown column rejected) | 25/25 passed | 2026-11-02 |
| Browser verification | — | **Not performed**: the catalogue is not registered, so every route denies on TEST | — |
| Real Oracle integration (writes) | — | **Not performed**: no authorization for TEST writes in this run | — |

## 11. Screenshots

None yet. They require the G1 catalogue registration and a role grant on TEST, then fictional test
data; add them to guides 01–04 at that point.

## 12. Known limitations and dependencies

- Usable only after the G1 catalogue registration and a role grant (§8).
- No server handlers registered; HANDLER sources are refused until M2 delivers the handler contract.
- Source owner allowlist is code-level (`XXZP`); adding an owner is a reviewed code change.
- Organization scope is configured in M2 (physical schema, §7).
- Configuration changes are not written to the security audit table (owner decision, §8).

## 13. Follow-up work

- Owner: G1 registration and grant; then live UI verification, screenshots and guide status update.
- M2: versioned source/form mapping (keys, organization scope, statuses, handlers).

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Project owner |
| Review outcome | Pending |
| Handoff accepted by | Pending |
| Date | — |
