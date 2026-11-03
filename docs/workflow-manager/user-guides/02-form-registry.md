# 02 — Form registry (list and lookup)

| Item | Value |
|---|---|
| Package | M1 — Module foundation and form registry |
| Screen | **Form registry** |
| URL | `/workflow-manager/forms` (filters are kept in the address, e.g. `?status=INACTIVE&sortBy=FORM_NAME`) |
| Audience | Configuration administrators |
| Required permission | `WORKFLOW_MANAGER.FORM_REGISTRY:VIEW` |
| Further actions | Register: `FORM_REGISTRY:CREATE` · Activate: `FORM_REGISTRY:ACTIVATE` · Deactivate: `FORM_REGISTRY:DEACTIVATE` |
| API | `GET /api/v1/workflow-manager/forms`, `GET …/lookups/modules`, `POST …/forms/{formId}/activate`, `POST …/forms/{formId}/deactivate` |
| Oracle | `XX_ZRV_WF_FORMS` (read/write), `XX_ZRV_WF_FORM_VERSIONS` (count only), `XX_ZRV_APP_MODULES` (read only) |
| Verification status | **Implemented — verified by automated tests only.** Pending G1 catalogue registration; live browser verification and screenshots follow. |

## Purpose

The Form registry lists the existing business forms that have been **registered** so that their
approval workflows can be configured later. Registering records only the form's identity —
code, name, owning module, optional detail route and description. It does not change the form
itself, its data, or how it is approved today.

## How to get there

**Workflow Manager → Form registry** in the sidebar, or the **Registered forms** card / **Form
registry** link on the Overview.

## Screen elements

### Header

| Control | What it does | Shown when |
|---|---|---|
| **Register form** | Opens the registration page ([guide 03](03-form-registration.md)). | You hold `FORM_REGISTRY:CREATE` |

### Search and filters

| Field | Meaning | Validation |
|---|---|---|
| **Search** | Contains-match on form code, form name or module code, not case-sensitive. Applied when you select **Search** or press Enter. | Empty, or 2–100 characters |
| **Module** | Only forms owned by this module. The list shows the active modules of the permission catalog. | Applies immediately |
| **Status** | *All statuses*, *Active* or *Inactive*. | Applies immediately |
| **Sort by** | Form code, Form name, Module or Last updated, ascending (↑) or descending (↓). | Applies immediately |

Changing any filter returns to page 1. Because filters live in the address, **Back** returns to the
previous filtered list and the address can be shared with a colleague who has the same permission.

### Table

| Column | Content |
|---|---|
| **Form** | Form name, with the form code below it. |
| **Module** | Module name and code. |
| **Detail route** | The application page of one record of this form, if recorded; `—` otherwise. |
| **Versions** | Number of mapping versions (created by the mapping package, M2; `0` until then). |
| **Status** | *Active* or *Inactive*. Inactive rows are shown in muted text. |
| **Last updated** | Local date and time of the last change. |
| **Open** | Opens the form's page ([guide 03](03-form-registration.md)). |
| **Activate** / **Deactivate** | Opens a confirmation. Shown only with the matching permission. |

**Previous** / **Next** move between pages of 20 forms; the footer shows *Page x of y · n total*.

## Step by step

### Find a registered form

1. Open **Workflow Manager → Form registry**.
2. Type part of the code or name in **Search**, e.g. `TRAVEL`, and press Enter.
3. Optionally narrow by **Module** and **Status**.
4. Select **Open** on the row.

### Deactivate a form

1. Find the form and select **Deactivate** on its row.
2. Read the confirmation: the form stays registered with its history but cannot be chosen for new
   workflow configuration until activated again. Nothing is deleted.
3. Select **Deactivate**. The button shows *Working…*; a second click is ignored.
4. The message *`<CODE>` deactivated.* appears and the row shows *Inactive*.

**Activate** works the same way in reverse.

### Worked example (fictional data)

The registry holds `TRAVEL_REQUEST` (*Travel Request*, module *HR*, active). A colleague
deactivated it a minute ago, but your list was opened earlier. You select **Deactivate** →
**Deactivate**: the dialog reports *Someone else changed this record after you opened it…* and
the list reloads, now showing the form as *Inactive*. Nothing was changed twice.

## What happens when you save

| Action | Database effect | Notifications |
|---|---|---|
| Activate / Deactivate | `XX_ZRV_WF_FORMS.IS_ACTIVE` set to `Y` / `N`; `UPDATED_AT`, `UPDATED_BY` set; `ROW_VERSION` incremented. Only if `ROW_VERSION` still equals the value you loaded. | None. No workflow requests, tasks or e-mails are created. |

## Validation, errors and troubleshooting

| Message | Cause | What to do |
|---|---|---|
| *No forms are registered yet.* | Empty registry. | Register one ([guide 03](03-form-registration.md)) if permitted. |
| *No registered form matches these filters.* | Filters exclude all forms. | Clear Search, Module or Status. |
| *Enter at least 2 characters.* | One-character search. | Type more, or clear the field. |
| *Someone else changed this record after you opened it…* | `409 STALE_RECORD`: the form changed since the list loaded. | The list reloads; check the current status and retry if still needed. |
| *You no longer have permission for this action…* | `403`: your permission was removed. | Your access is refreshed automatically; ask your administrator if needed. |
| *The server did not confirm the result…* | Network or server failure: the change may or may not have been applied. | Refresh and check the row before trying again. Never repeat blindly. |
| *The module list could not be loaded…* | Module lookup failed. | The module filter shows only the current selection; reload the page later. |

## Related guides

[01 — Navigation](01-workflow-manager-navigation.md) · [03 — Register or edit a form](03-form-registration.md) · [04 — Data source registry](04-data-source-registry.md)

## Verification

| Check | Result |
|---|---|
| List, search, filters, sort, pagination, activation, stale edit, 403/404/500 | `server/tests/workflow-manager.test.js` *form registry* suite passed |
| Client contract, service paths, CSRF, URL filters | `client/tests/workflowManager.test.mjs` passed |
| SQL against Oracle TEST | List/count/activation statements validated on TEST 2026-11-02 (SELECT executed read-only; UPDATE compiled only, never executed) |
| Live browser check and screenshot | **Not yet performed** — requires the G1-approved catalogue registration and a role grant on TEST |

Verified against branch `feat/workflow-manager-m1-foundation`, 2026-11-02.
