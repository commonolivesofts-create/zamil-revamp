# 03 — Register or edit a form (and organization scope)

| Item | Value |
|---|---|
| Package | M1 — Module foundation and form registry |
| Screens | **Register form** and the **registered form** page |
| URLs | `/workflow-manager/forms/new` · `/workflow-manager/forms/<formId>` |
| Audience | Configuration administrators |
| Required permissions | Register: `WORKFLOW_MANAGER.FORM_REGISTRY:CREATE` · View a form: `FORM_REGISTRY:VIEW` · Edit: `FORM_REGISTRY:UPDATE` · Activate/Deactivate: `FORM_REGISTRY:ACTIVATE` / `DEACTIVATE` |
| API | `POST /api/v1/workflow-manager/forms`, `GET/PUT …/forms/{formId}`, `GET …/forms/{formId}/versions`, `POST …/forms/{formId}/activate`, `…/deactivate`, `GET …/lookups/modules` |
| Oracle | `XX_ZRV_WF_FORMS` (read/write), `XX_ZRV_WF_FORM_VERSIONS` + `XX_ZRV_WF_SOURCE_VERSIONS` + `XX_ZRV_WF_DATA_SOURCES` (read only, version list), `XX_ZRV_APP_MODULES` (read only) |
| Verification status | **M1 screens accepted on TEST (7 November 2026). Business-first layout and readiness panel (Smart Mapping UX package) — verified by automated tests; live TEST check pending.** |

## Purpose

Registering a form tells the Workflow Manager that an existing business form exists, which module
owns it and where one of its records is opened in the application. It is the first step before a
form's data source, keys and statuses can be mapped (package M2) and a workflow designed (M3).

### About organization scope

The physical table `XX_ZRV_WF_FORMS` (verified in the Oracle TEST dictionary on 2026-11-02) has
**no organization-scope column**. Organization scope is part of the form's **versioned mapping**
(`XX_ZRV_WF_FORM_VERSIONS`), which records the verified record keys, statuses and organization
scope together and is configured in package M2. The registration page therefore records no
organization, and the mapping versions panel on the form page shows the versions that carry it.

## How to get there

- **Register:** Form registry → **Register form** (shown only with `CREATE`).
- **View or edit:** Form registry → **Open** on the row.

## Fields

Business fields come first. The **Technical identity** group (form code and detail page address)
is set once by the form administrator; it is shown when registering, and on the form page only to
users who may edit or register forms.

| Field | Required | Rules | Notes |
|---|---|---|---|
| **Form name** | Yes | 1–200 characters, no control characters. | The name business users know the form by; shown in lists and later in workflow screens. |
| **Owning module** | Yes | Must be an **active** module of the permission catalog. Security administration and Workflow Manager cannot own forms. | The list shows *Module name (CODE)*. |
| **Description** (optional) | No | At most 1000 characters. | Free text for administrators. |
| **Form code** (*Technical identity*) | Yes | Upper-case letters, digits and underscores, starting with a letter; at most 80 characters; unique. | Typed letters are converted to upper case. **Cannot be changed after registration** — it is the form's permanent identity. |
| **Detail page address** (optional, *Technical identity*) | No | An application route: starts with `/`, lower-case segments with digits and hyphens, and `:parameters`, e.g. `/hr/employee-services/sick-leave/:leaveId`. No web address, query string or `..`. At most 500 characters. | Used later to link a workflow task to the form record. Stored as the detail route. |

## Step by step — register a form

1. Open **Workflow Manager → Form registry** and select **Register form**.
2. Enter the **Form name**, e.g. `Travel Request`, and choose the **Owning module**.
3. Optionally enter a **Description**.
4. Under **Technical identity**, enter the **Form code**, e.g. `TRAVEL_REQUEST`, and optionally the
   **Detail page address**.
5. Select **Register form**. The button shows *Registering…* and further clicks are ignored.
6. On success the form's own page opens with *Form `TRAVEL_REQUEST` registered.*

**Cancel** returns to the Form registry without saving. *Unsaved changes* appears beside the
buttons once you have typed something.

## The registered form page

The page title is the form name; the module is shown below it.

