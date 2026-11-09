-- ExpenseHub 001 — Fusion mirror tables (DRD §3). Refreshed only by the sync jobs (D-07).
-- Design deliverable: written now, NOT executed until M8 (D-33). Oracle ADW 23ai.
-- CHECK lists must match packages/shared (checked by apps/api/src/data/ddl.test.ts).
-- Statements end with ";" ; PL/SQL blocks end with "/" on its own line (runner splits on both).

CREATE TABLE eh_employees (
  person_id               NUMBER(18)                NOT NULL,
  person_number           VARCHAR2(30)              NOT NULL,
  full_name               VARCHAR2(240)             NOT NULL,
  full_name_ar            VARCHAR2(240),
  email                   VARCHAR2(240),
  mobile                  VARCHAR2(30),
  assignment_id           NUMBER(18),
  business_unit           VARCHAR2(10)              NOT NULL,
  job_name                VARCHAR2(240),
  location_code           VARCHAR2(30),
  cost_center             VARCHAR2(30),
  supervisor_id           NUMBER(18),               -- no FK: may arrive out of order
  default_expense_account VARCHAR2(60),
  payee_ok                CHAR(1)      DEFAULT 'N'  NOT NULL,
  supplier_number         VARCHAR2(30),
  supplier_site           VARCHAR2(60),
  active                  CHAR(1)      DEFAULT 'Y'  NOT NULL,
  synced_at               TIMESTAMP WITH TIME ZONE  NOT NULL,
  CONSTRAINT eh_employees_pk PRIMARY KEY (person_id),
  CONSTRAINT eh_employees_number_uk UNIQUE (person_number),
  CONSTRAINT eh_employees_bu_ck CHECK (business_unit IN ('IPP','FPP','APP')),
  CONSTRAINT eh_employees_payee_ck CHECK (payee_ok IN ('Y','N')),
  CONSTRAINT eh_employees_active_ck CHECK (active IN ('Y','N'))
);
CREATE INDEX eh_employees_supervisor_ix ON eh_employees (supervisor_id);
CREATE INDEX eh_employees_bu_ix ON eh_employees (business_unit);
CREATE INDEX eh_employees_email_ix ON eh_employees (email);

CREATE TABLE eh_coa_values (
  segment      VARCHAR2(20)             NOT NULL,
  value        VARCHAR2(30)             NOT NULL,
  description  VARCHAR2(240),
  enabled      CHAR(1)     DEFAULT 'Y'  NOT NULL,
  start_date   DATE,
  end_date     DATE,
  synced_at    TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT eh_coa_values_pk PRIMARY KEY (segment, value),
  CONSTRAINT eh_coa_values_segment_ck CHECK (segment IN ('COMPANY','LOCATION','COST_CENTER','ACCOUNT','SEGMENT5','SEGMENT6')),
  CONSTRAINT eh_coa_values_enabled_ck CHECK (enabled IN ('Y','N'))
);

CREATE TABLE eh_business_trips (
  trip_id          NUMBER(18)               NOT NULL,
  person_id        NUMBER(18)               NOT NULL,
  absence_type     VARCHAR2(80)             NOT NULL,
  start_date       DATE                     NOT NULL,
  end_date         DATE                     NOT NULL,
  days             NUMBER(5,1)              NOT NULL,
  destination      VARCHAR2(240),           -- D-46: leave-request field TRIP_DESTINATION_FIELD
  approval_status  VARCHAR2(30)             NOT NULL,
  synced_at        TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT eh_business_trips_pk PRIMARY KEY (trip_id)
);
CREATE INDEX eh_business_trips_person_ix ON eh_business_trips (person_id, start_date);

CREATE TABLE eh_quick_pays (
  quick_pay_id       NUMBER GENERATED ALWAYS AS IDENTITY,
  payroll_action_id  NUMBER(18)               NOT NULL,
  run_result_id      NUMBER(18)               NOT NULL,
  person_id          NUMBER(18)               NOT NULL,
  element_name       VARCHAR2(240)            NOT NULL,
  amount_sar         NUMBER(14,2)             NOT NULL,
  effective_date     DATE                     NOT NULL,
  business_unit      VARCHAR2(10)             NOT NULL,
  synced_at          TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT eh_quick_pays_pk PRIMARY KEY (quick_pay_id),
  CONSTRAINT eh_quick_pays_fusion_uk UNIQUE (payroll_action_id, run_result_id),  -- FR-QP-04
  CONSTRAINT eh_quick_pays_bu_ck CHECK (business_unit IN ('IPP','FPP','APP'))
);
CREATE INDEX eh_quick_pays_person_ix ON eh_quick_pays (person_id);

CREATE TABLE eh_rates (
  from_ccy   VARCHAR2(3)              NOT NULL,
  to_ccy     VARCHAR2(3)              NOT NULL,
  rate_type  VARCHAR2(30)             NOT NULL,
  rate_date  DATE                     NOT NULL,
  rate       NUMBER(18,8)             NOT NULL,
  synced_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT eh_rates_pk PRIMARY KEY (from_ccy, to_ccy, rate_type, rate_date),
  CONSTRAINT eh_rates_positive_ck CHECK (rate > 0)
);
-- D-45: no EH_GRADE_LIMITS — limits are set per expense type in ExpenseHub.
