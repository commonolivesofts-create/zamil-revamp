# ExpenseHub — Data Requirements Document (DRD)

Version 0.1 — 17 Oct 2026 · Database: Oracle ADW, schema `XXZP` (D-43; every object prefixed `EH_`) · Implements PRD §5–6, brief §8

---

## 1. Conventions

| Item | Rule |
|---|---|
| Names | Tables `EH_<PLURAL>`, columns `snake_case`, PK `<entity>_id` |
| Keys | `NUMBER GENERATED ALWAYS AS IDENTITY` for EH-owned tables; Fusion IDs kept as `NUMBER(18)` in mirror tables |
| Money | `NUMBER(14,2)` in SAR; original amount `NUMBER(14,2)` + `currency VARCHAR2(3)` + `fx_rate NUMBER(18,8)` |
| Flags | `CHAR(1)` `'Y'/'N'` with `CHECK (x IN ('Y','N'))` |
| Status / enums | `VARCHAR2(30)` with `CHECK` constraint listing values (values defined once in `packages/shared/status.ts`; migration must match) |
| JSON | `JSON` data type (ADW 21c+/23ai) for OCR/QR results, payloads, rule conditions |
| Audit columns (EH-owned tables) | `created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL`, `created_by NUMBER(18)`, `updated_at`, `updated_by`, `version NUMBER DEFAULT 1` (optimistic locking) |
| Mirror tables | Read-only for the app except sync jobs; add `synced_at TIMESTAMP WITH TIME ZONE` |
| Deletes | Soft (`active='N'`) for setup; hard delete only for unreported expenses |
| Indexes | Every FK column; plus those listed per table |

Owner column below: **F** = Fusion mirror (refreshed by sync), **EH** = ExpenseHub-owned.

---

## 2. Entity overview

```
EH_EMPLOYEES 1─* EH_EXPENSES *─1 EH_EXPENSE_TYPES
     │              │  └─1 EH_RECEIPTS
     │              │  └─* EH_POLICY_VIOLATIONS
     │              *─1 EH_REPORTS 1─* EH_APPROVAL_STEPS
     │                     │  1─0..1 EH_AUDIT
     │                     │  1─* EH_REPORT_HISTORY
     │                     │  1─* EH_ADVANCE_APPLICATIONS *─1 EH_ADVANCES
     ├─* EH_BUSINESS_TRIPS (ref'd by EH_EXPENSES.trip_id)
     ├─* EH_QUICK_PAYS 1─0..1 EH_QUICK_PAY_INVOICES
     └─* EH_ROLE_ASSIGNMENTS, EH_USERS, EH_DELEGATIONS
EH_COA_VALUES, EH_RATES, EH_SYSTEM_OPTIONS, EH_APPROVAL_RULES, EH_AUDIT_RULES
EH_INTEGRATION_LOG, EH_JOB_RUNS, EH_NOTIFICATIONS, EH_SETUP_HISTORY, EH_SCHEMA_MIGRATIONS
```

Changes vs brief §8: `EH_PROJECTS` → split into `EH_BUSINESS_TRIPS` + `EH_QUICK_PAYS` (D-09, D-10); `EH_POLICY_LIMITS` → the limit on `EH_EXPENSE_TYPES` (D-45; the earlier `EH_GRADE_LIMITS` mirror was dropped); `EH_RECEIPTS.object_storage_url` → `file_path` on server disk (D-18); added `EH_USERS`, `EH_ROLE_ASSIGNMENTS`, `EH_APPROVAL_RULES`, `EH_AUDIT_RULES`, `EH_DELEGATIONS`, `EH_QUICK_PAY_INVOICES`, `EH_NOTIFICATIONS`, `EH_JOB_RUNS`, `EH_SETUP_HISTORY`.

---

## 3. Master data (mirrors of Fusion)

