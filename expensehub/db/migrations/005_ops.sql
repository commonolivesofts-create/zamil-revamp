-- ExpenseHub 005 — history, integration log, jobs, notification outbox, document sequences.
-- NOT executed until M8 (D-33).

CREATE TABLE eh_report_history (            -- append-only (DB-05)
  history_id   NUMBER GENERATED ALWAYS AS IDENTITY,
  entity_type  VARCHAR2(20)              NOT NULL,
  entity_id    NUMBER                    NOT NULL,
  at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  actor_id     NUMBER(18),               -- NULL = system
  action       VARCHAR2(40)              NOT NULL,
  from_status  VARCHAR2(30),
  to_status    VARCHAR2(30),
  detail       JSON,
  CONSTRAINT eh_report_history_pk PRIMARY KEY (history_id),
  CONSTRAINT eh_report_history_type_ck CHECK (entity_type IN ('REPORT','EXPENSE','ADVANCE','QUICK_PAY'))
);
CREATE INDEX eh_report_history_entity_ix ON eh_report_history (entity_type, entity_id, at);

CREATE TABLE eh_setup_history (             -- append-only (DB-05, FR-SET-05)
  id          NUMBER GENERATED ALWAYS AS IDENTITY,
  table_name  VARCHAR2(60)              NOT NULL,
  row_key     VARCHAR2(200)             NOT NULL,
  at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  actor_id    NUMBER(18),
  old_json    JSON,
  new_json    JSON,
  CONSTRAINT eh_setup_history_pk PRIMARY KEY (id)
);
CREATE INDEX eh_setup_history_table_ix ON eh_setup_history (table_name, row_key, at);

CREATE TABLE eh_integration_log (
  log_id       NUMBER GENERATED ALWAYS AS IDENTITY,
  interface    VARCHAR2(10)              NOT NULL,
  direction    VARCHAR2(3)               NOT NULL,
  ref_type     VARCHAR2(30),
  ref_id       VARCHAR2(60),
  http_method  VARCHAR2(10),
  url          VARCHAR2(1000),
  request      JSON,                     -- secrets stripped
  response     CLOB,                     -- truncated to 32 KB
  http_status  NUMBER(3),
  status       VARCHAR2(10)              NOT NULL,
  retries      NUMBER        DEFAULT 0   NOT NULL,
  duration_ms  NUMBER,
  at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT eh_integration_log_pk PRIMARY KEY (log_id),
  CONSTRAINT eh_integration_log_interface_ck CHECK (interface IN ('INT-01','INT-02','INT-03','INT-04','INT-05a','INT-05b','INT-06','INT-07','INT-08','INT-09')),
  CONSTRAINT eh_integration_log_dir_ck CHECK (direction IN ('IN','OUT')),
  CONSTRAINT eh_integration_log_status_ck CHECK (status IN ('OK','ERROR','RETRYING'))
);
CREATE INDEX eh_integration_log_if_ix ON eh_integration_log (interface, at);
CREATE INDEX eh_integration_log_ref_ix ON eh_integration_log (ref_type, ref_id);

CREATE TABLE eh_job_runs (
  run_id        NUMBER GENERATED ALWAYS AS IDENTITY,
  job_name      VARCHAR2(60)              NOT NULL,
  started_at    TIMESTAMP WITH TIME ZONE  NOT NULL,
  ended_at      TIMESTAMP WITH TIME ZONE,
  status        VARCHAR2(10)              NOT NULL,
  rows_read     NUMBER,
  rows_changed  NUMBER,
  error_text    VARCHAR2(4000),
  CONSTRAINT eh_job_runs_pk PRIMARY KEY (run_id),
  CONSTRAINT eh_job_runs_status_ck CHECK (status IN ('RUNNING','OK','ERROR','SKIPPED'))
);
CREATE INDEX eh_job_runs_job_ix ON eh_job_runs (job_name, started_at);

CREATE TABLE eh_notifications (             -- outbox (FR-NTF-01)
  notification_id  NUMBER GENERATED ALWAYS AS IDENTITY,
  channel          VARCHAR2(10)              NOT NULL,
  recipient_id     NUMBER(18)                NOT NULL,
  template_code    VARCHAR2(60)              NOT NULL,
  payload          JSON,
  status           VARCHAR2(10)  DEFAULT 'QUEUED' NOT NULL,
  attempts         NUMBER        DEFAULT 0   NOT NULL,
  sent_at          TIMESTAMP WITH TIME ZONE,
  error_text       VARCHAR2(1000),
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT eh_notifications_pk PRIMARY KEY (notification_id),
  CONSTRAINT eh_notifications_channel_ck CHECK (channel IN ('EMAIL','TEAMS','WHATSAPP')),
  CONSTRAINT eh_notifications_status_ck CHECK (status IN ('QUEUED','SENT','FAILED'))
);
CREATE INDEX eh_notifications_status_ix ON eh_notifications (status, created_at);

-- Gap-free document numbers (OQ-19). Updated inside the business transaction:
--   UPDATE eh_doc_sequences SET last_value = last_value + 1 WHERE seq_name = :n RETURNING last_value INTO :v
--   (MERGE first when the name is new). A rollback returns the number.
CREATE TABLE eh_doc_sequences (
  seq_name    VARCHAR2(60)              NOT NULL,
  last_value  NUMBER        DEFAULT 0   NOT NULL,
  CONSTRAINT eh_doc_sequences_pk PRIMARY KEY (seq_name)
);

-- Applied-migrations ledger for the M8 runner.
CREATE TABLE eh_schema_migrations (
  file_name   VARCHAR2(200)             NOT NULL,
  checksum    VARCHAR2(64)              NOT NULL,
  applied_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT eh_schema_migrations_pk PRIMARY KEY (file_name)
);
