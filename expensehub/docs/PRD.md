# ExpenseHub — Product Requirements Document (PRD)

| | |
|---|---|
| Product | ExpenseHub — employee expense claims for Zamil Plastic Industries (IPP, FPP, APP) |
| Owner | Zaid (IT) |
| Version | 0.1 draft — 17 Oct 2026 |
| Source | *ExpenseHub — Project Scope & Build Brief* (16 Oct 2026), prototype `expensehub.html` |
| Related | [TRD](TRD.md) · [DRD](DRD.md) · [Integration](INTEGRATION.md) · [API](API.md) · [UI-UX](UI-UX.md) · [Build plan](BUILD-PLAN.md) · [Decisions](DECISIONS.md) · [Open questions](OPEN-QUESTIONS.md) |

`(→ OQ-nn)` marks a requirement that depends on an open question.

---

## 1. Problem and goal

Employees at ZPI claim expenses on an Oracle form. ExpenseHub replaces that with a web app where employees **capture**, approvers **approve**, Finance **audits and sends to Payables**, while **Oracle Fusion stays the system of record** for people, invoices, payments and accounting.

**Goals**
1. One place for an employee to claim and track every reimbursement, including Fusion Payroll Quick Pays.
2. Policy enforced at entry (limits, receipts, VAT) instead of after the fact.
3. Every approved claim becomes exactly one Fusion Payables invoice — no re-keying, no duplicates.
4. Full audit trail and segregation of duties.

**Success measures (phase 1)**
- First real claim paid by Fusion from an ExpenseHub report (phase 1 exit).
- 100 % of claims for IPP, FPP, APP submitted in ExpenseHub within 2 months of go-live.
- 0 duplicate invoices in Fusion.
- Median submit-to-paid time tracked on the Finance dashboard (baseline set in month 1).

**Scale:** ~170 employees, ~25 claims/month (D-20).

---

## 2. Users and roles

One person can hold several roles; **nobody approves, audits or releases their own claim** (enforced in DB, D-24).

