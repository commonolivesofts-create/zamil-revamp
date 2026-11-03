# 04 — Data source registry

| Item | Value |
|---|---|
| Package | M1 — Module foundation and form registry |
| Screen | **Data source registry** (with the *Register data source*, *Edit data source* and *Versions* dialogs) |
| URL | `/workflow-manager/data-sources` (filters kept in the address) |
| Audience | Source administrators |
| Required permission | `WORKFLOW_MANAGER.DATA_SOURCE_REGISTRY:VIEW` |
| Further actions | Register: `DATA_SOURCE_REGISTRY:CREATE` · Edit: `UPDATE` · Activate: `ACTIVATE` · Deactivate: `DEACTIVATE` |
| API | `GET/POST /api/v1/workflow-manager/data-sources`, `GET/PUT …/data-sources/{sourceId}`, `GET …/{sourceId}/versions`, `POST …/{sourceId}/activate`, `…/deactivate`, `GET …/lookups/source-policy`, `GET …/lookups/source-objects` |
| Oracle | `XX_ZRV_WF_DATA_SOURCES` (read/write), `XX_ZRV_WF_SOURCE_VERSIONS` (read only), `ALL_OBJECTS` dictionary (names only) |
| Verification status | **Implemented — verified by automated tests only.** Pending G1 catalogue registration; live browser verification and screenshots follow. |

## Purpose

A **data source** names one approved place a registered form's records live in: an Oracle
**table**, an Oracle **view**, or a **server handler** (server-side code). The registry stores only
that identity. It never reads business data, and it never accepts SQL text.

Every table or view is checked when you save:

1. The **owner** (schema) must be on the approved allowlist (currently `XXZP`, the application
   schema).
2. The name must not start with a protected prefix (`XX_ZRV_` — application security, session,
   permission and workflow tables can never be sources).
3. The object must **exist** in the Oracle dictionary, be of the **selected kind** (table or view)
   and be **VALID**.

**Server handlers:** none are registered in this release, so the *Server handler* kind is shown
but cannot be selected. Handlers are introduced with the form mapping package (M2).

## How to get there

**Workflow Manager → Data source registry** in the sidebar, or the **Data sources** card on the Overview.

## Screen elements

### Header

| Control | What it does | Shown / enabled when |
|---|---|---|
| **Register data source** | Opens the registration dialog. | Shown with `CREATE`; enabled once the allowlist policy has loaded |

### Search, filters, table

| Element | Meaning |
|---|---|
| **Search** | Contains-match on source code, name, object or handler name (2–100 characters). |
| **Kind** | All kinds, Tables, Views or Server handlers. |
| **Status** | All, Active or Inactive. |
| **Sort by** | Source code, Source name, Kind or Last updated, ↑ / ↓. |
| Columns | **Source** (name and code), **Kind**, **Object or handler** (`OWNER.OBJECT` or handler code), **Versions**, **Status**, **Last updated** |
| **Versions** (row) | Read-only list of the source's versions (created by package M2). |
| **Edit** (row) | Opens the edit dialog. With `UPDATE`. |
| **Activate** / **Deactivate** (row) | Confirmation dialog. With `ACTIVATE` / `DEACTIVATE`. |

Pages hold 20 sources; use **Previous** / **Next**.

### Register / edit dialog fields

| Field | Required | Rules |
|---|---|---|
| **Source code** | Yes (register only) | Upper-case letters, digits, underscores; at most 80; unique. **Permanent** — read only when editing. |
| **Source name** | Yes | 1–200 characters. |
| **Source kind** | Yes | *Table*, *View* or *Server handler* (disabled while no handlers exist). |
| **Owner (schema)** | Table/View | Choose from the approved owners. |
| **Table name** / **View name** | Table/View | Oracle name: letters, digits, `_`, `$`, `#`; at most 128; converted to upper case. Type at least 2 characters to see up to 50 matching approved names as suggestions. |
| **Handler** | Server handler | One of the registered handlers. |

When a source **already has versions**, its kind, owner and object are **locked**; only the name can
change. To use a different object, register a new data source.

## Step by step — register a table source

