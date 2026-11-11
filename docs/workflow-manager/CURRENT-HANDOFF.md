# Workflow Manager — Current Development Handoff

**As of 07 November 2026.** The original v3.0 requirements, the repository's `REQUIREMENTS-v3.1-LOCKED.md`, and `REQUIREMENTS-v3.2-LOCKED.md` jointly govern functional scope; v3.2 is the owner's final RFI/comments/FYI/portal clarification. Preserve all. Exactly two functional phases, with the M1–M7 and E1–E7 delivery packages in `DEVELOPMENT-ROADMAP.md`.

Owner-reported TEST ADW structural validation: 21 tables, 50 FKs, 48 valid explicitly named indexes, 16 enabled triggers, one-open-RFI unique index and all required constraints. Runtime smoke/integration of the later (M2–E7) tables is still outstanding. The locked v3.2 requirements, roadmap and standards were merged in PR #54; the M1 physical table reference is in `schema-reference/` (PR #57). Never bundle all 14 packages into one PR.

## M1 — Module foundation and form registry: COMPLETE, accepted on Oracle TEST

- **Code:** merged into `main` via [PR #56](https://github.com/commonolivesofts-create/zamil-revamp/pull/56) (squash commit `cbc121c`, 2 November 2026) — backend `/api/v1/workflow-manager` (18 operations), Overview, Form registry, Register/edit form and Data source registry screens, OpenAPI, automated tests and guides 01–04. Writes only `XX_ZRV_WF_FORMS` / `XX_ZRV_WF_DATA_SOURCES`; reads version metadata. The feature branch `feat/workflow-manager-m1-foundation` was retired (local and remote) on 7 November 2026 after verifying it held nothing beyond PR #56.
- **RBAC (G1, owner-executed on TEST):** `WORKFLOW_MANAGER` catalogue registered with the scoped registration from PR #58 — 1 module, 3 resources, 11 permissions (15 records); all 11 granted to `SUPER_ADMINISTRATOR`; scoped verification MATCH 47 / MISSING 0 / CONFLICT 0 / UNREGISTERED 0. Completed; do not rerun. Not registered on UAT or production.
- **Acceptance (7 November 2026):** **Workflow Manager M1 has passed the agreed owner-executed functional acceptance checks in Oracle TEST** — Overview counts, form registration/edit/persistence/record-version/deactivate/reactivate/search/filters/version display (`SICK_LEAVE`), data source registration/autocomplete/identity edit/deactivate/reactivate (`WF_M1_TEST_SOURCE`, `XXZP.XXZP_MDF_HEADER`), page-level denial for an account without permissions, and optimistic-locking rejection with reload across two tabs. TEST data left Active, no versions created. This is **not** a production deployment or release approval. Evidence: `docs/handoffs/FEATURE-WORKFLOW-MANAGER-M1.md` §10A.
- **Open M1 follow-ups:** the `SICK_LEAVE` registration's detail route has been corrected on TEST to `/hr/employee-services/sick-leave/:leaveId` (owner, after PR #67); `WF_M1_TEST_SOURCE` is a test registration and is **not** mapped to the Sick Leave Form; guides 01–04, the guide index and matrix still say live verification is pending and need a status update; optional G2 decision on security-audit codes for configuration changes.

## M2-0 — Universal mapping foundation (implemented, under review)

Backend library only, G3-approved 7 November 2026: canonical JSON and record keys, precise Oracle values, `zrv.wf.source/1` and `zrv.wf.form/1` contracts, key assurance, read-only dictionary verification and the form-owned RecordAccessProvider / SourceHandler contracts composed only in `integrations/index.js` (empty). No routes, screens, database writes or RBAC changes; form-independent. Details: `docs/handoffs/FEATURE-WORKFLOW-MANAGER-M2-0.md`. Next: M2-A, M2-B, M2-C (G2), then M6 governance.

## Next: M2 — Versioned form and data source mapping (M2-A onward not started)

Deliverable per the roadmap: source version builder; verified header/line keys including composite keys; organization and employee scope; field catalogue; statuses and permitted transitions mapped to verified stored values; form-owned status-handler contract; validated preview; draft/published immutability. Primary tables `XX_ZRV_WF_SOURCE_VERSIONS` and `XX_ZRV_WF_FORM_VERSIONS` (write), with the M1 registries read. Guides 05–07 and a `forms/<verified-code>.md` for each form actually onboarded.

Before coding, M2 must design and get reviewed what the repository does not yet define — the `CONFIG_JSON` schemas, line/detail-source representation (the physical schema has only `HEADER_SOURCE_VERSION_ID`), the handler contract, API contract and any new RBAC entries (G1) — and re-verify the live TEST dictionary, respecting the JSON, hash, default-version and published-immutability constraints/triggers listed in the M1 handoff §13. No change to Sick Leave behavior, the legacy workflow engine or the two-phase roadmap; no workflow instances, tasks or e-mails in Phase 1.

## Delegated Git operations

Claude Code may perform owner-delegated routine Git operations in the existing authenticated local shell. It must respect `CONTRIBUTING.md`: short-lived branch, clean worktree, precise diffs, checked and reviewed PR, no force push/main direct writes, no deletion before verified merge, no credential sharing/change and no circumventing G1–G4. GitHub PR reviews still require authorized approval.
