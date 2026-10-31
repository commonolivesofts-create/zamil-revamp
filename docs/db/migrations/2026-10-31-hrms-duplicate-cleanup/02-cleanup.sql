-- HRMS-DUP-CLEAN-001 cleanup. NOT APPLIED. Run after 01-backup.sql, in one session, as the XXZP
-- owner. The block does NOT commit: run 03-verify.sql in the same session, then COMMIT if every
-- check passes, otherwise ROLLBACK. Every step checks its row count and raises (leaving the
-- session's changes to be rolled back) if the data is not what 00-precheck.sql showed.
--
-- 1. Requisition 100800: the two rows are identical in every column, so one copy is deleted.
-- 2. Interview 677: two different interviews share the ID. The 'Approved' row (it owns INT_NO,
--    which embeds 677) keeps the ID. The 'InProcess' row and its child rows (matched by
--    CREATED_BY, one per child table) move to a new ID taken from the table's identity sequence,
--    so the identity column never hands that value out again.
-- 3. Attachments: in each duplicated HEADER_ID group whose rows agree on UUID, FORM_HEADER_ID,
--    FORM_NAME and FILE_NAME, the row with the earliest ATTACHED_ON (then lowest ROWID) is kept
--    and the other is deleted. Both rows name the same file, so no file is lost.

DECLARE
  v_count   NUMBER;
  v_creator NUMBER;
  v_seq     VARCHAR2(128);
  v_new_id  NUMBER;

  PROCEDURE expect(p_what VARCHAR2, p_actual NUMBER, p_expected NUMBER) IS
  BEGIN
    IF p_actual <> p_expected THEN
      RAISE_APPLICATION_ERROR(-20001, p_what || ': expected ' || p_expected || ', got ' || p_actual);
    END IF;
  END;
BEGIN
  -- 1. Requisition 100800 ---------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count FROM (SELECT DISTINCT * FROM XXZP.XXZPI_PER_REQUISITIONS_ALL
                                      WHERE REQUISITION_ID = 100800);
  expect('requisition 100800 distinct rows', v_count, 1);

  DELETE FROM XXZP.XXZPI_PER_REQUISITIONS_ALL
   WHERE REQUISITION_ID = 100800
     AND ROWID <> (SELECT MIN(ROWID) FROM XXZP.XXZPI_PER_REQUISITIONS_ALL WHERE REQUISITION_ID = 100800);
  expect('requisition 100800 rows deleted', SQL%ROWCOUNT, 1);

  -- 2. Interview 677 --------------------------------------------------------------------------
  SELECT COUNT(DISTINCT CREATED_BY) INTO v_count
    FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = 677;
  expect('interview 677 creators', v_count, 2);

  SELECT CREATED_BY INTO v_creator          -- raises NO_DATA_FOUND / TOO_MANY_ROWS if not unique
    FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
   WHERE HEADER_ID = 677 AND STATUS = 'InProcess' AND INT_NO IS NULL;

  SELECT SEQUENCE_NAME INTO v_seq
    FROM ALL_TAB_IDENTITY_COLS
   WHERE OWNER = 'XXZP' AND TABLE_NAME = 'XXZP_INTERVW_ASSESMNT_HEADER_T' AND COLUMN_NAME = 'HEADER_ID';
  EXECUTE IMMEDIATE 'SELECT XXZP.' || DBMS_ASSERT.SIMPLE_SQL_NAME(v_seq) || '.NEXTVAL FROM DUAL'
    INTO v_new_id;

  SELECT COUNT(*) INTO v_count FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = v_new_id;
  expect('new interview ID already in use', v_count, 0);

  INSERT INTO XXZP.XXZP_DUPFIX_INT_MAP (OLD_HEADER_ID, NEW_HEADER_ID, CREATED_BY)
  VALUES (677, v_new_id, v_creator);

  UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T SET HEADER_ID = v_new_id
   WHERE HEADER_ID = 677 AND CREATED_BY = v_creator;
  expect('interview header renumbered', SQL%ROWCOUNT, 1);

  UPDATE XXZP.XXZP_INTERVIEW_EVAL_T SET HEADER_ID = v_new_id
   WHERE HEADER_ID = 677 AND CREATED_BY = v_creator;
  expect('interview eval renumbered', SQL%ROWCOUNT, 1);

  UPDATE XXZP.XXZP_PERSONAL_SPEC_T SET HEADER_ID = v_new_id
   WHERE HEADER_ID = 677 AND CREATED_BY = v_creator;
  expect('personal spec renumbered', SQL%ROWCOUNT, 1);

  UPDATE XXZP.XXZP_JOB_COMPETENCY_T SET HEADER_ID = v_new_id
   WHERE HEADER_ID = 677 AND CREATED_BY = v_creator;
  expect('job competency renumbered', SQL%ROWCOUNT, 1);

  -- 3. Attachments ----------------------------------------------------------------------------
  DELETE FROM XXZP.XXZP_ALL_ATTACHMENTS a
   WHERE a.ROWID IN (
     SELECT RID FROM (
       SELECT x.ROWID AS RID,
              ROW_NUMBER() OVER (PARTITION BY x.HEADER_ID ORDER BY x.ATTACHED_ON, x.ROWID) AS RN
         FROM XXZP.XXZP_ALL_ATTACHMENTS x
        WHERE x.HEADER_ID IN (
          SELECT HEADER_ID FROM XXZP.XXZP_ALL_ATTACHMENTS
           GROUP BY HEADER_ID
          HAVING COUNT(*) > 1
             AND COUNT(DISTINCT NVL(UUID, '~')) = 1
             AND COUNT(DISTINCT NVL(FORM_HEADER_ID, -1)) = 1
             AND COUNT(DISTINCT NVL(FORM_NAME, '~')) = 1
             AND COUNT(DISTINCT NVL(FILE_NAME, '~')) = 1))
      WHERE RN > 1);
  expect('attachment rows deleted', SQL%ROWCOUNT, 3564);   -- TEST figure; see 00-precheck step 6

  DBMS_OUTPUT.PUT_LINE('Cleanup done; interview 677 InProcess row moved to HEADER_ID ' || v_new_id
                       || '. Run 03-verify.sql, then COMMIT or ROLLBACK.');
END;
/
