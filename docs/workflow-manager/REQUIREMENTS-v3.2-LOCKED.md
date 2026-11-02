# Zamil Digitalization — Master Workflow Manager
## Requirements v3.2 — FINAL LOCKED Functional Addendum (RFI, Comments, FYI and Unified Action Portal)

| Control | Value |
|---|---|
| Document ID | ZRV-MWM-BRD-003.2 |
| Date | 02 November 2026 |
| Status | **OWNER-LOCKED FUNCTIONAL REQUIREMENTS** — documentation only; not SQL/code/deployment approval |
| Authority | Final explicit owner changes on 02 November 2026 |
| Original baseline | Previously locked v3.0 business requirements **remain fully binding** |
| Current predecessor | `docs/workflow-manager/REQUIREMENTS-v3.1-LOCKED.md`, GitHub `main`, blob `856065fc6bd556147b07003be954222d8f2820f7` |
| Interpretation | v3.2 clarifies RFI and adds comments/FYI/portal details; v3.1 continues to apply except specifically clarified sections below |
| Delivery model | **Exactly two functional phases**, one complete Oracle design/approved rollout covering both, before Phase 1 implementation |
| Development | ChatGPT designs/reviews; Claude implements approved tasks; owner controls Git/GitHub and Oracle rollout |

> **Release-lock rule:** These are the owner's final requested business-scope additions. Do not reopen accepted v3.0/v3.1/v3.2 decisions through implementation discussions. Technical verification and necessary fixes do not themselves authorize new functionality. Subsequent change requires explicit owner change-control approval. The verbatim v3.0 file was not independently recovered; therefore this is a controlled final *addendum*, not a false claim that it contains every line of v3.0. The authoritative requirement set is **v3.0 + v3.1 + v3.2** (with v3.2 taking precedence only for the RFI clarification described here).

---

## 1. Scope and phase allocation (LOCKED)

**Phase 1 — Workflow Management:** Admins configure RFI eligibility/policies, allowed recipient determination, required comments, FYI recipients for each approval stage, event-specific email templates, action visibility, notification mappings and the unified action-portal contracts. The guided designer, simulations, publication governance, mapping and My Delegations all remain in Phase 1. Phase 1 does **not** start live approvals, issue runtime RFIs, send runtime notification emails or process live FYI acknowledgements.

**Phase 2 — Workflow Execution:** Implement real RFI question/answer cycles, worklist entries, action-portal interactions, comment capture/display/email, and FYI stage notifications/read-only worklist, together with all other Phase 2 features already locked. **No Phase 3.**

The proposed 19 tables of Oracle Design v1.2 are a **working inventory**, not a business quota. The physical schema must be revalidated for these final additions before the one consolidated, owner-approved G1 TEST rollout. Neither previously generated v1.1 nor v1.2 DDL is an approved executable schema after this requirements change.

## 2. RFI — Request for More Information (LOCKED)

### 2.1 Purpose and eligibility

An eligible **current approval-task assignee** may issue `REQUEST_INFORMATION` during any active approval level, including delegated, forwarded, reassigned and parallel-stage assignments, if that action is enabled by the published policy and backend authorization. The requester selects an **eligible and verified application employee/user** from whom an answer is needed and provides an explicit question (required text). The question/recipient must be captured with the initiating actor's **real identity**, the current instance/cycle, stage, task and time.

RFI is for information gathering; it **does not transfer approval authority**, introduce a new approver level, alter the original hierarchy, alter the original/current assignee, terminate or restart the current stage, or change the source form's business approval status. It is distinct from `RETURN_FOR_CORRECTION` (existing form-owner correction / stage-iteration behavior) and from `FORWARD` (approval authority transfer).

### 2.2 Active-stage and one-open rule

- The pending approval stage and original/current approval task are **retained at the same level** during an RFI. It has an explicit awaiting-information presentation/state, while preserving its pending approval authority and stage identity.
- **Maximum one open RFI per active workflow instance/cycle, globally**, not one per parallel task. This is an atomic database-backed invariant, not merely a disabled frontend button.
- While any RFI is open in that instance, **all `APPROVE` and `REJECT` actions on that instance are blocked** for all approval actors, including parallel branches, under backend concurrency control. No stage-advance/finalize based on a late concurrent approval while the RFI is open.
- A second RFI cannot be opened before the first is resolved. Once an answer is provided and the RFI closes, another RFI may be opened at the same level, as often as authorized policy permits. Each question/answer round is separately preserved.
- RFI must not erase prior decisions already committed before its opening. A prior completed level remains completed; only currently eligible pending decisions are gated.

### 2.3 Information-request work item and answer

