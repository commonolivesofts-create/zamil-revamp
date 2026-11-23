# 05 — Data source fields (guided setup)

| Item | Value |
|---|---|
| Package | M2-A — Universal data source version mapping; guided business-first layout from the Smart Mapping UX package |
| Screens | **Fields of {data source}** (versions list) and **Field version** (guided setup: create / view / edit), opened with **Manage fields** in the Data source registry |
| URLs | `/workflow-manager/data-sources/{sourceId}/mapping-versions` · `…/mapping-versions/new` · `…/mapping-versions/{versionId}` |
| Audience | **Data administrators** (one-time onboarding of a data source). Business users who design workflows never need these screens. |
| Required permissions | `WORKFLOW_MANAGER.SOURCE_MAPPING:VIEW` **and** `WORKFLOW_MANAGER.DATA_SOURCE_REGISTRY:VIEW` |
| Further actions | Start a new version / Start a new draft from this version: `SOURCE_MAPPING:CREATE` · Save draft / Re-check this draft: `SOURCE_MAPPING:UPDATE` · Delete draft: `SOURCE_MAPPING:DELETE` |
| API | `GET …/data-sources/{sourceId}/dictionary`, `GET/POST …/{sourceId}/mapping-versions`, `GET/PUT/DELETE …/mapping-versions/{versionId}`, `POST …/{versionId}/revalidate`, `GET …/{versionId}/drift`, `POST …/{versionId}/clone` (base `/api/v1/workflow-manager`) — unchanged by the redesign |
| Oracle | `XX_ZRV_WF_SOURCE_VERSIONS` (DRAFT rows written), `XX_ZRV_WF_DATA_SOURCES` (read, row lock), `XX_ZRV_WF_FORM_VERSIONS` (read, delete checks for `zrv.wf.form/1` and `/2`), Oracle dictionary views (read only), aggregate counts on the source object |
| Verification status | **Implemented — verified by automated tests.** `SOURCE_MAPPING` is registered on TEST (read-only preview 21 November 2026: MATCH 52 / MISSING 0 / CONFLICT 0) and its four actions are granted to `SUPER_ADMINISTRATOR`. **Owner TEST acceptance and screenshots are still pending.** |

## Purpose

A registered data source says *where* a form's information lives (an approved table or view).
Its **field list** says *what forms may use from it*:

- which information is **selected** — nothing outside the selection can ever be used by a workflow;
- how **private** each selected piece is: *Public*, *Internal*, *Personal* or *Highly confidential*;
- how **one record is identified** exactly (the record identifier).

Every fact — types, lengths, empty values, identity columns, constraints — is read from the **live
Oracle dictionary** when you save. You only make the choices. Each saved choice is a **version**;
the server stores it with a fingerprint (SHA-256), so any later change is detectable.

These screens create and maintain **drafts only**. Review, approval and choosing the version in use
belong to the later governance package (M6); nothing here makes a version available to forms or
affects a running workflow.

## How to get there

**Workflow Manager → Data source registry** → on the source's row, **Manage fields**. The link
replaces the read-only *Versions* link when you hold `SOURCE_MAPPING:VIEW`. There is no separate
sidebar entry.

## Screen elements — Fields of {data source} (versions list)

| Element | Meaning / when shown |
|---|---|
| **Readiness** panel | Badge *Ready · version N* (an approved field list is in use), *In setup* (versions exist, none approved), *Not set up* or *Inactive*, a sentence saying what that means, status and number of versions. **Technical details** (select to expand): kind, database object (`OWNER.OBJECT`), source code. |
| Primary button | **Continue draft version N** when the newest draft on the first page exists and you hold `UPDATE`; otherwise **Start a new version** (with `CREATE`). Only one primary action is shown. |
| **Back to registry** | Returns to the data source registry. |
| **History** table | **Version** (with *In use* for the approved default), **Status** (*Draft*, *In review*, *Approved*, *Published*, *Retired*), **Last checked**, **Last updated**. Newest first, 20 per page. Fingerprints are on the version page under technical details. |
| **Edit** / **Open** (row) | Opens the version. *Edit* when it is a draft and you hold `UPDATE`. |
| **Delete** (row) | Confirmation, then the draft is removed. Only drafts, with `DELETE`. |

## Screen elements — Field version (guided setup)

