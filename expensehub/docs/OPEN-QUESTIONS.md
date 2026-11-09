# ExpenseHub — Open Questions

Every point where the brief is unclear, contradicts itself, or leaves a gap. **Type your answer in the "Answer" line under each question.** When answered, move it to [DECISIONS.md](DECISIONS.md).

Each question has a **proposal** — what the build will assume if you say "OK". Agents must not build past a 🔴 question without an answer; for 🟡 they may build behind a config switch using the proposal; ⚪ is later-phase.

- 🔴 **Blocks phase 1** — needed before the affected module is built
- 🟡 **Proposal used until answered** — built configurable, easy to change
- ⚪ **Later phase** — not needed for phase 1

> **Status 23 Oct 2026.** Closed: OQ-01/02/03/33 (D-38/39), OQ-04/05/36 (D-49), OQ-07 (D-48), OQ-08/11 (D-45), OQ-10 (D-46), OQ-12 (D-40/42/47), OQ-15 (D-41), OQ-16/17/18/19/22/25/26/27/30/34 (D-51 — proposals adopted), OQ-20 (D-43), OQ-32 accounts (D-50; limits open). **Still open:** OQ-09 (migration source — later), OQ-13 (petty-cash advances — later), OQ-14 (segment 6 name; employee liability and advance clearing accounts), OQ-21 (integration user to reset), OQ-23/24/28/29/35 (proposals in use), OQ-31 (go-live date).

---

## A. Approval, audit and roles

### OQ-01 🔴 Which approval chain is correct?
The brief gives three different chains:
1. §2 In scope: *Line Manager → CEO → HR Manager → Finance Manager → Accountant*
2. FR-APR-01/02: *Line Manager → HR Manager → HCM Supervisor*, CEO added above SAR 5,000
3. §5 Status table: *Line Manager → Department Head above SAR 5,000 → Project Manager if project charged*

**Proposal:** one configurable rule table, seeded as:
`1 Line Manager (always) → 2 CEO (only if report total > SAR 5,000) → 3 HR Manager (always) → 4 Finance Manager (always) → 5 Accountant (always)`.
"Line Manager" = the HCM supervisor of the claimant. No separate "Department Head" step.

Answer: proposal adopted — D-38 (18 Oct 2026). Built in M5.

### OQ-02 🔴 Who holds the HR Manager, Finance Manager, Accountant and CEO steps?
Are they one person each for all three BUs, or one per BU (IPP/FPP/APP)? Do they come from HCM (e.g. a job or position) or are they assigned in ExpenseHub?
**Proposal:** assigned in ExpenseHub Admin per business unit (role assignment with a backup person), not derived from HCM.

Answer: proposal adopted — D-38 (18 Oct 2026). Built in M5.

### OQ-03 🔴 Is "Accountant" approval the same as the Finance audit?
Q-20 says audit is done by the Finance team after approval, but Finance Manager and Accountant are already approval steps. Running a separate audit stage after them means Finance touches each claim three times.
**Proposal:** the **Accountant step is the audit**. Audit rules (FR-AUD-01) decide whether the Accountant must do a *full audit* (verify receipts, adjust lines) or a *quick release*. Status `Pending Audit` is shown while the Accountant step is open on a selected report.
Alternative: keep a separate audit queue after the Accountant step.

Answer: proposal adopted — D-39 (18 Oct 2026). Built in M6.

### OQ-04 🟡 Does a line charged to a Business Trip or Quick Pay add an extra approver?
FR-APR-03 adds a *project manager* when a project is charged. Fusion Projects is not used (D-09).
**Proposal:** no extra approver; FR-APR-03 is dropped for phase 1. The trip reference is shown to approvers.

Answer:

### OQ-05 🟡 Delegation and escalation details
Q-6 said "as per your understanding" and S-8 was accepted.
**Proposal:** approver sets a delegate with a from/to date; reminder email on day 2; on day 3 the step is escalated to the **approver's own HCM supervisor** (or the BU backup person for HR/Finance/CEO steps); days are calendar days; KSA weekend (Fri/Sat) not excluded.

Answer:

### OQ-06 🟡 "Request more information" behaviour
**Proposal:** report stays `Pending Approval` with a flag *Info requested*; employee can edit purpose/justification and add receipts, but not amounts; on reply it returns to the same approver. Changing an amount requires withdraw → Draft → resubmit (chain restarts).

Answer: proposal in use since M5 (D-33 rule 7); not yet confirmed.

