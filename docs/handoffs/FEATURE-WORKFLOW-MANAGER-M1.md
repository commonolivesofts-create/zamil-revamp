# Feature handoff — Workflow Manager M1: Module foundation and form registry

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Master Workflow Manager — package M1 (Phase 1, Workflow Management) |
| Business purpose | Register existing business forms and the approved Oracle sources/handlers they use, as the verified foundation for workflow mapping (M2) and design (M3). Configuration only. |
| Business owner | Project owner (Zamil Digitalization) |
| Developer(s) | Claude Code (owner-delegated), branch below |
| Status | **Implemented, merged and accepted on Oracle TEST.** Workflow Manager M1 has passed the agreed owner-executed functional acceptance checks in Oracle TEST (7 November 2026, §10A). This is **not** a production deployment or a production release approval. |
| Replaces CI3 feature | New (no CI3 equivalent; legacy `XXPHP_WORKFLOW` untouched) |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/workflow-manager-m1-foundation` (from `main` `3c7788f`, PR #54). **Retired 7 November 2026:** remote and local branch deleted after verifying the remote head was still PR #56's head, it had no further commits, no open PR used it, and its tree is identical to the merge commit on `main`. |
| Commit(s) | `c7fe1bd` — feature commit; `f1a21e8` — merge of `main` into the branch (PR #56 head) |
| Pull Request | [#56](https://github.com/commonolivesofts-create/zamil-revamp/pull/56) `feat: add Workflow Manager M1 form and data source registries` |
| Merged into `main` | **Yes** — squash commit `cbc121c` (`cbc121cd0257db99d3ba1682fcccc5a1c51c0220`), 2 November 2026 |
| Related merged PRs | [#57](https://github.com/commonolivesofts-create/zamil-revamp/pull/57) (`b59173c`) — M1 Oracle physical table reference and read-only checks (`docs/workflow-manager/schema-reference/`); [#58](https://github.com/commonolivesofts-create/zamil-revamp/pull/58) (`347fcc9`) — Workflow Manager-only scoped TEST RBAC catalogue registration (`--module=WORKFLOW_MANAGER`, `server/docs/RBAC-REGISTRATION.md`) |
| Later changes on `main` | PR #72 (`d8db5c8`) updated the detail-route example text in `FormEditor.jsx`, `workflowManagerModel.js` and `server/tests/workflow-manager.test.js` to the renamed `/hr/talent-management/...` HR routes (PR #67). No functional M1 change. |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion (roadmap M1) | Verified? | Evidence |
|---|---|---|---|
| 1 | Workflow Manager navigation/route/permission catalogue proposal | Yes | `workflowManager.module.js`; `client/tests/workflowManager.test.mjs` (keys equal backend route permissions) |
| 2 | Role-guarded API to list/register/inspect forms | Yes | `server/tests/workflow-manager.test.js` — form registry + authorization suites |
| 3 | Registered source identities, source/handler allowlist | Yes | Data source suite: owner allowlist, `XX_ZRV_` protection, dictionary existence/type/VALID, handler refusal |
| 4 | No direct business-table edits; no arbitrary SQL | Yes | Static test: writes only to the two registry tables, no DELETE, no runtime tables, no `CONFIG_JSON` |
| 5 | User sees only authorized features | Yes | Automated: default deny (`NO_GRANT`, `PERMISSION_UNKNOWN`, `EXPLICIT_DENY`), navigation listing by permission. Manual TEST: an account without Workflow Manager permissions was denied `/workflow-manager` (§10A-E; page level only) |
| 6 | Verified form identity/record scope | Partly | Form identity + owning module verified against the RBAC catalogue. **Record/organization scope has no column on `XX_ZRV_WF_FORMS`**; it belongs to `XX_ZRV_WF_FORM_VERSIONS` (M2). |
| 7 | No invented Oracle table/column mapping | Yes | Every column taken from the TEST dictionary (§7); all 24 statements validated on TEST |
| 8 | Read-only access to source/form version metadata | Yes | `GET …/forms/{id}/versions`, `GET …/data-sources/{id}/versions` (no `CONFIG_JSON`) |
| 9 | No workflow instances, tasks or e-mails | Yes | Static SQL test; no runtime table referenced; no delivery service used |
| 10 | One guide per screen | Yes | `docs/workflow-manager/user-guides/01`–`04` |
| 11 | Works end to end on Oracle TEST through the real UI | Yes | Owner-executed functional acceptance, 7 November 2026 (§10A) |

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
| Approval reference (G1/G4) | G1 applied only to the RBAC catalogue registration (§8), owner-executed on TEST; no DDL; no CI3 change (G4 n/a) |
| Applied to TEST | No DDL/DML scripts. At implementation (2 November 2026) all four WF tables held 0 rows and the developer wrote nothing. During owner acceptance (7 November 2026) configuration rows were created **through the M1 UI/API**: one form (`SICK_LEAVE`) and one data source (`WF_M1_TEST_SOURCE`), both left Active; no source or form versions exist (§10A). |
| Transactions | Create/update/activate/deactivate of forms and sources each run in one LOW `withTransaction`; reads use LOW `withConnection` |
| Physical-schema finding | `XX_ZRV_WF_FORMS` has no organization-scope column and no source FK; scope and header source live in `XX_ZRV_WF_FORM_VERSIONS` (M2). No triggers maintain `ROW_VERSION`/`UPDATED_AT` on the two registry tables — the application increments them. |

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes | Module `WORKFLOW_MANAGER`; `OVERVIEW:VIEW`; `FORM_REGISTRY:VIEW, CREATE, UPDATE, ACTIVATE, DEACTIVATE`; `DATA_SOURCE_REGISTRY:VIEW, CREATE, UPDATE, ACTIVATE, DEACTIVATE` (1 module, 3 resources, 11 permissions; standard action vocabulary only) |
| Created in the catalogue by | **Done on Oracle TEST by the owner (G1)** using the Workflow Manager-only scoped registration added in PR #58 (`rbac-register.js --target=TEST --module=WORKFLOW_MANAGER`, preview then `--apply --fingerprint=…`; see `server/docs/RBAC-REGISTRATION.md`): 15 catalogue records — 1 module, 3 resources, 11 permissions. Subsequent scoped verification: **MATCH 47, MISSING 0, CONFLICT 0, UNREGISTERED 0**. Completed — do not rerun. UAT and production catalogues are not registered. |
| Granted to | All 11 `WORKFLOW_MANAGER` permissions granted to the `SUPER_ADMINISTRATOR` role on TEST (owner). No other role holds them. |
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
| Browser verification + real Oracle TEST writes | Owner-executed functional acceptance through the M1 UI | **Passed** — see §10A | Project owner, 2026-11-07 |

The automated results above are historical, recorded on the feature branch at PR #56 time; they
were not re-executed for this documentation update.

### 10A. Owner functional acceptance on Oracle TEST — 7 November 2026

Executed manually by the project owner through the M1 screens against Oracle TEST. All items below
**passed**. The counts are historical TEST acceptance evidence, not fixed or production totals.

| # | Area | What was verified | Result |
|---|---|---|---|
| A | Workflow Manager Overview | Live counts: registered forms 1 (active 1); data sources 1 (active 1); tables 1; views 0. Counters updated after data source changes. | Passed |
| B | Form registry | Registration of `SICK_LEAVE` (*Sick Leave Form*, module `HR`, detail route `/hr/employee-services/sick-leave/:leaveId`); listing and navigation; editing; persistence after page refresh; record-version increment; deactivation and reactivation; partial-text search (`sick` returned the form); Inactive filter (0 forms while the record was Active); HR module filter (1 form); read-only mapping-version display (0 versions). | Passed |
| C | Data source registry | Registry loading; Oracle object-name autocomplete; registration of `WF_M1_TEST_SOURCE` (*Workflow M1 Test Source*, TABLE, owner `XXZP`); source identity editing and saving (final object `XXZP.XXZP_MDF_HEADER`); read-only version display (0 versions); deactivation and reactivation; Overview counter updates. | Passed |
| D | RBAC | `WORKFLOW_MANAGER` catalogue registered on TEST (15 records) and granted to `SUPER_ADMINISTRATOR`; scoped verification MATCH 47 / MISSING 0 / CONFLICT 0 / UNREGISTERED 0 (§8). | Passed |
| E | Unauthorized access | A TEST account without Workflow Manager permissions opening `/workflow-manager` was denied. **Manual page-level check only** — not an exhaustive live API permission test (API denial is covered by the automated suite). | Passed |
| F | Concurrent editing | Two administrator tabs opened `SICK_LEAVE`; tab A saved; tab B's save with older values was rejected with *"Someone else changed this record after you opened it. Reload to see the current values, then apply your change again."*; **Reload the current values** loaded tab A's saved data. Optimistic locking and reload behavior confirmed. | Passed |
| G | Cleanup | Temporary test description markers removed; final description *Employee sick leave request form for workflow configuration*; `SICK_LEAVE` left Active; `WF_M1_TEST_SOURCE` left Active; no mapping or source versions created. | Done |

**`WF_M1_TEST_SOURCE` is not mapped to the Sick Leave Form.** Form–source mapping does not exist in
M1; it is established by versioned mapping in M2.

**Conclusion:** Workflow Manager M1 has passed the agreed owner-executed functional acceptance
checks in Oracle TEST. This is not proof of production deployment or a production release
approval; UAT/production RBAC registration, deployment and release approval remain separate,
pending decisions.

## 11. Screenshots

None in the repository. Owner acceptance screenshots, if any, are not committed (they may contain
real account names); guides 01–04 can receive sanitized screenshots with fictional data later.

## 12. Known limitations and dependencies

- Usable only where the `WORKFLOW_MANAGER` catalogue is registered and granted: done on TEST
  (`SUPER_ADMINISTRATOR` only); not done on UAT or production.
- **Stale detail route on TEST:** the accepted `SICK_LEAVE` registration stores
  `/hr/employee-services/sick-leave/:leaveId`, but PR #67 (merged 4 November 2026) moved the Sick
  Leave record page to `/hr/employee-services/sick-leave/:leaveId`. M1 only displays the value
  (nothing navigates with it yet), so acceptance is unaffected; correct it through **Form
  registry → Open → Edit details** before M2/M3 rely on it.
- `WF_M1_TEST_SOURCE` (`XXZP.XXZP_MDF_HEADER`) is an acceptance-test registration, not a verified
  Sick Leave source; decide whether to keep or deactivate it before M2 onboarding.
- No server handlers registered; HANDLER sources are refused until M2 delivers the handler contract.
- Source owner allowlist is code-level (`XXZP`); adding an owner is a reviewed code change.
- Organization scope is configured in M2 (physical schema, §7).
- Configuration changes are not written to the security audit table (owner decision, §8).
- Unauthorized-access acceptance was page-level only (§10A-E).
- Screen guides 01–04 and the guide index/matrix still describe live verification as pending G1;
  update them in a separate documentation change (out of scope for this handoff update).

## 13. Follow-up work

### Owner / housekeeping

- Correct the `SICK_LEAVE` detail route on TEST (§12).
- Update guides 01–04, `USER-GUIDE-INDEX.md` and `SCREEN-GUIDE-MATRIX.md` to *accepted on TEST*.
- Optional G2 decision: security-audit event codes for configuration changes.
- UAT/production: catalogue registration, role grants, deployment and release approval (separate).

### Next package — M2: Versioned form and data source mapping (not started)

Scope per `DEVELOPMENT-ROADMAP.md` (M2 row) and `REQUIREMENTS-v3.1-LOCKED.md` §4–§5:

- Source version builder over registered data sources: validated allowlist of the source's
  verified Oracle columns (dictionary-checked, safe identifiers only, no arbitrary DML).
- Form mapping versions: header source (and approved line/detail sources), verified record keys
  including composite keys, header/detail relationships.
- Organization and employee scope (record identity = form + approved organization scope +
  canonical business-record key — never an unqualified `HEADER_ID`).
- Field catalogue (typed fields, labels, privacy classification, line collections) and
  creation/owner/requester/manager attributes.
- Business statuses and permitted transitions mapped per form to **verified stored values**;
  form-owned status-handler contract (handlers registered server-side; no arbitrary status updates).
- Validated preview; draft → review → approved → published → retired lifecycle with immutability.
- Screen guides 05–07 (`SCREEN-GUIDE-MATRIX.md`); one `forms/<verified-code>.md` per form actually onboarded.

Physical tables (deployed on TEST, verified read-only 2 November 2026 — see §7 and
`docs/workflow-manager/schema-reference/`):

| Table | M2 access | Constraints M2 must respect |
|---|---|---|
| `XX_ZRV_WF_SOURCE_VERSIONS` | Write | `CONFIG_JSON` CLOB `IS JSON STRICT WITH UNIQUE KEYS`; `CONFIG_SHA256` length 64; `LIFECYCLE_STATE` DRAFT/REVIEW/APPROVED/PUBLISHED/RETIRED; `IS_DEFAULT='Y'` only when PUBLISHED, one default per source (`ZWF_UX_SV_DEF`); unique (`SOURCE_ID`, `VERSION_NO`); trigger `TR_WF_SV_IMM` blocks deletes and payload changes once PUBLISHED/RETIRED |
| `XX_ZRV_WF_FORM_VERSIONS` | Write | Same JSON/hash/lifecycle/default rules (`ZWF_UX_FV_DEF`, `TR_WF_FV_IMM`); `HEADER_SOURCE_VERSION_ID` FK to source versions; unique (`FORM_ID`, `VERSION_NO`) |
| `XX_ZRV_WF_FORMS`, `XX_ZRV_WF_DATA_SOURCES` | Read (M1 registries) | — |

Not yet defined in the repository (must be designed and reviewed in M2, not assumed): the
`CONFIG_JSON` schema for source and form versions, the line/detail-source representation (the
physical schema has only `HEADER_SOURCE_VERSION_ID`), the handler contract, M2 API endpoints and
RBAC resources/actions (any new catalogue entries require G1). M2 must re-verify the live TEST
dictionary before writing SQL. M2 must not change Sick Leave behavior, the legacy workflow engine
(`XXPHP_WORKFLOW`, `XX_REQ_WF_REC`), or the two-phase M1–M7 / E1–E7 roadmap, and creates no
workflow instances, tasks or e-mails.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Project owner |
| Code review | PR #56 merged into `main` (2 November 2026) |
| Functional acceptance | Passed — owner-executed on Oracle TEST, 7 November 2026 (§10A) |
| Formal handoff acceptance | Pending — this documentation update is under review |
| Production release approval | Pending (not requested) |
| Date | 2026-11-07 |