1. Open **Workflow Manager → Data source registry** and select **Register data source**.
2. Enter the **Source code**, e.g. `TRAVEL_REQUEST_HEADER`, and a **Source name**.
3. Keep **Source kind** = *Table* (or choose *View*).
4. Keep **Owner** = `XXZP`.
5. Start typing the **Table name**; pick the right name from the suggestions.
6. Select **Register**. The button shows *Registering…*; further clicks are ignored.
7. On success the dialog closes, *Data source `TRAVEL_REQUEST_HEADER` registered.* appears and the
   list reloads.

### Edit or deactivate

- **Edit** → change the name (or, if *Versions* is 0, the kind/object) → **Save changes**.
  **Save changes** is disabled while nothing changed (*No changes to save.*).
- **Deactivate** → **Deactivate**. The source stays registered with its history; nothing is deleted.

## What happens when you save

| Action | Database effect | Notifications |
|---|---|---|
| Register | One `XX_ZRV_WF_DATA_SOURCES` row: kind, owner/object or handler, `IS_ACTIVE='Y'`, `ROW_VERSION=1`, your user as creator, UTC timestamps. | None |
| Save changes | Name (and identity, while no versions exist) updated; `ROW_VERSION` +1 — only if nobody changed it since it was loaded. | None |
| Activate / Deactivate | `IS_ACTIVE` set; `ROW_VERSION` +1. | None |

No business table is read or changed, and no workflow requests, tasks or e-mails are created.

## Worked example (fictional data)

*Test Admin* registers `TRAVEL_REQUEST_HEADER`, *Travel request header*, kind *Table*, owner
`XXZP`, table `XXZP_TRAVEL_REQUEST_T`. Because that table does not exist in the database, the
dialog answers *No table or view with this owner and name exists in the database.* — nothing is
saved. *Test Admin* types `TRAVEL`, chooses the real table offered in the suggestions, and
registers it successfully. (All names here are illustrations; register only real, verified objects.)

## Validation and troubleshooting

| Message | Cause | What to do |
|---|---|---|
| *No table or view with this owner and name exists in the database.* | `SOURCE_OBJECT_NOT_FOUND` | Use a suggestion; check spelling. |
| *The object exists, but it is not of the selected kind…* | `SOURCE_OBJECT_TYPE_MISMATCH` | Switch between *Table* and *View*. |
| *…is not VALID in the database…* | `SOURCE_OBJECT_INVALID` (e.g. a view that no longer compiles) | Ask the database owner to fix the object first. |
| *Application security, session, permission and workflow tables can never be workflow sources.* | `SOURCE_OBJECT_PROTECTED` (`XX_ZRV_…`) | Choose the business table. |
| *This schema owner is not on the approved source allowlist.* | `SOURCE_OWNER_NOT_ALLOWED` | Only approved owners can be used; adding one needs a reviewed code change. |
| *This handler is not registered on the server.* | `SOURCE_HANDLER_NOT_ALLOWED` | Handlers arrive with package M2. |
| *A data source with this code is already registered…* | `409 SOURCE_CODE_EXISTS` | Choose another code. |
| *This source already has versions, so its kind and object can no longer change…* | `409 SOURCE_IDENTITY_LOCKED` | Register a new data source. |
| *Someone else changed this record after you opened it…* | `409 STALE_RECORD` | Close, let the list reload, reopen and retry. |
| *The source allowlist policy could not be loaded…* with **Retry** | Policy lookup failed. | Register/Edit stay unavailable until **Retry** succeeds. |
| *Suggestions are unavailable…* | Dictionary lookup failed. | You can still type the name; it is verified on save. |
| *The server did not confirm the result…* | Network/server failure. | Reload the list and check before retrying. |

## Related guides

[01 — Navigation](01-workflow-manager-navigation.md) · [02 — Form registry](02-form-registry.md) · [03 — Register or edit a form](03-form-registration.md)

## Verification

| Check | Result |
|---|---|
| Allowlist (owner, protected prefix, existence, type, VALID status), handler refusal, identity shape, duplicate, identity lock, stale edit, filters, versions, dictionary lookup | `server/tests/workflow-manager.test.js` *data source registry* suite passed |
| Client validation, payload normalization, contract | `client/tests/workflowManager.test.mjs` passed |
| SQL against Oracle TEST | Dictionary lookups and source SELECTs executed read-only; INSERT/UPDATE compiled only (2026-11-02) |
| Live browser check and screenshot | **Not yet performed** — requires the G1-approved catalogue registration and a role grant on TEST |

Verified against branch `feat/workflow-manager-m1-foundation`, 2026-11-02.