### EH_EMPLOYEES — F (INT-01/02/03/07)
| Column | Type | Null | Notes |
|---|---|---|---|
| person_id | NUMBER(18) | PK | Fusion PERSON_ID |
| person_number | VARCHAR2(30) | N, UK | Login username (local auth) |
| full_name | VARCHAR2(240) | N | |
| full_name_ar | VARCHAR2(240) | Y | phase 3 |
| email | VARCHAR2(240) | Y | Work email |
| mobile | VARCHAR2(30) | Y | WhatsApp (OQ-27) |
| assignment_id | NUMBER(18) | Y | Primary assignment |
| business_unit | VARCHAR2(10) | N | `IPP`/`FPP`/`APP` — CHECK |
| job_name | VARCHAR2(240) | Y | |
| location_code | VARCHAR2(30) | Y | |
| cost_center | VARCHAR2(30) | Y | Default, from default account |
| supervisor_id | NUMBER(18) | Y | FK → EH_EMPLOYEES (no constraint enforced; may arrive out of order) |
| default_expense_account | VARCHAR2(60) | Y | 6-segment string |
| payee_ok | CHAR(1) | N | Supplier + site + active bank exist (INT-07) |
| supplier_number | VARCHAR2(30) | Y | Fusion supplier for this employee (OQ-12) |
| supplier_site | VARCHAR2(60) | Y | |
| active | CHAR(1) | N | Active assignment |
| synced_at | TIMESTAMP WITH TIME ZONE | N | |
Indexes: `supervisor_id`, `business_unit`, `email`.

### EH_COA_VALUES — F (INT-04)
| Column | Type | Notes |
|---|---|---|
| segment | VARCHAR2(20) | `COMPANY`,`LOCATION`,`COST_CENTER`,`ACCOUNT`,`SEGMENT5`,`SEGMENT6` (names → OQ-14) |
| value | VARCHAR2(30) | |
| description | VARCHAR2(240) | |
| enabled | CHAR(1) | |
| start_date / end_date | DATE | |
| synced_at | TIMESTAMP WITH TIME ZONE | |
PK (`segment`,`value`).

### EH_BUSINESS_TRIPS — F (INT-05a, D-46)
| Column | Type | Notes |
|---|---|---|
| trip_id | NUMBER(18) PK | Fusion absence entry id |
| person_id | NUMBER(18) | |
| absence_type | VARCHAR2(80) | |
| start_date / end_date | DATE | |
| days | NUMBER(5,1) | |
| destination | VARCHAR2(240) | Business leave request field named by `TRIP_DESTINATION_FIELD` (D-46) |
| approval_status | VARCHAR2(30) | Only `APPROVED` usable |
| synced_at | TIMESTAMP WITH TIME ZONE | |
Index: (`person_id`,`start_date`).

### EH_QUICK_PAYS — F (INT-05b, OQ-07)
| Column | Type | Notes |
|---|---|---|
| quick_pay_id | NUMBER PK identity | EH key |
| payroll_action_id | NUMBER(18) | Fusion |
| run_result_id | NUMBER(18) | Fusion |
| person_id | NUMBER(18) | |
| element_name | VARCHAR2(240) | |
| amount_sar | NUMBER(14,2) | |
| effective_date | DATE | |
| business_unit | VARCHAR2(10) | |
| synced_at | TIMESTAMP WITH TIME ZONE | |
UK (`payroll_action_id`,`run_result_id`) — FR-QP-04.

### EH_RATES — F (INT-06)
`from_ccy VARCHAR2(3)`, `to_ccy VARCHAR2(3)` (always `SAR`), `rate_type VARCHAR2(30)`, `rate_date DATE`, `rate NUMBER(18,8)`, `synced_at`. PK (`from_ccy`,`to_ccy`,`rate_type`,`rate_date`).

*(EH_GRADE_LIMITS removed by D-45.)*

---

## 4. ExpenseHub-owned tables

### EH_USERS — EH (auth, OQ-22)
`user_id` PK, `person_id` UK → EH_EMPLOYEES, `password_hash VARCHAR2(100)` (null until set), `failed_attempts NUMBER`, `locked_until TIMESTAMP WITH TIME ZONE`, `last_login_at`, `reset_token_hash VARCHAR2(100)`, `reset_expires_at`, `active CHAR(1)`, audit cols.

### EH_ROLE_ASSIGNMENTS — EH (FR-SET-04)
`assignment_id` PK, `person_id`, `role_code VARCHAR2(30)` (CHECK list in TRD §5), `business_unit VARCHAR2(10)` (null = all BUs), `is_backup CHAR(1)`, `start_date DATE`, `end_date DATE`, audit cols. UK (`person_id`,`role_code`,`business_unit`).

