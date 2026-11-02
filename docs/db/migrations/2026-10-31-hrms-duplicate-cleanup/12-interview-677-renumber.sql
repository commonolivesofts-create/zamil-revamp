-- HRMS-DUP-CLEAN-001, interview 677, renumber. NOT APPLIED. Run after 11-interview-677-backup.sql,
-- in one session, as the XXZP owner. The block does NOT commit: check the output and the queries
-- at the end, then COMMIT, otherwise ROLLBACK.
--
-- The 'Approved' interview keeps 677 (its INT_NO embeds 677). The 'InProcess' interview (no
-- INT_NO) and its child rows, identified by the InProcess row's CREATED_BY (one per child table),
-- move to a new HEADER_ID taken from the header table's identity sequence, so the identity
-- column never hands that value out again. Its INT_NO stays empty, as it is today. Each moved
-- row is recorded in XXZP_DUPFIX_INT_MAP by its ROWID for the rollback.

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
  SELECT COUNT(*) INTO v_count FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = 677;
  expect('header rows on 677', v_count, 2);
  SELECT COUNT(DISTINCT CREATED_BY) INTO v_count
    FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = 677;
  expect('creators on 677', v_count, 2);

  SELECT CREATED_BY INTO v_creator          -- raises NO_DATA_FOUND / TOO_MANY_ROWS if not unique
    FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
   WHERE HEADER_ID = 677 AND STATUS = 'InProcess' AND INT_NO IS NULL;

  SELECT SEQUENCE_NAME INTO v_seq
    FROM ALL_TAB_IDENTITY_COLS
   WHERE OWNER = 'XXZP' AND TABLE_NAME = 'XXZP_INTERVW_ASSESMNT_HEADER_T' AND COLUMN_NAME = 'HEADER_ID';
  EXECUTE IMMEDIATE 'SELECT XXZP.' || DBMS_ASSERT.SIMPLE_SQL_NAME(v_seq) || '.NEXTVAL FROM DUAL'
    INTO v_new_id;
  SELECT COUNT(*) INTO v_count FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = v_new_id;
  expect('rows already on the new ID', v_count, 0);

  -- Record exactly the rows that move, then move them.
  INSERT INTO XXZP.XXZP_DUPFIX_INT_MAP (TABLE_NAME, ORIG_ROWID, OLD_HEADER_ID, NEW_HEADER_ID, CREATED_BY)
  SELECT 'XXZP_INTERVW_ASSESMNT_HEADER_T', ROWIDTOCHAR(ROWID), 677, v_new_id, v_creator
    FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = 677 AND CREATED_BY = v_creator
  UNION ALL
  SELECT 'XXZP_INTERVIEW_EVAL_T', ROWIDTOCHAR(ROWID), 677, v_new_id, v_creator
    FROM XXZP.XXZP_INTERVIEW_EVAL_T WHERE HEADER_ID = 677 AND CREATED_BY = v_creator
  UNION ALL
  SELECT 'XXZP_PERSONAL_SPEC_T', ROWIDTOCHAR(ROWID), 677, v_new_id, v_creator
    FROM XXZP.XXZP_PERSONAL_SPEC_T WHERE HEADER_ID = 677 AND CREATED_BY = v_creator
  UNION ALL
  SELECT 'XXZP_JOB_COMPETENCY_T', ROWIDTOCHAR(ROWID), 677, v_new_id, v_creator
    FROM XXZP.XXZP_JOB_COMPETENCY_T WHERE HEADER_ID = 677 AND CREATED_BY = v_creator;
  expect('rows recorded in the map', SQL%ROWCOUNT, 4);

  UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T SET HEADER_ID = v_new_id
   WHERE HEADER_ID = 677 AND CREATED_BY = v_creator;
  expect('header moved', SQL%ROWCOUNT, 1);
  UPDATE XXZP.XXZP_INTERVIEW_EVAL_T SET HEADER_ID = v_new_id
   WHERE HEADER_ID = 677 AND CREATED_BY = v_creator;
  expect('evaluation moved', SQL%ROWCOUNT, 1);
  UPDATE XXZP.XXZP_PERSONAL_SPEC_T SET HEADER_ID = v_new_id
   WHERE HEADER_ID = 677 AND CREATED_BY = v_creator;
  expect('personal spec moved', SQL%ROWCOUNT, 1);
  UPDATE XXZP.XXZP_JOB_COMPETENCY_T SET HEADER_ID = v_new_id
   WHERE HEADER_ID = 677 AND CREATED_BY = v_creator;
  expect('job competency moved', SQL%ROWCOUNT, 1);

  DBMS_OUTPUT.PUT_LINE('InProcess interview moved from 677 to HEADER_ID ' || v_new_id
                       || '. Check the queries below, then COMMIT or ROLLBACK.');
END;
/

-- Checks in the same session before COMMIT (read-only):
-- expect 677 -> 1 header and 2 children per table; the new ID -> 1 header and 1 child per table.
SELECT 'HEADER' T, HEADER_ID, COUNT(*) FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
 WHERE HEADER_ID IN (677, (SELECT MAX(NEW_HEADER_ID) FROM XXZP.XXZP_DUPFIX_INT_MAP)) GROUP BY HEADER_ID
UNION ALL
SELECT 'EVAL', HEADER_ID, COUNT(*) FROM XXZP.XXZP_INTERVIEW_EVAL_T
 WHERE HEADER_ID IN (677, (SELECT MAX(NEW_HEADER_ID) FROM XXZP.XXZP_DUPFIX_INT_MAP)) GROUP BY HEADER_ID
UNION ALL
SELECT 'PSPEC', HEADER_ID, COUNT(*) FROM XXZP.XXZP_PERSONAL_SPEC_T
 WHERE HEADER_ID IN (677, (SELECT MAX(NEW_HEADER_ID) FROM XXZP.XXZP_DUPFIX_INT_MAP)) GROUP BY HEADER_ID
UNION ALL
SELECT 'JCOMP', HEADER_ID, COUNT(*) FROM XXZP.XXZP_JOB_COMPETENCY_T
 WHERE HEADER_ID IN (677, (SELECT MAX(NEW_HEADER_ID) FROM XXZP.XXZP_DUPFIX_INT_MAP)) GROUP BY HEADER_ID;
-- And no duplicate interview IDs remain: expect 0.
SELECT COUNT(*) AS INT_DUPS FROM (SELECT 1 FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
                                   GROUP BY HEADER_ID HAVING COUNT(*) > 1);
-- COMMIT;   -- only after the checks match.
