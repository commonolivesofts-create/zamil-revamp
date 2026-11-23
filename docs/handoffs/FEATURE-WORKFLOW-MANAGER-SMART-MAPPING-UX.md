# Feature handoff — Workflow Manager Smart Mapping foundation and business-first UX

## 1. Summary

| Item | Value |
|---|---|
| Feature | (a) Module-local **Smart Mapping foundation**: versioned form contract `zrv.wf.form/2` (relationship graph), contract version dispatch, the `zrv.wf.businessRecord/1` result assembler, and fail-closed delete-dependency checks for every v2 source reference. (b) **Business-first redesign** of the existing M1/M2-A screens (Overview, Form registry, form page, Data source registry, data source fields) with truthful readiness. |
| Business purpose | Business users must not need Oracle or database knowledge. Forms show whether they are ready for workflows; technical onboarding stays with data administrators and is guided; the contract can describe real multi-source business data (header, lines, item per line, requester and department) without ever configuring joins in the ordinary flow. |
| Specification | `docs/workflow-manager/SMART-FORM-DATA-AND-SELF-SERVICE-UX-SPEC.md` (PR #99). Locked v3.0/v3.1/v3.2 requirements, the delivery & UX standard and the roadmap are preserved; no requirement is removed or deferred. |
| Business owner | Project owner (Zamil Digitalization) |
| Developer(s) | Claude Code (owner-delegated) |
| Status | **Implemented** on the feature branch; automated checks passed; read-only Oracle TEST checks passed. **Not** accepted on Oracle TEST. |
| Approval | Owner request of 21 November 2026 for this scope. No G1 (no DDL, DML, RBAC or grants), G2 (auth/session/authorization unchanged), G3 (RecordAccessProvider, SourceHandler, `integrations/index.js`, `recordKey.js`, `canonicalJson.js`, shared router/client unchanged) or G4 (no CI3 or form-ownership change) crossing. |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/workflow-manager-smart-mapping-ux` (from `main` `02373d4`, PR #99) |
| Commit(s) / Pull Request | See the Pull Request for this branch |
| Merged into `main` | Not yet |

## 3. Scope against the specification

### Implemented in this package

| Spec item | Delivered |
|---|---|
| §1 Overview starts with business forms and truthful readiness | Overview lists active forms with *Data ready* / *Data in setup* / *Not onboarded* from real data and the next step; no *Configure workflow* control (M3 not shipped). |
| §1 Form registry / editor: friendly name and status; technical fields only for administrators | Readiness column replaces route and version count; form page shows a readiness journey; form code, module code, detail route and record version only for `FORM_REGISTRY:UPDATE`/`CREATE` holders; editor groups them as *Technical identity*. |
| §1 Data sources as an internal onboarding step | Registry described as one-time onboarding for data administrators; *Approved fields* readiness; kind/object de-emphasised. |
| §1 Source versions: readiness, history, one primary action, fingerprint on request | *Readiness* panel, *History* table without fingerprints, one primary action (*Continue draft* / *Start a new version*). |
| §1 Editor: **Choose information → Verify record identification → Review & save** | Three-step guided setup; maintenance actions grouped under *More actions*. |
| §1 Column table: business labels, purpose, privacy, safe selection; no auto-exposure or lower sensitivity | Readable names and kinds, Oracle types under *Technical options*; no bulk select; privacy starts **unclassified** and is required (previously defaulted to *Internal*). |
| §1 Key editor: recommend only verified identifiers; evidence/attestation restricted to technical onboarding | Recommendation only from enforced PK / unique constraint / unique index over NOT NULL columns (never by name); declared keys with basis/evidence/rationale under *Technical onboarding*. |
| §1 Validation: what failed, how to fix, whether saved, request ID; codes kept | Plain-language explanations per code, *Not saved — nothing was changed*, *Reference for support* for server errors; codes and locations still shown. |
| §4 Record identification | `recordKey.js`, `keyAssurance.js`, `sourceContract.js` unchanged; v2 root and row keys reuse `buildRecordKey`; declared keys stay provisional blockers. |
| §5 Generalized relationships, backward compatible | `zrv.wf.form/2` beside unchanged `zrv.wf.form/1` (shared semantics extracted verbatim to `formSemantics.js`); dispatch refuses unknown versions; no stored mapping is migrated. |
| §6 One typed business-data result | `zrv.wf.businessRecord/1` assembler (pure; reads nothing). |
| §8 Critical: deletion checks for all v2 references | `findVersionReferences` adds `graphRefs` (`$.sources[*].sourceVersionId` of `zrv.wf.form/2`), counts v1 lines only for v1, treats any other schema as unverifiable; the service fails closed on unknown counts. |
| §8 Verify TEST dictionary before asserting no DDL | Done read-only (§7): no DDL needed. |

### Not implemented (documented, later packages)

Form mapping writes, form-version API and screens (**M2-B**); secure preview executing reads and related-source / purpose access providers (**M2-C**, G2/G3); the *Create workflow* journey, conditions, levels, approvers (**M3**); resolvers, EN/AR templates, repeating tables in e-mails (**M4**); simulation and publication (**M6**); execution, tasks, notifications (**E1–E7**). Nothing in the UI or guides claims these exist. Collection aggregates for conditions are an M3 concern; the assembler guarantees completeness (overflow is an error) so any later aggregate works on complete data.

## 4. Files

**Backend (new):** `mapping/formSemantics.js` (shared semantics of every form contract, extracted verbatim from v1), `mapping/formContractV2.js` (`zrv.wf.form/2`, `relationshipGraph`), `mapping/formMapping.js` (version dispatch, `formSourceReferences`), `mapping/businessRecord.js` (`zrv.wf.businessRecord/1`).
**Backend (changed):** `mapping/formContract.js` (uses `formSemantics.js`; exports and behaviour unchanged), `sourceMapping.repository.js` (`graphRefs`, schema-scoped counts), `sourceMapping.service.js` (fail closed on graph references and unknown counts), `workflowManager.repository.js` (`defaultVersionNo` for forms and sources), `server/docs/openapi/openapi.yaml` (`defaultVersionNo`).
**Backend tests:** new `tests/workflow-form-graph.test.js`; `tests/workflow-source-mapping.test.js`, `tests/workflow-manager.test.js`, `tests/helpers/sourceMappingFakes.js`, `tests/helpers/workflowManagerFakes.js`.
**Frontend (new):** `smartMappingModel.js`, `components/SourceIdentifierStep.jsx`.
**Frontend (changed):** pages `WorkflowOverviewPage`, `FormRegistryPage`, `FormRecordPage`, `DataSourceRegistryPage`, `SourceVersionListPage`, `SourceVersionEditorPage`; components `WorkflowUi`, `FormEditor`, `SourceColumnTable`, `SourceValidationPanel`; `sourceMappingModel.js`, `workflowManagerModel.js`, `workflowManagerContract.js`; `styles/workflow-manager.css`.
**Frontend tests:** new `tests/workflowSmartMapping.test.mjs`; `tests/workflowSourceMapping.test.mjs`.
**Docs:** guides 01–05, `USER-GUIDE-INDEX.md`, `SCREEN-GUIDE-MATRIX.md`, `WORKFLOW-SETUP-USER-GUIDE.md`, `CURRENT-HANDOFF.md`, this handoff.

## 5. `zrv.wf.form/2` contract

`{ root: { alias, sourceVersionId, keyCandidate }, sources: [{ alias, sourceVersionId }], relationships: [...], fields, attributes, orgScope, status, events, deepLink, recordAccess }`; stored with `schema: 'zrv.wf.form/2'`, `SCHEMA_VERSION = 2`, `HEADER_SOURCE_VERSION_ID = root.sourceVersionId`.

| Rule | Behaviour |
|---|---|
| Kinds | `SINGLE_LOOKUP` (exactly one), `OPTIONAL_LOOKUP` (zero or one), `COLLECTION` (zero or many), `REQUIRED_COLLECTION` (one or many) |
| Graph | One parent per source, every source reachable from the root (cycles → `RELATIONSHIP_CYCLE`), depth ≤ 4, ≤ 2 nested collections, total row budget ≤ 10 000, ≤ 20 sources |
| Joins | Exposed columns, compatible types without implicit conversion, composite pairs allowed |
| Lookups | Must join on a key candidate of the looked-up source (`LOOKUP_KEY_REQUIRED`); declared key → `PROVISIONAL_LOOKUP_KEY` blocker; no order (no "first row") |
| Collections | `orderBy` required, `maxRows` required (never truncated), keyed via a key candidate (declared → blocker) or keyless with acknowledgement (DISPLAY/TEMPLATE only, blocker, cannot own collections) |
| Organization | `PARENT_RECORD`, `SAME_ORGANIZATION` (organization column pair must be in the join), `REFERENCE_DATA` (lookups only) |
| Filters | Typed equality only: `FIXED` canonical values or allowlisted `CONTEXT` (`FORM_CODE`, `ORGANIZATION_SCOPE`); unknown properties (SQL, expressions) rejected |
| Semantics placement | Status from the root; organization-scope field from the root or mandatory lookups; person attributes from root or lookups (not collections) |
| Access | Root access is not blanket access: personal/sensitive fields of related sources raise `RELATED_SOURCE_ACCESS_UNVERIFIED` until their access rule exists (M2-C/G3) |
| Verification | `VERIFIED` / `PROVISIONAL` with evidence per relationship; provisional → `PROVISIONAL_RELATIONSHIP` blocker |

## 6. `zrv.wf.businessRecord/1`

Assembled from rows already read by an authorized reader (later packages): record key (canonical), organization, mapped status, root fields, each lookup as an object or `null`, each collection as `{ cardinality, keyed, complete: true, rowCount, rows }` with per-row keys, provenance of every source version. Fail-closed errors: `ROOT_NOT_FOUND`, `ROOT_AMBIGUOUS`, `LOOKUP_REQUIRED_MISSING`, `LOOKUP_AMBIGUOUS`, `COLLECTION_OVERFLOW`, `COLLECTION_REQUIRED_EMPTY`, `ROW_KEY_DUPLICATE`, `ROW_FILTER_MISMATCH`, `ROW_COLUMN_MISSING`, `STATUS_UNMAPPED`, `VALUE_INVALID`, `ORGANIZATION_SCOPE_UNAVAILABLE`, `AUDIENCE_REQUIRED`. Fields above the stated audience sensitivity are returned as `REDACTED` (value never included). It executes no SQL and decides no access.

## 7. Oracle TEST evidence (read only, 21 November 2026)

All checks ran as `XXZP` on `G480281AE328134_ZPADWTEST` inside `SET TRANSACTION READ ONLY` with SELECTs only, ending with a rollback.

| Check | Result |
|---|---|
| `XX_ZRV_WF_FORM_VERSIONS` dictionary | 16 columns as designed; checks `ZWF_CK_FV_1..7` ENABLED VALIDATED, including `SCHEMA_VERSION > 0` and `CONFIG_JSON IS JSON STRICT WITH UNIQUE KEYS`; trigger `TR_WF_FV_IMM` enabled; 0 rows. **`zrv.wf.form/2` needs no DDL.** |
| Extended `findVersionReferences` (branch code) | Executes; for a non-existent version: header 0, lines 0, graph 0, unverifiable 0, 1 visible foreign key |
| `listForms` / `listSources` with `defaultVersionNo` (branch code) | Execute; `SICK_LEAVE` 0 versions / null, `WF_M1_TEST_SOURCE` 0 versions / null |
| Scoped RBAC preview | MATCH 52 / MISSING 0 / CONFLICT 0 / UNREGISTERED 0 — nothing written; `SOURCE_MAPPING` VIEW/CREATE/UPDATE/DELETE granted to `SUPER_ADMINISTRATOR` |

No DDL, DML, RBAC catalogue write or grant was executed.

## 8. Authentication and permissions

No new permission, route, navigation entry or RBAC catalogue record. Every screen keeps its existing permission and route guards; technical details on the form page appear only for `FORM_REGISTRY:UPDATE`/`CREATE` holders (display only — the API is unchanged and already restricted). The M2-A G1 registration and grants are complete and were not re-applied.

## 9. Acceptance matrix (spec §10)

| Scenario | Evidence now | Status |
|---|---|---|
| Business user creates workflow for a pre-onboarded form; no Oracle/PK/FK/join inputs | Overview/registry/form page show only business readiness; static tests forbid designer links | Ordinary flow (M3) **not built**; no faux control |
| Form not yet onboarded | *Not onboarded* / *Data in setup*, no ready action (`workflowSmartMapping.test.mjs`) | Done |
| Enforced key and composite key | Recommendation only from enforcement (client); composite canonical root key (`workflow-form-graph.test.js`) | Done |
| No PK or FK | Declared key + provisional relationship with blockers (contract tests) | Contract done; onboarding UI for relationships is M2-B |
| Declared key duplicates/nulls | Existing observation findings; `ROW_KEY_DUPLICATE`, never first row | Done |
| Multiple lines and lookup per line | Structured collection, item per line, header once | Done (assembler) |
| Optional vs required missing lookup | `null` vs `LOOKUP_REQUIRED_MISSING` | Done (assembler) |
| Single lookup multiple matches | `LOOKUP_AMBIGUOUS` | Done (assembler) |
| Keyless lines | Duplicates preserved; DISPLAY/TEMPLATE only; blockers | Done |
| Sensitive related fields / cross-org | Redaction, `RELATED_SOURCE_ACCESS_UNVERIFIED`, organization-scoped joins | Done (contract/assembler); runtime access providers M2-C/G3 |
| Collection condition complete or fail closed | `COLLECTION_OVERFLOW`, `complete: true` | Foundation done; aggregates M3 |
| Source deletion with v2 nested references | `SOURCE_VERSION_REFERENCED` / fail closed (`workflow-source-mapping.test.js`) | Done |
| Drift, concurrency, clone/delete, immutability | All M2-A suites unchanged and passing | Done |
| M1 registration and RBAC regression | All M1 suites passing; RBAC preview 52/0/0 | Done |
| Email header + repeating lines (M4) | Result model traceable (`zrv.wf.businessRecord/1`) | Renderer M4 |
| Screen design: patterns, keyboard/mobile/a11y, truthful states, guides | Existing Orvexa/ITSAZZ classes and tokens; named controls, step navigation with `aria-current`, responsive grids; guides 01–05 | Done in code; **live check pending** |

## 10. Validation and test evidence

| Check | Command | Result | Date |
|---|---|---|---|
| Server lint, format, all tests | `cd server; npm run check` | passed — 1101 tests: 1094 pass, 0 fail, 7 todo (pre-existing) | 2026-11-21 |
| New graph/assembler suite | `tests/workflow-form-graph.test.js` | 17 passed | 2026-11-21 |
| Source mapping API (incl. v2 references) | `tests/workflow-source-mapping.test.js` | 42 passed | 2026-11-21 |
| Client lint | `cd client; npm run lint` | 0 errors (2 pre-existing warnings outside Workflow Manager) | 2026-11-21 |
| Client tests | `cd client; npm test` | 579 tests: 576 pass, 0 fail, 3 todo (pre-existing) | 2026-11-21 |
| Client build and release checks | `npm run build`; `node scripts/verify-production.mjs` | passed | 2026-11-21 |
| Formatting | `prettier --check` (changed areas) | clean | 2026-11-21 |

Mocks are not proof of Oracle behaviour; the changed SELECT statements were executed read-only on TEST (§7).

## 11. Screenshots

None. The redesigned screens have not been opened in a browser against TEST; the owner-executed TEST acceptance (below) captures them for guides 01–05.

## 12. TEST acceptance steps (owner)

1. Deploy the merged `main` to TEST (frontend and backend).
2. Sign in as a `SUPER_ADMINISTRATOR` member. **Overview:** *Business forms* shows *Sick Leave* (or the registered name) with *Not onboarded* and the onboarding next step; no *Configure workflow* button; counts unchanged.
3. **Form registry:** *Workflow readiness* column; no detail route column. Open the form: *Readiness for workflows* (Registered done, Business data prepared not started, Workflow configured not available yet); **Technical details** shows code/route/record version. Sign in as a view-only user (if available): no technical details.
4. **Edit** the form name and save; reload; record version +1 (technical details). Register a test form: business fields first, *Technical identity* group with form code and detail page address.
5. **Data source registry:** *Approved fields: Not set up* for `WF_M1_TEST_SOURCE`; **Manage fields** opens *Fields of …* with *Readiness* and **Start a new version**.
6. **Start a new version:** step 1 lists live columns with readable names and kinds; select two; privacy shows *Choose…*; select **Save draft** on step 3 without choosing → *Fix the steps marked with !* and step 1 marked; choose privacy.
7. Step 2: if the table has an enforced primary key, *Record identifier found* → **Use this identifier**; otherwise *No verified record identifier found* and **Technical onboarding**.
8. Step 3: summary; **Save draft** → *Draft version 1 saved.*, *Saved and checked*. List shows **Continue draft version 1**.
9. **More actions:** *Check for source changes* (no changes), *Re-check this draft*, *Start a new draft from this version* (version 2), *Delete draft* on version 2.
10. Optional: open a second tab, save in one, then save in the other → *Someone else changed this record…* with **Reload latest (discards your changes)**.
11. Capture screenshots (no sensitive data) for guides 01–05 and record pass/fail here and in the M2-A handoff (M2-A acceptance can be executed in the same cycle).

## 13. Known limitations and dependencies

- No API writes or reads `zrv.wf.form/2` yet (M2-B); the contract and assembler are tested libraries.
- Readable names are suggestions from database names (display only); business labels for fields are defined per form in the form mapping (`fields[].label`, M2-B).
- The overview shows the first 20 active forms (ready first) with a link to the full registry.
- The guided setup uses the existing M2-A API unchanged; a declared identifier still requires the M6 approval step.

## 14. Rollback

Revert the Pull Request. No database object, data, RBAC record or grant was changed; `defaultVersionNo` is an additive response field.

| Handoff accepted by | Pending |
|---|---|