### EH_EXPENSE_TYPES — EH (FR-POL-01)
| Column | Type | Notes |
|---|---|---|
| type_id | PK identity | |
| type_code | VARCHAR2(30) UK | e.g. `MEALS`, `MILEAGE` |
| name / name_ar | VARCHAR2(80) | |
| category | VARCHAR2(30) | `STANDARD`/`MILEAGE` — decides the form (D-45: no per diem) |
| natural_account | VARCHAR2(30) | ACCOUNT segment |
| default_limit_sar | NUMBER(14,2) | null = no limit |
| limit_action | VARCHAR2(5) | `WARN`/`BLOCK` |
| receipt_over_sar | NUMBER(14,2) | receipt required above; 0 = always |
| justification_req | CHAR(1) | |
| attendees_req | CHAR(1) | |
| vat_eligible | CHAR(1) | |
| unit | VARCHAR2(10) | `KM`/null |
| unit_rate_sar | NUMBER(14,4) | mileage rate |
| icon | VARCHAR2(40) | lucide icon name |
| sort_order | NUMBER | |
| is_placeholder | CHAR(1) | `Y` until Finance confirms (OQ-32) |
| active | CHAR(1) | |
| audit cols | | |

### EH_SYSTEM_OPTIONS — EH (FR-SET-01)
`option_key VARCHAR2(60)`, `business_unit VARCHAR2(10)` (`*` = all), `option_value VARCHAR2(400)`, `value_type VARCHAR2(10)` (`NUMBER`/`STRING`/`BOOL`/`JSON`), `description`, audit cols. PK (`option_key`,`business_unit`).
Seed keys: `VAT_RATE=15`, `VAT_RECOVERY=N` (D-41), `FUSION_PAY_GROUP=EMPLOYEES`, `FUSION_PAYMENT_TERMS=Immediate` (D-42), `TRIP_DESTINATION_FIELD=DESTINATION` (D-46), `CEO_THRESHOLD_SAR=5000`, `RATE_TYPE=Corporate`, `INVOICE_SEND_MODE=MANUAL` (OQ-16), `ATTACH_RECEIPTS_TO_INVOICE=Y`, `ACCT_EMPLOYEE_LIABILITY`, `ACCT_INPUT_VAT`, `ACCT_ADVANCE_CLEARING`, `ACCT_CARD_PAYABLE` (per BU, OQ-14), `TAX_CLASSIFICATION_CODE` (OQ-15), `REMINDER_DAYS=2`, `ESCALATION_DAYS=3`, `TRIP_DATE_TOLERANCE_DAYS=1`, `FUSION_INVOICE_TYPE`, `FUSION_INVOICE_SOURCE`, `FUSION_PAYMENT_METHOD`.

### EH_APPROVAL_RULES — EH (FR-APR-01, OQ-01)
| Column | Type | Notes |
|---|---|---|
| rule_id | PK | |
| chain_code | VARCHAR2(20) | `STANDARD` / `CEO_CLAIMANT` (D-37: used when the claimant holds `APPROVER_CEO`) |
| seq | NUMBER | order within the chain; UK (`chain_code`,`seq`) |
| step_name | VARCHAR2(60) | "Line Manager", "CEO" … |
| approver_source | VARCHAR2(20) | `SUPERVISOR` / `ROLE` |
| role_code | VARCHAR2(30) | when ROLE |
| condition_type | VARCHAR2(20) | `ALWAYS` / `TOTAL_GT` |
| condition_amount_sar | NUMBER(14,2) | |
| is_audit_step | CHAR(1) | `Y` for Accountant if OQ-03 proposal accepted |
| active | CHAR(1) | |
Seed: `STANDARD` per OQ-01 proposal (CEO step amount null = use option `CEO_THRESHOLD_SAR`, FR-APR-02); `CEO_CLAIMANT` = Finance Manager → HR Manager → Accountant (D-37).

### EH_DOC_SEQUENCES — EH (OQ-19)
`seq_name VARCHAR2(60)` PK (e.g. `EH-IPP-2026`, `QP-IPP-2026`), `last_value NUMBER`. Gap-free document numbers: incremented inside the business transaction, so a rollback returns the number.

### EH_AUDIT_RULES — EH (FR-AUD-01, OQ-33)
`rule_code` PK (`ANY_WARNING`,`MISSING_RECEIPT`,`TOTAL_GT`,`RANDOM_PCT`,`DUPLICATE`), `param_number NUMBER(14,2)` (3000, 10), `active CHAR(1)`, audit cols.

