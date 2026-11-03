# Zamil Digitalization — Master Workflow Manager
## Development roadmap — exactly two functional phases

**Status:** Proposed engineering delivery breakdown; no change to locked business requirements.  
**Business authority:** Locked v3.0 + v3.1 + v3.2; v3.2 governs RFI, comments, FYI and unified portal clarifications.  
**Database baseline:** Oracle ADW TEST structural verification supplied by owner on 2026-11-02: 21 workflow tables, 50 FKs, 48 valid explicitly named indexes, 16 enabled triggers and all post-deployment verification conditions passed. This is **structural evidence only**, not successful runtime integration testing or a statement that the migration scripts have been reconciled with the deployed schema.  
**Product architecture:** Existing React 19/Vite 8 frontend, Node 24/Express 5 backend, Oracle ADW LOW pool for writes, existing RBAC, login, MFA, CSRF, standardized API envelopes, registry/navigation, Joi, OpenAPI and GitHub workflows. No second authentication/authorization/notification framework.

### Important definitions

- **Phase** means one of two fixed functional delivery phases. The packages below are **work packages / PR milestones**, **not additional phases**.
- **Backend-first contract within each vertical slice**: agree request/response, auth and Oracle transaction behavior; create/test minimal API; integrate actual UI against it; deliver a complete slice. Do not complete the entire phase's backend before starting UI; do not build fake UI with nonexistent endpoints.
- **Phase 1** may use the 11 configuration/governance tables and `XX_ZRV_WF_DELEGATIONS`. It cannot activate workflow instances or send live execution notifications.
- **Phase 2** activates remaining runtime tables; configuration remains readable and phase 1 screens remain operational.
- The 21 tables are all already structurally deployed to TEST according to the owner's outputs. No new DDL is part of these packages by default; any new DDL/RBAC catalogue writes require explicit G1 authorization.

## Table inventory (canonical full names)

| Key | Oracle table | Primary purpose |
|---|---|---|
| F | `XX_ZRV_WF_FORMS` | Registered forms |
| DS | `XX_ZRV_WF_DATA_SOURCES` | Approved source objects or handlers |
| SV | `XX_ZRV_WF_SOURCE_VERSIONS` | Versioned source allowlists |
| FV | `XX_ZRV_WF_FORM_VERSIONS` | Verified PK/status/field mapping versions |
| D | `XX_ZRV_WF_DEFINITIONS` | Workflow families / form-event trigger |
| R | `XX_ZRV_WF_RESOLVERS` | Reusable resolver identities |
| RV | `XX_ZRV_WF_RESOLVER_VERSIONS` | Governed resolver implementation versions |
| T | `XX_ZRV_WF_TEMPLATES` | Notification template identities |
| TV | `XX_ZRV_WF_TEMPLATE_VERSIONS` | Versioned EN/AR templates |
| V | `XX_ZRV_WF_VERSIONS` | Workflow graph and pinned policy versions |
| PR | `XX_ZRV_WF_PUBLICATION_REVIEWS` | Maker/checker decisions |
| DEL | `XX_ZRV_WF_DELEGATIONS` | My Delegations and scoped delegation administration |
| I | `XX_ZRV_WF_INSTANCES` | Form record, cycle and workflow version |
| SI | `XX_ZRV_WF_STAGE_INSTANCES` | Activated stages, routes, iteration and original snapshots |
| TK | `XX_ZRV_WF_TASKS` | Original approver, current assignee and actual decision actor |
| A | `XX_ZRV_WF_ACTIONS` | Immutable business actions/comments/transfer lineage |
| E | `XX_ZRV_WF_EVENTS` | Append-only timeline |
| O | `XX_ZRV_WF_OUTBOX` | Email/integration work, attempts and delivery state |
| X | `XX_ZRV_WF_EXCEPTIONS` | Retryable failures and administered recovery |
| RFI | `XX_ZRV_WF_RFI` | One open question per workflow instance, answered rounds |
| FYI | `XX_ZRV_WF_FYI` | Read-only informational recipients and worklist |

## Prerequisite engineering checkpoint — documentation and TEST validation (not a functional phase)

**DC-0**: Reconcile the actual deployed TEST dictionary with the final reviewed migration files, including on-the-fly corrections to JSON syntax, 48 explicit indexes, `XX_ZRV_WF_EXCEPTIONS.CREATED_AT`, trigger and constraints inventory; keep a clean **greenfield** script and separate **already deployed** reconciliation evidence, never rerun CREATE TABLE over existing objects. Check the locked v3.2 file into `docs/workflow-manager/` through an owner-reviewed documentation PR; include both roadmap and user guide. Read-only Oracle dictionary checks and reviewed transactional smoke tests are required before enabling live execution in Phase 2. Do not alter existing schema or app code under this documentation package. Existing v3.0 original wording remains binding if not yet recovered for verbatim reconciliation.