| Panel | Content and controls |
|---|---|
| **Readiness for workflows** | Three stages with only provable states: **Registered** (done), **Business data prepared** (done when an approved business data version is in use; *in progress* while versions exist but none is approved; *not started* otherwise) and **Workflow configured** (*not available yet* — the workflow designer, package M3, is not released; there is no button for it). The badge repeats the readiness (*Data ready*, *Data in setup*, *Not onboarded*, *Inactive*). |
| **Registration** | Status, module, number of business data versions, *Registered* (date and the registering user's name), *Last updated*. **Activate** / **Deactivate** (with permission) opens a confirmation. **Technical details** (users with `UPDATE` or `CREATE` only; select to expand): form code, module code, detail route, record version. |
| **Edit details** (with `UPDATE`) or **Details** (view only) | The fields above; the technical identity group appears only for form administrators, and the form code is read only. **Save changes** is enabled only when something changed; **Discard changes** restores the loaded values. Without `UPDATE` all fields are read only and no buttons are shown. |
| **Business data versions** | Read only: version (*In use* marker for the approved default), status (*Draft, In review, Approved, Published, Retired*), approval and update time. Form administrators also see the main data source and the configuration fingerprint (first 12 characters of its SHA-256). *No versions yet…* until a data administrator prepares the form's business data (package M2-B). |

### Step by step — edit a form

1. Open the form from the Form registry.
2. Change **Form name**, **Owning module**, **Description** or, under **Technical identity**, the
   **Detail page address**.
3. Select **Save changes**. On success *Changes saved.* appears and *Record version* (technical
   details) increases by 1.

Changing the module checks it again; keeping an unchanged module is always accepted, even if the
module was deactivated in the catalog later.

## What happens when you save

| Action | Database effect | Notifications |
|---|---|---|
| Register | One row in `XX_ZRV_WF_FORMS`: `IS_ACTIVE='Y'`, `ROW_VERSION=1`, `CREATED_BY`/`UPDATED_BY` = your user, UTC timestamps. | None |
| Save changes | Name, module, route and description updated; `UPDATED_AT`/`UPDATED_BY` set; `ROW_VERSION` +1 — only if nobody else changed the form since you opened it. | None |
| Activate / Deactivate | `IS_ACTIVE` set; `ROW_VERSION` +1. Nothing is deleted. | None |

No workflow requests, approval tasks or e-mails are created by any of these actions. Each change
is recorded in the application log with your user ID.

## Worked example (fictional data)

*Test Admin* registers code `TRAVEL_REQUEST`, name *Travel Request*, module *HR*, detail route
`/hr/travel-requests/:requestId`. The page opens showing *Not onboarded* with **Registered** done,
**Business data prepared** not started and **Workflow configured** not available yet, *Active*,
*Business data versions 0* and, under technical details, *Record version 1*. Later, *Test Admin* corrects the name to *Business Travel Request* and saves:
*Record version 2*. These names and the route are illustrations only; use the real, verified form
code and route when registering an actual form.

## Validation and troubleshooting

| Message | Cause | What to do |
|---|---|---|
| *Form code must use upper-case letters, digits and underscores…* | Spaces or symbols in the code. | Use e.g. `TRAVEL_REQUEST`. |
| *Enter an application route such as…* | The route is a web address, has a query string, `..` or upper-case letters. | Enter the in-app path only. |
| *A form with this code is already registered…* | `409 FORM_CODE_EXISTS` (also when two people register the same code at once). | Choose another code, or open the existing form. |
| *The module is not an active module of the permission catalog.* | The module is unknown or inactive. | Choose another module or ask a security administrator. |
| *This module cannot own workflow forms.* | Security administration or Workflow Manager chosen. | Choose the business module. |
| *Someone else changed this record after you opened it…* with **Reload the current values** | `409 STALE_RECORD`. | Select **Reload the current values**, re-apply your change and save. |
| *This form is not registered…* | Wrong or removed ID in the address. | Return to the Form registry. |
| *The server did not confirm the result…* | Network or server failure. | The page re-reads the form; check *Record version* before retrying. |
| *You no longer have permission…* | `403`. | Access is refreshed; ask your administrator. |

## Related guides

[01 — Navigation](01-workflow-manager-navigation.md) · [02 — Form registry](02-form-registry.md) · [04 — Data source registry](04-data-source-registry.md)

## Verification

| Check | Result |
|---|---|
| Registration, duplicate (incl. concurrent ORA-00001), module rules, route/length validation, update with optimistic locking, immutable code, activation, versions, Oracle-failure rollback | `server/tests/workflow-manager.test.js` passed |
| Client validation mirrors backend rules; payloads and CSRF | `client/tests/workflowManager.test.mjs` passed |
| SQL against Oracle TEST | SELECTs executed read-only; INSERT/UPDATE compiled only with `DBMS_SQL.PARSE`, never executed (2026-11-02) |
| Readiness panel, technical details only for form administrators | `client/tests/workflowSmartMapping.test.mjs` passed (2026-11-21) |
| Live browser check and screenshot | M1 screens accepted by the owner on TEST (7 November 2026). The redesigned layout is **not yet checked live** — owner TEST acceptance pending. |

Verified against branch `feat/workflow-manager-m1-foundation`, 2026-11-02; layout updated on
`feat/workflow-manager-smart-mapping-ux`, 2026-11-21.
