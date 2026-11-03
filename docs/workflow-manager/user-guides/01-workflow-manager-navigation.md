# 01 — Workflow Manager entry and navigation

| Item | Value |
|---|---|
| Package | M1 — Module foundation and form registry |
| Screen | Workflow Manager **Overview** |
| URL | `/workflow-manager` |
| Audience | Users given Workflow Manager access |
| Required permission | `WORKFLOW_MANAGER.OVERVIEW:VIEW` |
| API | `GET /api/v1/workflow-manager/overview` |
| Verification status | **Implemented — verified by automated tests only.** Pending owner G1 registration of the `WORKFLOW_MANAGER` permission catalogue on TEST; live browser verification and screenshots follow that registration. See [Verification](#verification). |

## Who can access it

A signed-in user whose effective permissions include `WORKFLOW_MANAGER.OVERVIEW:VIEW`. The
permission is granted through a role (Security administration → **Role permissions**) or a direct
override; nobody has it by default. Without it the **Workflow Manager** sidebar section does not
show the Overview, the command palette does not offer it, and opening the URL shows the
*access denied* page. The backend refuses the API with `403 FORBIDDEN` and records the refusal in
the security audit (`ACCESS_DENIED`).

No MFA-verified session is required (Workflow Manager is not a security-administration module).

## How to get there

1. Sign in.
2. In the left sidebar open the **Workflow Manager** section (icon: workflow).
3. Choose **Overview**.

Alternatively press **Ctrl+K** (**⌘K** on macOS) to open the command palette, type `Workflow`
and choose **Overview**.

The **Workflow Manager** section lists only the pages you may open:

| Sidebar item | URL | Permission |
|---|---|---|
| Overview | `/workflow-manager` | `WORKFLOW_MANAGER.OVERVIEW:VIEW` |
| Form registry | `/workflow-manager/forms` | `WORKFLOW_MANAGER.FORM_REGISTRY:VIEW` |
| Data source registry | `/workflow-manager/data-sources` | `WORKFLOW_MANAGER.DATA_SOURCE_REGISTRY:VIEW` |

The **Register form** page (`/workflow-manager/forms/new`) and a form's own page
(`/workflow-manager/forms/<id>`) are not in the sidebar; they open from the Form registry.

## What the Overview shows

| Element | Meaning | Shown when |
|---|---|---|
| **Registered forms** card | Total registered forms, and how many are active and inactive. Selecting it opens the Form registry. | You also hold `FORM_REGISTRY:VIEW` |
| **Data sources** card | Total registered data sources, active and inactive. Selecting it opens the Data source registry. | You also hold `DATA_SOURCE_REGISTRY:VIEW` |
| **Tables and views** card | Number of TABLE and VIEW data sources. | You also hold `DATA_SOURCE_REGISTRY:VIEW` |
| **Available to you** | Links to Form registry, Register a form and Data source registry — only those your permissions allow. | At least one applies |
| Note *Workflow execution is not active* | Registering forms and sources never submits requests, creates approval tasks or sends e-mails. | Always |

The counts come from the live database each time the page opens. If you can open the Overview but
can view neither registry, the page says so instead of showing cards.

## Step by step — check the registry status

1. Open **Workflow Manager → Overview**.
2. Read the **Registered forms** card, for example *3 · 2 active · 1 inactive*.
3. Select the card (or **Form registry** under *Available to you*) to see the forms themselves.

### Worked example (fictional data)

An administrator, *Test Admin*, has the Overview, Form registry (VIEW, CREATE) and Data source
registry (VIEW) permissions. The Overview shows *Registered forms 1 · 1 active · 0 inactive*,
*Data sources 0* and the links **Form registry**, **Register a form** and **Data source registry**.
A colleague with only Overview and Form registry VIEW sees the forms card and the
**Form registry** link — no data-source card and no **Register a form** link.

## States and troubleshooting

| What you see | Why | What to do |
|---|---|---|
| *Loading Workflow Manager overview…* | The counts are being read. | Wait. |
| *The Workflow Manager overview could not be loaded* with **Retry** | Network or server error. | Select **Retry**. If it persists, report the time to support. |
| Access denied page | You lack `WORKFLOW_MANAGER.OVERVIEW:VIEW`, or it is not yet in the permission catalogue. | Ask your security administrator. |
| No **Workflow Manager** section in the sidebar | You hold none of the Workflow Manager page permissions. | Ask your security administrator. |
| *Your session has ended* | Sign-in expired. | Sign in again. |

Nothing on this page changes data.

## Related guides

- [02 — Form registry](02-form-registry.md)
- [03 — Register or edit a form](03-form-registration.md)
- [04 — Data source registry](04-data-source-registry.md)

## Verification

| Check | Result |
|---|---|
| Backend route, permission and counts | `server/tests/workflow-manager.test.js` — *overview* and *authorization* suites passed |
| Navigation listing and route guard by permission | `client/tests/workflowManager.test.mjs` — *pages are listed and opened only with their backend permission* passed |
| SQL against Oracle TEST | Overview count queries executed read-only on TEST, 2026-11-02 (feature handoff §10) |
| Live browser check and screenshot | **Not yet performed** — requires the G1-approved catalogue registration and a role grant on TEST |

Verified against branch `feat/workflow-manager-m1-foundation`, 2026-11-02.
