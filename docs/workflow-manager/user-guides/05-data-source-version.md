# 05 — Data source versions and approved allowlist

| Item | Value |
|---|---|
| Package | M2-A — Universal data source version mapping |
| Screens | **Source versions** (list) and **Source version** (create / view / edit), opened with **Manage mapping** in the Data source registry |
| URLs | `/workflow-manager/data-sources/{sourceId}/mapping-versions` · `…/mapping-versions/new` · `…/mapping-versions/{versionId}` |
| Audience | Source administrators |
| Required permissions | `WORKFLOW_MANAGER.SOURCE_MAPPING:VIEW` **and** `WORKFLOW_MANAGER.DATA_SOURCE_REGISTRY:VIEW` |
| Further actions | New version / Clone: `SOURCE_MAPPING:CREATE` · Save draft / Re-validate: `SOURCE_MAPPING:UPDATE` · Delete draft: `SOURCE_MAPPING:DELETE` |
| API | `GET …/data-sources/{sourceId}/dictionary`, `GET/POST …/{sourceId}/mapping-versions`, `GET/PUT/DELETE …/mapping-versions/{versionId}`, `POST …/{versionId}/revalidate`, `GET …/{versionId}/drift`, `POST …/{versionId}/clone` (base `/api/v1/workflow-manager`) |
| Oracle | `XX_ZRV_WF_SOURCE_VERSIONS` (DRAFT rows written), `XX_ZRV_WF_DATA_SOURCES` (read, row lock), `XX_ZRV_WF_FORM_VERSIONS` (read, delete checks), Oracle dictionary views (read only), aggregate counts on the source object |
| Verification status | **Implemented — verified by automated tests only.** The `SOURCE_MAPPING` permissions are not yet registered (gate G1), so the screens deny everyone on TEST until the owner registers and grants them. Live browser verification and screenshots follow. |

## Purpose

A registered data source says *where* a form's records live (an approved table or view). A
**source version** says *what may be used from it*:

- which columns are in the mapping (the **allowlist**) — nothing outside it can ever be used by a
  workflow;
- which of those columns are **exposed** to form mappings and workflow screens;
- how each column is **classified**: *Public*, *Internal*, *Personal* or *Sensitive*;
- which columns **identify one record** — **key candidates**, single or composite.

Every fact — column types, lengths, nullability, identity columns, constraints — is read from the
**live Oracle dictionary** when you save. You only make the choices. The server stores the result as
a canonical configuration with a fingerprint (SHA-256), so any later change is detectable.

This package creates and maintains **drafts only**. Review, approval, publication and default
selection belong to the later governance package (M6); nothing on these screens publishes a
version or affects a running workflow.

## How to get there

**Workflow Manager → Data source registry** → on the source's row, **Manage mapping**. The link
replaces the read-only *Versions* link when you hold `SOURCE_MAPPING:VIEW`. There is no separate
sidebar entry.

## Screen elements — Source versions (list)

| Element | Meaning / when shown |
|---|---|
| Source panel | Source name, `OWNER.OBJECT` and kind, active status and number of versions. |
| **New version** | Opens an empty draft. With `CREATE`. |
| **Back to registry** | Returns to the data source registry. |
| Table | **Version** (number, *DEFAULT* badge if published as default), **State** (*Draft*, *In review*, *Approved*, *Published*, *Retired*), **Validated**, **Last updated**, **Fingerprint** (first 12 characters; hover for all 64). Newest first, 20 per page. |
| **Edit** / **View** (row) | Opens the version. *Edit* when it is a draft and you hold `UPDATE`; otherwise *View*. |
| **Clone** (row) | Confirmation, then a new draft is created from that version. With `CREATE`. |
| **Delete** (row) | Confirmation, then the draft is removed. Only for drafts, with `DELETE`. |

## Screen elements — Source version (editor)

### Source and version

Source name and object, source status, version number and state, when and by whom it was last
validated and updated, fingerprint (with a *MISMATCH* / *UNREADABLE* badge if the stored
configuration no longer matches it), record version, and when the dictionary was read.
Non-draft versions show *… versions are read-only. Clone this version to start a new draft.*

### Columns

| Control | Meaning |
|---|---|
| **In mapping** | Adds the column to the allowlist. Columns that are not ticked can never be used. |
| **Column** | Name, with badges: *IDENTITY ALWAYS / BY DEFAULT*, *CANNOT BE EXPOSED* (types such as BLOB), *NOT IN SOURCE* (a saved column the object no longer has). |
| **Oracle type**, **Nulls** | From the dictionary; read only. |
| **Exposed** | Makes the column available to form mappings. Enabled only for included columns of supported types. |
| **Data class** | *Public* — may be shown to anyone who can see the request; *Internal* — company-internal business data; *Personal* — identifies or describes a person; *Sensitive* — highly confidential (salary, health, disciplinary …). Required for every included column, exposed or not. |
| **Include all supported** / **Clear** | Bulk selection helpers. |

### Key candidates