### OQ-36 🟡 One person holding several steps of the same claim
Example: the Finance Manager claims > SAR 5,000 — the CEO is their line manager, the CEO step, and (D-34) their Finance Manager step, so the CEO approves three times.
**Current behaviour (default until answered, D-39):** the person approves each step separately; every approval is in the history.
Alternative: a repeat approval by the same person is approved automatically and logged ("approved earlier as Line Manager").

Answer:

---

## B. Quick Pays, Business Trips, per diem

### OQ-07 🔴 Quick Pay flow — what exactly happens?
D-10 says Quick Pays appear in ExpenseHub and Finance converts them into an invoice.
1. Which Quick Pays qualify — which **element names / element classification** (e.g. "Business Trip Allowance")?
2. Is the Quick Pay **only calculated in payroll and paid through AP**? Please confirm payroll will **not also pay it** (prepayments / payslip), otherwise the employee is paid twice.
3. Does a Quick Pay need ExpenseHub approval, or does Finance invoice it directly?
4. Does the employee see it in ExpenseHub?

**Proposal:** Finance-only "Quick Pay queue" → Finance clicks **Create invoice** → one Payables invoice per Quick Pay → status from Fusion. No approval chain (it was already approved in Payroll). Employee sees it read-only on their status page.

Answer (23 Oct 2026 — **closed by D-48**): any QuickPay comes with its total amount; that total is the invoice amount.

### OQ-08 🔴 Where in HCM are the grade / location limits defined?
Q-5 says "Yes and defined in HCM". Which object holds them: **Grade Rates**, a **User-Defined Table (UDT)**, a **value set**, or a **flexfield on Grade**? Please give the object name and one example row (grade, location class, expense type, limit).
**Proposal:** a BIP report extracts them nightly into `EH_GRADE_LIMITS`. If an expense type has no HCM limit, the default limit on the expense type applies.

Answer (22 Oct 2026 — **closed by D-45**): no grade limits are needed; allowances are calculated in Quick Pay. Each expense type's own limit applies.

### OQ-09 🔴 Migration source (Q-2 = Yes, but Fusion Expenses is not licensed)
Which claims must be migrated, and **from where**: paper/Excel register, Oracle EBS iExpenses, the current "Oracle expense claim form" (which one?), or another system? Only **open** claims, or history too (how many years)? Please attach one sample export.
**Proposal:** migrate open claims only, via a one-time CSV import, loaded as reports with status at the point reached; history is attached as read-only.

Answer:

### OQ-10 🟡 Business Trips from Absences
1. Which **absence type(s)** are business trips?
2. Is the destination (city/country) on the absence (e.g. in a DFF)? It is needed for the location class (domestic / GCC / international).
3. Only approved trips?

**Proposal:** read **approved** absences of configured types; destination from a DFF you name; ExpenseHub has **no travel-request screen** — trips are requested and approved in Fusion Absences.

Answer (22 Oct 2026 — **closed by D-46**): the destination is on the business leave request. The report brings every field of the request; ExpenseHub picks the destination field (option `TRIP_DESTINATION_FIELD`). No location class is needed (D-45). Still to do: name the field once the report runs (`--show-fields`).

### OQ-11 🟡 Per diem calculation
**Proposal:** per diem lines are linked to a Business Trip; days = trip days (inclusive); rate = grade + location-class rate from `EH_GRADE_LIMITS`; amount calculated, not typed (FR-CAP-05).
Is per diem actually claimed through ExpenseHub, or already paid as a Quick Pay? (If Quick Pay, per diem is removed from expense capture.)

Answer (22 Oct 2026 — **closed by D-45**): the calculation is already done in Quick Pay, so per diem is removed from expense capture.

---

## C. Fusion Payables, accounting, VAT

### OQ-12 🔴 How are employees set up as payees in Fusion Payables?
Payables invoice REST needs a **Supplier** and **Supplier Site**.
1. Are employees already suppliers of type *Employee*? Is the supplier number = person number?
2. One supplier site per BU (IPP/FPP/APP)? Site name?
3. Invoice type (*Standard*?), pay group, payment terms, payment method (*EFT*?).
4. Invoice source name to use (e.g. a custom "EXPENSEHUB" source)?

Answer (19 Oct 2026 — **closed by D-40 and D-42**): employees are **not yet suppliers; Finance will create them** (one supplier per employee). Supplier number = **person number**. Sites **IPP-EMP / FPP-EMP / APP-EMP**. Invoice type **Standard**, source **EXPENSEHUB**, payment terms **Immediate**, payment method **Electronic (EFT)**, pay group **EMPLOYEES**.

