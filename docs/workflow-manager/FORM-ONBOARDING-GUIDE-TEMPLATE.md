# Workflow Setup — [Verified Form Display Name]

> **Template only.** Do not publish until verified against the deployed Oracle dictionary, the actual form backend integration, and the live frontend navigation. Replace every bracketed field; do not invent statuses, PKs or handlers.

| Item | Value |
|---|---|
| Form display name | [verified] |
| Form code | [approved stable form code] |
| Owning department / form owner | [verified] |
| Frontend form page / route | [existing verified route] |
| Workflow-enabled organization scope | [verified] |
| Form primary record key | [verified PK or composite key; documentation may omit sensitive internals from end-user version] |
| Supported submission event(s) | [verified] |
| Stored form status progression | [actual stored values verified; e.g., not guessed DRAFT/APPROVED] |
| Form data preview fields / privacy | [verified safe fields] |
| Form integration handler | [approved registered handler; not raw arbitrary SQL] |
| Workflow activation/cutover | [not enabled / approved TEST / authorized production etc.] |
| Approved by / date | [owner review evidence] |

## Step-by-step administrator setup for this form

1. **Choose the form:** Workflow Manager → Workflow Designer → New → select [verified form]. Confirm [actual event] and organization scope.
2. **Choose conditions:** [specific business rules verified by form owner; include path examples].
3. **Add levels:** [level names / original approver resolver or fixed user, ALL/ANY/QUORUM if parallel]. Add FYI recipients **separately** at each level.
4. **Set actions:** [RFI allowed? eligible respondent? forwarding/reassignment policy? comment requiredness? Return for Correction? SLA?]. Remember one global open RFI per request blocks all approvals and rejections.
5. **Set notifications:** [event → approved template and recipient roles, EN/AR, permitted fields/comment exposure, authenticated portal links]. FYI has no approve/reject action.
6. **Simulate:** [tested realistic route scenarios + expected original levels, FYI and RFI outcomes].
7. **Review and publish:** [maker/checker and effective date]. Published version immutable; future change creates a new version.
8. **Runtime check after separate form cutover authorization:** [submit real TEST form in controlled plan; confirm worklist, RFI, FYI, final status and requester email; retain legacy history].

## Employee instructions for this form

- **Requester:** Open [form UI]; submit with permitted status; track [history route].
- **Approver:** Open secure task link / My Approvals; see [relevant form details]; decide using current authorized controls, add comment.
- **RFI respondent:** Open Information Requested; answer required question only; cannot approve from this item.
- **FYI recipient:** Open information-only item or form link; no approval action.
- **Rejected resubmission:** [exact form-owned edit and resubmit rules], preserving earlier cycle history.

## Troubleshooting for this form

- Missing mapping [verified error action].
- Route ambiguity [verified recovery].
- No eligible approver [approved escalation/exception].
- Status synchronization failure [form handler recovery].

**Do not expose private employee details, customer records, sensitive attachments, credentials, or real production screenshots in a public GitHub repository.**