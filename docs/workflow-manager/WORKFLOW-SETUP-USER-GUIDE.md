# Workflow Manager — User Guide
## How to configure a workflow for any Zamil Digitalization form

**Guide audience:** Workflow Administrators, Workflow Publishers and approved form owners. Ordinary employees should use the action instructions near the end; they do not need to configure workflow tables.  
**Status:** Design-stage guide. Only the package **M1** screens are implemented — **Workflow Manager → Overview**, **Form registry** (register, edit, activate/deactivate a form) and **Data source registry**; use their screen guides ([01](user-guides/01-workflow-manager-navigation.md), [02](user-guides/02-form-registry.md), [03](user-guides/03-form-registration.md), [04](user-guides/04-data-source-registry.md)) for exact steps. All later screens (mapping, designer, resolvers, templates, delegations, publication and execution) are **not yet implemented**; menu labels below describe the proposed user experience and must be reconciled with the real UI before publishing this document as an operational guide. The steps are intentionally written for non-developers.\
**Scope:** All workflow-enabled forms, subject to confirmed form integrations and appropriate permission. Do not assume every existing form supports workflow submission until it is registered and verified.

## A. First understand four words

| Word | Simple meaning |
|---|---|
| **Form** | The request people already fill in, for example an HR request. |
| **Workflow** | The approvals this form must go through. |
| **Level** | One approval checkpoint. Levels can be sequential, conditional or parallel. |
| **Approver vs FYI** | An **approver** decides. An **FYI** recipient only receives information and can view it; they never decide. |

**Special actions:** **Forward** transfers the same pending approval task to another eligible person; **Reassign** transfers it under a separately authorized policy; **Request for More Information (RFI)** asks someone a question without changing the current approver or level. **Return for Correction** is a distinct form-owner correction flow. **Delegation** is a preconfigured time-bound rule checked when a new task activates.

## B. Before creating a workflow

Ask the form owner for:

1. The exact existing form name and owner department.
2. Who can create, submit and view the form; which organization (e.g., company/business unit) it belongs to.
3. The actual submission event and stored statuses **verified from the form API and Oracle mapping**. Do not type guessed values such as `APPROVED` into source status mapping.
4. Who approves each level (person, employee manager, HR role, department head or approved resolver), and whether decisions are sequential or parallel.
5. Any conditions, e.g., company, request type or amount; and who receives FYI on each level.
6. Which actions are allowed at each level (approve, reject, RFI, forward, reassign, return), whether comments/reasons are mandatory, and escalation/SLA settings.
7. Which email language/template/recipients are needed, and what sensitive form values may be shown.

> **Important:** A user without configuration permission should not see workflow setup controls. A person who configures a workflow does not automatically receive permission to approve it.

## C. Follow the five-step Workflow Designer

### Step 1 — Choose the form

1. Open **Workflow Manager → Workflow Designer → New Workflow** (planned UI label).
2. Find and select the form from the **verified Form Registry**.
3. Inspect the form's mapped business record key, organization scope, requester/owner, source fields and status transitions. The system should show the approved mapping, not require the administrator to type SQL.
4. Choose the event that should start this workflow and give the workflow a clear name.
5. Save as **Draft**. If the form is absent or mapping is unverified, stop and request form onboarding rather than inventing it.

### Step 2 — Set conditions and routing

1. For a basic workflow select **Standard** (one route and ordered levels).
2. For different organizations, amounts or request actions select **Advanced** and add a condition/branch. Example only: when `Organization = IPP`, use Path A; when `Organization = FPP`, use Path B. These names are illustrations, not preapproved form rules.
3. Set the deterministic default or exception path. Two competing matching routes cannot be published.
4. Preview which route each test case selects.

### Step 3 — Add approval levels and FYI people

For **each level**:

1. Set a clear level name such as "Department review" and sequence.
2. Choose **Approver** recipients: fixed named employee, role/group, direct manager, department/BU head, or approved resolver.
3. Choose **FYI** recipients separately, if needed. FYI entries receive a read-only notification and form link and do **not** contribute votes or block stage completion.
4. Choose approval mode: one approver; sequential levels; parallel `ALL`, `ANY` or approved `QUORUM` with correct threshold.
5. Choose allowed actions: Approve, Reject, Forward, Reassign, Request More Information and/or Return for Correction according to policy.
6. Set whether comment is optional or required for each action (required reason where applicable).
7. Choose RFI eligible answerer policy. An RFI preserves the current approval level. Only one RFI may be open for **the whole workflow request**, including parallel approvals; while it is open no one can approve or reject that request. The answerer may only **Provide Information** through the RFI item.
8. Configure SLA/reminder/escalation behavior; no implicit SLA pause while RFI is open unless the policy says so.
9. Add the next level or outcome route, then check the original hierarchy preview.

### Step 4 — Set emails and actions