### OQ-13 🔴 Cash advances through petty cash — how are they recorded and netted?
1. When petty cash pays an advance, is anything recorded in Fusion (AP invoice/prepayment to the employee, a GL journal by the cashier, or nothing)?
2. Who disburses — a *petty cashier* role in ExpenseHub that marks the advance as paid?
3. When netted against a claim, should the AP invoice carry a **negative line to an advance clearing account**? Which account?
4. If the open advance is **larger** than the claim, the invoice would be zero. Should the report be closed as *Settled* without an invoice, and the remainder stay open?
5. How does an employee **return** unused cash?

**Proposal:** petty cashier marks *Disbursed* in ExpenseHub (cash voucher number); netting is a negative invoice line to the advance clearing account; net zero → status *Settled*, no invoice; refund recorded by petty cashier.

Answer:

### OQ-14 🔴 Chart of accounts details
1. Names of segments 5 (`000`) and 6 (`000000`) — Intercompany / Future? Always default?
2. Is the **Company** segment value the BU code (`IPP`, `FPP`, `APP`)?
3. Does **Location** come from the employee's default expense account, or can the employee change it?
4. Account codes for: **employee liability**, **input VAT**, **advance clearing**, **card issuer payable** — per BU or common?
5. Fusion **value set names** for each segment (for INT-04).

Answer:

### OQ-15 🔴 How should input VAT go to Fusion?
1. Use **Fusion Tax** (tax classification code on the invoice line, Fusion calculates VAT), or send a **separate line to the input VAT account**?
2. Tax regime / rate / classification code names?

**Proposal:** Fusion Tax with a tax classification code (e.g. `VAT 15% STANDARD`) on VAT-recoverable lines; amount lines sent net of VAT. Needs your confirmed code names.

Answer (19 Oct 2026 — **closed by D-41**): there must be **no VAT on these invoices**. Lines go gross with no tax code; `VAT_RECOVERY = N`.

### OQ-16 🟡 When is the invoice created?
D-05: "Invoice must be created in Fusion and reflected here." Two ways:
A. ExpenseHub **pushes automatically** every hour once a report is *Ready for Payment*.
B. Finance reviews a **Ready for Payment** list and clicks **Send to Payables** (one or many).

**Proposal:** B for phase 1 (Finance controls what reaches Fusion), with A available as a system option later.

Answer:

### OQ-17 🟡 Attach receipts to the Fusion invoice?
Payables invoice REST supports attachments.
**Proposal:** yes — attach all receipt files of the report as invoice attachments so AP sees them in Fusion.

Answer:

### OQ-18 🟡 Invoice cancelled or rejected in Fusion
**Proposal:** if INT-09 shows the invoice was cancelled, the report returns to *Ready for Payment* with a red flag *Cancelled in Fusion* for Finance to resolve; it is never auto-resent.

Answer:

### OQ-19 🟡 Invoice number format
**Proposal:** `EH-<BU>-<YYYY>-<6-digit seq>` e.g. `EH-IPP-2026-000123`; also used as the idempotency key. Quick Pay invoices: `QP-<BU>-<YYYY>-<seq>`.

Answer:

---

## D. Technical environment

### OQ-20 🔴 Database for local development
A. Connect from your PC to an **ADW dev schema** in Jeddah (needs the ADW wallet and network access to OCI).
B. Install **Oracle Database 23ai Free** locally.
**Proposal:** A — same database family as production; reuse the parent workspace's test wallet at `../secrets/oracle/Wallet_zpadwtest/`.
Is there a dev/test ADW instance available, and can a schema `EXPENSEHUB` be created?

Answer (19 Oct 2026 — **closed**): A. ADW test instance `zpadwtest` (Jeddah), shared parent wallet at `../secrets/oracle/Wallet_zpadwtest/`. Schema: keep the existing **`XXZP`** (D-43).

### OQ-21 🔴 Fusion test environment
1. Fusion **test pod URL** and **release** (e.g. 26C)?
2. Can the Fusion admin create an **integration user** with Payables invoice create/query, HCM extract/BIP run, and currency rate query privileges?
3. Basic auth or OAuth (client credentials)?

Until this is available, the API runs with `FUSION_MODE=mock` (see TRD §8).

Answer: *(partial, 18 Oct 2026)* 1. Test pod: `https://iaeskf-test.fa.ocs.oraclecloud.com` (welcome page `/fscmUI/faces/FuseWelcome`). Still open: release, integration user (2), auth method (3).
*(19 Oct 2026)* 2. Integration user `ERP_INTEGRATION_USER` provided; a read-only REST call (currencyRates) returned HTTP 200. 3. Basic auth works. Still open: release; BIP run privilege is tested once the reports exist (D-44).

