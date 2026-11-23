# Workflow Manager — Smart Form Data & Self-Service UX Specification

**Status:** Owner-requested design/UX implementation brief, documentation only; NOT implementation, TEST acceptance, Oracle change, or authorization to bypass G1–G4.  
**Prepared:** 21 November 2026  
**Authority:** Preserve ALL of original locked v3.0 plus `REQUIREMENTS-v3.1-LOCKED.md` and `REQUIREMENTS-v3.2-LOCKED.md`; follow `DELIVERY-AND-UX-STANDARD-LOCKED.md`, `DEVELOPMENT-ROADMAP.md`, and `CONTRIBUTING.md`. The verbatim v3.0 is not independently present here; do not claim a line-by-line audit.  
**Audience:** Claude Code and human implementers. **This is the self-contained record of the owner's ChatGPT discussion. Claude cannot read that discussion.**  
**No scope reduction:** This brief refines how existing and future functions are designed and presented. It does not delete, defer, or replace any locked business requirement. Two functional phases remain Phase 1 (M1–M7) and Phase 2 (E1–E7).

## 1. Problem observed in the actual merged M1 / M2-A UI

The existing UI is functionally technical-first and is too difficult even for a developer unfamiliar with the database; it is not appropriate as the normal self-service experience for nontechnical business users. This is **not** a request to weaken its backend validation. Current code examples:

| Current UI / implementation | Why users struggle | Required user-facing behavior |
|---|---|---|
| `WorkflowOverviewPage.jsx` suggests starting with form/source registration | Starting with technical registration does not explain the user's next business task | Show ready business forms, their verified readiness and a clear **Configure workflow** next action; only truthful backend-supported states |
| `FormRegistryPage.jsx`, `FormEditor.jsx` show form code, owning module and technical detail route | Users should not need to know route placeholders or internal codes | Display searchable friendly form name/status; ordinary workflow creation selects a ready form. Keep technical registration and route fields only with appropriate admin permissions |
| `DataSourceRegistryPage.jsx` exposes source kind, owner/schema, object names, versions | Business users should not select Oracle TABLE/VIEW/HANDLER | Use data sources as an internal onboarding/admin step; standard workflow flow offers approved **Request details**, **Requester** and **Requested items** |
| `SourceVersionListPage.jsx` displays fingerprint and version management prominently | Integrity hashes do not help a business user | Show meaningful readiness, draft/change history, one primary action; fingerprint remains available to technical admin or diagnostics |
| `SourceVersionEditorPage.jsx` shows **Source and version**, **Columns**, **Key candidates**, **Validation** panels with **Delete draft / Clone / Check drift / Re-validate / Validate and save** | Many competing operations and jargon obscure what should happen | Guided setup: **Choose information → Verify record identification → Review & save** for authorized data admins; standard workflow user sees preapproved data, not this wizard |
| `SourceColumnTable.jsx` uses **In mapping**, **Exposed**, **Data class**, Oracle types | Too many configuration concepts; can accidentally invite overexposure | Show business-friendly field labels, clear purpose and privacy, safe field selection; do not auto-expose columns or lower sensitivity |
| `SourceKeyCandidateEditor.jsx` requests **Key code**, manual key-column checkboxes, **Assurance basis**, **Evidence reference**, **Rationale** | PK/FK and attestation fields are not understandable to ordinary users | Automatically recommend only verified identifiers; show **Record identifier found**. If unverified, leave blocked/provisional and send to restricted technical onboarding; retain required evidence and owner attestation there |
| `SourceValidationPanel.jsx` surfaces technical findings | Users cannot identify how to recover | Explain **what failed, how to fix it, whether it saved**, with request ID where relevant; detailed error codes retained for technical administration |

Do not merely rename labels while retaining the same intimidating interaction or hiding critical errors. Use actual working API data and permitted controls. Do not invent unimplemented pages or claim data is ready when its integration is incomplete.

## 2. Clear ownership boundary — ordinary users never configure joins

**Business workflow administrator:** select an already-onboarded business form; use approved fields, attributes and collections; configure conditions, approvers/levels, actions, event notifications; simulate; enter maker/checker publication process. No schema, SQL, PK/FK, join, evidence-ref or rationale questions.

**Authorized data-onboarding administrator / form integration owner:** maintain a reusable, versioned, verified **form data profile**. Technical configuration is shown only where uncertainty remains; it is not part of every workflow creation.

**System:** verify registered sources; propose trustworthy identifiers/relationships; enforce form-owner record access, scope, classification, dependency integrity and published version pinning. A heuristic suggestion is NOT an approved relationship.

Once the profile is ready, business users must be able to design workflows themselves, without recurrent IT support. For a brand-new legacy form lacking trustworthy metadata, one-time technical onboarding is permitted and preferable to guesses.

## 3. Concrete target journeys (no SQL or schema knowledge)