| Control | Meaning |
|---|---|
| **Key code** | Upper-case letters, digits and `_`, starting with a letter; unique within the version. |
| **Key columns** | Tick one column (single key) or several (composite key); the order you tick is kept. Only included, exposed columns of key-eligible types (not CLOB, BLOB, LONG …) are offered. |
| Enforcement badge | *Database-enforced · NAME* — an enabled, validated primary key, unique constraint or valid unique index (with all columns NOT NULL) covers these columns, so Oracle guarantees uniqueness. *Declared — provisional* — Oracle does not; you must document the assurance. The server re-checks this on save. |
| **Assurance basis** | Declared keys only: *Oracle identity column (GENERATED ALWAYS / BY DEFAULT)*, *Generated by the owning application*, *Attested by the data owner*. An identity basis must match the dictionary. |
| **Evidence reference**, **Rationale** | Declared keys only; required (at most 500 / 1000 characters). |
| Saved evidence | After saving: how the key was saved, the **uniqueness observation** (row count, rows with a null key, duplicated key values — counts only, dated) and who attested it and when. |
| **Add key candidate** / **Remove** | Up to 20 keys. |

A declared key stays **provisional** even when the observation is clean: it is recorded as a
*publication blocker* and needs explicit approval in the governance package.

### Validation

Separate sections for **Errors** (the save was refused), **Warnings** (saved; worth reading),
**Publication blockers** (recorded for M6; they do not stop saving a draft) and the **Drift check**.
Each line shows where (column or key), what, and the stable code.

### Action bar

| Button | Does | Shown / enabled when |
|---|---|---|
| **Validate and save draft** / **Validate and save** | Validates against the live source with fresh evidence and stores the draft. | Drafts you may change; enabled when there are unsaved changes |
| **Re-validate** | Re-runs validation of the *saved* draft with fresh evidence and refreshes its validation time. | Saved drafts with `UPDATE`; disabled while you have unsaved changes |
| **Check drift** | Read-only comparison of the saved version with the live object. | Any version |
| **Clone** | New draft from this version's saved choices. | With `CREATE`; disabled when the stored configuration is not verified |
| **Delete draft** | Removes the draft after confirmation. | Drafts, with `DELETE` |
| *Unsaved changes* | Shown while your edits differ from the saved version. | — |

## Step by step — create the first version

1. In the **Data source registry**, select **Manage mapping** on the source.
2. Select **New version**. The editor lists every column of the live object.
3. Tick **In mapping** for each column forms may need; tick **Exposed** for the ones they may show
   or use; choose the **Data class** of each.
4. Under **Key candidates**, select **Add key candidate**, enter a code such as `REQUEST_PK` and
   tick the key column(s). Check the badge:
   - *Database-enforced* — nothing more to enter;
   - *Declared — provisional* — choose the **Assurance basis** and fill in **Evidence reference**
     and **Rationale**.
5. Select **Validate and save draft**. The button shows *Validating…*; further clicks are ignored.
6. On success you are taken to the saved draft (*Draft version 1 saved.*). Read any warnings and
   publication blockers.
7. If the save is refused, the **Errors** list says what to correct; your input stays on screen.

### Edit, re-validate, check drift, clone or delete

- **Edit** a draft, then **Validate and save**. The save succeeds only if nobody changed the draft
  since you opened it.
- **Re-validate** a saved draft after the source changed (for example a new constraint). If it no
  longer validates, *The draft no longer validates against the live source. It was left unchanged*
  appears with the findings — the saved draft is not touched.
- **Check drift** on any version (including published ones) to see whether columns, types,
  identity, constraints or the object itself changed since it was validated.
- **Clone** any version into a new draft — for example to change a published mapping. The new
  draft is validated again, declared keys are attested by you, and the original does not change.
- **Delete draft** removes an unused draft permanently.

## What happens when you save

| Action | Database effect | Notifications |
|---|---|---|
| Validate and save (new) | One `XX_ZRV_WF_SOURCE_VERSIONS` row: next version number for the source, `LIFECYCLE_STATE='DRAFT'`, `IS_DEFAULT='N'`, no publication date, canonical `CONFIG_JSON` and its `CONFIG_SHA256`, `VALIDATED_AT/BY`, your user as creator, `ROW_VERSION=1`. | None |
| Validate and save (edit) | Configuration, fingerprint and validation stamp replaced; `ROW_VERSION` +1 — only if it is still a draft and unchanged since you loaded it. | None |
| Re-validate | Same as an edit, with the saved choices and fresh evidence; nothing is written if validation fails. | None |
| Check drift, open, list | Nothing is written. | None |
| Clone | A new draft row as for *new*; the original row is not changed. | None |
| Delete draft | The draft row is deleted — only if it is unreferenced, still a draft and unchanged. | None |

To verify the mapping, the server reads only the **Oracle dictionary** and, for declared keys,
three **aggregate counts** on the source object (rows, rows with a null key part, duplicated key
values) inside a read-only transaction. No business row is ever returned, displayed or stored, and
no workflow requests, tasks or e-mails are created.

## Worked example (fictional data)