### EH_REPORTS — EH (FR-REP-01)
| Column | Type | Notes |
|---|---|---|
| report_id | PK identity | |
| report_number | VARCHAR2(30) UK | `EH-IPP-2026-000123` (OQ-19); assigned at first submit |
| person_id | NUMBER(18) N | claimant |
| business_unit | VARCHAR2(10) N | copied from employee at create |
| purpose | VARCHAR2(500) N | |
| report_date | DATE N | |
| status | VARCHAR2(30) N | CHECK: DRAFT, PENDING_APPROVAL, PENDING_AUDIT, READY_FOR_PAYMENT, INVOICED, PAID, REJECTED, SETTLED |
| info_requested | CHAR(1) | OQ-06 |
| total_sar | NUMBER(14,2) | all lines |
| cash_sar | NUMBER(14,2) | reimbursable (approved amounts) |
| card_sar | NUMBER(14,2) | |
| vat_sar | NUMBER(14,2) | |
| advance_applied_sar | NUMBER(14,2) | |
| net_payable_sar | NUMBER(14,2) | |
| audit_selected | CHAR(1) | |
| submitted_at / approved_at / released_at | TIMESTAMP WITH TIME ZONE | |
| fusion_invoice_id | NUMBER(18) | |
| fusion_invoice_num | VARCHAR2(50) | = report_number |
| fusion_status | VARCHAR2(30) | Validation/approval/paid status as last seen |
| payment_ref | VARCHAR2(50) | |
| paid_at | TIMESTAMP WITH TIME ZONE | |
| sync_error | VARCHAR2(1000) | last INT-08/09 error |
| source | VARCHAR2(15) | `APP` / `MIGRATION` |
| audit cols + version | | |
Indexes: (`person_id`,`status`), (`status`,`business_unit`).

### EH_EXPENSES — EH (FR-CAP)
| Column | Type | Notes |
|---|---|---|
| expense_id | PK identity | |
| person_id | NUMBER(18) N | |
| report_id | NUMBER | null = unreported |
| line_no | NUMBER | within report |
| expense_date | DATE N | |
| type_id | NUMBER N | |
| merchant | VARCHAR2(240) | |
| description | VARCHAR2(500) | business purpose |
| attendees | VARCHAR2(500) | |
| justification | VARCHAR2(1000) | |
| quantity | NUMBER(10,2) | km / days |
| unit_rate_sar | NUMBER(14,4) | |
| amount | NUMBER(14,2) N | original currency |
| currency | VARCHAR2(3) N | |
| fx_rate | NUMBER(18,8) N | 1 for SAR |
| fx_rate_date | DATE | |
| amount_sar | NUMBER(14,2) N | |
| vat_sar | NUMBER(14,2) N default 0 | recoverable |
| net_sar | NUMBER(14,2) | amount_sar − vat_sar |
| approved_amount_sar | NUMBER(14,2) | after audit adjustment; default = amount_sar |
| adjustment_reason | VARCHAR2(500) | FR-AUD-04 |
| tax_invoice | CHAR(1) | |
| receipt_required | CHAR(1) | computed by policy |
| receipt_attached | CHAR(1) | |
| charge_account | VARCHAR2(60) N | 6 segments |
| cost_center | VARCHAR2(30) | override |
| trip_id | NUMBER(18) | → EH_BUSINESS_TRIPS |
| quick_pay_id | NUMBER | → EH_QUICK_PAYS (reference only) |
| source | VARCHAR2(10) | `CASH` / `CARD` |
| card_txn_id | NUMBER | phase 3 |
| receipt_hash | VARCHAR2(64) | SHA-256, for duplicate check |
| policy_level | VARCHAR2(5) | worst of violations: PASS/WARN/BLOCK |
| audit cols + version | | |
Indexes: (`person_id`,`report_id`), (`person_id`,`merchant`,`amount_sar`,`expense_date`), `receipt_hash`.

### EH_POLICY_VIOLATIONS — EH
`violation_id` PK, `expense_id`, `rule_code VARCHAR2(40)`, `level VARCHAR2(5)` (`WARN`/`BLOCK`), `message VARCHAR2(500)`, `created_at`. Replaced (delete + insert) on each server validation of the line while the report is DRAFT; frozen at submit.

