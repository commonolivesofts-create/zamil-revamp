-- HRMS-DUP-CLEAN-001 backup (requisition 100800 and attachments). NOT APPLIED. Creates backup
-- tables holding every row the cleanup touches (CTAS commits implicitly). Run after
-- 00-precheck.sql matched, as the XXZP owner. Keep these tables until the owner signs off;
-- 04-rollback.sql restores from them.

CREATE TABLE XXZP.XXZP_DUPFIX_REQ_BAK AS
  SELECT ROWIDTOCHAR(t.ROWID) AS ORIG_ROWID, SYSDATE AS BACKED_UP_ON, t.*
    FROM XXZP.XXZPI_PER_REQUISITIONS_ALL t
   WHERE t.REQUISITION_ID = 100800;

CREATE TABLE XXZP.XXZP_DUPFIX_ATT_BAK AS
  SELECT ROWIDTOCHAR(t.ROWID) AS ORIG_ROWID, SYSDATE AS BACKED_UP_ON, t.*
    FROM XXZP.XXZP_ALL_ATTACHMENTS t
   WHERE t.HEADER_ID IN (SELECT HEADER_ID FROM XXZP.XXZP_ALL_ATTACHMENTS
                          GROUP BY HEADER_ID HAVING COUNT(*) > 1);

-- Verification: expect REQ 2, ATT 7128 (TEST figures).
SELECT 'REQ' T, COUNT(*) FROM XXZP.XXZP_DUPFIX_REQ_BAK UNION ALL
SELECT 'ATT', COUNT(*) FROM XXZP.XXZP_DUPFIX_ATT_BAK;