| Role | Who | Main jobs |
|---|---|---|
| Employee | Any active HCM employee | Capture expenses, build/submit reports, request advances, track status, see own Quick Pays |
| Approver | Line manager (HCM supervisor), CEO, HR Manager, Finance Manager (→ OQ-01, OQ-02) | Approve, reject, request info, delegate |
| Accountant / Auditor | Finance team (→ OQ-03) | Audit selected reports, verify receipts, adjust/disallow lines, release |
| Finance / AP | Payables team | Send reports and Quick Pays to Fusion, monitor sync, resolve errors |
| Petty cashier | Finance (→ OQ-13) | Disburse and settle cash advances |
| Card administrator | Treasury (phase 3) | Load SAB card files, resolve unmatched transactions |
| System admin | IT (Zaid's team) | Expense types, rules, options, role assignment, integration monitor |

Role comes from the logged-in user. The prototype's role switcher is removed.

---

## 3. Scope by phase

| Phase | Scope | Exit criterion |
|---|---|---|
| **1 — Core claim to pay** | Sign-in, HCM/COA/rates/trips/quick-pay sync, expense capture with receipt upload + ZATCA QR + OCR, policy engine, reports, approval chain, Finance audit step, send to Fusion AP, status sync, Quick Pay → invoice, accounting preview, email notifications, setup screens, employee/approver/finance dashboards, migration of open claims | First real claim paid by Fusion from an ExpenseHub report |
| **2 — Control** | Cash advances + netting, duplicate detection, ZATCA signature check, approval SLA (reminder/escalation/delegation), approve-from-email, receipts by email, Teams + WhatsApp notifications, integration monitor retry UI | Audit team works only from ExpenseHub |
| **3 — Scale** | SAB corporate cards, mobile PWA + camera, Arabic RTL UI, spend analytics | Card programme live, mobile adoption |

> Note: duplicate detection (D-23) is cheap and protects payments; it may be pulled into phase 1 if time allows.

**Out of scope:** travel booking; travel request screens (trips are requested in Fusion Absences, → OQ-10); payroll reimbursement; any GL posting or accounting engine (D-06); Fusion Projects (D-09).

---

## 4. Status lifecycle

### 4.1 Expense report

```
            submit                 last approval            audit release / no audit
 DRAFT ──────────────▶ PENDING_APPROVAL ─────────▶ PENDING_AUDIT ─────────▶ READY_FOR_PAYMENT
   ▲  ▲  withdraw            │  │                      │                           │ send to Payables (INT-08)
   │  └──────────────────────┘  │ reject               │ reject                    ▼
   │                            ▼                      ▼                        INVOICED
   └──────────── correct ── REJECTED ◀─────────────────┘                           │ payment (INT-09)
                                                                                    ▼
                                                                                  PAID
```

| Status | Set by | Next |
|---|---|---|
| `DRAFT` | Employee creates report / withdraws / corrects a rejected report | Submit (blocked by any blocking violation) |
| `PENDING_APPROVAL` | Submit | Approval chain per OQ-01; employee may withdraw → `DRAFT` |
| `PENDING_AUDIT` | Approval steps done and an audit rule matched | Accountant releases or rejects (→ OQ-03) |
| `READY_FOR_PAYMENT` | No audit rule matched, or audit released | Advance netting calculated; Finance sends to Payables (→ OQ-16) |
| `INVOICED` | Fusion accepted the invoice (INT-08) | Fusion validates, accounts, pays |
| `PAID` | INT-09 returns payment reference | Closed |
| `REJECTED` | Any approver or auditor, reason mandatory | Employee corrects → `DRAFT` |
| `SETTLED` | Net payable = 0 after advance netting (→ OQ-13) | Closed, no invoice |

Every transition writes one row to the report history (append-only).

### 4.2 Quick Pay (→ OQ-07)
`NEW` (synced from Fusion) → `INVOICE_REQUESTED` (Finance clicks Create invoice) → `INVOICED` → `PAID`; or `EXCLUDED` (Finance marks not payable via AP, reason mandatory).

### 4.3 Cash advance (phase 2)
`PENDING_APPROVAL` → `APPROVED` → `DISBURSED` → `PARTIALLY_APPLIED` → `FULLY_APPLIED`; or `REJECTED`; `REFUNDED` for returned cash (→ OQ-13).

---

## 5. Functional requirements

IDs follow the brief so tests trace back to it. **New** = not in the prototype. Phase in brackets.

### 5.1 Expense capture — FR-CAP

| ID | Requirement | Acceptance |
|---|---|---|
| FR-CAP-01 [1] | Enter an expense: date, expense type (icon tiles), merchant, amount, currency, cost center, Business Trip / Quick Pay reference (optional, D-09), business purpose, attendees (for meal types), receipt flag, tax-invoice flag. | Saved as *unreported*; all mandatory fields validated client and server side. |
| FR-CAP-02 [1] | Upload receipt (JPG, PNG, PDF ≤ 10 MB); show it beside the form. Camera capture [3]. | File stored on server disk (D-18); preview shown; wrong type/size rejected with message. |
| FR-CAP-03 [1] | OCR proposes merchant, date, amount, VAT (→ OQ-23). | Proposed values highlighted; user must confirm; QR values win over OCR. |
| FR-CAP-04 [1] **new** | Read ZATCA QR on Saudi tax invoices (seller, VAT no., timestamp, total, VAT). VAT recovery allowed only if QR validates (→ OQ-24). | Invalid/missing QR ⇒ VAT recoverable = 0 and a warning shown. |
| FR-CAP-05 [1] | Mileage = km × rate per km. Amount calculated, not typed. (D-45: no per diem — allowances are paid by Quick Pay.) | Amount field read-only for mileage. |
| FR-CAP-06 [1] | Foreign currency → SAR at Fusion corporate rate for the expense date (latest rate on or before that date). | Rate and source date shown on the line; missing rate blocks save. |
| FR-CAP-07 [1] | Recoverable VAT = round(amount_sar × 15/115, 2) when type is VAT-eligible **and** tax-invoice flag **and** QR valid. QR VAT amount used when present. | Unit tests on rounding and edge cases. |
| FR-CAP-08 [1] | Show the 6-segment charge account `Company.Location.CostCenter.Account.000.000000` as the user types (D-12, → OQ-14). | Each segment value checked against synced COA values; invalid value is a blocking violation. |
| FR-CAP-09 [1] | Unreported list; multi-select → create report; delete unreported expense (and its receipt). | Expenses already on a report cannot be deleted from the list. |
| FR-CAP-10 [2, may move to 1] **new** | Duplicate check: same employee + merchant + amount + date, or same receipt SHA-256. | Warning violation (not block); sends report to audit. |
| FR-CAP-11 [2] **new** | Receipts emailed to a mailbox land in the sender's unreported list (D-27). | Sender matched by email to an employee; unknown senders ignored and logged. |

### 5.2 Policy engine — FR-POL

| ID | Requirement |
|---|---|
| FR-POL-01 [1] | Per expense type: default limit, action on breach (warn/block), receipt-required above SAR x, justification required, VAT-eligible, natural account, unit + unit rate. |
| FR-POL-02 [1] | Validation runs on every change in the form (same rule code on client and server) and shows each rule as **pass / warn / block**. |
| FR-POL-03 [1] | Block stops save-to-report and submit; warn allows submit and forces audit. |
| FR-POL-04 | ~~Limit by grade × location class from HCM~~ — **withdrawn by D-45**: the expense type's own limit applies to everyone. |
| FR-POL-05 [1] **new** | Charge account segments must exist and be enabled (block). |
| FR-POL-06 [1] **new** | Prerequisites (FR-SET-02) failing for the employee block submit with a clear message telling them who to contact. |

### 5.3 Expense reports — FR-REP

| ID | Requirement |
|---|---|
| FR-REP-01 [1] | Report: number, purpose, date, lines, totals (reimbursable, card, advance applied, net payable), status, approval steps, audit reasons, history, Fusion invoice no., payment ref. |
| FR-REP-02 [1] | Statuses per §4.1. |
| FR-REP-03 [1] | Submit blocked while any line has a blocking violation. |
| FR-REP-04 [1] | Rejected → employee corrects → `DRAFT` → resubmit; approval chain restarts from step 1. |
| FR-REP-05 [1] **new** | Withdraw while `PENDING_APPROVAL` and no step yet approved → `DRAFT`. (→ OQ-06 for after first approval) |
| FR-REP-06 [1] | List with status filter, search, progress tracker; detail panel with full history. |
| FR-REP-07 [1] **new** | Self-service status page: where the report is, who holds it, since when (D-26). |

### 5.4 Approvals — FR-APR

| ID | Requirement |
|---|---|
| FR-APR-01 [1] | Chain built at submit from configurable rules (→ OQ-01). Default seed: Line Manager → CEO (> SAR 5,000) → HR Manager → Finance Manager → Accountant. The CEO's own claims: Finance Manager → HR Manager → Accountant (D-37). |
| FR-APR-02 [1] | CEO threshold configurable (default SAR 5,000) in system options. |
| FR-APR-03 | Project manager step — **dropped** unless OQ-04 says otherwise. |
| FR-APR-04 [1] | Approve; reject (reason mandatory); request more information (→ OQ-06). |
| FR-APR-05 [2] **new** | Delegation by date range; reminder day 2, escalation day 3 (D-25, → OQ-05). |
| FR-APR-06 [2] **new** | Approve/reject from the email via a signed one-time link (expires in 72 h, requires sign-in for reject reason). |
| FR-APR-07 [1] **new** | An approver who is also the claimant is skipped and the step goes to their HCM supervisor — for role steps too, never the BU backup (D-34); logged in history (D-24). |
| FR-APR-08 [1] **new** | If the line manager is missing in HCM, submit is blocked (prerequisite). |

### 5.5 Audit — FR-AUD (→ OQ-03, OQ-33)

| ID | Requirement |
|---|---|
| FR-AUD-01 [1] | After the approval steps, select for audit if: any warning violation, any missing required receipt, total > SAR 3,000, or random 10 %. All configurable; reasons stored. |
| FR-AUD-02 [1] | No rule matched → `READY_FOR_PAYMENT`. |
| FR-AUD-03 [1] | Auditor marks receipts verified, releases or rejects. |
| FR-AUD-04 [1] **new** | Auditor reduces or disallows a line with a reason; employee notified; totals recalculated; original amount kept. |

### 5.6 Payables hand-off — FR-PAY

| ID | Requirement |
|---|---|
| FR-PAY-01 [1] | `READY_FOR_PAYMENT` reports sent to Fusion as Payables invoices via REST (D-04): Finance "Send to Payables" (→ OQ-16), and optional hourly job. |
| FR-PAY-02 [1] | Invoice = reimbursable lines − advance applied; card lines excluded. |
| FR-PAY-03 [1] | Fusion invoice id/number stored; status and payment reference polled hourly (INT-09); report → `INVOICED` → `PAID`. |
| FR-PAY-04 [1] | No "Run payments" in ExpenseHub; payment is Fusion's payment process request (D-05). |
| FR-PAY-05 [1] | Idempotent: invoice number = report number; a retry never creates a second invoice. |
| FR-PAY-06 [1] | Receipt files attached to the Fusion invoice (→ OQ-17). |

### 5.7 Quick Pays — FR-QP **new** [1] (D-10, → OQ-07)

| ID | Requirement |
|---|---|
| FR-QP-01 | Nightly sync of Quick Pay results from Fusion Payroll for configured elements: person, element, amount, date, payroll action id. |
| FR-QP-02 | Finance Quick Pay queue: filter by BU/status/date; Create invoice (one or many); Exclude with reason. |
| FR-QP-03 | Invoice goes through the same INT-08/INT-09 path; status shown in the queue and on the employee's status page. |
| FR-QP-04 | A Quick Pay can be invoiced only once (unique key on Fusion payroll action + element). |

### 5.8 Business Trips — FR-TRP **new** [1] (D-11, → OQ-10)

| ID | Requirement |
|---|---|
| FR-TRP-01 | Nightly sync of approved business leave requests: person, type, start/end, destination (the leave-request field named by `TRIP_DESTINATION_FIELD`, D-46). |
| FR-TRP-02 | Employee can link an expense line to one of **their own** trips; trip dates shown; warning if expense date is outside trip dates ± 1 day. |

### 5.9 Cash advances — FR-ADV [2] (D-16, → OQ-13)

| ID | Requirement |
|---|---|
| FR-ADV-01 | Request with purpose and amount; approval by line manager; disbursement marked by petty cashier with voucher no. |
| FR-ADV-02 | Open advance deducted from the next reimbursement, oldest first, never below zero. |
| FR-ADV-03 | Statuses per §4.3. |
| FR-ADV-04 | Fusion recording per OQ-13. |

### 5.10 Corporate cards — FR-CRD [3] (D-28, → OQ-35)
As brief FR-CRD-01…04: card programme, SAB file import and matching, employee itemizes, card lines credit card issuer payable and are never reimbursed.

### 5.11 Accounting preview — FR-ACC [1]

| ID | Requirement |
|---|---|
| FR-ACC-01 | Show expected journal per report: Dr expense (net of VAT) per charge account; Dr input VAT; Cr employee liability (net payable); Cr advance clearing; Cr card issuer payable. Labelled "Preview — Fusion creates the accounting". |
| FR-ACC-02 | No GL posting from ExpenseHub (D-06). |

### 5.12 Setup and admin — FR-SET [1]

| ID | Requirement |
|---|---|
| FR-SET-01 | Maintain expense types, approval rules, audit rules, system options (VAT rate, CEO threshold, audit threshold, random %, rate type, accounts per BU). |
| FR-SET-02 | Prerequisite check per employee: active assignment, supervisor, default expense account, Payables payee/bank OK (INT-07). Exceptions report for HR. |
| FR-SET-03 | Integration monitor: last run per interface, errors, payloads, retry (retry UI phase 2; log view phase 1). |
| FR-SET-04 **new** | Role assignment per user and BU (Approver steps, Accountant, Finance, Petty cashier, Admin). |
| FR-SET-05 **new** | Every setup change written to history (who, when, old → new). |

### 5.13 Dashboards and notifications

| ID | Requirement |
|---|---|
| FR-DSH-01 [1] | Employee: amount on its way, unreported count, drafts, open advance, recent reports with progress, spend by category, monthly trend (real data). |
| FR-DSH-02 [1] | Approver: inbox with amount and policy-flag tags; approve/reject per row; audit queue for Accountant. |
| FR-DSH-03 [1] | Finance: ready for payment, invoiced unpaid, paid this month, Quick Pays pending, pipeline by stage, integration errors. |
| FR-NTF-01 [1 email, 2 Teams/WhatsApp] | Notify at submit (approver), approve (next approver), reject / info request (employee), audit adjustment (employee), invoiced, paid (employee) (D-17, → OQ-25, OQ-26, OQ-27). |

### 5.14 Migration — FR-MIG **new** [1] (D-30, → OQ-09)
One-time CSV import of open claims into reports with original status; dry-run mode with error file; imported records tagged `source = MIGRATION`.

---

## 6. Business rules and calculations

| Rule | Definition |
|---|---|
| Money | All amounts in SAR, 2 decimals, rounding half-up. Original currency, amount and rate kept on each line (A-1). |
| Exchange rate | Fusion corporate rate type (configurable), latest rate with `rate_date ≤ expense_date`. |
| VAT recoverable | `round(amount_sar × vat_rate / (100 + vat_rate), 2)` with vat_rate = 15; or QR VAT if QR valid. Expense line net = amount_sar − vat. |
| Reimbursable total | Σ approved amount of lines with source = Cash. |
| Advance applied | min(open advances oldest first, reimbursable total). |
| Net payable | reimbursable total − advance applied (≥ 0). |
| Audit random sample | Deterministic per report (seeded by report id) so a re-run gives the same answer. |
| Report number | `EH-<BU>-<YYYY>-<seq>` (→ OQ-19). |
| SoD | Claimant ≠ any approver, auditor, releaser, or petty cashier of the same document. |

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Sign-in | Per OQ-22; session timeout 8 h, idle 30 min. |
| Authorisation | Role-based; data limited to own claims, own approval steps, or BUs assigned to finance users. Checked in the API on every request. |
| Segregation of duties | Enforced by DB triggers as well as the API (D-24). |
| Audit trail | Every status change, edit, adjustment and setup change in append-only history. |
| Receipts | Server disk, outside the web root, served only through the API after an authorisation check; kept forever (D-18). |
| Secrets | `.env` and `secrets/` on localhost; never in code; production store → OQ-30. |
| Performance | Screens < 2 s; ~170 users (D-20). |
| Availability | KSA business hours; if Fusion is down, sends queue and retry. |
| Browsers | Current Chrome, Edge, Safari; responsive to 360 px. |
| Language | English phase 1; Arabic RTL phase 3 — CSS uses logical properties from day 1. |
| Accessibility | WCAG 2.1 AA contrast; keyboard operable forms. |

---

## 8. Assumptions and risks
Assumptions A-1…A-5 and the risk table in the brief §13 apply unchanged. Added:

| Risk | Mitigation |
|---|---|
| Quick Pay paid twice (payroll and AP) | Confirm OQ-07 before go-live; unique key per Quick Pay |
| Unrealistic go-live date (Q-19) | Milestone plan in BUILD-PLAN; Fusion mock mode lets the build continue while Fusion access is pending |
| No Git = no history of code changes | Claude Code checkpoints + daily zip backup script (see AGENTS.md) |

## 9. Open questions for this document
OQ-01 – OQ-19, OQ-31 – OQ-33. See [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).
