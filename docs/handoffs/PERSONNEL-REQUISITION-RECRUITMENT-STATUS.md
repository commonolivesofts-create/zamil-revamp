# Recruitment status and offer acceptance

Recruitment status is independent of requisition approval. The API retains the
`ticketStatus` field and existing ATTRIBUTE1 codes for compatibility:

| Stored/API value | UI label |
| --- | --- |
| Open | Open |
| Accepted | Offer Accepted |
| Close | Filled / Closed |
| On Hold | On Hold |
| Cancelled | Cancelled |

All new requisitions explicitly store Open, including non-HR submissions. Existing
nulls continue to read/filter as Open through NVL(ATTRIBUTE1,'Open'). Approval never
updates recruitment status. Only server-verified HR users can change recruitment
status through approved requisition actions. Create/update form payloads reject
`ticketStatus` even for HR. New forms have no status field; saved forms show it read-only.

The report detail drawer loads the current record and displays actions only when
the server confirms HR membership and approval is Approved, and the user holds
requisition UPDATE permission. POST /api/v1/hr/requisitions/:requisitionId/recruitment-status
accepts `action` (hold/cancel/reopen/fill), `expectedStatus` and optional `reason`.
The expected status prevents stale clicks from overwriting a more recent change.
Only Offer Accepted supports fill. On Hold and Cancelled support resume, restoring
Offer Accepted if a genuine acceptance date exists, otherwise Open. Filled / Closed
is terminal. No action on this screen creates a first offer acceptance.

On a saved employment offer, HR with offer UPDATE permission records the actual
acceptance date in the final step. POST /api/v1/hr/employment-offers/:headerId/accept
accepts `{ "acceptedDate": "YYYY-MM-DD" }`. The server locks both rows and, in one
transaction, changes the offer STATUS to Accepted and the linked requisition's
ATTRIBUTE1 to Accepted, storing the supplied date in ATTRIBUTE14. The date must
be on or after the offer date and no later than today in Asia/Riyadh. The saved
offer must link to exactly one existing Approved requisition by requisition number.
An optional reason can be supplied with acceptance.

An identical retry succeeds without overwriting dates. Missing/ambiguous links,
a second acceptance, or a non-open requisition produce a conflict. Accepted offers
cannot be edited/deleted, which prevents their requisition link being changed.
The requisition is not automatically marked Filled / Closed: HR records that
separate milestone. It requires an existing acceptance date and stamps the first
closure date in ATTRIBUTE15. Status re-saves preserve acceptance and closure dates.
On Hold/Cancelled retain historical dates. Reopen a held/cancelled requisition
before recording its first acceptance.

This supersedes the legacy behavior that stamped today's date on each status save.
Creation and every status action, including automatic offer acceptance, append a
RECRUITMENT_STATUS_CHANGED event to the existing audit log. The event contains the
actor, action timestamp, old/new values, optional reason, source, offer ID and actual
acceptance date where applicable. The audit record commits in the business
transaction; audit failures roll back the status and offer changes. Identical
acceptance retries do not add duplicate events.
No new database columns are used. No existing rows are rewritten by this change.

## Draft versus approval submission

The save actions are explicitly labeled **Save Draft** for new/Draft records and
**Save Changes** for existing records in other statuses. The draft success toast
explicitly says the record has not been submitted for approval.

Approval submission is not implemented. Repository inspection confirmed that
Workflow Manager currently provides M1 configuration only, with no execution,
task activation or notification service. The legacy PHP application has a separate
`Requisition/submitWorkflow` action. Connecting the form to that engine versus
implementing the new execution engine requires an owner decision. No control that
merely changes the status to Inprocess has been added; a real submission must
establish an actionable approval workflow and preserve one responsible engine.

Owner follow-up: the senior developer will implement submission. At the owner's
explicit request, a **Submit for Approval** button is displayed beside Save Draft
for editable new/Draft/Rejected requisitions. It intentionally has no click handler,
API call, status change or success message. Save Draft continues to save normally.

## Approved requisition to interview assessment

Approved report rows offer **Create assessment** to users with the existing
INTERVIEW_CREATE permission. The action opens a new interview assessment with the
requisition number in the URL. The form accepts that number only when it is present
in the server's current approved requisition lookup; the existing position lookup
then fills Position applied for. Existing assessments are never overwritten by the
URL parameter. Candidate details, interview dates and ratings require user input;
opening the form does not create a database record. The query parameter survives
refresh, while New assessment opens the ordinary blank form.

The Submit for Approval button now shows an informational Workflow pending toast
explaining that setup is pending and the requisition has not been submitted.
