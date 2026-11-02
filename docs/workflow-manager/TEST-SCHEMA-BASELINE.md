# Workflow Manager — Oracle ADW TEST Structural Baseline

**Source of evidence:** Owner-provided SQL execution output on 02 November 2026; not an independently executed database connection by this documentation task.

- 21 `XX_ZRV_WF_*` tables; 50 foreign keys; 48 explicitly named workflow indexes, all `VALID`; 16 enabled triggers; one-open-RFI unique index verified; constraints enabled/validated.
- Owner's post-deployment output: `PASS: 21 tables, 50 foreign keys, one-open RFI index, 16 triggers and enabled/validated constraints. Runtime integration still requires tests.`
- During TEST deployment the SQL package required repair for JSON check constraint syntax; missing RFI, FYI, and other indexes; and an exception-table creation timestamp inconsistency. Ensure source-controlled migration scripts reflect the **actual deployed shape**, including these adjustments. Do not treat the initial greenfield ZIP as a complete replayable production script until reconciled/compiled and reviewed.
- Do not run CREATE TABLE scripts on the already deployed TEST schema. Read-only dictionary checks are acceptable; runtime DML smoke tests require the owner's approved test plan, and production/UAT rollout requires separate authorizations.
- This document is a **status record**, not an Oracle upgrade script or approval to run SQL.