## Phase 1 — Workflow Management (complete configuration product)

| Package | Deliverable (usable, tested vertical slice) | Primary workflow tables | Acceptance gate |
|---|---|---|---|
| **M1 — Module foundation & form registry** | Workflow Manager navigation/route/permission catalogue proposal; role-guarded API and UI for list/register/inspect forms and registered source identities; source/handler allowlist; no direct business-table edits | F, DS; read SV, FV | User sees only authorized features; verified form identity/record scope; no invented Oracle table/column mapping |
| **M2 — Versioned form/source mapping** | Source version builder, verified header/line PK/composite keys, scoped org/employee data, field catalogue, statuses and transitions, form-owned status-handler contract; validated preview | F, DS, SV, FV | Real source dictionary validation, safe identifier allowlisting, no arbitrary DML; draft/published immutability |
| **M3 — Workflow designer** | ITSAZZ five-step designer: choose form → route conditions → levels → notifications/actions → simulate/review/publish; graph editors for sequential, branching, parallel ALL/ANY/QUORUM; approvers and FYI slots; RFI, comments, transfer and SLA policy; saved drafts and versions | F, FV, D, V; read R, RV, T, TV | Deterministic graph validation; original hierarchy preserved; no fictitious UI behavior |
| **M4 — Resolvers & email templates** | Fixed/role/manager/dept/BU/approved handler resolvers, versioned technical review; restrict SQL behind approved read-only boundary; EN/AR templates, recipient To/CC/BCC rules, redaction, action-comment/RFI/FYI variables, preview and controlled test-send | R, RV, T, TV; read F, FV, V | Unsafe SQL never executed by privileged pools; preview is accurate; test-send distinct from runtime notification |
| **M5 — My Delegations and administration** | Self-service creation/edit/revoke; multiple form-specific delegates and time windows; verified employee eligibility; overlap/cycle protection; scoped delegation administrator view | DEL; read F, D | Persisted records; no global RBAC elevation; no live task reassignment yet |
| **M6 — Simulation, maker/checker & publication** | Sample-context simulation with audit, compare versions, review/approve/publish/retire, effective windows, collision checks across definitions, dependency pinning, fail-closed conditions; configuration audit | PR, F, DS, SV, FV, D, R, RV, T, TV, V; read DEL | No unapproved publication; version immutability; successful and failing simulations explained |
| **M7 — Guided onboarding & Phase 1 acceptance** | Complete ITSAZZ UI polishing; searchable setup help; per-form onboarding guide generated only for actually verified mapping; permission/accessibility/API regression tests; publish one controlled non-live configuration | Reads all 11 management tables + DEL; writes only as needed for accepted configuration | Admin can configure, simulate and publish a workflow end to end; no instances/tasks/live mail created |

**Phase 1 completion criteria:** an authorized administrator can map a real form from verified Oracle metadata, design and publish a safe effective workflow (including stage FYI and RFI policies), preview emails, use My Delegations and repeat the setup using the guide without developer assistance. Runtime submissions/approval emails remain disabled.

## Phase 2 — Workflow Execution (complete operating product)

