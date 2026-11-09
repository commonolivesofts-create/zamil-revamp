-- ExpenseHub 002 — security and setup tables (DRD §4, FR-SET). NOT executed until M8 (D-33).

CREATE TABLE eh_users (
  user_id           NUMBER GENERATED ALWAYS AS IDENTITY,
  person_id         NUMBER(18)                NOT NULL,
  password_hash     VARCHAR2(100),
  failed_attempts   NUMBER        DEFAULT 0   NOT NULL,
  locked_until      TIMESTAMP WITH TIME ZONE,
  last_login_at     TIMESTAMP WITH TIME ZONE,
  reset_token_hash  VARCHAR2(100),
  reset_expires_at  TIMESTAMP WITH TIME ZONE,
  active            CHAR(1)       DEFAULT 'Y' NOT NULL,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by        NUMBER(18),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by        NUMBER(18),
  version           NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_users_pk PRIMARY KEY (user_id),
  CONSTRAINT eh_users_person_uk UNIQUE (person_id),
  CONSTRAINT eh_users_person_fk FOREIGN KEY (person_id) REFERENCES eh_employees (person_id),
  CONSTRAINT eh_users_active_ck CHECK (active IN ('Y','N'))
);
CREATE INDEX eh_users_reset_token_ix ON eh_users (reset_token_hash);

CREATE TABLE eh_role_assignments (
  assignment_id  NUMBER GENERATED ALWAYS AS IDENTITY,
  person_id      NUMBER(18)                NOT NULL,
  role_code      VARCHAR2(30)              NOT NULL,
  business_unit  VARCHAR2(10),             -- NULL = all business units
  is_backup      CHAR(1)       DEFAULT 'N' NOT NULL,
  start_date     DATE                      NOT NULL,
  end_date       DATE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by     NUMBER(18),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by     NUMBER(18),
  version        NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_role_assignments_pk PRIMARY KEY (assignment_id),
  CONSTRAINT eh_role_assignments_uk UNIQUE (person_id, role_code, business_unit),
  CONSTRAINT eh_role_assignments_person_fk FOREIGN KEY (person_id) REFERENCES eh_employees (person_id),
  CONSTRAINT eh_role_assignments_role_ck CHECK (role_code IN ('APPROVER_HR','APPROVER_FIN_MGR','APPROVER_CEO','ACCOUNTANT','FINANCE_AP','PETTY_CASHIER','CARD_ADMIN','SYS_ADMIN')),
  CONSTRAINT eh_role_assignments_bu_ck CHECK (business_unit IN ('IPP','FPP','APP')),
  CONSTRAINT eh_role_assignments_backup_ck CHECK (is_backup IN ('Y','N'))
);
CREATE INDEX eh_role_assignments_role_ix ON eh_role_assignments (role_code, business_unit);

CREATE TABLE eh_expense_types (
  type_id            NUMBER GENERATED ALWAYS AS IDENTITY,
  type_code          VARCHAR2(30)              NOT NULL,
  name               VARCHAR2(80)              NOT NULL,
  name_ar            VARCHAR2(80),
  category           VARCHAR2(30)              NOT NULL,
  natural_account    VARCHAR2(30)              NOT NULL,
  default_limit_sar  NUMBER(14,2),
  limit_action       VARCHAR2(5)   DEFAULT 'WARN' NOT NULL,
  receipt_over_sar   NUMBER(14,2),             -- 0 = always, NULL = never
  justification_req  CHAR(1)       DEFAULT 'N' NOT NULL,
  attendees_req      CHAR(1)       DEFAULT 'N' NOT NULL,
  vat_eligible       CHAR(1)       DEFAULT 'N' NOT NULL,
  unit               VARCHAR2(10),
  unit_rate_sar      NUMBER(14,4),
  icon               VARCHAR2(40)              NOT NULL,
  sort_order         NUMBER        DEFAULT 0   NOT NULL,
  is_placeholder     CHAR(1)       DEFAULT 'Y' NOT NULL,   -- OQ-32
  active             CHAR(1)       DEFAULT 'Y' NOT NULL,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by         NUMBER(18),
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by         NUMBER(18),
  version            NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_expense_types_pk PRIMARY KEY (type_id),
  CONSTRAINT eh_expense_types_code_uk UNIQUE (type_code),
  CONSTRAINT eh_expense_types_category_ck CHECK (category IN ('STANDARD','MILEAGE')),
  CONSTRAINT eh_expense_types_action_ck CHECK (limit_action IN ('WARN','BLOCK')),
  CONSTRAINT eh_expense_types_unit_ck CHECK (unit IN ('KM')),
  CONSTRAINT eh_expense_types_flags_ck CHECK (
    justification_req IN ('Y','N') AND attendees_req IN ('Y','N') AND vat_eligible IN ('Y','N')
    AND is_placeholder IN ('Y','N') AND active IN ('Y','N'))
);

