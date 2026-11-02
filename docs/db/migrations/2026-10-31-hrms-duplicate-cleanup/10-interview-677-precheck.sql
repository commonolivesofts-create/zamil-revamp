-- HRMS-DUP-CLEAN-001, interview 677, precheck: read-only. Lists the rows that share
-- HEADER_ID 677 (row IDs, status and creator only) so HR can confirm which interview keeps 677
-- before 11..12 run. Expected on TEST (2026-10-31): two header rows, 'Approved' with INT_NO and
-- 'InProcess' without, from two different creators; three child rows per child table, of which
-- the InProcess creator owns exactly one per table. If anything differs, STOP.

-- 1. Header rows sharing 677: row identifiers, status, INT_NO and creator.
SELECT ROWIDTOCHAR(ROWID) AS ROW_ID, UUID, HEADER_ID, STATUS, INT_NO, CREATED_BY
  FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
 WHERE HEADER_ID = 677
 ORDER BY STATUS;

-- 2. Child rows on 677: row identifiers and creator, with the header status of the same creator
--    (the only link between a child and its interview; the child UUIDs never match the header's).
SELECT c.T, c.ROW_ID, c.UUID, c.HEADER_ID, c.CREATED_BY, h.STATUS AS OWNER_STATUS
  FROM (SELECT 'XXZP_INTERVIEW_EVAL_T' AS T, ROWIDTOCHAR(ROWID) AS ROW_ID, UUID, HEADER_ID, CREATED_BY
          FROM XXZP.XXZP_INTERVIEW_EVAL_T WHERE HEADER_ID = 677
        UNION ALL
        SELECT 'XXZP_PERSONAL_SPEC_T', ROWIDTOCHAR(ROWID), UUID, HEADER_ID, CREATED_BY
          FROM XXZP.XXZP_PERSONAL_SPEC_T WHERE HEADER_ID = 677
        UNION ALL
        SELECT 'XXZP_JOB_COMPETENCY_T', ROWIDTOCHAR(ROWID), UUID, HEADER_ID, CREATED_BY
          FROM XXZP.XXZP_JOB_COMPETENCY_T WHERE HEADER_ID = 677) c
  LEFT JOIN XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T h
    ON h.HEADER_ID = c.HEADER_ID AND h.CREATED_BY = c.CREATED_BY
 ORDER BY c.T, OWNER_STATUS;

-- 3. Child rows per table owned by the InProcess creator: expect 1, 1, 1.
SELECT 'EVAL' AS T, COUNT(*) FROM XXZP.XXZP_INTERVIEW_EVAL_T
 WHERE HEADER_ID = 677 AND CREATED_BY = (SELECT CREATED_BY FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
                                          WHERE HEADER_ID = 677 AND STATUS = 'InProcess' AND INT_NO IS NULL)
UNION ALL
SELECT 'PSPEC', COUNT(*) FROM XXZP.XXZP_PERSONAL_SPEC_T
 WHERE HEADER_ID = 677 AND CREATED_BY = (SELECT CREATED_BY FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
                                          WHERE HEADER_ID = 677 AND STATUS = 'InProcess' AND INT_NO IS NULL)
UNION ALL
SELECT 'JCOMP', COUNT(*) FROM XXZP.XXZP_JOB_COMPETENCY_T
 WHERE HEADER_ID = 677 AND CREATED_BY = (SELECT CREATED_BY FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
                                          WHERE HEADER_ID = 677 AND STATUS = 'InProcess' AND INT_NO IS NULL);

-- 4. Nothing else points at 677 as an interview: expect 0 offers.
SELECT COUNT(*) AS OFFERS
  FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
 WHERE ATTRIBUTE10 IN (SELECT INT_NO FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = 677);

-- 5. Backup table names are free: expect no rows.
SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = 'XXZP' AND TABLE_NAME LIKE 'XXZP_DUPFIX_INT%';
