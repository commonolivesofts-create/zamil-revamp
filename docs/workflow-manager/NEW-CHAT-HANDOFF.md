# Zamil Digitalization — Master Workflow Manager
## New-chat handoff — November 2, 2026

**Project:** Zamil Revamp / Zamil Digitalization  
**GitHub:** `commonolivesofts-create/zamil-revamp` (owner manages Git; ChatGPT reads/reviews through connected GitHub connector; Claude implements).  
**Requirements:** Previously approved full BRD **v3.0** PLUS controlled **v3.1 LOCKED** addendum, `Zamil_Master_Workflow_Manager_Requirements_v3_1_LOCKED.md`. Both bind the design; no silent omission.  
**Status:** Business and functional requirements locked. No Oracle physical schema approved; previous Oracle Design v1.0 and DDL are **superseded draft/reference only and DO NOT EXECUTE**. No Phase 1 code authorized.  
**Current next task:** Prepare one comprehensive **Oracle Schema Design v1.1** and proposed DDL for both functional phases, without running anything, following repository guidance and current verified DB facts.

## Locked delivery division

1. **Phase 1 — Workflow Management:** all form/source/PK/status and organization mappings; workflow/routing/stage/approver conditions; fixed and dynamic resolver library, restricted SQL policies; parallel/conditional workflows; email templates; design/simulate/review/version/publish; **My Delegations** and administrator delegation setup; ITSAZZ premium functioning frontend. No live workflow submissions/notifications until Phase 2.
2. **Phase 2 — Workflow Execution:** actual submission, task stage activation, **delegation check at each stage activation**, email notifications, worklist, authenticated approve/reject/return/RFI, forward/reassign, parallel, SLA/reminders/escalation, audit, reporting, requester final result email, business form status integration, exceptions, linked rejected-request resubmission. The old advanced Phase 3 scope is folded into Phase 2; no third phase.

**ONE full Oracle schema proposed and reviewed for both phases before Phase 1.** Current working inventory: 19 `XX_ZRV_WF_*` tables (11 configuration/governance + 8 execution/delegation). 19 is not sacred if integrity demands adjustments, but explain any changes and avoid complexity for its own sake.

## Mandatory runtime and history rules

- Distinguish **published original hierarchy**, **per-instance resolved original approver**, **current task assignee**, **actual decision actor**; preserve each separately.
- **Delegations:** configurable before the task, scoped to one/many forms, different delegates, from/to dates, eligible active users and actions. At **each stage activation**, resolve original approver, then check matching active delegation; assign/email delegate if eligible; show principal and delegate. A delegate decides in their OWN name with the principal shown as 'on behalf of'. Do not retroactively transfer existing tasks due to later delegation settings.
- **Forward:** after an assignee receives an active level task, that user can transfer approval at SAME level to eligible target. Original approver retained; all transfer actors/from/to/times/comments logged. Forwarded user approves/rejects in own name. Previous recipient no longer has task authority.
- **Reassign:** transfers SAME current level task, potentially by another approved actor who ACTUALLY approved an earlier stage in the SAME cycle, per configured policy; track who reassigned from whom to whom. This does not edit the published hierarchy or other requests.
- **Reject → Resubmit:** rejection terminates cycle; if form permits, requester edits SAME form record and resubmits. Create NEW linked workflow instance/cycle (`REVISION_NO`, root/previous link). Preserve cycle 1, all its levels, transfers, rejection and notifications, and show cycle 2 independently. Return/RFI can remain in same instance with iteration count according to workflow policy.
- Full timeline starts at submission: submitted by/to whom, every stage assignment, delegation/forward/reassignment, approval or rejection by real actor and date, source and business status sync, mail queued/sent/failed, **final requester notification**. Requester notice is NOT an approval level. Show both original hierarchy and actual transaction timeline on form and worklist.
- Keep `XXPHP_WORKFLOW` and `XX_REQ_WF_REC` legacy data safe; no dual-engine writes; migration/history adapter only under specifically approved coexistence plan. Example legacy expense `NGROUP_ID=30198` had 5 rows despite NUMBER_OF_STEPS=4; don't equate notification count with approval-level count without legacy source evidence.

