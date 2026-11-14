# Feature handoff — Workflow Manager M2-A: universal data source version mapping

## 1. Summary

| Item | Value |
|---|---|
| Feature | Source version mapping: column allowlist, data classification, key candidates, validation, drift, clone and restricted delete of **DRAFT** source versions |
| Business purpose | Lets a source administrator record, per registered data source, exactly which columns workflows may use, how each is classified, and which columns identify a record — validated against the live Oracle dictionary — as the input to form mapping (M2-B) and governance (M6). Form-independent: no business form, table, status or organization is named in code. |
| Business owner | Project owner (Zamil Digitalization) |
| Developer(s) | Claude Code (owner-delegated) |
| Status | **Implemented** on the feature branch; automated checks passed. **Not** accepted on Oracle TEST. |
| Replaces CI3 feature | New |
| Approval | Owner-approved 9 November 2026 for the code scope only. Oracle TEST writes, RBAC catalogue registration and role grants remain gated by **G1** and were not executed. |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/workflow-manager-m2-a-source-mapping` (from `main` `4bb0588`; M2-0 PR #74 `1e99898` included) |
| Commit(s) | See the Pull Request |
| Pull Request | See the Pull Request for this branch (title *feat: add universal Workflow Manager M2-A source version mapping*) |
| Merged into `main` | Not yet |

## 3. Requirement and acceptance criteria

Implements the approved M2-A brief (§3 items 1–11). Acceptance checklist:

| Criterion | Evidence |
|---|---|
| M1 unaffected; M2-0 reused verbatim | All M1/M2-0 suites pass unchanged except the module-wide OpenAPI operation list (extended by the nine operations). `prepareSourceVersion`, `checkSourceDrift`, `createDictionaryService`, `assessKeyCandidate`, canonical JSON/SHA are used as is; no parallel schema, canonicalizer or hash. |
| First-version / source-identity concurrency fixed | Parent `SELECT … FOR UPDATE WAIT 10` in M1 `updateSource` and in every M2-A write; deterministic interleaving tests for both orders (§10). |
| Real dictionary metadata, allowlist and classifications | `GET …/dictionary`; editor columns come only from it; classes `PUBLIC`/`INTERNAL`/`PERSONAL`/`SENSITIVE`. |
| Single/composite candidates, enforced vs provisional assurance, observations | `DATABASE_ENFORCED` vs `DECLARED`; declared keys need basis/evidence/rationale, are observed (null/duplicate counts only) and always produce `PROVISIONAL_KEY`. |
| Strict valid DRAFT persistence with canonical CLOB, SHA and ROW_VERSION | Only `valid` results are stored; tests recompute canonical JSON and SHA from the stored row. |
| List/detail/edit/revalidate/drift/clone/restricted delete; ownership; immutability | Nine endpoints; cross-source access is 404; non-DRAFT is read-only (409). |
| Permissions/CSRF/auth fail closed; no data or SQL exposure | 401/403/CSRF tests per endpoint; default deny while `SOURCE_MAPPING` is unregistered; errors sanitized. |
| ITSAZZ UI integrated with the live API and permissions | Source versions + Source version screens, **Manage mapping** in the registry. |
| Endpoints documented and tested; guide 05 and handoff | OpenAPI 3.1, `user-guides/05-data-source-version.md`, this file. |
| No unauthorized Oracle/RBAC writes; no runtime or CI3 changes | No script was run against Oracle; static SQL tests (§10). |

## 4. Files

**Backend (new):** `server/src/modules/workflow-manager/sourceMapping.{repository,service,controller,validation}.js`.
**Backend (changed):** `workflowManager.catalog.js` (`SOURCE_MAPPING` key), `workflowManager.routes.js` (nine routes, prerequisite guard), `workflowManager.repository.js` (`lockSource`), `workflowManager.service.js` (lock in `updateSource`, `SOURCE_BUSY`), `server/src/routes/api.routes.js` (wiring; injectable dictionary service), `server/docs/openapi/openapi.yaml`, `server/docs/RBAC-REGISTRATION.md`.
**Backend tests:** new `workflow-source-mapping.test.js`, `workflow-source-mapping-concurrency.test.js`, `helpers/sourceMappingFakes.js`; changed `helpers/workflowManagerFakes.js` (`lockSource`, M2-A repository over the same tables), `workflow-manager.test.js` (operation list), `rbac-register.test.js` (scoped count derived from the registry: 15 + 5).
**Frontend (new):** `features/workflow-manager/sourceMappingModel.js`, `pages/SourceVersionListPage.jsx`, `pages/SourceVersionEditorPage.jsx`, `components/SourceColumnTable.jsx`, `components/SourceKeyCandidateEditor.jsx`, `components/SourceValidationPanel.jsx`.
**Frontend (changed):** `workflowManagerContract.js` (strict readers), `workflowManagerService.js` (nine calls), `workflowManagerModel.js` (keys, paths, conflict wording), `pages/DataSourceRegistryPage.jsx` (**Manage mapping**), `config/registry/modules/workflowManager.module.js`, `app/router.jsx`, `routes/RouteComponents.jsx`, `styles/workflow-manager.css`.
**Frontend tests:** new `workflowSourceMapping.test.mjs`; route/permission lists extended in `workflowManager.test.mjs`, `registry.test.mjs`, `navigation.test.mjs`, `securityAdministration.test.mjs`.
**Docs:** `docs/workflow-manager/user-guides/05-data-source-version.md` (new), guide 04 (link), `USER-GUIDE-INDEX.md`, `SCREEN-GUIDE-MATRIX.md`, `CURRENT-HANDOFF.md`, `docs/handoffs/FEATURE-WORKFLOW-MANAGER-M2-0.md` (merged status).

## 5. Frontend routes and navigation

| Route | Registry id | Permission | Notes |
|---|---|---|---|
| `/workflow-manager/data-sources/:sourceId/mapping-versions` | `workflow-source-versions` | `SOURCE_MAPPING:VIEW` + `DATA_SOURCE_REGISTRY:VIEW` | Hidden; from **Manage mapping** |
| `/workflow-manager/data-sources/:sourceId/mapping-versions/new` | `workflow-source-version-new` | `SOURCE_MAPPING:CREATE` + `DATA_SOURCE_REGISTRY:VIEW` | Hidden |
| `/workflow-manager/data-sources/:sourceId/mapping-versions/:versionId` | `workflow-source-version` | `SOURCE_MAPPING:VIEW` + `DATA_SOURCE_REGISTRY:VIEW` | Hidden |

No sidebar or command-palette entries were added. Buttons follow permission and lifecycle state; non-DRAFT versions are read-only. The editor keeps unsaved input on 409, offers *Reload latest (discards your changes)*, never retries unsafe requests, reconciles uncertain outcomes by reloading (or by returning to the list after an unconfirmed create/clone/delete) and refreshes permissions on 403.

## 6. API endpoints and contracts

Base `/api/v1/workflow-manager`; every route: `authenticate`, `authorize(DATA_SOURCE_REGISTRY, VIEW)`, `authorize(SOURCE_MAPPING, action)`, CSRF on changes, Joi (unknown fields rejected), `Cache-Control: no-store`, central error handler.

| Method | Path | Action | Success |
|---|---|---|---|
| GET | `/data-sources/:sourceId/dictionary` | VIEW | 200 snapshot facts or handler contract; `available:false` + finding when the object cannot be read |
| GET | `/data-sources/:sourceId/mapping-versions?page&pageSize≤100` | VIEW | 200 metadata page, `VERSION_NO DESC, SOURCE_VERSION_ID DESC` |
| GET | `/data-sources/:sourceId/mapping-versions/:versionId` | VIEW | 200 metadata + canonical config + `configIntegrity` + stored blockers |
| POST | `/data-sources/:sourceId/mapping-versions` `{ draft }` | CREATE | 201 `{ source, version, validation }` |
| PUT | `/data-sources/:sourceId/mapping-versions/:versionId` `{ rowVersion, draft }` | UPDATE | 200 |
| POST | `…/:versionId/revalidate` `{ rowVersion }` | UPDATE | 200; 409 `SOURCE_VERSION_REVALIDATION_FAILED` (findings, nothing written) |
| GET | `…/:versionId/drift` | VIEW | 200 `{ drifted, findings, current, … }` (any lifecycle state) |
| POST | `…/:versionId/clone` `{}` | CREATE | 201 new DRAFT |
| DELETE | `…/:versionId` `{ rowVersion }` | DELETE | 200 `{ sourceId, sourceVersionId, deleted: true }` |

Errors: 400 `VALIDATION_ERROR` / `SOURCE_MAPPING_INVALID` (details = findings `{ field, message, code, severity }`); 401; 403 `FORBIDDEN` / `CSRF_REJECTED`; 404 `RESOURCE_NOT_FOUND`; 409 `STALE_RECORD`, `SOURCE_VERSION_NOT_DRAFT`, `SOURCE_IDENTITY_CHANGED`, `SOURCE_VERSION_CONFLICT`, `SOURCE_BUSY`, `SOURCE_OBJECT_UNAVAILABLE`, `SOURCE_VERSION_REFERENCED`, `SOURCE_VERSION_DEPENDENCY_UNVERIFIED`, `SOURCE_VERSION_UNREADABLE`, `SOURCE_VERSION_IMMUTABLE`, `SOURCE_VERSION_REVALIDATION_FAILED`; 413 (body limit); 503 `DICTIONARY_TIMEOUT`. Oracle errors never reach the client (ORA-00001 → `SOURCE_VERSION_CONFLICT`, ORA-02292 → `SOURCE_VERSION_REFERENCED`, ORA-30006/00054 → `SOURCE_BUSY`, ORA-20xxx → `SOURCE_VERSION_IMMUTABLE`, others → 500 `INTERNAL_ERROR`). The M1 metadata-only `GET /data-sources/:sourceId/versions` is unchanged.

## 7. Oracle database

| Object | Access | Statements (all bound; IDs as strings; LOW pool) |
|---|---|---|
| `XX_ZRV_WF_SOURCE_VERSIONS` | read/write | `INSERT` (`LIFECYCLE_STATE='DRAFT'`, `IS_DEFAULT='N'`, `PUBLISHED_AT/BY` NULL, `CONFIG_JSON` bound as CLOB, `CONFIG_SHA256`, `SCHEMA_VERSION`, `VALIDATED_AT/BY`, audit, `ROW_VERSION=1`, `RETURNING SOURCE_VERSION_ID`); `UPDATE … WHERE source_version_id AND source_id AND row_version AND lifecycle_state='DRAFT'` (row_version + 1); `DELETE … WHERE … row_version AND lifecycle_state='DRAFT' AND is_default='N' AND published_at IS NULL`; `SELECT … FOR UPDATE WAIT 10`; `NVL(MAX(version_no),0)+1`; paged metadata; detail with `CONFIG_JSON` fetched as string |
| `XX_ZRV_WF_DATA_SOURCES` | read + row lock | `SELECT source_id … FOR UPDATE WAIT 10` (shared with M1) |
| `XX_ZRV_WF_FORM_VERSIONS` | read | header FK count; `JSON_EXISTS(config_json, '$.lines[*]?(@.sourceVersionId == $sv)' PASSING :id AS "sv")`; count of configurations whose `$.schema` is not `zrv.wf.form/1` |
| `ALL_CONSTRAINTS` | read | foreign keys referencing `XX_ZRV_WF_SOURCE_VERSIONS` (delete rule, status) |
| Dictionary views, source object | read only | M2-0 `dictionary.service.js` unchanged: `SET TRANSACTION READ ONLY`, 15 s call timeout, rollback, owner allowlist `XXZP`, protected `XX_ZRV_`; aggregate counts only for declared keys |

**No DDL, no DML outside the rows above, no grants.** **Live dictionary verification was not performed** in this package: the columns, check constraints, `(SOURCE_ID, VERSION_NO)` unique key, default index, `TR_WF_SV_IMM` and FK names/delete rules of the deployed TEST tables (which had manual fixes) are taken from `schema-reference/M1-ORACLE-TABLE-STRUCTURES.md` and the M1 handoff and must be checked read-only before TEST acceptance (for example with `schema-reference/READONLY-VERIFY-M1.sql`). In particular, confirm that the application user sees the FORM_VERSIONS → SOURCE_VERSIONS foreign key in `ALL_CONSTRAINTS` under `CURRENT_SCHEMA`; otherwise delete fails closed (`SOURCE_VERSION_DEPENDENCY_UNVERIFIED`).

### Concurrency and integrity decisions

- **Lock order:** parent data source row → (delete only) version row. M1 `updateSource` and every M2-A write take the parent lock first; nothing locks in the opposite order.
- **Evidence before the lock:** dictionary snapshot and observations run on their own READ ONLY connections *before* the write transaction (no transaction is nested around `SET TRANSACTION READ ONLY`). Inside the transaction the source row is re-read after the lock; if its identity differs from the one the evidence was taken for → 409 `SOURCE_IDENTITY_CHANGED`; otherwise the configuration is re-derived from the locked row (e.g. current active flag) and must still be valid.
- **Version numbers:** `MAX+1` under the parent lock, backed by the unique key. **Limitation:** with no durable counter, deleting the highest DRAFT lets its number be allocated again; versions are never renumbered and `SOURCE_VERSION_ID` is never reused. No DDL was invented to change this.
- **Optimistic locking:** caller `rowVersion` checked early (409) and again in the statement; a 0-row update is classified as 404 / not-draft / stale.
- **Restricted delete:** structural checks plus fail-closed rules (unreadable form configurations; cascading or disabled FKs; header FK not visible) and the enforced FK (ORA-02292) as the final guard, all in one transaction. **Protocol for M2-B:** a form-mapping writer must lock each referenced source version row (`SELECT … FOR UPDATE`) before inserting or changing a form version, so a concurrent delete either sees the reference or the writer sees the version gone (both orders tested).
- **Revalidation** never writes on failure; **clone** reads the origin only.
- Not changed: `setSourceActive` does not take the parent lock (an activation racing a save can make the recorded `SOURCE_INACTIVE` blocker momentarily stale; blockers are re-derived at M6).

## 8. Authentication and permissions

Client registry delta (code only): resource `WORKFLOW_MANAGER.SOURCE_MAPPING` with `VIEW`, `CREATE`, `UPDATE`, `DELETE` — **1 resource + 4 permissions = 5 catalogue records**; module total 20 (15 M1 + 5). Pages use `alsoRequires: ['DATA_SOURCE_REGISTRY:VIEW']`; the backend enforces the same prerequisite on every route. Default deny (`PERMISSION_UNKNOWN`) until registered; no role was granted.

**G1 actions pending owner approval (not executed):**
1. From `server/`: `node --env-file-if-exists=.env .\scripts\rbac-register.js --target=TEST --module=WORKFLOW_MANAGER` (read-only preview). Expected on TEST: 15 MATCH, **MISSING 5**, CONFLICT 0. Review the plan and its fingerprint.
2. Only after owner approval of that exact fingerprint: the same command with `--apply --fingerprint=<approved-SHA256>` and the interactive confirmation.
3. Grant the required `SOURCE_MAPPING` actions (and `DATA_SOURCE_REGISTRY:VIEW` if missing) to the intended role in Security Administration.
4. Read-only dictionary verification of the M2-A tables (§7), then owner-executed TEST acceptance.

## 9. Shared components and services reused

M2-0 mapping library; shared API client (session cookie, CSRF, DELETE body, no unsafe retry); `useWorkflowAction` (single submission, unknown outcome, permission refresh); `useResource`; Security Administration UI kit (`AdminPage`, `Panel`, `Badge`, `ConfirmDialog`, `DetailList`, `Feedback`, `Field`, `Pagination`, `ResourceState`); central registry/router guards; existing CSS tokens.

## 10. Validation and test evidence

| Check | Command | Result | Date |
|---|---|---|---|
| Server lint, format, all tests | `cd server; npm run check` | passed — 1066 tests: 1059 pass, 0 fail, 7 todo (pre-existing) | 2026-11-09 |
| New M2-A API suite (37) and concurrency suite (12) | included above | passed | 2026-11-09 |
| Client lint | `cd client; npm run lint` | passed (0 problems) | 2026-11-09 |
| Client tests | `cd client; npm test` | passed — 530 tests: 527 pass, 0 fail, 3 todo (pre-existing); new `workflowSourceMapping.test.mjs` 12 tests | 2026-11-09 |
| Client production build | `cd client; npm run build` | passed (Vite chunk-size warning only, pre-existing) | 2026-11-09 |
| Whitespace | `git diff --check` | clean | 2026-11-09 |
| Mutation check | M1 parent lock removed temporarily | both identity/version interleaving tests failed; restored | 2026-11-09 |

Covered: nine endpoints × auth, CSRF, RBAC action separation, prerequisite, default deny, explicit deny; Joi allowlist (server-owned/lifecycle/unknown fields, IDs, page size); canonical JSON and SHA recomputed; 256 KiB limit (service) behind the 100 kb body limit (413); exposure and data classes; single/composite keys; enforced and declared evidence; null/duplicate observations; identity-basis consistency; drift (type, length, identity, missing column, key enforcement loss, invalid/missing object); handler unavailable; draft CRUD, clone, revalidate (no corruption), non-DRAFT immutability for REVIEW/APPROVED/PUBLISHED/RETIRED; delete references (header, line JSON, unreadable configs), FK fail-closed; rollback and sanitized 500. Concurrency: simultaneous first versions (6), lockless control (unique key → 409), identity change in both orders, two stale updates, delete↔update both orders, dependency introduction both orders, ORA-02292 final guard, rollback. Static: writes only `XX_ZRV_WF_SOURCE_VERSIONS`, DRAFT literals only, no runtime tables, no JSON text scan, only fixed SQL fragments interpolated; both services take the parent lock. Client: strict readers, nine calls, CSRF/DELETE body, no unsafe retry, editor rules, routes/permissions, static accessibility and no-placeholder checks.

Mocks are not proof of Oracle SQL: no statement was executed against Oracle.

### 10A. Independent review and re-validation after merging `main` (2026-11-14)

`main` (`03aa9f3`) was merged into the branch (only conflict: `workflow-manager.css`, which `main` had reformatted without rule changes). An independent code review found and this branch fixed:

1. **Unverified stored configuration reused (medium).** Update and revalidate passed the stored config as attestation evidence even when its SHA-256 did not match (`MISMATCH`), so an out-of-band edit of `attestedBy/attestedAt` could be carried into a newly fingerprinted row. Now only a `VERIFIED` config carries attestations forward; revalidation of a non-`VERIFIED` config is refused (`CONFIG_FINGERPRINT_MISMATCH`, nothing written); structurally malformed configs are `UNREADABLE` instead of causing a 500 on detail/drift. Three tests added (each fails without the fix).
2. **Editor finding labels (low).** Findings, blockers and drift were labelled with the key/column at the right index of the wrong array (submitted vs. stored sorted order). Save results now use the submitted order (also across the create navigation); drift and stored blockers use the stored order. Client test added.

Noted, not changed: `updateVersionConfig` runs a plain `UPDATE`; if a future writer (M2-B) holds a version row lock, it should be preceded by `lockVersion` (`WAIT`) to keep waits bounded.

## 11. Screenshots

None. The screens cannot be opened on TEST until `SOURCE_MAPPING` is registered and granted (G1); no runtime capture was made.

## 12. Known limitations and dependencies

- Live TEST dictionary not verified (§7); TEST acceptance not done.
- Deleted highest DRAFT number can be reused (§7).
- No source handlers are registered, so HANDLER sources report *handler not registered* and cannot be mapped.
- Uniqueness observations on very large objects may hit the 15 s call timeout (`DICTIONARY_TIMEOUT`).
- `CONFIG_TOO_LARGE` is reachable only below the HTTP body limit (100 kb default).
- Attestation shows the user ID, not a display name.

## 13. Follow-up work

G1 registration and grant; read-only dictionary verification; TEST acceptance with screenshots for guide 05; M2-B form mapping (must follow the source-version lock protocol, §7); M2-C preview (G2); M6 review/approval/publication/default/retirement and blocker enforcement.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Project owner |
| Review outcome | Pending |
| Handoff accepted by | Pending |
| Date | 2026-11-09 |
