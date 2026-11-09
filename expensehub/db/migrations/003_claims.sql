-- ExpenseHub 003 — reports, expenses, receipts, approvals, audit (DRD §4, FR-CAP/REP/APR/AUD).
-- NOT executed until M8 (D-33).

CREATE TABLE eh_reports (
  report_id            NUMBER GENERATED ALWAYS AS IDENTITY,
  report_number        VARCHAR2(30),             -- EH-IPP-2026-000123, assigned at first submit (OQ-19)
  person_id            NUMBER(18)                NOT NULL,
  business_unit        VARCHAR2(10)              NOT NULL,
  purpose              VARCHAR2(500)             NOT NULL,
  report_date          DATE                      NOT NULL,
  status               VARCHAR2(30)  DEFAULT 'DRAFT' NOT NULL,
  info_requested       CHAR(1)       DEFAULT 'N' NOT NULL,     -- OQ-06
  total_sar            NUMBER(14,2)  DEFAULT 0   NOT NULL,
  cash_sar             NUMBER(14,2)  DEFAULT 0   NOT NULL,
  card_sar             NUMBER(14,2)  DEFAULT 0   NOT NULL,
  vat_sar              NUMBER(14,2)  DEFAULT 0   NOT NULL,
  advance_applied_sar  NUMBER(14,2)  DEFAULT 0   NOT NULL,
  net_payable_sar      NUMBER(14,2)  DEFAULT 0   NOT NULL,
  audit_selected       CHAR(1)       DEFAULT 'N' NOT NULL,
  submitted_at         TIMESTAMP WITH TIME ZONE,
  approved_at          TIMESTAMP WITH TIME ZONE,
  released_at          TIMESTAMP WITH TIME ZONE,
  fusion_invoice_id    NUMBER(18),
  fusion_invoice_num   VARCHAR2(50),
  fusion_status        VARCHAR2(30),
  payment_ref          VARCHAR2(50),
  paid_at              TIMESTAMP WITH TIME ZONE,
  sync_error           VARCHAR2(1000),
  source               VARCHAR2(15)  DEFAULT 'APP' NOT NULL,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by           NUMBER(18),
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by           NUMBER(18),
  version              NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_reports_pk PRIMARY KEY (report_id),
  CONSTRAINT eh_reports_number_uk UNIQUE (report_number),
  CONSTRAINT eh_reports_invoice_num_uk UNIQUE (fusion_invoice_num),               -- DB-07
  CONSTRAINT eh_reports_person_fk FOREIGN KEY (person_id) REFERENCES eh_employees (person_id),
  CONSTRAINT eh_reports_status_ck CHECK (status IN ('DRAFT','PENDING_APPROVAL','PENDING_AUDIT','READY_FOR_PAYMENT','INVOICED','PAID','REJECTED','SETTLED')),
  CONSTRAINT eh_reports_bu_ck CHECK (business_unit IN ('IPP','FPP','APP')),
  CONSTRAINT eh_reports_source_ck CHECK (source IN ('APP','MIGRATION')),
  CONSTRAINT eh_reports_flags_ck CHECK (info_requested IN ('Y','N') AND audit_selected IN ('Y','N')),
  CONSTRAINT eh_reports_net_ck CHECK (net_payable_sar >= 0)
);
CREATE INDEX eh_reports_person_status_ix ON eh_reports (person_id, status);
CREATE INDEX eh_reports_status_bu_ix ON eh_reports (status, business_unit);

