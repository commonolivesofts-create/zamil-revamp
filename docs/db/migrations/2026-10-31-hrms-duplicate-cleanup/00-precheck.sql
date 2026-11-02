-- HRMS-DUP-CLEAN-001 precheck (requisition 100800 and attachments): read-only. Run on the target
-- before 01..03 and compare with the expected values in the comments (TEST, ZPADWTEST,
-- 2026-10-31). If any value differs, STOP: the cleanup was written for these exact findings.
-- Interview 677 has its own scripts: 10-interview-677-precheck.sql .. 13-interview-677-rollback.sql.

-- 1. Requisition 100800: expect ROWS_ = 2 and DISTINCT_ROWS = 1 (the two rows are identical).
SELECT (SELECT COUNT(*) FROM XXZP.XXZPI_PER_REQUISITIONS_ALL
         WHERE REQUISITION_ID = 100800) AS ROWS_,
       (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM XXZP.XXZPI_PER_REQUISITIONS_ALL
                               WHERE REQUISITION_ID = 100800)) AS DISTINCT_ROWS
  FROM DUAL;

-- 2. Requisition 100800 references: expect 0 and 0.
SELECT (SELECT COUNT(*) FROM XXZP.XXZP_ALL_ATTACHMENTS
         WHERE FORM_HEADER_ID = 100800 AND FORM_NAME = 'Requisition') AS ATTACHMENTS,
       (SELECT COUNT(*) FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
         WHERE ATTRIBUTE4 = '100800') AS INTERVIEWS
  FROM DUAL;

-- 3. Attachments: expect DUP_IDS = 3564, DUP_ROWS = 7128, MAX_GROUP = 2.
SELECT COUNT(*) AS DUP_IDS, SUM(N) AS DUP_ROWS, MAX(N) AS MAX_GROUP
  FROM (SELECT COUNT(*) N FROM XXZP.XXZP_ALL_ATTACHMENTS GROUP BY HEADER_ID HAVING COUNT(*) > 1);

-- 4. Attachments: duplicate groups whose rows disagree on anything except ATTACHED_ON: expect 0.
--    Only groups that agree are cleaned; any group listed here needs a manual decision.
SELECT COUNT(*) AS DISAGREEING_GROUPS
  FROM (SELECT HEADER_ID
          FROM XXZP.XXZP_ALL_ATTACHMENTS
         GROUP BY HEADER_ID
        HAVING COUNT(*) > 1
           AND (COUNT(DISTINCT NVL(UUID, '~')) > 1
             OR COUNT(DISTINCT NVL(FORM_HEADER_ID, -1)) > 1
             OR COUNT(DISTINCT NVL(FORM_NAME, '~')) > 1
             OR COUNT(DISTINCT NVL(FILE_NAME, '~')) > 1));

-- 5. Backup table names are free: expect no rows.
SELECT TABLE_NAME FROM ALL_TABLES
 WHERE OWNER = 'XXZP' AND TABLE_NAME IN ('XXZP_DUPFIX_REQ_BAK', 'XXZP_DUPFIX_ATT_BAK');

-- 6. Unique constraints from HRMS-ID-UK-001 on these tables must not exist yet: expect no rows.
SELECT TABLE_NAME, CONSTRAINT_NAME
  FROM ALL_CONSTRAINTS
 WHERE OWNER = 'XXZP' AND CONSTRAINT_TYPE IN ('P', 'U')
   AND TABLE_NAME IN ('XXZPI_PER_REQUISITIONS_ALL', 'XXZP_ALL_ATTACHMENTS');