### EH_RECEIPTS — EH (D-18)
`receipt_id` PK, `expense_id` (null allowed while just uploaded / email inbox), `person_id`, `file_path VARCHAR2(400)` (relative to RECEIPTS_DIR), `original_name`, `mime VARCHAR2(60)`, `size_bytes NUMBER`, `sha256 VARCHAR2(64)`, `ocr_json JSON`, `qr_json JSON`, `qr_valid CHAR(1)`, `qr_errors VARCHAR2(1000)`, `verified_by_auditor CHAR(1)`, `source VARCHAR2(10)` (`UPLOAD`/`EMAIL`/`MIGRATION`), audit cols. Index `sha256`.

### EH_APPROVAL_STEPS — EH (FR-APR)
| Column | Type | Notes |
|---|---|---|
| step_id | PK | |
| report_id | N | |
| seq | NUMBER N | |
| step_name | VARCHAR2(60) | copied from rule |
| rule_id | NUMBER | |
| is_audit_step | CHAR(1) | |
| assigned_to | NUMBER(18) N | resolved approver |
| original_assignee | NUMBER(18) | before delegation/escalation |
| status | VARCHAR2(20) | `WAITING`/`PENDING`/`APPROVED`/`REJECTED`/`SKIPPED`/`CANCELLED` |
| acted_by | NUMBER(18) | |
| acted_at | TIMESTAMP WITH TIME ZONE | |
| comment_text | VARCHAR2(1000) | reason mandatory on reject |
| pending_since | TIMESTAMP WITH TIME ZONE | for SLA |
| reminded_at / escalated_at | TIMESTAMP WITH TIME ZONE | |
| cycle_no | NUMBER | increments on each resubmission |
Index (`assigned_to`,`status`).

### EH_DELEGATIONS — EH (FR-APR-05)
`delegation_id`, `from_person_id`, `to_person_id`, `start_date`, `end_date`, `active`, audit cols. CHECK `from_person_id <> to_person_id`.

### EH_AUDIT — EH (FR-AUD)
`audit_id`, `report_id` UK, `reasons JSON` (list of matched rule codes), `auditor_id`, `outcome VARCHAR2(20)` (`RELEASED`/`REJECTED`), `notes VARCHAR2(1000)`, `acted_at`, audit cols.

### EH_ADVANCES / EH_ADVANCE_APPLICATIONS — EH (phase 2, OQ-13)
Advances: `advance_id`, `advance_number`, `person_id`, `business_unit`, `purpose`, `amount_sar`, `applied_sar`, `refunded_sar`, `status` (§4.3 PRD), `approver_id`, `approved_at`, `disbursed_by`, `disbursed_at`, `voucher_no`, `fusion_ref`, audit cols.
Applications: `application_id`, `advance_id`, `report_id`, `amount_sar`, `applied_at`. CHECK `amount_sar > 0`.

### EH_CARD_TRANSACTIONS — card file (phase 3)
`txn_id`, `card_last4 VARCHAR2(4)`, `person_id`, `txn_date`, `posting_date`, `merchant`, `mcc`, `amount`, `currency`, `amount_sar`, `status` (`UNMATCHED`/`MATCHED`/`ITEMIZED`), `file_name`, `file_line`, UK (`file_name`,`file_line`). **Never store full card numbers.**

### EH_QUICK_PAY_INVOICES — EH (FR-QP)
`qp_invoice_id`, `quick_pay_id` UK, `status` (`INVOICE_REQUESTED`/`INVOICED`/`PAID`/`EXCLUDED`/`ERROR`), `invoice_number`, `fusion_invoice_id`, `fusion_status`, `payment_ref`, `paid_at`, `sync_error` (last INT-08/09 error), `excluded_reason`, `requested_by`, audit cols.

### EH_REPORT_HISTORY — EH, append-only
`history_id`, `entity_type VARCHAR2(20)` (`REPORT`/`EXPENSE`/`ADVANCE`/`QUICK_PAY`), `entity_id`, `at TIMESTAMP WITH TIME ZONE`, `actor_id` (null = system), `action VARCHAR2(40)`, `from_status`, `to_status`, `detail JSON`. Index (`entity_type`,`entity_id`,`at`).

