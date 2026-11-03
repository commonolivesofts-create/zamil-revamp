# Zamil Digitalization — Master Workflow Manager
## Requirements v3.1 — LOCKED Controlled Update to Approved v3.0

| Control | Detail |
|---|---|
| Document ID | ZRV-MWM-BRD-003.1 |
| Date | 02 November 2026 |
| Status | LOCKED business and functional requirements addendum — owner requested lock on 02 November 2026; **NOT** authorization to execute SQL or modify application code |
| Baseline | Previously locked Master Workflow Manager BRD v3.0 (all provisions remain in force unless explicitly clarified here) |
| Delivery model | **Two implementation phases**, one completely designed and approved Oracle database schema |
| Product | Standalone Master Workflow Manager module inside Zamil Digitalization (Zamil Revamp) |
| Delivery responsibilities | ChatGPT researches, architects and reviews; Claude implements scoped tasks; owner performs Git branch/push/pull, rollout and approvals |

> **LOCKED requirement change-control rule:** The owner requested this v3.1 baseline be locked on 02 November 2026. This document records the agreed v3.1 clarifications and a comprehensive implementation baseline. It does not rescind any v3.0 requirement not specifically revised here. The exact original v3.0 text was not available as an independent file for a verbatim diff; before declaring a line-by-line superseding master BRD, reconcile against that original. The v3.0 baseline plus this v3.1 update jointly govern design. No new business requirement should be silently inferred from a proposed physical table or a UI mock-up.

---

## 1. Purpose, business outcome and system boundary

Implement a reusable enterprise workflow platform **within** the existing Zamil Digitalization application that can configure, publish, execute, monitor and audit approvals for existing and future forms. Preserve existing Oracle ADW business tables and the application's authentication, authorization, MFA, CSRF, notification security, error contracts, navigation conventions and deployment practices. The Workflow Manager is an independently maintained domain module, **not** a separate application or a second authentication layer.

The business goal is to allow authorized administrators to configure form mappings, approval hierarchies, routing and notifications without bespoke hardcoded workflow logic for each form, while giving employees a unified approval worklist and complete request history.

## 2. Development plan — exactly two functional phases

### Phase 1 — Workflow Management (complete configuration product)

Deliver form/source registry and mapping, status and event mapping; workflow families and versioned definitions; fixed/dynamic/conditional/parallel approval hierarchy; approved resolver and restricted dynamic SQL configuration; email templates and recipients; runtime action policies; delegation setup and administration; validation, simulation, configuration review/publish/retire; role-based configuration access; and a premium guided UI. **My Delegations must work as a persistent, permission-controlled configuration function in Phase 1** even though no new workflow executes until Phase 2.

Phase 1 does **not** perform real request submissions, assign runtime approval tasks, send execution emails, or mutate business-form statuses through new workflow actions. Avoid fake working controls or unimplemented pages.

### Phase 2 — Workflow Execution (complete operating product)

Deliver submit/start, route resolution, stage/task activation, delegation application, approver notification, secure centralized worklist, approve/reject/return/answer, forward/reassign, parallel approvals, complete history, linked rejected-request resubmissions, business status integration, requester result notification, reminders, SLA/escalation, exceptions, monitoring, reporting and exports. Phase 2 must implement all runtime features formerly scheduled across the older Phase 2 and Phase 3 breakdown; **there is no third functional phase** in this plan. Phase 2 can use multiple small tested Git PRs.

## 3. One complete Oracle database design and rollout

Design all configuration, delegation, execution, notification, audit and exception structures **before** Phase 1 implementation. The working inventory is **19 proposed `XX_ZRV_WF_*` tables**, subject to final column/key/constraint review; the table count is not independently a business requirement. One consolidated G1 database design/DDL package must cover both phases, be previewed/reviewed and deployed in one controlled TEST rollout only with target-specific owner authorization. Execution tables may remain empty during Phase 1. Never create DDL on application startup. No implicit approval for subsequent UAT/production operations. Do not modify the 11 locked RBAC tables or any existing business table without distinct impact assessment and authorization.

## 4. Form registration and business-record identity