| Package | Deliverable (usable, tested vertical slice) | Primary workflow tables | Acceptance gate |
|---|---|---|---|
| **E1 — Form integration, submit & orchestration** | Server-side form owned submit; select pinned published workflow version; idempotent new instance/cycle; source status sync or durable reconciliation; resolve stages/approvers/parallel edges; stage snapshots, outbox skeleton, exceptions | I, SI, TK, A, E, O, X; read F, DS, SV, FV, D, RV, V, DEL | Duplicate submission cannot create duplicate active instance; same DB transaction for supported writes; one responsible engine per form/event |
| **E2 — Worklist & unified action portal** | My Approvals, secure task/form detail, decision action policies, actual actor/comment, approve/reject/return, per-item state and stale-link denial; form history integration | I, SI, TK, A, E, O, X; read V, FV, TV | Only eligible current actor can decide; stage progression and business status updates audited; action UI reflects API-authorized controls |
| **E3 — Delegation & authority transfers** | Check delegation at each task activation; original/current/actual identities; forward same-level, reassign current-level (including authorized prior actual approver within same cycle), transfer chains, invalidation of previous task holder | DEL, I, SI, TK, A, E, O, X; read V, RV | Delegation before notification; old actor loses rights; no published hierarchy changes; handoff reasons retained |
| **E4 — RFI, FYI & comment notifications** | RFI question/answer-only worklist and portal; one-open-RFI global instance gate; block all approvals/rejections and ordinary transfers until answered; FYI stage notification/read-only worklist; recipient-aware comment rendering | RFI, FYI, I, SI, TK, A, E, O, X; read V, TV, RV, FV | Atomic one-open rule across parallel stages; respondent answer-only; FYI zero votes; comments redacted to recipient scope |
| **E5 — Durable delivery, reminders & escalations** | Worker using existing permitted infrastructure, outbox claim/retry/attempt/provider acceptance, requester results, reminder/SLA/escalation policies, actionable exceptions/recovery | O, E, X, I, SI, TK, A, RFI, FYI; read TV, V, DEL | No duplicate email job, safe retry; no 'delivered' before evidence; unresolved RFI never orphaned by escalation |
| **E6 — Resubmission, history & reporting** | Rejected form correction/resubmit same business key with new linked instance; original hierarchy vs actual timeline; per-cycle tabs, CSV audit/workload reports; form deep-link history | I, SI, TK, A, E, O, X, RFI, FYI; read F, FV, D, V, TV | Previous rejected cycle immutable; multiple cycles clearly separate; comments, mail states, RFI, FYI and transfers visible under permission guards |
| **E7 — Integration UAT & controlled form-by-form cutover** | Race/failure tests, ACL/accessibility, real form status side-effects, CI3 ownership validation (G4 if needed), runbooks, gradually enable authorized form/events only | Reads/writes all **21** as each exercised process requires | No dual engine; concurrency, session/CSRF, status-sync and mail outage scenarios passed; one approved form at a time |

**Phase 2 completion criteria:** request lifecycle end-to-end including eligible actor, parallel votes, delegation, forward, reassign, RFI, FYI, comments in scoped emails, final requester notice, resubmission cycles, audit/reporting, SLA and controlled recovery. There is **no third functional phase**.

## Implementation sequencing — answer to API first vs UI together

1. Do **not** implement all APIs for Phase 1 and only then build screens (slow feedback, integration drift).
2. Do **not** build full frontend first against mocked/no-op endpoints (violates Zamil production readiness rules).
3. For each M/E package: **API contract + RBAC/action matrix → backend repository/service/transaction tests → real endpoint → UI against endpoint → feature integration tests → OpenAPI + guide update → scoped PR**.
4. The first package can be backend-heavy (foundational RBAC/Oracle/form inventory), then follow a **vertical-slice API-first-inside-the-package / backend+frontend-together delivery**.
5. Prefer one scoped PR per package, split unusually large packages into a backend contract PR and UI PR only when both are linked, tested, and the UI is not exposed before the backend is available.
6. Use `server/src/modules/workflow-manager/` and `client/src/features/workflow-manager/` as proposed feature folders only, not an instruction to move existing code. Use established registry, protected router and OpenAPI extension points. Do not change protected shared behavior without applicable gates.

## Roles & approval gates

- ChatGPT: repository inspection, architecture/contract and acceptance review, concise Claude tasks; owner reviews technical impact.
- Claude: only approved scoped implementation in feature branch; small testable PRs; no structural re-analysis of locked decisions.
- Owner: creates/merges branches and controls releases, permissions and Oracle rollouts.
- G1: any new Oracle DDL/data/RBAC catalog writes (the existing schema deployment is **not** a blanket authorization for future catalogue writes).
- G2: changes to core auth/MFA/CSRF/session/authorization behavior.
- G3: behavior changes to shared routes/config/client/provider infrastructure rather than routine module registration.
- G4: CI3/form write ownership and coexistence changes.

## Required docs written as part of every implemented package

- Update `docs/workflow-manager/WORKFLOW-SETUP-USER-GUIDE.md` after any admin UI change.
- For **each actually integrated form**, write `docs/workflow-manager/forms/<verified-form-code>.md` from `FORM-ONBOARDING-GUIDE-TEMPLATE.md`. Include verified screen names and real stored statuses, never guessed values or SQL.
- Maintain `docs/workflow-manager/forms/README.md` as the per-form guide index (form registered / configured / runtime-enabled states).
- Update API/OpenAPI, relevant test evidence, deployment and rollback notes and implementation handoff per PR.