CREATE TABLE eh_expenses (
  expense_id           NUMBER GENERATED ALWAYS AS IDENTITY,
  person_id            NUMBER(18)                NOT NULL,
  report_id            NUMBER,                   -- NULL = unreported
  line_no              NUMBER,
  expense_date         DATE                      NOT NULL,
  type_id              NUMBER                    NOT NULL,
  merchant             VARCHAR2(240),
  description          VARCHAR2(500),
  attendees            VARCHAR2(500),
  justification        VARCHAR2(1000),
  quantity             NUMBER(10,2),
  unit_rate_sar        NUMBER(14,4),
  amount               NUMBER(14,2)              NOT NULL,
  currency             VARCHAR2(3)               NOT NULL,
  fx_rate              NUMBER(18,8)  DEFAULT 1   NOT NULL,
  fx_rate_date         DATE,
  amount_sar           NUMBER(14,2)              NOT NULL,
  vat_sar              NUMBER(14,2)  DEFAULT 0   NOT NULL,
  net_sar              NUMBER(14,2)              NOT NULL,
  approved_amount_sar  NUMBER(14,2)              NOT NULL,
  adjustment_reason    VARCHAR2(500),
  tax_invoice          CHAR(1)       DEFAULT 'N' NOT NULL,
  receipt_required     CHAR(1)       DEFAULT 'N' NOT NULL,
  receipt_attached     CHAR(1)       DEFAULT 'N' NOT NULL,
  charge_account       VARCHAR2(60)              NOT NULL,
  cost_center          VARCHAR2(30),
  trip_id              NUMBER(18),               -- no FK: trips can disappear from the extract
  quick_pay_id         NUMBER,                   -- reference only
  source               VARCHAR2(10)  DEFAULT 'CASH' NOT NULL,
  card_txn_id          NUMBER,
  receipt_hash         VARCHAR2(64),
  policy_level         VARCHAR2(5)   DEFAULT 'PASS' NOT NULL,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by           NUMBER(18),
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by           NUMBER(18),
  version              NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_expenses_pk PRIMARY KEY (expense_id),
  CONSTRAINT eh_expenses_person_fk FOREIGN KEY (person_id) REFERENCES eh_employees (person_id),
  CONSTRAINT eh_expenses_report_fk FOREIGN KEY (report_id) REFERENCES eh_reports (report_id),
  CONSTRAINT eh_expenses_type_fk FOREIGN KEY (type_id) REFERENCES eh_expense_types (type_id),
  CONSTRAINT eh_expenses_source_ck CHECK (source IN ('CASH','CARD')),
  CONSTRAINT eh_expenses_policy_ck CHECK (policy_level IN ('PASS','WARN','BLOCK')),
  CONSTRAINT eh_expenses_approved_ck CHECK (approved_amount_sar BETWEEN 0 AND amount_sar),
  CONSTRAINT eh_expenses_flags_ck CHECK (
    tax_invoice IN ('Y','N') AND receipt_required IN ('Y','N') AND receipt_attached IN ('Y','N'))
);
CREATE INDEX eh_expenses_person_report_ix ON eh_expenses (person_id, report_id);
CREATE INDEX eh_expenses_report_ix ON eh_expenses (report_id);
CREATE INDEX eh_expenses_type_ix ON eh_expenses (type_id);
CREATE INDEX eh_expenses_dup_ix ON eh_expenses (person_id, merchant, amount_sar, expense_date);  -- D-23
CREATE INDEX eh_expenses_hash_ix ON eh_expenses (receipt_hash);

CREATE TABLE eh_policy_violations (
  violation_id  NUMBER GENERATED ALWAYS AS IDENTITY,
  expense_id    NUMBER                    NOT NULL,
  rule_code     VARCHAR2(40)              NOT NULL,
  level         VARCHAR2(5)               NOT NULL,
  message       VARCHAR2(500)             NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT eh_policy_violations_pk PRIMARY KEY (violation_id),
  CONSTRAINT eh_violations_expense_fk FOREIGN KEY (expense_id) REFERENCES eh_expenses (expense_id) ON DELETE CASCADE,
  CONSTRAINT eh_violations_level_ck CHECK (level IN ('WARN','BLOCK'))
);
CREATE INDEX eh_violations_expense_ix ON eh_policy_violations (expense_id);