Register each supported form with stable code, display name, owner domain, detail-route/deep-link policy, approved submission events and organization scope. Map verified Oracle table/view or registered backend handler, header/detail relationships, record keys (including composite keys), creation/owner/requester/manager attributes, status column, business field catalogue and field sensitivity. Never invent Oracle object names: the deployed Oracle dictionary is authoritative. Identifiers must be allowlisted, never directly accepted as SQL from ordinary users.

Record identity is **form + approved organization scope + canonical business-record key**, never an unqualified `HEADER_ID` common to all forms. One business record can have multiple sequential workflow submission cycles, not multiple conflicting active cycles of the same event unless explicitly designed/approved.

## 5. Field and status mapping

Support typed fields: text, numbers, dates, lookups, boolean, employee/org references and approved header/line collections. Configure safe display labels, grouping, expressions from approved registry, visible fields, privacy classification, line-item tables for emails and conditions, key mapping and permitted status transitions. Initial submission, in-progress, approved, rejected, returned, cancelled and any legacy terminal values must map **per form** to verified actual stored values. The engine must not assume universal case or spelling across legacy forms.

Only a registered, approved form integration may write the business status. A narrowly mapped atomic update is permissible for truly simple cases; complex forms must invoke registered form-owned handlers preserving side effects and compatibility. No arbitrary status column updates.

## 6. Workflow families, routing and versions

A form can have multiple conditional routes by organization, value, action, department, employee attributes, etc. Example: Material Disposal IPP/FPP and SELL/DISPOSE may select different approved paths; example identifiers do not assert actual Oracle tables or production rules. Workflow family/definition has multiple numbered versions. Each published version is immutable, valid for specified effective dates, and bound to verified form/source/resolver/template versions. Existing instances stay pinned to their own approved versions; a new submission cycle selects the published version applicable to that cycle.

Workflow topology supports sequential stages, conditional branches, multiple paths and parallel stages (ALL/ANY/QUORUM where approved). Retain stage IDs, edges, branch criteria, duplicate approver policies, level display order and terminal rules. Use a deterministic router and safe fallback/exception handling; unsupported rules fail closed rather than choosing an arbitrary approver.

## 7. Original approval hierarchy (configuration)

Designer configures at each stage: code, level/sequence/display name, condition, resolution method, original approver(s), approval policy, action permissions, next stage(s), SLA, escalation/reminders, emails and allowed transfer policy. Supported approver methods include fixed named user(s), application role/group, requester or selected employee's direct manager, department head, business unit head, approved employee attributes and approved versioned resolvers. Store the immutable original selection specification in the published workflow version; **never edit a published hierarchy because one instance was forwarded, delegated or reassigned**.

The per-instance **resolved original approver(s)** must also be snapshotted at stage activation; changes to the live employee master or resolver must not rewrite already-recorded history.

## 8. Resolver library and dynamic SQL governance

Register reusable resolvers with identity, permitted form/org context, typed inputs, output contract, stable versions, tests, reviewer/publisher and deactivation policy. Resolver kinds include approved hierarchy, lookup, fixed group, registered application handler and technically approved read-only SQL. For SQL, save source text in an approved **resolver version**, not in every stage/task row. Stage configuration refers to the pinned resolver version and approved input mapping.

**Saving SQL is not authorization to execute SQL.** A proposed SELECT can still be unsafe or invoke side effects. Execution requires an independently approved restricted read-only Oracle identity/handler/view boundary, allowlisted sources, verified parse/statement policy, binds only, time/row limits, forbidden procedures/functions/DDL/DML, sensitive-column controls, and deterministic eligible-user result validation. If that boundary is unavailable, use an approved registered backend resolver rather than executing untrusted SQL on existing privileged pools. Resolver drafts, simulations and published changes are audited and versioned.

## 9. Notification template and delivery configuration

Visual editor for reusable versioned branded subject/body, EN/AR, approved form variables, conditional content, header/line tables, links, attachments when permitted, event-specific notifications, dynamic To/CC/BCC and recipient resolvers, preview and controlled test send. Templates and versions are governed separately from security/account-recovery email functionality. Provide form-specific approval, rejection, return, reminder, escalation, transfer and final requester-result templates. Never place confidential information or approval authority in unauthenticated email links.