**A. Business user / self-service**
1. Go to **Workflow Manager** and choose **Create workflow**.
2. Search/select a **ready** business form (e.g., material request, leave request; illustrative only).
3. See readable business field groups: **Request details**, **Requester / department**, **Requested items**, approved amounts and statuses. Never ask which Oracle columns join.
4. Configure routing conditions (including approved aggregate conditions on complete collections), sequential/conditional/parallel levels and authorized approvers.
5. Configure actions, RFI/FYI, comments, notifications and email content through approved fields/collections, retaining the locked v3.0/v3.1/v3.2 scope.
6. Simulate matching/unmatched scenarios, review and publish through maker/checker governance. A user must not be told features work until real M3/M4/M6 packages implement them.

**B. Data-onboarding admin (only when needed)**
1. Open the registered form profile; inspect auto-discovered verified sources and a proposed record identifier.
2. Confirm approved business fields and privacy classes, never defaulting sensitive data to exposed.
3. Where database PK/unique constraint exists, system recommends it. If none, a reliable application ID or composite key may be configured as **DECLARED/provisional**, with existing assurance, dated uniqueness observation and explicit M6 publication blocker.
4. Inspect relationships presented as **Single lookup / Optional lookup / Multiple items / Nested items**. Auto-accept only trusted evidence; ambiguous links require restricted verification of specific columns and cardinality.
5. Run safe read-only validation, see plain-language result, **Save draft**; published data profiles stay immutable.

**C. Approver / email recipient (later runtime packages)**
Open authorized request detail or notification and see one header, permitted requester/lookup information and an accurate repeating line table. Links open authenticated Workflow Action Portal, not public approval actions. Recipient sees only fields/comments within their scope.

## 4. Record identification without PK constraints

Preserve `zrv.wf.recordKey/1`, `recordKey.js`, `keyAssurance.js` and `sourceContract.js`: identity is **form + authorized organization scope + canonical business record key**, single or composite. Do not use ROWID or pick the first duplicate.

Support: Oracle enforced primary/unique keys; trusted application-generated ID; business number scoped by organization; composite ID. The system may recommend a column from trusted dictionary/form-owner evidence, **not** because it is named `ID`.

Without enforced uniqueness, keep declared-key assurance (`basis`, `evidenceRef`, `rationale`) and server attestation *restricted to technical onboarding*, keep provisional status and M6 publication blocker. Null/duplicate/current-data checks are observations, not guarantees. Runtime single-record reads fail closed on zero/multiple rows as currently required.

## 5. Generalized multi-source relationships

Current `zrv.wf.form/1` in `formContract.js` supports `header`, directly joined `lines`, keyless-line restrictions and fields, but does not represent a general graph of single lookups/nested joins. Extend via backward-compatible, reviewed contract version (candidate `zrv.wf.form/2`); retain the original reader/semantics.

Model a **single logical root** and registered, pinned source-version aliases connected through a **bounded acyclic relationship graph**, supporting:
- exactly-one; zero-or-one; zero-or-many; one-or-many;
- multiple independent detail collections;
- nested lookup from a line to its item; multi-hop department/employee lookups;
- composite column-pair joins and approved junction relationships;
- validated source/column types, cardinality and organization scope;
- typed allowlisted fixed/context filters, deterministic order and row/depth limits;
- explicit zero/multiple-match policy; no arbitrary `FETCH FIRST 1` for single lookup;
- no cycles, unbounded fan-out, Cartesian product, cross-organization joins or user-supplied raw SQL.

Illustrative **not verified** example: request header (1), request lines (many), requester employee (0..1 or 1 according to form contract), item master for each line (single). The engine must return a structured header plus lines, **not flattened rows that duplicate header totals**.

**Without FKs:** the system may discover candidates using approved form integration, verified dictionary metadata and bounded observations, but cannot infer semantic relationships with certainty from equal names/types. Never auto-publish unverified joins. A data specialist verifies uncertain join columns once; ordinary workflow users only see friendly business fields.

**Keyless lines:** preserve duplicates; display/template only with explicit acknowledgement and current blockers. Never silently promote keyless lines to individually actionable records or unsafe condition inputs.

## 6. One authorized business-data service — consumers and correctness

Define a reusable typed result representing root identity, approved header fields, zero/one related lookup objects, repeating collections, attributes, status, org scope, source/version provenance and explicit errors. The same model supplies:
- **M2-C** safe preview;
- **M3** approved condition inputs;
- **M4** EN/AR template variables, repeating tables, optional sections and recipient-safe comments;
- **E1–E7** execution, task context, snapshot/history, notification and reporting as authorized.

This document does **not** authorize implementing live emails or workflow execution in the current UX/foundation package.

Security: preserve form-owned `RecordAccessProvider` as root authority; **root access is not blanket access to related tables**. Define/verify additional related-source/purpose/recipient restrictions before executing reads; no admin bypass. Use bind variables, verified identifiers, approved read-only execution boundary, timeouts, row budgets, batched retrieval and consistent snapshots where needed. Never let template expressions execute arbitrary SQL.

Conditions on collections must be deterministic and based on complete authorized rows or approved full-data aggregates; display truncation cannot influence routing silently. Missing required lookup, duplicate single lookup, missing root, overflow, drift and access denial must fail explicitly. Optional missing lookup returns null; optional no lines returns empty array. No fabricated values.