## Proposed Oracle table names to review (not approved)

Configuration: `XX_ZRV_WF_FORMS`, `XX_ZRV_WF_DATA_SOURCES`, `XX_ZRV_WF_SOURCE_VERSIONS`, `XX_ZRV_WF_FORM_VERSIONS`, `XX_ZRV_WF_DEFINITIONS`, `XX_ZRV_WF_RESOLVERS`, `XX_ZRV_WF_RESOLVER_VERSIONS`, `XX_ZRV_WF_TEMPLATES`, `XX_ZRV_WF_TEMPLATE_VERSIONS`, `XX_ZRV_WF_VERSIONS`, `XX_ZRV_WF_PUBLICATION_REVIEWS`.

Runtime: `XX_ZRV_WF_INSTANCES`, `XX_ZRV_WF_STAGE_INSTANCES`, `XX_ZRV_WF_TASKS`, `XX_ZRV_WF_ACTIONS`, `XX_ZRV_WF_DELEGATIONS`, `XX_ZRV_WF_EVENTS`, `XX_ZRV_WF_OUTBOX`, `XX_ZRV_WF_EXCEPTIONS`.

Mandatory design refinements from earlier proposed v1.0: original approver and stage-level snapshot; explicit task assignment mode and applied delegation ID; typed from/to handoffs and action history; full cycle links/revision keys; submission/business context snapshots; notification delivery tracking and pending recovery; relational integrity/index/constraints; exact parallel+iteration semantics; immutability/version hashes and source mappings; secure SQL resolver execution boundary; precise business status handler integration. Decide whether the workflow stage/approver configuration should be separate relational tables or immutable validated versioned JSON based on reporting/integrity, not for arbitrary table-count target.

## GitHub/current architecture

React 19/Vite 8 client; Node.js 24/Express 5 ES Modules backend; Oracle ADW via shared `withConnection`/`withTransaction` and LOW pool for writes. Existing auth/RBAC/MFA/CSRF; module registration `client/src/config/registry/`, backend routing `server/src/routes/api.routes.js`; tests + OpenAPI. Project documentation (read only) `CLAUDE.md`, `docs/FEATURE-DELIVERY-WORKFLOW.md`, `server/docs/` and `client/docs/` is authoritative. Existing app has some legacy `XXPHP_WORKFLOW` reads (e.g. Idea listing) and form workflows omitted from new Node CRUD scopes.

## Responsibility and gates

- **ChatGPT:** repo inspection/design, concise file-specific coding prompts, GitHub review.
- **Claude:** implementation only after approved technical scope; avoid spending Claude tokens on broad architecture reanalysis.
- **Owner:** Git branch/commits/push/pull/merge, approved SQL execution and rollouts.
- **G1** Oracle DDL/catalogue/DML target-specific approval; **G2** central auth/security changes; **G3** protected shared contracts; **G4** legacy CI3 coexistence / ownership. Normal registration at documented extension points isn't automatically G3. No unapproved DB writes, Git writes or code edits. Avoid repeated confirmations; consolidate genuine decisions once.

## New chat — exact request

Read the attached LOCKED v3.1 requirements document (and original v3.0 if available as Project context). Treat all existing v3.0 scope as retained. Use the connected GitHub repo to verify architecture/conventions rather than asking Claude to research. Prepare the **full Oracle Schema Design v1.1** for both phases: exact Oracle columns/types/keys/constraints/FKs/indexes/identities, JSON versioned schema policy, dynamic SQL safety, lifecycle states, workflow graph and stage snapshots, parallel tasks, delegation/forward/reassignment and actor history, rejected-resubmitted cycles, idempotency/concurrency, outbox mail and requester notification, legacy coexistence, grants/security, and phased code integrations. Include review-only SQL DDL and TEST rollout/rollback/checks in a comprehensive package. Do not execute SQL or modify code. One consolidated owner review at the end. No reopening locked requirements; report only verified technical blockers.