## 10. Delegation setup — Phase 1

Offer **My Delegations** to signed-in eligible users and an authorized Delegation Administration capability. The user can specify delegate employee(s) via verified employee/user lookup, applicable one or many forms, optionally workflow/organization scope, effective **from** and **to** timestamps/dates, permitted actions, and reason where required. One principal may create **multiple independent delegations** for different forms and delegates. When several forms are selected, persist independently unambiguous scoped records or an equivalent normalized representation. View upcoming/active/expired/revoked entries; edit/revoke with audit. A delegate must be eligible and active; delegation never confers global RBAC permissions.

Overlapping delegations which could yield multiple recipients for the same form/task/time must be prevented or resolved by an explicit approved deterministic rule. No silent `FETCH FIRST 1` selection. Do not allow invalid self-delegation or cyclic delegation chains; use bounded policy for nesting and act-on-behalf rules.

## 11. Delegation application — Phase 2

**Check delegations when each actual stage/task is about to activate, before its notification is queued**, not only when the request was originally submitted. First resolve and preserve the **original approver** from that stage's pinned policy; then check active eligible delegation for that user, form, organization and activation instant. If no matching delegation exists, assign the original approver. If valid, assign the delegate directly, notify the delegate (not the original), and preserve the original principal, delegate, delegation ID and explicit `DELEGATED` reason in task and immutable history.

A delegation created after an already-active task does **not** silently transfer that task. Expiry/revocation and current eligibility must be checked at action time; if authority is no longer valid, block the stale action and route through explicit reassignment/recovery policy. The delegate's approval/rejection is recorded **under the delegate's real user identity**, with the principal shown as `on behalf of`, never falsely as the principal's action.

## 12. Forwarding — runtime transfer of approval responsibility

A current eligible approver may choose **Forward** after receiving the task. A forward transfers approval authority at the **same level** to one eligible target; it is not merely emailing for information. Preserve the originally resolved approver even after one or more forwards. Current recipient and inbox responsibility transfer to the forwarded user; the old recipient's task action link/authority becomes invalid. Record initiator, from/to users, reason, timestamp, transfer chain and new notification. The forwarded user decides under **their own identity**. Published hierarchy and other request instances remain unchanged.

If information-only forward is offered, it must be a separately named/read-only action and must not transfer approval authority or be confused with this Forward operation.

## 13. Reassignment — runtime transfer with special authorization

Reassignment changes only the current active level's responsibility for **this single workflow instance**. It may be performed by the current eligible assignee when permitted or by an authorized previous-level decision maker: for example, while Level 3 is pending, a user who actually approved Level 1 or Level 2 **in the current submission cycle** may be eligible to reassign Level 3, subject to the published policy. User appearing merely as original approver but not actual approving actor does not automatically qualify. No unrelated employees or other cycles gain authority.

Record reassigner actor, original level approver, previous/current assignees, target, reason, timestamp and notification. Transfer cannot alter prior decisions or republish the hierarchy. Forward and Reassign must have distinct action codes and access policies even if they share transactional assignment mechanics.

## 14. Three identities and assignment lineage (mandatory)

Every task/stage must distinguish: (1) **original approver** from the configured/resolved hierarchy (immutable for that stage execution), (2) **current assignee** who owns the pending task (changes on valid transfers), and (3) **actual action actor** who approved/rejected (immutable after decision). For delegated decisions also record the principal. Every original-to-delegate, sender-to-forwarded and prior-to-reassigned transfer must be reconstructible as a chronological typed event, even after multiple transfers. Display meaningful employee names, user/employee IDs as needed and historical identity snapshots without exposing unnecessary personal data.

## 15. Submission and initial workflow instance

Employee submits an existing form through its approved server-side integration. Authenticate and authorize the actor, verify record scope and form eligibility/status, load authoritative form values/lines, select the correct effective published workflow version, snapshot relevant submission and routing context, create a new instance and activate initial eligible stages/tasks. Set the form's mapped in-progress status via approved handler, create immutable submission/assignment events and durable notification jobs. Maintain atomicity where the same DB connection supports it; otherwise use durable idempotent integration/outbox with explicit consistency states. Repeated network requests cannot create duplicate active executions.