## 7. Email and approval detail expectations

A future template designer should offer **Insert Request number**, **Requester**, **Request date**, **Requested items table**, **Total** and other approved business fields without SQL/HTML loops. One email displays one header plus each legitimate line, with item code/description lookup per line. Support scoped formatting, empty collections, row-limit policy, EN/AR, conditional sections and recipient-specific sensitive-data redaction. Notifications link to the authenticated shared action portal; a link is not approval authorization.

Keep locked distinctions among Approver, RFI answer-only, FYI information-only, forwarded/reassigned/delegated approval, comments, immutable per-cycle history, parallel voting and publication. No simplification may remove them.

## 8. Code impact (review against latest main before editing)

| Path | Intent |
|---|---|
| `server/src/modules/workflow-manager/mapping/recordKey.js` | Keep canonical record-key contract |
| `mapping/keyAssurance.js`, `mapping/sourceContract.js` | Preserve declared-key evidence, validations, privacy |
| `mapping/formContract.js` | Add versioned relationship graph and meaningful compatibility tests, gated where required |
| `mapping/recordAccess.js`, `integrations/index.js` | Preserve form-owned access; assess required purpose/related-source provider extensions under approval gates |
| `mapping/dictionary.service.js` | Verified evidence, not speculative relationships |
| `sourceMapping.repository.js`, `sourceMapping.service.js` | **Critical:** deletion/dependency checks currently understand root FK and `$.lines[*].sourceVersionId` of v1; extend fail-closed checks to ALL source references in v2 |
| Existing Workflow Manager React pages and components | Business-first hierarchy, reduced jargon, effective permissions, no faux features |
| M2-B / M2-C / M4 package code | Implement only in their scoped packages; do not report them as complete now |

Physical storage: `XX_ZRV_WF_FORM_VERSIONS` already has `CONFIG_JSON`, `SCHEMA_VERSION`, `CONFIG_SHA256`, `HEADER_SOURCE_VERSION_ID` in the repository design reference. Prefer versioned JSON, but **verify actual Oracle TEST dictionary read-only** before asserting that no DDL is necessary. Respect config size and dependency constraints. Do not auto-migrate stored mappings.

## 9. Scope, governance and Git workflow

**Target logical sequence:** design/contract/security review → approved module-local smart-mapping foundation and existing M1/M2-A UX improvement → M2-B form mapping → M2-C preview → M3/M4/M5/M6/M7 → E1–E7, following the existing roadmap. Do not turn the entire roadmap into one massive PR. Each implemented feature slice must include real backend/API, working frontend where applicable, tests, OpenAPI, guides and documented nonimplemented dependencies.

**G1** Oracle DDL/DML/RBAC catalogue writes; **G2** central auth/security behavior; **G3** protected shared contracts/infrastructure; **G4** CI3/business-form coexistence/ownership. This documentation is not approval to cross them. Keep the already completed M2-A source-mapping permission grants; do not reapply.

Before future coding, read current `main`, compare contract compatibility and inspect relevant backend/frontend/tests. Use a fresh task branch; configured user's Git identity; no main direct pushes; PR reviews/CI and required approvals; only after confirmed merge sync main and delete that merged task branch locally and remotely. Never delete unrelated/unmerged branches or uncommitted files.

## 10. Acceptance matrix — what future implementation must prove

| Scenario | Required evidence |
|---|---|
| Business user creates workflow for a pre-onboarded form | No Oracle field, PK/FK, join, evidence or rationale inputs on ordinary flow |
| Form not yet safely onboarded | Clear not-ready status, no pretend workflow-ready action |
| Enforced key and composite key | Verified recommendation; correct canonical scoped record |
| No PK or FK | Trusted declared identifier and approved logical relationship, with governance |
| Declared key duplicates/nulls | Explicit failure/provisional blocker; never select first row |
| Multiple lines and lookup-per-line | Correct complete structured collection, no accidental duplicates/truncation |
| Optional missing lookup; required missing lookup | Null vs explicit error |
| Single lookup returns multiple matches | Explicit ambiguity error |
| Keyless lines | Preserve rows/duplicates and display/template restrictions |
| Sensitive related fields or cross-org records | Restricted, redacted or denied correctly |
| Collection condition | Complete/approved aggregate or fail-closed; never truncated calculation |
| Source deletion with v2 nested references | Refused safely and consistently |
| Source drift, concurrent update, clone/delete and published immutability | Existing M2-A behavior preserved |
| M1 registration and RBAC regression | Existing accepted functionality unchanged |
| Email header + repeating lines (M4) | Design contract traceable now; working renderer tested when M4 ships |
| Screen design | Real ITSAZZ/Orvexa patterns, keyboard/mobile/a11y, truthful states, accurate user guides |

**Document-only PR acceptance:** this specification is linked from the documentation index; no app code, schema, migrations, RBAC or runtime changed. Implementers must not treat the descriptions of future screens as features already live.