### OQ-22 🟡 Sign-in method (no IDCS SSO)
The brief NFR says "no local passwords", but Q-11 says IDCS SSO is not available.
A. **Microsoft Entra ID (Azure AD) SSO** — you use Teams, so ZPI likely has M365; needs an app registration by your M365 admin.
B. **Local accounts**: username = person number, password (bcrypt), reset link by email.

**Proposal:** build B now for localhost (behind an auth-provider interface), switch to A before production if your M365 admin can register the app.

Answer:

### OQ-23 🟡 OCR default engine (Q-4 = "ALL")
**Proposal:** phase 1 = **ZATCA QR decoding** (exact, free) + **Tesseract.js** (runs locally, free, no data leaves the server). Add a cloud engine (OCI Document Understanding / Azure Document Intelligence) later only if accuracy is poor. Any engine that sends receipts outside KSA allowed?

Answer:

### OQ-24 🟡 ZATCA QR validation depth
**Proposal:** phase 1 decodes the TLV QR and validates: seller VAT number format (15 digits, starts and ends with 3), total and VAT present, VAT ≈ total × 15/115 (±0.05 SAR), date not in the future. Phase 2 adds cryptographic signature check (tags 6–9) for e-invoicing phase-2 QR codes. OK?

Answer:

### OQ-25 🟡 Email (SMTP) for notifications
SMTP host/port and sender address (e.g. `expensehub@zamilplastic.com` via Office 365 SMTP)? On localhost, emails go to a local catcher until this is set.

Answer: (open) — the SMTP adapter is built (M9); it needs only `NOTIFY_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` (and relay permission for the sender) before M10.

### OQ-26 🟡 Microsoft Teams notifications
A. Post to a **channel** via a Teams *Workflows* webhook (easy, no admin app registration).
B. **Personal message** to each approver (needs Entra app registration + Graph / bot).
**Proposal:** A in phase 1 for Finance channel; B with SSO (OQ-22 A).

Answer: (open) — proposal A is built (M9): sync failures and reports ready for payment are posted to the channel once `TEAMS_WEBHOOK_URL` is set.

### OQ-27 ⚪ WhatsApp notifications
Needs a **WhatsApp Business** account with Meta Cloud API or a local provider (e.g. Unifonic), approved message templates, and employee mobile numbers from HCM.
**Proposal:** phase 2. Which provider, and does ZPI already have a WhatsApp Business number?

Answer:

### OQ-28 🟡 Language: TypeScript or JavaScript?
**Proposal:** **TypeScript** for both React and Node — it catches money/status mistakes at compile time and helps Claude Code keep the code consistent.

Answer:

### OQ-29 🟡 Your development PC
**Assumed:** Windows 10/11, VS Code, Node.js 24 LTS, Claude Code extension. Scripts are written to work on Windows (no bash-only commands). Correct?

Answer:

### OQ-30 ⚪ Production hosting
Where will the app run after localhost (on-prem Windows server, OCI VM in Jeddah, other)? This decides the receipt disk path, backups of receipts kept forever (D-18), HTTPS and how approvers reach email "Approve" links (FR-APR-06 works only when the server is reachable from the approver's device).

Answer:

---

## E. Plan, data and branding

### OQ-31 🔴 Phase 1 go-live date (Q-19 = "tomorrow")
Phase 1 needs, outside the code: the Fusion integration user (OQ-21), employee suppliers (OQ-12), Finance-approved expense types and accounts (OQ-32), and a test payment in the Fusion test pod. Please give a realistic target date; [BUILD-PLAN.md](BUILD-PLAN.md) lists the milestones.

Answer:

### OQ-32 🔴 Expense types, limits and accounts from Finance
The prototype values are placeholders (A-4). Please supply the list: expense type, natural account, default limit, warn/block, receipt-required above SAR x, justification required, VAT-eligible, unit rate (mileage).
**Proposal:** until supplied, seed the prototype's placeholder types, clearly marked `PLACEHOLDER`.

Answer (23 Oct 2026 — D-50): expense accounts 55101–55114, 55116 and 55201–55207 (one expense type each, named from the Fusion account description); **limits open for now**.

### OQ-33 🟡 Audit selection defaults
**Proposal:** as brief FR-AUD-01 — any policy warning, any missing required receipt, total > SAR 3,000, random 10 %. All configurable. OK?

Answer: proposal adopted — D-39 (18 Oct 2026). Built in M6; the DUPLICATE rule exists but is off by default.

### OQ-34 ⚪ ZPI brand colours and logo (Q-15)
Please attach the logo (SVG preferred) and colour codes. Until then the prototype green `#0E9F6E` is used as a design token, so it changes in one place.

Answer:

### OQ-35 ⚪ SAB corporate card file (phase 3)
Please get a sample transaction file and its layout spec from SAB.

Answer:
