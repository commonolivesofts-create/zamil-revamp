-- SICK-LEAVE-HALF-DAYS-001: fractional Sick Leave duration and half-day persistence.
-- Applied to the TEST database on 2026-11-07 after the user authorized the change.
-- For future environments, run as XXZP (or an authorized user) after 00-precheck.sql.
-- Oracle DDL commits implicitly. The guarded column swap briefly rejects writes that
-- target LEAVE_DAYS; run against the test environment and keep submissions paused.
-- Recovery: inspect the current columns and trigger before continuing; do not rerun blindly.

DECLARE
  v_table_count       PLS_INTEGER;
  v_days_count        PLS_INTEGER;
  v_invalid_days      PLS_INTEGER;
  v_day_type_count    PLS_INTEGER;
  v_temp_column_count PLS_INTEGER;
  v_backup_column_count PLS_INTEGER;
  v_fractional_days   PLS_INTEGER;
  v_existing_half     PLS_INTEGER;
  v_trigger_count     PLS_INTEGER;
  v_dependency_count  PLS_INTEGER;
  v_column_dependency_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_table_count
    FROM ALL_TABLES
   WHERE OWNER = 'XXZP'
     AND TABLE_NAME = 'XXZP_SICK_LEAVE';

  IF v_table_count <> 1 THEN
    RAISE_APPLICATION_ERROR(-20001, 'XXZP.XXZP_SICK_LEAVE must exist before this migration');
  END IF;

  SELECT COUNT(*)
    INTO v_days_count
    FROM ALL_TAB_COLUMNS
   WHERE OWNER = 'XXZP'
     AND TABLE_NAME = 'XXZP_SICK_LEAVE'
     AND COLUMN_NAME = 'LEAVE_DAYS'
     AND DATA_TYPE = 'VARCHAR2';

  IF v_days_count <> 1 THEN
    RAISE_APPLICATION_ERROR(-20002, 'LEAVE_DAYS must be VARCHAR2 for this guarded conversion');
  END IF;

  SELECT COUNT(*)
    INTO v_invalid_days
    FROM XXZP.XXZP_SICK_LEAVE
   WHERE LEAVE_DAYS IS NOT NULL
     AND VALIDATE_CONVERSION(TRIM(LEAVE_DAYS) AS NUMBER) = 0;

  IF v_invalid_days <> 0 THEN
    RAISE_APPLICATION_ERROR(-20003, 'LEAVE_DAYS contains values that cannot safely convert to NUMBER');
  END IF;

  SELECT COUNT(*)
    INTO v_fractional_days
    FROM XXZP.XXZP_SICK_LEAVE
   WHERE LEAVE_DAYS <> TRUNC(LEAVE_DAYS);

  IF v_fractional_days <> 0 THEN
    RAISE_APPLICATION_ERROR(-20004, 'Existing fractional leave totals need day-type mapping before migration');
  END IF;

  SELECT COUNT(*)
    INTO v_day_type_count
    FROM ALL_TAB_COLUMNS
   WHERE OWNER = 'XXZP'
     AND TABLE_NAME = 'XXZP_SICK_LEAVE'
     AND COLUMN_NAME IN ('FROM_DAY_TYPE', 'TO_DAY_TYPE');

  IF v_day_type_count <> 0 THEN
    RAISE_APPLICATION_ERROR(-20005, 'A day-type column already exists; review the partial schema before migration');
  END IF;

  SELECT COUNT(*)
    INTO v_temp_column_count
    FROM ALL_TAB_COLUMNS
   WHERE OWNER = 'XXZP'
     AND TABLE_NAME = 'XXZP_SICK_LEAVE'
     AND COLUMN_NAME = 'LEAVE_DAYS_NUM_TMP';

  SELECT COUNT(*)
    INTO v_backup_column_count
    FROM ALL_TAB_COLUMNS
   WHERE OWNER = 'XXZP'
     AND TABLE_NAME = 'XXZP_SICK_LEAVE'
     AND COLUMN_NAME = 'LEAVE_DAYS_VC_OLD';

  IF v_temp_column_count <> 0 OR v_backup_column_count <> 0 THEN
    RAISE_APPLICATION_ERROR(-20006, 'A migration staging column already exists; inspect before continuing');
  END IF;

  SELECT COUNT(*)
    INTO v_existing_half
    FROM ALL_CONSTRAINTS
   WHERE OWNER = 'XXZP'
     AND CONSTRAINT_NAME IN ('XXZP_SL_FROM_DAY_TYPE_CK', 'XXZP_SL_TO_DAY_TYPE_CK');

  IF v_existing_half <> 0 THEN
    RAISE_APPLICATION_ERROR(-20007, 'A target day-type constraint name already exists; review before migration');
  END IF;

  SELECT COUNT(*)
    INTO v_trigger_count
    FROM ALL_TRIGGERS
   WHERE TABLE_OWNER = 'XXZP'
     AND TABLE_NAME = 'XXZP_SICK_LEAVE';

  SELECT COUNT(*)
    INTO v_dependency_count
    FROM ALL_DEPENDENCIES
   WHERE REFERENCED_OWNER = 'XXZP'
     AND REFERENCED_NAME = 'XXZP_SICK_LEAVE';

  SELECT
      (SELECT COUNT(*)
         FROM ALL_CONS_COLUMNS
        WHERE OWNER = 'XXZP'
          AND TABLE_NAME = 'XXZP_SICK_LEAVE'
          AND COLUMN_NAME = 'LEAVE_DAYS')
    + (SELECT COUNT(*)
         FROM ALL_IND_COLUMNS
        WHERE TABLE_OWNER = 'XXZP'
          AND TABLE_NAME = 'XXZP_SICK_LEAVE'
          AND COLUMN_NAME = 'LEAVE_DAYS')
    INTO v_column_dependency_count
    FROM DUAL;

  IF v_trigger_count <> 0 OR v_dependency_count <> 0 OR v_column_dependency_count <> 0 THEN
    RAISE_APPLICATION_ERROR(-20008, 'LEAVE_DAYS has triggers, dependencies, indexes, or constraints; review before conversion');
  END IF;
END;
/

-- Build and populate a numeric shadow column while the old character column remains live.
ALTER TABLE XXZP.XXZP_SICK_LEAVE
  ADD (LEAVE_DAYS_NUM_TMP NUMBER);

CREATE OR REPLACE TRIGGER XXZP.XXZP_SL_DAYS_MIRROR_TRG
BEFORE INSERT OR UPDATE ON XXZP.XXZP_SICK_LEAVE
FOR EACH ROW
BEGIN
  :NEW.LEAVE_DAYS_NUM_TMP := TO_NUMBER(TRIM(:NEW.LEAVE_DAYS));
END;
/

UPDATE XXZP.XXZP_SICK_LEAVE
   SET LEAVE_DAYS_NUM_TMP = TO_NUMBER(TRIM(LEAVE_DAYS));
COMMIT;

DECLARE
  v_mismatch_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_mismatch_count
    FROM XXZP.XXZP_SICK_LEAVE
   WHERE (LEAVE_DAYS IS NULL AND LEAVE_DAYS_NUM_TMP IS NOT NULL)
      OR (LEAVE_DAYS IS NOT NULL
          AND (LEAVE_DAYS_NUM_TMP IS NULL
               OR TO_NUMBER(TRIM(LEAVE_DAYS)) <> LEAVE_DAYS_NUM_TMP));

  IF v_mismatch_count <> 0 THEN
    RAISE_APPLICATION_ERROR(-20009, 'Numeric shadow column does not match LEAVE_DAYS; stop before cutover');
  END IF;
END;
/

-- These two renames form a short cutover window; submissions should be paused while running.
ALTER TABLE XXZP.XXZP_SICK_LEAVE
  RENAME COLUMN LEAVE_DAYS TO LEAVE_DAYS_VC_OLD;

DROP TRIGGER XXZP.XXZP_SL_DAYS_MIRROR_TRG;

ALTER TABLE XXZP.XXZP_SICK_LEAVE
  RENAME COLUMN LEAVE_DAYS_NUM_TMP TO LEAVE_DAYS;

ALTER TABLE XXZP.XXZP_SICK_LEAVE
  DROP COLUMN LEAVE_DAYS_VC_OLD;

-- Defaults preserve legacy CI3 inserts that omit the new day-type fields.
ALTER TABLE XXZP.XXZP_SICK_LEAVE
  ADD (
    FROM_DAY_TYPE VARCHAR2(4 CHAR) DEFAULT 'FULL' NOT NULL,
    TO_DAY_TYPE   VARCHAR2(4 CHAR) DEFAULT 'FULL' NOT NULL
  );

ALTER TABLE XXZP.XXZP_SICK_LEAVE
  ADD CONSTRAINT XXZP_SL_FROM_DAY_TYPE_CK
  CHECK (FROM_DAY_TYPE IN ('FULL', 'HALF'));

ALTER TABLE XXZP.XXZP_SICK_LEAVE
  ADD CONSTRAINT XXZP_SL_TO_DAY_TYPE_CK
  CHECK (TO_DAY_TYPE IN ('FULL', 'HALF'));
