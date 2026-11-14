-- ExpenseHub 004 — Quick Pay invoices, cash advances (phase 2), card transactions (phase 3).
-- NOT executed until M8 (D-33).

CREATE TABLE eh_quick_pay_invoices (
  qp_invoice_id      NUMBER GENERATED ALWAYS AS IDENTITY,
  quick_pay_id       NUMBER                    NOT NULL,
  status             VARCHAR2(20)              NOT NULL,
  invoice_number     VARCHAR2(50),             -- QP-IPP-2026-000001 (OQ-19)
  fusion_invoice_id  NUMBER(18),
  fusion_status      VARCHAR2(30),             -- validation / payment status as last seen (INT-09)
  payment_ref        VARCHAR2(50),
  paid_at            TIMESTAMP WITH TIME ZONE,
  sync_error         VARCHAR2(1000),           -- last INT-08/09 error
  excluded_reason    VARCHAR2(500),
  requested_by       NUMBER(18),
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by         NUMBER(18),
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by         NUMBER(18),
  version            NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_quick_pay_invoices_pk PRIMARY KEY (qp_invoice_id),
  CONSTRAINT eh_qp_invoices_qp_uk UNIQUE (quick_pay_id),                -- DB-09
  CONSTRAINT eh_qp_invoices_number_uk UNIQUE (invoice_number),
  CONSTRAINT eh_qp_invoices_qp_fk FOREIGN KEY (quick_pay_id) REFERENCES eh_quick_pays (quick_pay_id),
  CONSTRAINT eh_qp_invoices_status_ck CHECK (status IN ('INVOICE_REQUESTED','INVOICED','PAID','EXCLUDED','ERROR')),
  CONSTRAINT eh_qp_invoices_reason_ck CHECK (status <> 'EXCLUDED' OR excluded_reason IS NOT NULL)
);

CREATE TABLE eh_advances (
  advance_id      NUMBER GENERATED ALWAYS AS IDENTITY,
  advance_number  VARCHAR2(30),
  person_id       NUMBER(18)                NOT NULL,
  business_unit   VARCHAR2(10)              NOT NULL,
  purpose         VARCHAR2(500)             NOT NULL,
  amount_sar      NUMBER(14,2)              NOT NULL,
  applied_sar     NUMBER(14,2)  DEFAULT 0   NOT NULL,
  refunded_sar    NUMBER(14,2)  DEFAULT 0   NOT NULL,
  status          VARCHAR2(30)  DEFAULT 'PENDING_APPROVAL' NOT NULL,
  approver_id     NUMBER(18),
  approved_at     TIMESTAMP WITH TIME ZONE,
  disbursed_by    NUMBER(18),
  disbursed_at    TIMESTAMP WITH TIME ZONE,
  voucher_no      VARCHAR2(50),
  fusion_ref      VARCHAR2(50),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by      NUMBER(18),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by      NUMBER(18),
  version         NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_advances_pk PRIMARY KEY (advance_id),
  CONSTRAINT eh_advances_number_uk UNIQUE (advance_number),
  CONSTRAINT eh_advances_person_fk FOREIGN KEY (person_id) REFERENCES eh_employees (person_id),
  CONSTRAINT eh_advances_status_ck CHECK (status IN ('PENDING_APPROVAL','APPROVED','DISBURSED','PARTIALLY_APPLIED','FULLY_APPLIED','REJECTED','REFUNDED')),
  CONSTRAINT eh_advances_amount_ck CHECK (amount_sar > 0),
  CONSTRAINT eh_advances_balance_ck CHECK (applied_sar + refunded_sar <= amount_sar)   -- DB-08
);
CREATE INDEX eh_advances_person_ix ON eh_advances (person_id, status);

CREATE TABLE eh_advance_applications (
  application_id  NUMBER GENERATED ALWAYS AS IDENTITY,
  advance_id      NUMBER                    NOT NULL,
  report_id       NUMBER                    NOT NULL,
  amount_sar      NUMBER(14,2)              NOT NULL,
  applied_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT eh_advance_applications_pk PRIMARY KEY (application_id),
  CONSTRAINT eh_adv_app_advance_fk FOREIGN KEY (advance_id) REFERENCES eh_advances (advance_id),
  CONSTRAINT eh_adv_app_report_fk FOREIGN KEY (report_id) REFERENCES eh_reports (report_id),
  CONSTRAINT eh_adv_app_amount_ck CHECK (amount_sar > 0)
);
CREATE INDEX eh_adv_app_advance_ix ON eh_advance_applications (advance_id);
CREATE INDEX eh_adv_app_report_ix ON eh_advance_applications (report_id);

-- Phase 3. Never store full card numbers.
CREATE TABLE eh_card_transactions (
  txn_id        NUMBER GENERATED ALWAYS AS IDENTITY,
  card_last4    VARCHAR2(4)               NOT NULL,
  person_id     NUMBER(18),
  txn_date      DATE                      NOT NULL,
  posting_date  DATE,
  merchant      VARCHAR2(240)             NOT NULL,
  mcc           VARCHAR2(10),
  amount        NUMBER(14,2)              NOT NULL,
  currency      VARCHAR2(3)               NOT NULL,
  amount_sar    NUMBER(14,2)              NOT NULL,
  status        VARCHAR2(20)  DEFAULT 'UNMATCHED' NOT NULL,
  file_name     VARCHAR2(255)             NOT NULL,
  file_line     NUMBER                    NOT NULL,
  CONSTRAINT eh_card_transactions_pk PRIMARY KEY (txn_id),
  CONSTRAINT eh_card_txn_file_uk UNIQUE (file_name, file_line),
  CONSTRAINT eh_card_txn_status_ck CHECK (status IN ('UNMATCHED','MATCHED','ITEMIZED')),
  CONSTRAINT eh_card_txn_last4_ck CHECK (REGEXP_LIKE(card_last4, '^[0-9]{4}$'))
);
CREATE INDEX eh_card_txn_person_ix ON eh_card_transactions (person_id, status);
