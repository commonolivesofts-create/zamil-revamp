# Workflow Manager — Required Screen / Feature User-Guide Matrix

**Status:** Planned coverage inventory; rows 01–04 are implemented by package M1 and row 05 by package M2-A (see links), all others remain planned. This is **not proof these screens exist**; every item becomes a verified user guide when its real API+UI implementation ships. Exact routes, permissions, buttons and screenshots must be verified from production code and the actual running application. No generic one-guide-for-everything substitution.

| ID | Package | Feature / screen | Required screen-specific guide (under `user-guides/`) | Audience |
|---|---|---|---|---|
| 01 | M1 | Workflow Manager entry and navigation | [`01-workflow-manager-navigation.md`](user-guides/01-workflow-manager-navigation.md) — **Implemented (M1)**, tests verified; live check pending G1 | Eligible users |
| 02 | M1 | Form Registry list and lookup | [`02-form-registry.md`](user-guides/02-form-registry.md) — **Implemented (M1)**, tests verified; live check pending G1 | Configuration administrator |
| 03 | M1 | Register/edit form and organization scope | [`03-form-registration.md`](user-guides/03-form-registration.md) — **Implemented (M1)**, tests verified; live check pending G1. Organization scope is held in the M2 versioned mapping (no column on `XX_ZRV_WF_FORMS`) | Configuration administrator |
| 04 | M1 | Data Source Registry | [`04-data-source-registry.md`](user-guides/04-data-source-registry.md) — **Implemented (M1)**, tests verified; live check pending G1 | Source administrator |
| 05 | M2-A | Data source versions and approved allowlist | [`05-data-source-version.md`](user-guides/05-data-source-version.md) — **Implemented (M2-A)**, tests verified (branch `feat/workflow-manager-m2-a-source-mapping`, 2026-11-09); `SOURCE_MAPPING` registration (G1) and live check pending | Source administrator |
| 06 | M2 | Header/detail/PK/FK field mapping | `06-form-field-mapping.md` | Form integrator |
| 07 | M2 | Business status, submit-event and ownership mapping | `07-form-status-mapping.md` | Form integrator |
| 08 | M3 | Workflow definitions, list and drafts | `08-workflow-list.md` | Workflow designer |
| 09 | M3 | Designer — Step 1 choose form | `09-designer-select-form.md` | Workflow designer |
| 10 | M3 | Designer — Step 2 conditions/branches | `10-designer-routing.md` | Workflow designer |
| 11 | M3 | Designer — Step 3 approval hierarchy/parallel | `11-designer-levels.md` | Workflow designer |
| 12 | M3 | Designer — Step 3 FYI and RFI action policies | `12-designer-fyi-rfi.md` | Workflow designer |
| 13 | M3–M4 | Designer — Step 4 recipients/emails/action comments | `13-designer-notifications-actions.md` | Workflow designer |
| 14 | M4 | Resolver Library and eligibility checks | `14-resolver-library.md` | Resolver administrator |
| 15 | M4 | Resolver versions, approved SQL safeguards | `15-resolver-version-review.md` | Technical reviewer |
| 16 | M4 | Email template library and EN/AR editor | `16-email-template-editor.md` | Notification administrator |
| 17 | M4 | Email preview and controlled test-send | `17-email-preview-test.md` | Notification administrator |
| 18 | M5 | My Delegations | `18-my-delegations.md` | Employee / approver |
| 19 | M5 | Delegation Administration | `19-delegation-administration.md` | Delegation administrator |
| 20 | M6 | Designer — Step 5 simulation and validation | `20-simulation-validation.md` | Workflow designer |
| 21 | M6 | Configuration review/maker-checker | `21-review-approval.md` | Reviewer/publisher |
| 22 | M6 | Publish, compare, retire and version history | `22-publish-version-history.md` | Reviewer/publisher |
| 23 | E1 | Submit form for workflow and track status | `23-submit-track-request.md` | Requester |
| 24 | E2 | My Approvals — worklist and filters | `24-my-approvals.md` | Approver |
| 25 | E2 | Unified Workflow Action Portal / task detail | `25-action-portal.md` | All participants (scoped) |
| 26 | E2 | Approve, reject and action comments | `26-approve-reject-comments.md` | Current approver |
| 27 | E2 | Return for Correction vs RFI | `27-return-for-correction.md` | Approver / requester |
| 28 | E3 | Forward and reassign at same level | `28-forward-reassign.md` | Authorized actors |
| 29 | E3 | Act as delegate / transfer history | `29-delegated-approvals.md` | Delegate and principal |
| 30 | E4 | Request More Information | `30-request-information.md` | Current approver |
| 31 | E4 | Information Requested — provide answer only | `31-provide-information.md` | RFI respondent |
| 32 | E4 | FYI inbox and read-only detail | `32-fyi-information.md` | FYI recipient |
| 33 | E5 | Notification delivery/audit, reminders and escalation | `33-notifications-escalations.md` | Authorized operations |
| 34 | E6 | Original hierarchy, actual timeline and cycles | `34-workflow-history.md` | Scoped user/auditor |
| 35 | E6 | Reject then correct/resubmit same form record | `35-resubmit-rejected-request.md` | Requester |
| 36 | E6 | Reports and CSV exports | `36-monitoring-reports.md` | Reporting users |
| 37 | E6–E7 | Exceptions, recovery, legacy cutover | `37-operations-recovery.md` | Workflow operator |

## Acceptance requirements for every guide

Use distinct step-by-step instructions for its **actual** screen/feature, not copied generic paragraphs. Each guide requires: verified route/menu; eligibility and role; prerequisites; actual controls and fields; steps including save/submit/confirm; what changes in Oracle workflow state (not raw SQL for end users); generated email and visibility; validation/403/409/timeout states; linked guides and sanitized screenshot after implementation; date + build/PR version that verified it. Explicitly mark `Planned — not yet live` until complete. If one actual screen covers several functions, keep separate **feature guides** when the audience/actions differ.

## Separate guides for business forms

Create `forms/<verified-form-code>.md` for **each onboarded and verified real business form**, in its onboarding PR. Do not claim all existing forms are on the new engine; never invent Oracle source mappings, statuses or routes. Provide exact per-form setup and workflow operations including approvers, FYI, RFI, conditions, templates, status transitions, tests and authoritative owner. Track onboarding status and guide links in `forms/README.md`.