1. On request, persist a uniquely identified RFI with state `OPEN`, question, requester (approver), recipient (answerer), instance/cycle/stage/task references, timestamps and deduplication key. In the same transaction record action/events and queue the recipient email in the existing durable outbox.
2. The selected recipient receives an email with the question (subject to field sensitivity) and an **authenticated portal link** directly to the reply view. A plain email link or forwarded URL alone confers no permission.
3. Their linked worklist item has **one permitted business action: `PROVIDE_INFORMATION`**. They may read the minimum approved request context necessary to answer and submit an answer/comment; they cannot approve, reject, forward, reassign or issue another RFI through this *information-request* assignment. Existing unrelated permissions do not transform an RFI role into an approval role.
4. The answer must contain actual response text (required). Store it with real actor identity, timestamp and immutable history; transition that RFI from `OPEN` to `ANSWERED` exactly once, using optimistic locking/transactional compare-and-swap. Repeated clicks or duplicate API requests must not create multiple answers/emails.
5. Queue a response notification **to the approver who requested the information**. The approving task remains the same pending task; the answer is visible in its history/context and approval/rejection buttons become eligible again **only when no RFI remains open** and all other current authorization checks pass.
6. The original question, answer, each associated comment, email acceptance/failure, and request/answer timestamps remain queryable in both workflow history and the source form's history. Answering alone does not count as approval, change a stage outcome or modify source-form status.

### 2.4 Exceptional situations

- If a recipient becomes inactive, lacks access, or fails to respond, expose overdue/exception state and controlled administrator recovery with audit. Never silently choose a replacement recipient or auto-approve.
- **Default transfer safety:** normal `FORWARD`/`REASSIGN` of the waiting approval task must not silently orphan an open RFI. Block ordinary transfers while RFI is open; separately authorized recovery can reassign/recover with preserved initiating actor, question/answer destination, notices and history. The same rule applies to automatic escalation of that task.
- On cancellation or other authorized terminal closure, close an outstanding RFI with an explicit terminal reason and notify applicable actors; never leave an actionable orphan.
- SLA and reminder handling must account for time spent awaiting information using a published, explicit policy; timestamps and elapsed time are never rewritten. No automatic SLA pause or auto-completion without a configured/approved rule.
- The single-open invariant must hold across concurrent approval/RFI requests and parallel paths at Oracle transaction level, not only in API/UI validation.

## 3. Unified authenticated Workflow Action Portal (LOCKED)

One coherent Workflow Action Portal and common secure task/detail experience serves:

- approver actions: `APPROVE`, `REJECT`, `FORWARD`, `REASSIGN`, `REQUEST_INFORMATION`, configured `RETURN_FOR_CORRECTION`, and related policy-authorized actions;
- RFI respondent action: `PROVIDE_INFORMATION` (answer-only for that information request);
- FYI recipient: `VIEW_INFORMATION` (read only; not an approval action);
- authorized administrators: approved monitoring/recovery/reassignment actions with distinct RBAC and audit.

The portal is a **single design and navigation experience**, not a separate application/authentication service. One contextual page may expose different action controls based on the backend-evaluated user's current relationship to the specific item and current instance/task state. It shows the form and request reference, current level, approver, required action, action history, relevant comments and attachments when authorized, associated RFI questions/answers, and secure form deep link.

All action URLs in emails resolve to authenticated portal routes. Every API POST is protected by the existing session, CSRF, RBAC, current-assignment verification, form/organization record scope, task version/state checks and action-specific permissions. Old task links must fail safely after a transfer, termination, expiry, revocation or answered RFI. Portal usability meets existing ITSAZZ standards; no duplicated action page per action or faux working controls.

## 4. Comment entry, history and outbound email (LOCKED)

- Show a comment/remarks input with **every user-initiated workflow action**: submit (if enabled by form), approve, reject, forward, reassign, request information, provide information, return, cancel and other authorized actions. The field is available even where entry is optional.
- The server enforces the published action policy for required/optional comment: RFI **question text is mandatory**, RFI **answer text is mandatory**, reject/forward/reassign/return reasons remain mandatory if their approved policy requires them. A comment field cannot replace the structured question, answer or transfer-reason fields.
- Persist comments against the **actual actor**, action code, instance/cycle, stage/task or RFI identifier, timestamp, and relevant from/to assignee where applicable. Comments are part of immutable historical events and cannot be overwritten by a later action.
- Include the **relevant action's entered comment/question/answer** in the resulting notification to the intended recipient(s), including forwarding/reassignment/RFI requests and responses, and approvals/rejections/returns when they generate email. Do not substitute an unrelated prior comment.
- Template rendering is server-side and controlled: approved variables, escaping/sanitization, length limits, typed fields, sensitivity/recipient scope, and no raw HTML or approval capability in public links. If a recipient is not permitted to see a sensitive comment, suppress/redact that content rather than leaking it; preserve the full authorized history internally.
- The outbox records template version, event, per-recipient message, relevant comment snapshot, deduplication, attempt/result and provider acceptance (distinct from eventual delivery). A template/email failure must never discard the committed action or history; retry according to the existing durable recovery rules.

## 5. FYI recipients on approval stages (LOCKED)

### 5.1 Designer configuration

At **every approval stage/level**, the designer can independently configure:

1. **Approver recipient(s):** fixed, role, dynamic or other approved resolver; receives approval-task assignment with approved actions.
2. **FYI recipient(s):** named user(s), group/role or an approved resolver (as permitted by the existing resolver library); receives an **informational notification only** when that level activates.

FYI recipients may be multiple and may be present on sequential, conditional and parallel stages; their source selection and pinned resolver/input mapping are part of the **immutable published workflow version**. Validate recipient eligibility, organization/form scope and sensitive fields when configuring/publishing. A stage may have both approver(s) and FYI recipient(s) simultaneously. A workflow cannot accidentally treat FYI as satisfying a required approver slot.

### 5.2 Stage activation and FYI permissions

- When the level **actually activates**, resolve and snapshot the eligible FYI recipients, queue separate informational emails alongside the approver's task email, and record event/notification history. Do not send FYI for an unselected conditional branch or an inactive stage.
- FYI email includes an **informational subject/context and authenticated form/portal link**, plus only authorized form metadata and comment content. It must **not** include approve/reject/forward/reassign/RFI actions or approval-authority language.
- An FYI recipient has a clearly labeled **FYI / For Your Information** read-only entry in the unified worklist (or its distinct FYI tab/filter), not an approval decision item. They may view the authorized context; they cannot act on the workflow merely because they received FYI.
- FYI does **not** create an approval level, join/parallel vote, pending approval decision, approver assignment, blocker, source-status transition or completion condition; failed FYI delivery is tracked and recoverable without blocking legitimate approval progression.
- A person separately assigned as a genuine approver retains that independently verified approver role; FYI itself grants **no** permissions. Protect data scope and sensitive fields in both the portal and email.

## 6. Worklist and history (LOCKED)

The centralized worklist must distinguish actionable approvals, forwarded/reassigned approvals, delegated approvals, **information requested from me**, **my approval awaiting someone else's information**, FYI read-only items and completed/history entries. Filters, badges, search, deep links, assignment times and current state reflect each item's real authority; do not show active action buttons to former recipients.

Both the source form and Workflow Manager show an integrated **per-cycle** timeline: submission; original hierarchy and per-stage original approvers; FYI notification target(s); each RFI opened/questioned/answered/closed (including who asked whom and when); any comment; any delegation/forward/reassign; decisions by actual actor; email queue/provider status; business status synchronization and final requester notification. Historical information remains immutable even if assignment, delegation, approval version or source data later changes.

## 7. Versioning, database and implementation safeguards

The schema design must support, in Oracle-enforceable or reliably transactional form:

- a stable and auditable RFI request/answer correlation with an **instance-wide uniqueness invariant for open RFI**, concurrency-safe operations, requester/responder/task/cycle identities, status and timestamps;
- FYI audience configuration in the pinned immutable stage graph, resolved FYI snapshot, worklist representation and notification history, independent of approval votes;
- typed action codes `REQUEST_INFORMATION`, `PROVIDE_INFORMATION`, and `VIEW_INFORMATION` as a *read-only worklist role* (do not turn mere viewing into an approval decision); action-comment and answer/question payloads and immutable events;
- portal access distinctions (`APPROVER`, `RFI_RESPONDENT`, `FYI`, `ADMIN`) without inventing new authentication or bypassing backend RBAC;
- durable per-recipient mail with the correct comment variable, template pins and deduplication, including FYI deliveries and RFI reply notification;
- accurate state transitions during parallel approval races, out-of-date worklist tasks, RFI recipient access expiration and administrator recoveries;
- immutable historical identity and preserved linked cycles.

The previously proposed **19-table physical inventory remains the starting point**, but do not force RFI records into an approval-task structure if that would compromise integrity or reporting. A minimal additional table is technically permissible **only with clear evidence and revised consolidated G1 approval**, because v3.1 explicitly states 19 is not sacred. Avoid unnecessary new tables. Review the existing 19 tables, unique indexes, workflow graph JSON schemas, action check constraints, triggers, FK paths, outbox job kinds and grants before updating SQL.

**No SQL execution, Oracle change, DB grant, RBAC seed, application code change or GitHub write is authorized by this requirements lock.** Next revise the schema design to a new reviewed candidate (v1.3 or equivalent) incorporating this locked v3.2 update and the pre-existing v1.2 technical corrections. Obtain a **single consolidated G1 review** before any TEST rollout; G2/G3/G4 still apply to their respective boundaries.

## 8. Acceptance criteria (minimum, mandatory)

| ID | Scenario | Required outcome |
|---|---|---|
| RFI-01 | Level 2 approver requests information from employee C | Level 2 stays pending; question and actor recorded; C emailed and sees answer-only work item |
| RFI-02 | C views portal | `PROVIDE_INFORMATION` only for this RFI, never approve/reject/forward/reassign |
| RFI-03 | C answers | RFI closes once, response goes to original RFI requester, same level resumes and is actionable |
| RFI-04 | Approver requests RFI again after answer | New correlated RFI round accepted with complete prior history |
| RFI-05 | Second RFI while first open | HTTP conflict/appropriate business error; no duplicate record or email |
| RFI-06 | Approve/reject attempted during open RFI | Rejected on backend for every task of same workflow instance, including parallel approvals |
| RFI-07 | Simultaneous RFI request and approve/answer requests | Serialized/optimistic transition; only a valid state wins; no orphan outbox or double decision |
| RFI-08 | RFI respondent inactive or unanswered | Explicit overdue/exception/recovery state, no implicit approval or assignee swap |
| RFI-09 | Forward/reassign attempted during open RFI | No orphaned RFI; ordinary transfer is blocked, authorized exception recovery audited |
| RFI-10 | Return for correction vs RFI | Return follows approved iteration policy; RFI never changes approval level by itself |
| COM-01 | Each portal action page | Visible comment field; mandatory/optional policy enforced server-side |
| COM-02 | Forward/Reassign with comment | Recipient notification includes correctly scoped action comment, and history keeps actual actor |
| COM-03 | RFI question and answer | Separate required texts, correct respective emails, full immutable timeline |
| COM-04 | Restricted/sensitive comment | Sensitive text not leaked to unauthorized email recipients or FYI viewer |
| COM-05 | Provider failure after committed action | Action remains committed; delivery failure/retry visible in outbox; no duplicate decision |
| FYI-01 | Stage has approver A and FYI B | A gets actionable task; B gets FYI-only email/worklist item at same stage activation |
| FYI-02 | FYI B opens portal | Read-only scope; no approval controls; no authority via email link |
| FYI-03 | Parallel ALL/ANY/QUORUM with FYI | FYI never counted as an approval or stage blocker |
| FYI-04 | Conditional branch not activated | FYI message for that branch not queued |
| FYI-05 | FYI email fails | Separate failure tracking; approval flow still proceeds normally |
| PORT-01 | Approver, RFI answerer, FYI recipient use same portal | Different backend-authorized controls according to role, state and record scope |
| PORT-02 | Old task link after transfer/cancel/RFI close | Unauthenticated/stale/unauthorized action fails safely |
| HIST-01 | Rejected and resubmitted request with prior RFI/FYI | Separate linked cycles, all comments and question/answers preserved |
| GOV-01 | Stage FYI/RFI configuration after publication | Published version unchanged; revision requires new governed version |

## 9. Explicit unchanged baseline

Everything else remains as locked in v3.0 and v3.1: existing form/source/status mappings, original hierarchy, conditional/sequential/parallel workflows, versioned resolver SQL security, versioned templates EN/AR, delegated approval, forwarding, reassigning by authorized prior *actual* approvers, linked rejected/resubmitted cycles, optional return for correction, approval and requester notifications, full audit, SLA/escalation, reporting, existing Oracle ADW LOW/HIGH use, RBAC/MFA/CSRF, CI3 ownership and G1–G4. No third phase, no replacement auth, no automatic legacy migration, no silent direct SQL status edits, no extra user request/approval level for an FYI or final requester notification.

## 10. Next controlled work package

1. Owner keeps this v3.2 final locked requirements update in the project and merges it into GitHub through the established **owner-controlled branch/PR** workflow (no Git write performed here).
2. ChatGPT evaluates **Oracle Schema v1.2** against v3.2 and produces an updated **review-only, complete, consistent v1.3 schema/DDL**, including tests and database review evidence; do not execute SQL.
3. One consolidated owner/DBA G1 design review and explicit target-specific TEST approval, with any G2/G3/G4 impacts separately identified.
4. After authorized TEST schema rollout and verification, Claude begins Phase 1 with scoped implementation prompts. Phase 2 includes all runtime RFI/FYI/comment/portal behavior.

**Functional business scope is LOCKED as v3.0 + v3.1 + v3.2.** Technical details remain subject to the ordinary non-business-breaking verification and G1 review process.