### EH_SETUP_HISTORY — EH, append-only (FR-SET-05)
`id`, `table_name`, `row_key`, `at`, `actor_id`, `old_json JSON`, `new_json JSON`.

### EH_INTEGRATION_LOG — EH
`log_id`, `interface VARCHAR2(10)` (`INT-01`…`INT-09`), `direction`, `ref_type`, `ref_id`, `http_method`, `url`, `request JSON`, `response CLOB`, `http_status`, `status` (`OK`/`ERROR`/`RETRYING`), `retries`, `duration_ms`, `at`. Index (`interface`,`at`), (`ref_type`,`ref_id`).

### EH_JOB_RUNS — EH
`run_id`, `job_name`, `started_at`, `ended_at`, `status` (`RUNNING`/`OK`/`ERROR`/`SKIPPED`), `rows_read`, `rows_changed`, `error_text`.

### EH_NOTIFICATIONS — EH (outbox)
`notification_id`, `channel` (`EMAIL`/`TEAMS`/`WHATSAPP`), `recipient_id`, `template_code`, `payload JSON`, `status` (`QUEUED`/`SENT`/`FAILED`), `attempts`, `sent_at`, `error_text`, `created_at`.

---

## 5. Integrity rules enforced in the database (D-24)

| # | Rule | Mechanism |
|---|---|---|
| DB-01 | Approver of a step ≠ claimant of the report | `BEFORE UPDATE OF status ON EH_APPROVAL_STEPS` trigger: when new status in (APPROVED, REJECTED), `acted_by <> EH_REPORTS.person_id` else `RAISE_APPLICATION_ERROR(-20001, 'SOD: self-approval')` |
| DB-02 | Auditor ≠ claimant | Trigger on `EH_AUDIT` insert/update |
| DB-03 | Audit line adjustment by claimant blocked | Trigger on `EH_EXPENSES` update of `approved_amount_sar`: `:new.updated_by <> person_id` |
| DB-04 | Petty cashier / advance approver ≠ advance owner | Trigger on `EH_ADVANCES` |
| DB-05 | History is append-only | `BEFORE UPDATE OR DELETE` trigger on `EH_REPORT_HISTORY`, `EH_SETUP_HISTORY` raises error |
| DB-06 | Lines of a non-DRAFT report cannot change amount/type/date | Trigger on `EH_EXPENSES` checks parent report status (except audit adjustment columns during PENDING_AUDIT) |
| DB-07 | One invoice per report | UK on `fusion_invoice_num` |
| DB-08 | Advance applied ≤ advance amount | CHECK `applied_sar + refunded_sar <= amount_sar` |
| DB-09 | Quick Pay invoiced once | UK on `EH_QUICK_PAY_INVOICES.quick_pay_id` |

The API sets the acting user on the session with `DBMS_SESSION.SET_IDENTIFIER(person_id)` (or passes `updated_by`) so triggers know who acts. Error codes `-20001…-20099` map to `AppError('SOD_VIOLATION', 403)` etc. in the API.

---

## 6. Seed data (dev)

- Placeholder expense types from the prototype, `is_placeholder='Y'` (OQ-32).
- System options §4 with proposed values.
- Approval rules per OQ-01 proposal; audit rules per OQ-33.
- 16 mock employees / demo users (D-35) across IPP/FPP/APP incl. a CEO, HR manager, finance manager, accountant, petty cashier, admin, and two employees whose supervisor chain lets every rule fire; plus one employee with `payee_ok='N'` to test FR-SET-02.
- Mock COA values, rates (USD, EUR, AED, BHD, INR), two trips, three Quick Pays.

## 7. Migration (FR-MIG, OQ-09)
Staging table `EH_MIG_CLAIMS` (raw CSV columns as VARCHAR2) → validation procedure writes `EH_MIG_ERRORS` → load into reports/expenses with `source='MIGRATION'` and history action `MIGRATED`. Format defined once OQ-09 is answered.

## 8. Data retention and backup
Receipts and claim data kept forever (D-18). ADW automatic backups cover the DB; `storage/receipts` must be in the server backup (OQ-30). No PII beyond work email, mobile, name, job; **no bank account or IBAN stored** (INT-07 gives a flag only).

## 9. Open questions for this document
OQ-07, OQ-08, OQ-09, OQ-10, OQ-13, OQ-14, OQ-19, OQ-20, OQ-32. See [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).