## 16. Worklist, tasks and approval pages

Centralized **My Approvals** and authorized administrative worklist with pending/completed/overdue, search, filters, form and organization, request number, requester, original approver, current assignee, level, due date, delegation/forward/reassignment badges, task detail and action controls. Task state, current permissions and record scope govern buttons at the backend. Secure links from emails lead to the authenticated task/form context; an email link or token alone does not grant approval.

## 17. Approve, reject and return / RFI

Approve: record actual actor, decision time, comment, resulting stage state, progress to next stage and notify new assignees. Reject: record actor/reason, end the current approval cycle under the configured policy, cancel/close remaining pending tasks, update the business form to the mapped rejected state and notify requester. Return/request-for-information: preserve entire transaction history, questions/answers and current assignments; policy defines whether the current workflow remains open and stages restart with increased iteration number. A return is not silently treated as rejection. Enforce approved comment requirements per action.

## 18. Rejected request resubmission — immutable multiple cycles

If the original form permits it, its owner/requester can correct **the same business record** after rejection and submit it again. The prior rejected workflow execution remains terminal and immutable. Create a **new linked workflow instance** with its own submission time/actor, `REVISION_NO` / cycle number, root and previous-instance links, submission snapshot, eligible workflow version, stages, original approvers, transfers, actions, decisions and notification records. Example: request 4628 → cycle 1 rejected at Level 2 → cycle 2 approved at Level 3. Both cycles must be visible with complete details on the same business form. Never delete/recycle a previous instance or overwrite its hierarchy. New cycle has independent authorization checks, conditions, delegation lookups and audit trail.

Only one current active cycle for a given form + scoped business record + submission event is allowed by default. Configure and constrain exceptions explicitly if multi-event independent workflows are later approved. Do not permit a rejected form to bypass its form-owned editing/resubmission rules.

## 19. Complete history and requester final notification

Provide **two synchronized views**, on both source forms and Workflow Manager:

1. **Original Approval Hierarchy** — all configured/activated levels and the originally resolved approver(s), including skipped/conditional/parallel route handling.
2. **Actual Transaction Timeline** — submitted by whom and when; at each level original approver, delegated/forwarded/reassigned from/to, initiator and reason, who actually approved/rejected/returned, action time, comments, stage transitions, email queued/attempted/provider accepted/failed/retried, status-sync outcome, completion and final requester notification. Present each rejected/resubmitted cycle separately, never merge histories into a misleading single path.

After **last required approval**, the workflow writes the verified business form's final `APPROVED` (or its mapped value), marks the instance terminal and **queues a result email to the original requester**. After rejection, write mapped `REJECTED`, terminate applicable tasks and likewise notify requester. **Requester notification is not an approval level**; the resulting event is independently tracked. Do not call a request "notified" until the provider accepts the email; clearly distinguish delivery states. Finalization cannot claim business success if status synchronization failed.

## 20. SLA, reminders, escalations, exceptions and monitoring

Per-workflow/stage SLA clocks, permitted reminders and controlled escalation targets, business calendars if configured, assignment exception handling, controlled retry and administrator resolution. Durable outbox records avoid lost notifications; deduplication/idempotency prevent repeated assignments and duplicate business transitions. Provide monitoring of pending/overdue/completed/rejected/reassigned/delegated requests, task aging, form, BU, organization, approver and cycle reporting, audit and CSV export under appropriate permissions. No unapproved background worker infrastructure or new third-party queue introduced by default; use an approved in-process/external scheduler mechanism consistent with existing architecture when Phase 2 implementation is designed.

## 21. Configuration governance and security

Draft → under review → approved → published → retired lifecycle; maker/checker and optional effective dates; immutable versions, change comparison, audit, controlled rollback via new version and restricted delete. Existing `XX_ZRV_*` RBAC, effective permissions, MFA rules, secure sessions, CSRF, scoped access and centralized error responses remain authoritative. Separate rights to register source/SQL, design workflow, approve/publish, configure delegation, read tasks, act on task, view history, reassign and operate exceptions. Privileged ability to configure a workflow is not permission to approve that workflow's tasks.

