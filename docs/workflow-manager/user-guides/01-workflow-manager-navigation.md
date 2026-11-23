# 01 — Workflow Manager entry and navigation

| Item | Value |
|---|---|
| Package | M1 — Module foundation and form registry |
| Screen | Workflow Manager **Overview** |
| URL | `/workflow-manager` |
| Audience | Users given Workflow Manager access |
| Required permission | `WORKFLOW_MANAGER.OVERVIEW:VIEW` |
| API | `GET /api/v1/workflow-manager/overview`; with `FORM_REGISTRY:VIEW` also `GET /api/v1/workflow-manager/forms?status=ACTIVE` (readiness) |
| Verification status | **M1 screen accepted on TEST (7 November 2026). Redesigned business-first layout (Smart Mapping UX package) — verified by automated tests; live TEST check and screenshots pending.** See [Verification](#verification). |

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

The Overview answers one business question first: **which forms are ready for workflows, and
what does each still need?** Only states the system can prove are shown.

| Element | Meaning | Shown when |
|---|---|---|
| **Business forms** | One card per **active** form (up to 20, ready forms first): its name, owning module, a readiness badge and the next step. **All forms** opens the Form registry; *Showing 20 of N active forms* links to the rest. | You also hold `FORM_REGISTRY:VIEW` |
| Readiness badge | *Data ready* — an approved (published, default) business data version exists. *Data in setup* — versions exist but none is approved yet. *Not onboarded* — no business data has been prepared yet. | On each card |
| Next step | *Ready:* configuring its workflow arrives with the workflow designer in a later release. *Otherwise:* a data administrator prepares its business data once (onboarding). There is **no** *Configure workflow* button yet — the designer (package M3) is not released. | On each card |
| **Registered forms** card | Total registered forms, active and inactive. Opens the Form registry. | `FORM_REGISTRY:VIEW` |
| **Data sources** card | Total registered data sources, active and inactive. Opens the Data source registry. | `DATA_SOURCE_REGISTRY:VIEW` |
| **What you can do** | *Register a business form* (`FORM_REGISTRY:CREATE`), *All registered forms* (`FORM_REGISTRY:VIEW`), *Prepare business data* (`DATA_SOURCE_REGISTRY:VIEW`, for data administrators) — only those your permissions allow. | At least one applies |
| Note *Workflow execution is not active yet* | Preparing forms and data never submits requests, creates approval tasks or sends e-mails. | Always |

Readiness and counts come from the live database each time the page opens. If you can open the
Overview but can view neither registry, the page says so instead of showing cards.

## Step by step — see which forms are ready

1. Open **Workflow Manager → Overview**.
2. Under **Business forms**, read each card's badge, for example *Not onboarded* for a form whose
   business data has not been prepared.
3. Select the form name to open its page and its **Readiness for workflows** ([guide 03](03-form-registration.md)).

### Worked example (fictional data)

An administrator, *Test Admin*, has the Overview, Form registry (VIEW, CREATE) and Data source
registry (VIEW) permissions. The Overview lists one card, *Travel Request · HR · Not onboarded —
Next: a data administrator prepares its business data once (onboarding)*, then *Registered forms
1 · 1 active · 0 inactive*, *Data sources 0* and the tasks **Register a business form**, **All
registered forms** and **Prepare business data**. A colleague with only Overview and Form
registry VIEW sees the form cards and **All registered forms** — no data-source card and no
registration or data tasks.

## States and troubleshooting

| What you see | Why | What to do |
|---|---|---|
| *Loading Workflow Manager overview…* / *Loading business forms…* | The counts or forms are being read. | Wait. |
| *No active forms yet. Register a business form to begin.* | No active form is registered. | Register one ([guide 03](03-form-registration.md)) if permitted. |
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
| Readiness states and no faux workflow action | `client/tests/workflowSmartMapping.test.mjs` passed (Smart Mapping UX, 2026-11-21) |
| Readiness SQL (`defaultVersionNo`) against Oracle TEST | Executed read-only on TEST, 2026-11-21 (Smart Mapping UX handoff §7) |
| Live browser check and screenshot | M1 layout accepted by the owner on TEST (7 November 2026). The redesigned layout is **not yet checked live** — owner TEST acceptance pending. |

Verified against branch `feat/workflow-manager-m1-foundation`, 2026-11-02; layout updated on
`feat/workflow-manager-smart-mapping-ux`, 2026-11-21.