The page has three **steps**. Select any step at the top to go to it; the current step is
highlighted, and a step showing **!** needs attention. A new version starts at step 1; an existing
version opens at step 3 (its summary). **Back** and **Next** move between steps.

### Step 1 — Choose information

| Control | Meaning |
|---|---|
| **Use** | Selects the information for forms. Nothing is pre-selected and there is no "select all": choose only what forms need. |
| **Information** | A readable name suggested from the database name (for example *Request date* for `REQUEST_DATE`), with the database name below it. Badges: *No longer in the source* (a saved column the object lost), *Cannot be shown to forms* (types such as BLOB), *Checks only* (selected but hidden from forms). |
| **Kind** | What the information holds, in plain words: *Text (up to 30 characters)*, *Whole number*, *Number with 2 decimals*, *Date (and time)*, *Long text* … |
| **Privacy** | Required for every selected row; starts empty (*Choose…*) so nothing is silently classified: *Public — anyone involved in the request*, *Internal — company staff*, *Personal — identifies a person*, *Highly confidential* (salary, health, disciplinary …). The legend below the table explains each. |
| **Find information** | Filters the rows by readable or database name. |
| **Technical options** | Shows **Visible to forms** (untick to keep a selected column *for checks only*), **Oracle type** (with *IDENTITY* badges) and **Empty values**. Only here can a column of an unsupported type be kept, hidden from forms. |
| **Clear selection** | Unselects everything. |

### Step 2 — Verify record identification

Workflows must always find exactly one record. The system recommends only an identifier the
**database guarantees** to be unique — an enforced primary key, otherwise the narrowest enforced
unique rule over never-empty columns. It never guesses from a column name such as `ID`.

| What you see | Meaning / action |
|---|---|
| *Record identifier found: …* with **Use this identifier** | The database enforces it. One click adds it (and selects its information; set its privacy in step 1). |
| *Record identifier: … · Verified by the database* | The chosen identifier is enforced. Nothing more to do. |
| *Record identifier: … · Provisional* | Declared by a data specialist; not guaranteed by the database. It must be approved before forms can rely on it. |
| *No verified record identifier found* | The database guarantees nothing unique. Records cannot be identified reliably until a data specialist declares an identifier in technical onboarding. |
| **Technical onboarding (data specialists): identifiers and evidence** (select to expand; opens automatically when there are problems or declared identifiers) | The full identifier editor: **Key code**, **Key columns** (single or composite, in the order ticked), enforcement badge (*Database-enforced · NAME* / *Declared — provisional*), and for declared identifiers **Assurance basis** (*Oracle identity column*, *Generated by the owning application*, *Attested by the data owner*), **Evidence reference**, **Rationale**; after saving, the **uniqueness observation** (counts only, dated) and who attested it. **Add key candidate** / **Remove**, up to 20. |

A declared identifier stays **provisional** even when the observation is clean: it is recorded as a
point to approve later and needs explicit approval in the governance package.

### Step 3 — Review & save

| Element | Meaning |
|---|---|
| Summary | *Information for forms: N selected (x public, y internal, …)*, *Kept for checks only*, *Record identifier* (verified / provisional / none). Status badge of the version. |
| **Technical details** | Database object, checked and updated (time and user), fingerprint (with a *MISMATCH* / *UNREADABLE* badge if the stored configuration no longer matches it), record version, when the dictionary was read. |
| **Check result** | *Saved and checked* (with notes to read) or *Not saved — N problems to fix* with *Nothing was changed* and, for server errors, a *Reference for support*. Each line says **what failed** and **How to fix**, then where it happened and the server code. **Must be approved later** lists approval blockers (they do not stop saving a draft). **Source changes** shows the result of a check for changes. |
| **More actions** (existing versions) | **Check for source changes** (any version; read only), **Re-check this draft** (saved drafts with `UPDATE`; disabled while you have unsaved changes), **Start a new draft from this version** (with `CREATE`; disabled when the stored configuration is not verified), **Delete draft** (drafts, with `DELETE`). |
| **Save draft** | Checks against the live source with fresh evidence and stores the draft. Shown on steps 2 and 3 for drafts you may change; enabled when there are unsaved changes (always for a new version). |
| *Unsaved changes* / *Fix the steps marked with !* | Shown in the action bar. |

## Step by step — prepare the first version