## 22. Business form and legacy coexistence

The new module must not automatically take ownership of currently live CodeIgniter 3 workflows, `XXPHP_WORKFLOW`, `XX_REQ_WF_REC` or form-specific approval/mail/status methods. Existing references in Node form listing/report code must be reviewed before cutover. Do not write new execution rows to the legacy table merely to satisfy a compatibility shortcut, nor backfill old transactions as new approvals without validated migration rules. Preserve legacy history through a specifically authorized read-only adapter or migration with stable IDs and provenance, if required. Each form/event is cut over explicitly to ensure only **one** authoritative execution engine acts on a live request.

## 23. Transactional consistency, concurrency and evidence

Use shared Oracle LOW pool for writes, service-owned transactions, bind variables and deterministic locking/optimistic row versions. Every approval, rejection, transfer, delegation application, stage advance, form status update (where transactionally possible), action log, event and durable outbox job must be consistently recorded. Support no-result/ambiguous-resolver failure, parallel races, duplicate clicks, expired delegation, revoked sessions, request cancellation, email outage and status-handler failure. Immutable history must retain actor/user/stage/cycle IDs and timestamps; preserve audit privacy, retention and access restrictions.

## 24. User experience and design standard

Apply **ITSAZZ**: distinctive production-quality enterprise interface, compact polished layout, accessibility, responsive behavior, keyboard usability, loading/error/empty states and finished interactions. Workflow Management: five-step guided designer — choose form, conditions, levels, email/actions, simulate/review/publish — with Standard and Advanced mode using the same backend validation. Separate My Delegations and Delegation Administration. Workflow Execution: central worklist, actionable task detail, original hierarchy vs actual history and cycle tabs with clear delegation/forward/reassignment actor labels. No fake dashboards, ornamental controls, silent errors or mock production data.

## 25. Acceptance scenarios (minimum end-to-end tests)

**Management:** register verified form/source; configure key/line/status mappings; define fixed/dynamic/conditional/parallel stages; publish immutable v1 then revise to v2; configure approved resolver and versioned template; simulate matched/unmatched conditions; create multiple form-scoped delegations and reject ambiguous overlaps; enforce role scopes.

**Execution:** submit and notify first stage; direct approval by original actor; delegate active at stage activation to C and show `original A / actual C`; no eligible delegation uses A; forward Level 2 from Y to X, X approves, preserve Y as original; reassign Level 3 from Z to W by an authorized actual prior-level approver X, W approves; deny unauthorized previous-level reassignment; reject at Level 2, notify requester, edit and resubmit same business record, new cycle links to old; display **both cycles**, original stages, every reassignment/forward/delegation, comments, actor/date and final requester notification; final approval status writes successfully; status-write failure and SMTP failure tracked and recoverable; parallel ALL/ANY/QUORUM and double-submit races; no stale email link can approve a transferred task.

## 26. Current proposed table inventory (all 19, full rollout)

**Configuration/governance (11):**

1. `XX_ZRV_WF_FORMS`
2. `XX_ZRV_WF_DATA_SOURCES`
3. `XX_ZRV_WF_SOURCE_VERSIONS`
4. `XX_ZRV_WF_FORM_VERSIONS`
5. `XX_ZRV_WF_DEFINITIONS`
6. `XX_ZRV_WF_RESOLVERS`
7. `XX_ZRV_WF_RESOLVER_VERSIONS`
8. `XX_ZRV_WF_TEMPLATES`
9. `XX_ZRV_WF_TEMPLATE_VERSIONS`
10. `XX_ZRV_WF_VERSIONS`
11. `XX_ZRV_WF_PUBLICATION_REVIEWS`

**Delegation and execution/operations (8):**

12. `XX_ZRV_WF_INSTANCES`
13. `XX_ZRV_WF_STAGE_INSTANCES`
14. `XX_ZRV_WF_TASKS`
15. `XX_ZRV_WF_ACTIONS`
16. `XX_ZRV_WF_DELEGATIONS` *(configured during Phase 1, applied at Phase 2 runtime)*
17. `XX_ZRV_WF_EVENTS`
18. `XX_ZRV_WF_OUTBOX`
19. `XX_ZRV_WF_EXCEPTIONS`

**Mandatory physical-schema revisions from v1.0 proposal, not yet approved DDL:** stage ordinal/name and snapshot of original resolved hierarchy; task original/current/actual assignee distinction, assignment mode and applied delegation reference; typed from/to actor handoffs; full action timestamps and immutable events; root/previous instance links and cycle/revision uniqueness; notification attempt/provider outcome; form context snapshots; original-publisher/version pins; policy and time-window indexes; strict constraints/retention/permissions. Evaluate whether stage/approver rows need separate relational definitions **without treating 19 as sacred**; avoid additional tables unless they materially improve integrity/queryability. All physical details belong to the next complete schema design package.

## 27. Approval gates and implementation authority

**G1** owner approval before Oracle DDL/data changes, RBAC catalogue writes or authorized TEST run. **G2** before changes to central authentication/MFA/session/CSRF/security behavior. **G3** before changes to protected shared infrastructure contracts beyond routine module registration. **G4** before changing CI3-dependent behavior, coexistence or write ownership. Separate target-specific approval applies to subsequent production/UAT deployment. Code reviews and local unit tests do not constitute DB execution approval. ChatGPT provides repository-based architecture and compact Claude implementation prompts; Claude codes authorized scope; owner operates Git/GitHub and deployments; ChatGPT reviews pushed changes. No repeat approval of already-locked business decisions.

## 28. Explicit exclusions and outstanding design validations

- No third functional development phase; the old advanced-execution scope is folded into Phase 2.
- No replacing existing business-form tables, authentication, RBAC framework or email-account recovery subsystem.
- No arbitrary SQL or status DML enabled through visual configuration.
- No retroactive editing of published hierarchy or historical approval instances when a new mapping, delegate or resolver version is configured.
- No automatic adoption of old CI3 workflow instances without an approved compatibility/migration plan.
- Validate the exact Oracle source/table shapes, restricted SQL execution boundary, legal form statuses and environment-specific privileges during technical database design; these are **verification tasks**, not invitations to reopen locked business requirements.
- Final v3.1 supersession requires comparison to the unavailable verbatim original v3.0 master BRD. Until then, **v3.0 + this addendum** remain jointly binding; no omissions are authorized.

## 29. Change log — what is clarified from v3.0

| Change | v3.1 rule |
|---|---|
| Phasing | Two phases only: Management; Execution (old advanced Phase 3 merged into Execution) |
| Database | One complete 19-table working inventory/one consolidated reviewed TEST rollout, schema adjusted for whole scope before implementation |
| Delegations | My Delegations in Phase 1; form-specific multi-delegate schedules; checked **per stage activation** in Phase 2 |
| Forward | Runtime transfer of action to another approver **at the same level**, original remains visible |
| Reassign | Runtime transfer at current level; qualified previous actual approving user in same cycle may reassign if authorized |
| Actor identities | Original approver, current assignee and actual acting approver always distinguishable |
| Rejection | Terminal for current approval cycle; requester is notified |
| Resubmission | Same business record, **new linked workflow instance/cycle**; prior rejection/history fully retained |
| Return for correction | Can remain inside current instance with new stage iteration according to published rules, distinct from rejection |
| Completion | Final form status synchronized then requester notification queued; requester notice is **not** another approval level |
| History | Original hierarchy + complete actual event timeline, separate history for all cycles, displayed in forms and worklist |
| Legacy | `XXPHP_WORKFLOW` analysis informs transition; do not alter/write it or overlap engines without G4 approval |

## 30. Next step

Owner has requested locking this v3.1 requirements update. Next prepare **Oracle Schema Design v1.1** and a comprehensive proposed DDL, constraints, grants, indexes, transactional design, versioned JSON schemas and migration/cutover safeguards covering **both phases together**. Explicit G1 authorization is then needed before any Oracle TEST execution. Locking the requirements does not authorize Claude coding, Git writes or any Oracle DDL/DML execution. Those require the applicable project approval gate(s).