1. Pick a versioned notification template and language for each relevant event: submitted, stage assignment, FYI, RFI question, RFI answer, approval, rejection, forward, reassign, reminder, escalation and final result.
2. Preview to whom the notification goes and what form information it reveals.
3. Ensure the comment associated with an action appears where authorized. A comment can be optional by workflow policy; a question and an RFI answer always require actual text.
4. Include a **secure sign-in portal link**. Email by itself does not grant authorization. FYI email has no approve/reject option.
5. Use preview / approved controlled test-send; **Phase 1 does not send live workflow execution emails**.

### Step 5 — Simulate, review and publish

1. Run realistic test scenarios (use fictional/non-sensitive data) for every organization, branch, parallel policy, delegation case, FYI and allowed action.
2. Fix validation failures, ambiguous routes or missing mapping fields.
3. Submit the configuration for independent review.
4. Approved publisher checks the hierarchy, dependencies, template and effective dates, and **publishes a new immutable version**.
5. Never edit a published version directly; create the next version for future submissions. Existing running instances retain their pinned version.
6. **Publishing configuration is not automatically activating the new engine for a legacy form**. Runtime enablement/cutover requires its own controlled owner-approved process.

## D. My Delegations — self-service setup

1. Open **Workflow Manager → My Delegations** (planned UI label).
2. Choose eligible delegate employee, one or more forms, optional organization/workflow scope, start and end timestamp, allowed actions and reason as required.
3. The system must prevent invalid self-delegation, ambiguity/overlap for the same task and cyclic chains.
4. Save and review upcoming/active/expired delegations; edit/revoke with audit where permitted.
5. A new delegation is checked **when each new stage/task activates**. It does not silently transfer tasks already assigned. The delegate acts using their own identity, shown "on behalf of" the original principal.

## E. What employees see in Phase 2 — Unified Workflow Action Portal

| You are… | You see… | Allowed action(s) |
|---|---|---|
| Current approver | **My Approvals** task, original hierarchy, form and history | Policy-authorized approve/reject/forward/reassign/RFI/return, with comment field |
| Delegated/forwarded/reassigned current holder | Same task in your worklist with transfer explanation | Actions allowed by your current assignment and policy, not the former holder's permissions |
| RFI answerer | **Information Requested** entry, question, minimum permitted form context | **Provide Information** only, with required answer. No approval/forward/reassign from this RFI item |
| FYI recipient | **For Your Information** entry / informational mail and form link | **View Information** only; never approve or reject |
| Requester | Own submitted request and history across cycles | View progress; resubmit rejected record only if the form's rules allow it |
| Authorized workflow administrator | Scoped monitoring and exception entries | Only specifically granted recovery/administration actions |

**RFI example:** Level 2 approver asks Person C for a missing document. Level 2 stays pending, all approval/rejection buttons for that request are blocked, and C sees only **Provide Information**. C answers; the system notifies the same requesting approver, stores the question and answer in history and allows a further RFI or decision when eligible. RFI is not a new approval level.

**Comment rule:** There is a comment field on every workflow action. Requiredness follows published policy. Relevant authorized recipient email includes the comment; confidential comments/fields must be redacted or excluded where not permitted.

## F. Quick troubleshooting (for administrators)

| Problem | What to check |
|---|---|
| Form not available in designer | Form registry enabled; verified mapping, permissions, org scope, form integration ready |
| Approval level lacks eligible person | Resolver approval, user status, employee relationship, org scope and fallback exception |
| Workflow cannot publish | Missing maker/checker approval; ambiguous conditions; invalid graph; version/handler/template dependencies |
| FYI person cannot approve | Correct behavior: FYI is informational, not an approver |
| Approve/Reject disabled | Open RFI for that instance, stale assignment/transfer, task completed, no permission or terminal state |
| RFI answerer sees only Provide Information | Correct behavior: the answer-only RFI role never grants approval authority |
| No mail | Inspect delivery/outbox state and recipient/template config; provider accepted ≠ delivered into inbox |
| Historic approvals differ from today's approver setup | Correct behavior: history is pinned to its original published version and actual actors |
| Previously rejected request is resubmitted | New linked cycle, not replacement of previous rejected cycle |
| Legacy form shows old approval behavior | Form/event cutover has not been authorized; do not enable both engines on the same event |

## G. How this guide covers every form

The five-step setup procedure above applies **to every form that has a verified Workflow Manager integration**. Every newly onboarded form must also receive a small form-specific instruction sheet under `docs/workflow-manager/forms/<verified-form-code>.md`, created using `FORM-ONBOARDING-GUIDE-TEMPLATE.md`. That sheet supplies the **real form name, UI navigation, allowed events/statuses, owner, mapped fields, level policy, FYI and sample outcome**. It is not safe to pre-populate PKs, statuses, Oracle tables, or permissions from a form name alone.

See `forms/README.md` for a registry-based discovery checklist. The separate per-form sheets are produced and verified as each form is onboarded; they are not invented in advance.