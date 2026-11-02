-- HRMS-ID-UK-001: unique constraints on HRMS ID columns that have no primary or unique key.
-- NOT APPLIED. For DBA review; gate G1 (and G4: CI3 inserts into these tables too).
--
-- Preconditions (TEST first, then each further environment):
--   1. 00-duplicate-check.sql returns DUPLICATE_IDS = 0 and NULL_IDS = 0 for every table below.
--   2. No uncommitted transactions on these tables (ALTER TABLE takes a short exclusive lock).
--   3. Run as the XXZP schema owner (or a user with ALTER on these tables and CREATE INDEX).
-- Effect: Oracle builds a unique index per constraint. A duplicate insert (for example a CI3
-- MAX+1 collision with an identity value) then fails with ORA-00001 instead of being stored.
-- DDL commits implicitly; the rollback is 02-rollback.sql.
--
-- TEST results of 00-duplicate-check.sql on 2026-10-31 (ZPADWTEST): the five tables below are
-- clean. The three tables at the end are NOT included: they hold duplicate IDs (see README.md).

ALTER TABLE XXZP.XXZP_PAF_PROBATION_HEADER
  ADD CONSTRAINT XXZP_PAF_PROB_HDR_ID_UK UNIQUE (HEADER_ID);

ALTER TABLE XXZP.XXZP_PAF_PROBATION_LINES
  ADD CONSTRAINT XXZP_PAF_PROB_LINES_ID_UK UNIQUE (LINE_ID);

ALTER TABLE XXZP.XXZP_NEW_HIRETRAINING_SS_HDR_T
  ADD CONSTRAINT XXZP_NHT_SS_HDR_ID_UK UNIQUE (HEADER_ID);

ALTER TABLE XXZP.XXZP_NEW_HIRETRAIN_SS_LINE_T
  ADD CONSTRAINT XXZP_NHT_SS_LINE_ID_UK UNIQUE (DEP_LINE_ID);

ALTER TABLE XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
  ADD CONSTRAINT XXZP_EMP_OFFER_HDR_ID_UK UNIQUE (HEADER_ID);

-- Already keyed (no change): XXZP_NEW_HIRETRAIN_PROD_HDR_T (PK SYS_C0066104),
-- XXZP_NEW_HIRETRA_PROD_LINES_T (PK SYS_C0066106), XXZP_NHT_MASTER_FLAG (PK SYS_C0066108).

-- BLOCKED until the owner decides how to resolve the duplicates (data change, separate approval):
-- ALTER TABLE XXZP.XXZPI_PER_REQUISITIONS_ALL     ADD CONSTRAINT XXZPI_PER_REQ_ID_UK    UNIQUE (REQUISITION_ID);
-- ALTER TABLE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T ADD CONSTRAINT XXZP_INTVW_HDR_ID_UK   UNIQUE (HEADER_ID);
-- ALTER TABLE XXZP.XXZP_ALL_ATTACHMENTS           ADD CONSTRAINT XXZP_ALL_ATTACH_ID_UK  UNIQUE (HEADER_ID);

-- Verification (read-only): expect 5 rows, STATUS = ENABLED, VALIDATED = VALIDATED.
SELECT TABLE_NAME, CONSTRAINT_NAME, STATUS, VALIDATED
  FROM ALL_CONSTRAINTS
 WHERE OWNER = 'XXZP'
   AND CONSTRAINT_NAME IN ('XXZP_PAF_PROB_HDR_ID_UK', 'XXZP_PAF_PROB_LINES_ID_UK',
                           'XXZP_NHT_SS_HDR_ID_UK', 'XXZP_NHT_SS_LINE_ID_UK',
                           'XXZP_EMP_OFFER_HDR_ID_UK');
