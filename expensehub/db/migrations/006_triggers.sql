-- ExpenseHub 006 — integrity triggers DB-01…DB-06 (DRD §5, D-24). NOT executed until M8 (D-33).
-- Until then the same rules run in the service layer: apps/api/src/domain/integrity.ts.
-- DB-07 / DB-09 are unique keys and DB-08 a check constraint (files 003, 004).
--
-- The API identifies the actor with DBMS_SESSION.SET_IDENTIFIER(person_id) and also writes
-- acted_by / auditor_id / updated_by. Error numbers map to API errors:
--   -20001…-20004 → SOD_VIOLATION (403) · -20005 → INVALID_STATE (history is append-only)
--   -20006 → INVALID_STATE (409, line locked)

-- DB-01: the approver of a step is never the claimant.
CREATE OR REPLACE TRIGGER eh_approval_steps_sod_trg
  BEFORE UPDATE OF status ON eh_approval_steps
  FOR EACH ROW
  WHEN (new.status IN ('APPROVED', 'REJECTED'))
DECLARE
  l_claimant eh_reports.person_id%TYPE;
BEGIN
  SELECT person_id INTO l_claimant FROM eh_reports WHERE report_id = :new.report_id;
  IF :new.acted_by IS NULL OR :new.acted_by = l_claimant THEN
    RAISE_APPLICATION_ERROR(-20001, 'SOD: self-approval');
  END IF;
END;
/

-- DB-02: the auditor is never the claimant.
CREATE OR REPLACE TRIGGER eh_audit_sod_trg
  BEFORE INSERT OR UPDATE OF auditor_id, outcome ON eh_audit
  FOR EACH ROW
  WHEN (new.auditor_id IS NOT NULL)
DECLARE
  l_claimant eh_reports.person_id%TYPE;
BEGIN
  SELECT person_id INTO l_claimant FROM eh_reports WHERE report_id = :new.report_id;
  IF :new.auditor_id = l_claimant THEN
    RAISE_APPLICATION_ERROR(-20002, 'SOD: self-audit');
  END IF;
END;
/

-- DB-03: the claimant never changes the audited (approved) amount of their own line.
CREATE OR REPLACE TRIGGER eh_expenses_adjust_sod_trg
  BEFORE UPDATE OF approved_amount_sar ON eh_expenses
  FOR EACH ROW
  WHEN (new.approved_amount_sar <> old.approved_amount_sar)
BEGIN
  IF :new.updated_by IS NULL OR :new.updated_by = :new.person_id THEN
    RAISE_APPLICATION_ERROR(-20003, 'SOD: claimant cannot adjust own line');
  END IF;
END;
/

-- DB-04: the advance approver and the petty cashier are never the advance owner.
CREATE OR REPLACE TRIGGER eh_advances_sod_trg
  BEFORE INSERT OR UPDATE OF approver_id, disbursed_by ON eh_advances
  FOR EACH ROW
BEGIN
  IF :new.approver_id = :new.person_id OR :new.disbursed_by = :new.person_id THEN
    RAISE_APPLICATION_ERROR(-20004, 'SOD: advance owner cannot approve or disburse');
  END IF;
END;
/

-- DB-05: history is append-only.
CREATE OR REPLACE TRIGGER eh_report_history_ro_trg
  BEFORE UPDATE OR DELETE ON eh_report_history
BEGIN
  RAISE_APPLICATION_ERROR(-20005, 'History is append-only');
END;
/

CREATE OR REPLACE TRIGGER eh_setup_history_ro_trg
  BEFORE UPDATE OR DELETE ON eh_setup_history
BEGIN
  RAISE_APPLICATION_ERROR(-20005, 'History is append-only');
END;
/

-- DB-06: amount / type / date of a line on a non-DRAFT report cannot change; a line cannot be
-- moved onto a non-DRAFT report. Audit adjustments use approved_amount_sar (not listed here).
CREATE OR REPLACE TRIGGER eh_expenses_lock_trg
  BEFORE UPDATE OF amount, amount_sar, currency, fx_rate, quantity, type_id, expense_date, report_id
  ON eh_expenses
  FOR EACH ROW
DECLARE
  l_status eh_reports.status%TYPE;
BEGIN
  IF :old.report_id IS NOT NULL THEN
    SELECT status INTO l_status FROM eh_reports WHERE report_id = :old.report_id;
    IF l_status <> 'DRAFT' THEN
      RAISE_APPLICATION_ERROR(-20006, 'Line is locked: report is ' || l_status);
    END IF;
  END IF;
  IF :new.report_id IS NOT NULL AND (:old.report_id IS NULL OR :new.report_id <> :old.report_id) THEN
    SELECT status INTO l_status FROM eh_reports WHERE report_id = :new.report_id;
    IF l_status <> 'DRAFT' THEN
      RAISE_APPLICATION_ERROR(-20006, 'Cannot add a line to a report in status ' || l_status);
    END IF;
  END IF;
END;
/