1. In the **Data source registry**, select **Manage fields** on the source.
2. Select **Start a new version**. Step 1 lists all information of the live object.
3. Tick **Use** for each piece forms need and choose its **Privacy**.
4. Select **Next**. In step 2, if *Record identifier found* appears, select **Use this identifier**.
   If its information was not selected yet, go back to step 1 and set its privacy.
   - If *No verified record identifier found* appears, a data specialist opens **Technical
     onboarding**, adds a key candidate and documents basis, evidence and rationale.
5. Select **Next**, read the summary and select **Save draft**. The button shows *Checking…*;
   further clicks are ignored.
6. On success you are taken to the saved draft (*Draft version 1 saved.*) at step 3. Read any notes
   and points to approve later.
7. If the save is refused, *Not saved* lists what failed and how to fix it, the step needing
   attention shows **!**, and your input stays on screen.

### Edit, re-check, check for changes, start a new draft or delete

- **Edit** a draft in steps 1–2, then **Save draft**. The save succeeds only if nobody changed the
  draft since you opened it.
- **Re-check this draft** after the source changed (for example a new constraint). If it no longer
  validates, *The draft no longer validates against the live source. It was left unchanged* appears
  with the findings — the saved draft is not touched.
- **Check for source changes** on any version to see whether information, types, identity,
  constraints or the object itself changed since it was checked.
- **Start a new draft from this version** — for example to change an approved field list. The new
  draft is checked again, declared identifiers are attested by you, and the original does not change.
- **Delete draft** removes an unused draft permanently.

## What happens when you save

| Action | Database effect | Notifications |
|---|---|---|
| Save draft (new) | One `XX_ZRV_WF_SOURCE_VERSIONS` row: next version number for the source, `LIFECYCLE_STATE='DRAFT'`, `IS_DEFAULT='N'`, no publication date, canonical `CONFIG_JSON` and its `CONFIG_SHA256`, `VALIDATED_AT/BY`, your user as creator, `ROW_VERSION=1`. | None |
| Save draft (edit) | Configuration, fingerprint and validation stamp replaced; `ROW_VERSION` +1 — only if it is still a draft and unchanged since you loaded it. | None |
| Re-check this draft | Same as an edit, with the saved choices and fresh evidence; nothing is written if validation fails. | None |
| Check for source changes, open, list | Nothing is written. | None |
| Start a new draft from this version | A new draft row as for *new*; the original row is not changed. | None |
| Delete draft | The draft row is deleted — only if it is unreferenced by any form mapping (header/root, `zrv.wf.form/1` lines or any source of a `zrv.wf.form/2` relationship graph), still a draft and unchanged. | None |

To verify the choices, the server reads only the **Oracle dictionary** and, for declared
identifiers, three **aggregate counts** on the source object (rows, rows with an empty key part,
duplicated key values) inside a read-only transaction. No business row is ever returned, displayed
or stored, and no workflow requests, tasks or e-mails are created.

## Worked example (fictional data)

*Test Mapper* opens **Manage fields** for source *Demo request header* (table
`XXZP.XXZP_DEMO_REQUEST_T`) and selects **Start a new version**. In step 1 they use *Request ID*,
*Request number* and *Organization ID* as *Internal*, and *Requester number* as *Personal*; under
**Technical options** they keep *Notes* selected as *Highly confidential* but untick **Visible to
forms** (*Checks only*). In step 2 the page shows *Record identifier found: Request ID* (primary
key); they select **Use this identifier**. Step 3 summarises *Information for forms: 4 selected (3
internal, 1 personal)*, *Kept for checks only: 1*, *Record identifier: Request ID (verified)*. They
select **Save draft**: *Draft version 1 saved.* (All names are illustrations; map only real,
verified objects.)

## Validation and troubleshooting

The **Check result** explains each problem in plain words. The server codes remain shown for
technical support:

| Message / code | Cause | What to do |
|---|---|---|
| *Choose who may see each selected piece of information (privacy).* | A selected row has no privacy. | Choose its privacy in step 1 (the row is highlighted). |
| `COLUMN_NOT_IN_SOURCE` / *No longer in the source* | Selected information no longer exists in the object. | Unselect it; reload the page to see the live information. |
| `COLUMN_TYPE_UNSUPPORTED` | Information such as BLOB was made visible to forms. | Unselect it, or keep it *for checks only* (technical options). |
| `KEY_COLUMN_NOT_EXPOSED` | The identifier uses information that is not selected / visible. | Select it in step 1 or choose another identifier. |
| `KEY_ASSURANCE_REQUIRED`, `KEY_ASSURANCE_INCOMPLETE` | A declared identifier has no (or incomplete) documentation. | In technical onboarding, choose a basis and fill in evidence and rationale. |
| `KEY_ASSURANCE_INCONSISTENT` | An identity basis was chosen but the dictionary shows no matching identity column. | Choose the basis that matches the column. |
| `KEY_TYPE_LOB`, `KEY_TYPE_UNSUPPORTED` | The information cannot identify a record. | Choose another identifier. |
| `KEY_DUPLICATES_OBSERVED`, `KEY_NULLS_OBSERVED` | Records currently share or lack identifier values. | Choose another identifier, or have the data owner correct the data. |
| `CONFIG_TOO_LARGE` | The configuration would exceed 256 KiB. | Select less information; very large requests are refused earlier with *413*. |
| *The registered table or view cannot be inspected…* (`SOURCE_OBJECT_UNAVAILABLE`) | The object is missing, INVALID, of another type or no longer allowed. | Ask the database owner; drafts cannot be saved until it is readable. |
| *The database dictionary did not answer in time* (`DICTIONARY_TIMEOUT`, 503) | Large object or busy database. | Try again later; nothing was saved. |
| *Someone else changed this record…* (`STALE_RECORD`) with **Reload latest (discards your changes)** | The draft changed after you opened it. | Note your changes, reload, apply them again. Your input stays until you reload. |
| `SOURCE_VERSION_NOT_DRAFT` | The version is no longer a draft. | Start a new draft from it. |
| `SOURCE_IDENTITY_CHANGED` | The source object changed while you were saving. | Reload and check the choices. |
| `SOURCE_VERSION_CONFLICT`, `SOURCE_BUSY` | Another change of the same source ran at the same moment. | Reload and try again. |
| `SOURCE_VERSION_REFERENCED` | A form mapping uses this draft (as its main source, a v1 line or any source of a v2 relationship graph). | It cannot be deleted. |
| `SOURCE_VERSION_DEPENDENCY_UNVERIFIED` | References to the draft cannot be verified safely (for example a form mapping of an unknown contract version). | Not deleted; ask the system owner to check the form mappings. |
| `SOURCE_VERSION_UNREADABLE` / fingerprint *MISMATCH* | The stored configuration does not match its fingerprint. | Do not start a new draft from it; report it to the system owner. |
| *The server did not confirm the result…* | Network/server failure. | The page reloads the stored state; check the version list before retrying. Quote the *Reference for support* if shown. |
| *You no longer have permission…* | Your access changed. | Your menu and buttons are refreshed. |

## Related guides

[04 — Data source registry](04-data-source-registry.md) · [01 — Navigation](01-workflow-manager-navigation.md) · Form business data mapping (06, package M2-B — planned)

## Verification

| Check | Result |
|---|---|
| Nine endpoints: authentication, CSRF, action-separated RBAC with the `DATA_SOURCE_REGISTRY:VIEW` prerequisite, default deny, Joi allowlist, ownership, canonical config and SHA, key assurance and observations, drift, clone, restricted delete (including `zrv.wf.form/2` graph references and unknown counts), non-draft immutability | `server/tests/workflow-source-mapping.test.js` passed |
| Concurrency interleavings | `server/tests/workflow-source-mapping-concurrency.test.js` passed |
| Client contract, service calls, editor rules (privacy required, no bulk selection), identifier recommendation from enforcement only, plain-language results | `client/tests/workflowSourceMapping.test.mjs`, `client/tests/workflowSmartMapping.test.mjs` passed |
| SQL against Oracle TEST | Read-only dictionary verification of the M2-A tables passed on 14 November 2026; the extended delete-dependency query executed read-only on TEST on 21 November 2026 |
| RBAC on TEST | `SOURCE_MAPPING` registered (MATCH 52 / MISSING 0 / CONFLICT 0, read-only preview 21 November 2026); VIEW/CREATE/UPDATE/DELETE granted to `SUPER_ADMINISTRATOR` (read-only check) |
| Live browser check and screenshots | **Not yet performed** — owner-executed TEST acceptance pending |

Verified against branch `feat/workflow-manager-smart-mapping-ux`, 2026-11-21.