*Test Mapper* opens **Manage mapping** for source `DEMO_REQUEST_HEADER` (table
`XXZP.XXZP_DEMO_REQUEST_T`) and selects **New version**. They include `REQUEST_ID`, `REQUEST_NO`
and `ORG_ID` as *Internal*, `REQUESTER_NO` as *Personal* (exposed) and `NOTES` as *Sensitive*
(included, not exposed). Key `REQUEST_PK` on `REQUEST_ID` shows *Database-enforced ·
XXZP_DEMO_REQUEST_PK*. A second key `ORG_LINE` on `ORG_ID` + `LINE_NO` shows *Declared —
provisional*; they choose *Attested by the data owner*, evidence *Design note DEMO-7* and a
rationale. On save the server observes 0 null and 0 duplicated key values and stores draft
version 1 with one publication blocker (*A declared (provisional) key needs explicit approval
before publication*). (All names are illustrations; map only real, verified objects.)

## Validation and troubleshooting

| Message / code | Cause | What to do |
|---|---|---|
| `COLUMN_NOT_IN_SOURCE` | A chosen column does not exist in the object. | Remove it; reload the page to see the live columns. |
| `COLUMN_TYPE_UNSUPPORTED` | A column of a type such as BLOB was exposed. | Keep it included but not exposed. |
| `KEY_COLUMN_NOT_EXPOSED` | A key uses a column that is not exposed. | Expose the column or change the key. |
| `KEY_ASSURANCE_REQUIRED`, `KEY_ASSURANCE_INCOMPLETE` | A declared key has no (or incomplete) assurance. | Choose a basis and fill in evidence and rationale. |
| `KEY_ASSURANCE_INCONSISTENT` | An identity basis was chosen but the dictionary shows no matching identity column. | Choose the basis that matches the column. |
| `KEY_TYPE_LOB`, `KEY_TYPE_UNSUPPORTED` | The key column's type cannot be a key. | Choose another column. |
| `KEY_DUPLICATES_OBSERVED`, `KEY_NULLS_OBSERVED` | The live data already has duplicated or null keys. | Choose a different key, or have the data owner correct the data. |
| `CONFIG_TOO_LARGE` | The configuration would exceed 256 KiB. | Map fewer columns; very large requests are refused earlier with *413*. |
| *The registered table or view cannot be inspected…* (`SOURCE_OBJECT_UNAVAILABLE`) | The object is missing, INVALID, of another type or no longer allowed. | Ask the database owner; drafts cannot be saved until it is readable. |
| *The database dictionary did not answer in time* (`DICTIONARY_TIMEOUT`, 503) | Large object or busy database. | Try again later; nothing was saved. |
| *Someone else changed this record…* (`STALE_RECORD`) with **Reload latest (discards your changes)** | The draft changed after you opened it. | Note your changes, reload, apply them again. Your input stays until you reload. |
| `SOURCE_VERSION_NOT_DRAFT` | The version is no longer a draft. | Clone it to make a new draft. |
| `SOURCE_IDENTITY_CHANGED` | The source object changed while you were saving. | Reload and check the mapping. |
| `SOURCE_VERSION_CONFLICT`, `SOURCE_BUSY` | Another change of the same source ran at the same moment. | Reload and try again. |
| `SOURCE_VERSION_REFERENCED` | A form mapping uses this draft. | It cannot be deleted. |
| `SOURCE_VERSION_DEPENDENCY_UNVERIFIED` | References to the draft cannot be verified safely. | Not deleted; ask the system owner to check the form mappings. |
| `SOURCE_VERSION_UNREADABLE` / fingerprint *MISMATCH* | The stored configuration does not match its fingerprint. | Do not clone; report it to the system owner. |
| *The server did not confirm the result…* | Network/server failure. | The page reloads the stored state; check the version list before retrying. |
| *You no longer have permission…* | Your access changed. | Your menu and buttons are refreshed. |

## Related guides

[04 — Data source registry](04-data-source-registry.md) · [01 — Navigation](01-workflow-manager-navigation.md) · Form field mapping (06, package M2-B — planned)

## Verification

| Check | Result |
|---|---|
| Nine endpoints: authentication, CSRF, action-separated RBAC with the `DATA_SOURCE_REGISTRY:VIEW` prerequisite, default deny, Joi allowlist, ownership, canonical config and SHA, key assurance and observations, drift, clone, restricted delete, non-draft immutability | `server/tests/workflow-source-mapping.test.js` passed |
| Concurrency interleavings (first versions, numbering, identity change in both orders, stale updates, delete/update, dependency introduction, FK fail-closed, rollback) | `server/tests/workflow-source-mapping-concurrency.test.js` passed |
| Client contract, service calls, editor rules, routes and permissions | `client/tests/workflowSourceMapping.test.mjs` passed |
| SQL against Oracle TEST | **Not executed.** No read-only dictionary verification of `XX_ZRV_WF_SOURCE_VERSIONS` was performed in this package; it is required before TEST acceptance. |
| Live browser check and screenshots | **Not yet performed** — requires the G1-approved `SOURCE_MAPPING` registration and a role grant on TEST |

Verified against branch `feat/workflow-manager-m2-a-source-mapping`, 2026-11-09.