CREATE TABLE eh_system_options (
  option_key     VARCHAR2(60)              NOT NULL,
  business_unit  VARCHAR2(10)  DEFAULT '*' NOT NULL,   -- '*' = all business units
  option_value   VARCHAR2(400),
  value_type     VARCHAR2(10)              NOT NULL,
  description    VARCHAR2(400),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by     NUMBER(18),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by     NUMBER(18),
  version        NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_system_options_pk PRIMARY KEY (option_key, business_unit),
  CONSTRAINT eh_system_options_type_ck CHECK (value_type IN ('NUMBER','STRING','BOOL','JSON')),
  CONSTRAINT eh_system_options_bu_ck CHECK (business_unit IN ('*','IPP','FPP','APP'))
);

CREATE TABLE eh_approval_rules (
  rule_id               NUMBER GENERATED ALWAYS AS IDENTITY,
  chain_code            VARCHAR2(20)  DEFAULT 'STANDARD' NOT NULL,   -- D-37
  seq                   NUMBER                    NOT NULL,
  step_name             VARCHAR2(60)              NOT NULL,
  approver_source       VARCHAR2(20)              NOT NULL,
  role_code             VARCHAR2(30),
  condition_type        VARCHAR2(20)  DEFAULT 'ALWAYS' NOT NULL,
  condition_amount_sar  NUMBER(14,2),             -- NULL with TOTAL_GT = option CEO_THRESHOLD_SAR
  is_audit_step         CHAR(1)       DEFAULT 'N' NOT NULL,
  active                CHAR(1)       DEFAULT 'Y' NOT NULL,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by            NUMBER(18),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by            NUMBER(18),
  version               NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_approval_rules_pk PRIMARY KEY (rule_id),
  CONSTRAINT eh_approval_rules_seq_uk UNIQUE (chain_code, seq),
  CONSTRAINT eh_approval_rules_chain_ck CHECK (chain_code IN ('STANDARD','CEO_CLAIMANT')),
  CONSTRAINT eh_approval_rules_source_ck CHECK (approver_source IN ('SUPERVISOR','SUPERVISOR_HIERARCHY','ROLE')),
  CONSTRAINT eh_approval_rules_cond_ck CHECK (condition_type IN ('ALWAYS','TOTAL_GT')),
  CONSTRAINT eh_approval_rules_role_ck CHECK (
    (approver_source = 'ROLE' AND role_code IS NOT NULL) OR (approver_source IN ('SUPERVISOR','SUPERVISOR_HIERARCHY') AND role_code IS NULL)),
  CONSTRAINT eh_approval_rules_flags_ck CHECK (is_audit_step IN ('Y','N') AND active IN ('Y','N'))
);

CREATE TABLE eh_audit_rules (
  rule_code     VARCHAR2(30)              NOT NULL,
  param_number  NUMBER(14,2),
  active        CHAR(1)       DEFAULT 'Y' NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by    NUMBER(18),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by    NUMBER(18),
  version       NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_audit_rules_pk PRIMARY KEY (rule_code),
  CONSTRAINT eh_audit_rules_code_ck CHECK (rule_code IN ('ANY_WARNING','MISSING_RECEIPT','TOTAL_GT','RANDOM_PCT','DUPLICATE')),
  CONSTRAINT eh_audit_rules_active_ck CHECK (active IN ('Y','N'))
);

CREATE TABLE eh_delegations (
  delegation_id   NUMBER GENERATED ALWAYS AS IDENTITY,
  from_person_id  NUMBER(18)                NOT NULL,
  to_person_id    NUMBER(18)                NOT NULL,
  start_date      DATE                      NOT NULL,
  end_date        DATE                      NOT NULL,
  active          CHAR(1)       DEFAULT 'Y' NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by      NUMBER(18),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_by      NUMBER(18),
  version         NUMBER        DEFAULT 1   NOT NULL,
  CONSTRAINT eh_delegations_pk PRIMARY KEY (delegation_id),
  CONSTRAINT eh_delegations_self_ck CHECK (from_person_id <> to_person_id),
  CONSTRAINT eh_delegations_dates_ck CHECK (start_date <= end_date),
  CONSTRAINT eh_delegations_active_ck CHECK (active IN ('Y','N'))
);
CREATE INDEX eh_delegations_from_ix ON eh_delegations (from_person_id, start_date);