CREATE TABLE eh_receipts (
  receipt_id           NUMBER GENERATED ALWAYS AS IDENTITY,
  expense_id           NUMBER,                   -- NULL while just uploaded / email inbox
  person_id            NUMBER(18)                NOT NULL,
  file_path            VARCHAR2(400)             NOT NULL,   -- relative to RECEIPTS_DIR (D-18)
  original_name        VARCHAR2(255)             NOT NULL,
  mime                 VARCHAR2(60)              NOT NULL,
  size_bytes           NUMBER                    NOT NULL,
  sha256               VARCHAR2(64)              NOT NULL,
  ocr_json             JSON,
  qr_json              JSON,
  qr_valid             CHAR(1),
  qr_errors            VARCHAR2(1000),
  verified_by_auditor  CHAR(1)       DEFAULT 'N' NOT NULL,
  source               VARCHAR2(10)  DEFAULT 'UPLOAD' NOT NULL,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by           NUMBER(18),
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by           NUMBER(18),
  version              NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_receipts_pk PRIMARY KEY (receipt_id),
  CONSTRAINT eh_receipts_expense_fk FOREIGN KEY (expense_id) REFERENCES eh_expenses (expense_id) ON DELETE SET NULL,
  CONSTRAINT eh_receipts_source_ck CHECK (source IN ('UPLOAD','EMAIL','MIGRATION')),
  CONSTRAINT eh_receipts_flags_ck CHECK (qr_valid IN ('Y','N') AND verified_by_auditor IN ('Y','N'))
);
CREATE INDEX eh_receipts_expense_ix ON eh_receipts (expense_id);
CREATE INDEX eh_receipts_sha256_ix ON eh_receipts (sha256);

CREATE TABLE eh_approval_steps (
  step_id            NUMBER GENERATED ALWAYS AS IDENTITY,
  report_id          NUMBER                    NOT NULL,
  seq                NUMBER                    NOT NULL,
  step_name          VARCHAR2(60)              NOT NULL,
  rule_id            NUMBER,
  is_audit_step      CHAR(1)       DEFAULT 'N' NOT NULL,
  assigned_to        NUMBER(18)                NOT NULL,
  original_assignee  NUMBER(18),
  status             VARCHAR2(20)  DEFAULT 'WAITING' NOT NULL,
  acted_by           NUMBER(18),
  acted_at           TIMESTAMP WITH TIME ZONE,
  comment_text       VARCHAR2(1000),
  pending_since      TIMESTAMP WITH TIME ZONE,
  reminded_at        TIMESTAMP WITH TIME ZONE,
  escalated_at       TIMESTAMP WITH TIME ZONE,
  cycle_no           NUMBER        DEFAULT 1   NOT NULL,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by         NUMBER(18),
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by         NUMBER(18),
  version            NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_approval_steps_pk PRIMARY KEY (step_id),
  CONSTRAINT eh_approval_steps_seq_uk UNIQUE (report_id, cycle_no, seq),
  CONSTRAINT eh_approval_steps_report_fk FOREIGN KEY (report_id) REFERENCES eh_reports (report_id),
  CONSTRAINT eh_approval_steps_status_ck CHECK (status IN ('WAITING','PENDING','APPROVED','REJECTED','SKIPPED','CANCELLED')),
  CONSTRAINT eh_approval_steps_audit_ck CHECK (is_audit_step IN ('Y','N')),
  CONSTRAINT eh_approval_steps_reason_ck CHECK (status <> 'REJECTED' OR comment_text IS NOT NULL)  -- FR-APR-04
);
CREATE INDEX eh_approval_steps_assignee_ix ON eh_approval_steps (assigned_to, status);

CREATE TABLE eh_audit (
  audit_id     NUMBER GENERATED ALWAYS AS IDENTITY,
  report_id    NUMBER                    NOT NULL,
  reasons      JSON,                     -- matched audit rule codes
  auditor_id   NUMBER(18),
  outcome      VARCHAR2(20),
  notes        VARCHAR2(1000),
  acted_at     TIMESTAMP WITH TIME ZONE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by   NUMBER(18),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by   NUMBER(18),
  version      NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_audit_pk PRIMARY KEY (audit_id),
  CONSTRAINT eh_audit_report_uk UNIQUE (report_id),
  CONSTRAINT eh_audit_report_fk FOREIGN KEY (report_id) REFERENCES eh_reports (report_id),
  CONSTRAINT eh_audit_outcome_ck CHECK (outcome IN ('RELEASED','REJECTED'))
);
