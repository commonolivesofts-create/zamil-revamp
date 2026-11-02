-- HRMS-DUP-CLEAN-001 verification (requisition 100800 and attachments): read-only. Run in the
-- same session as 02-cleanup.sql, before COMMIT. Every value must match the expectation in the
-- comment; otherwise ROLLBACK.

-- No duplicate IDs remain: expect 0 and 0.
SELECT (SELECT COUNT(*) FROM (SELECT 1 FROM XXZP.XXZPI_PER_REQUISITIONS_ALL
                               GROUP BY REQUISITION_ID HAVING COUNT(*) > 1)) AS REQ_DUPS,
       (SELECT COUNT(*) FROM (SELECT 1 FROM XXZP.XXZP_ALL_ATTACHMENTS
                               GROUP BY HEADER_ID HAVING COUNT(*) > 1)) AS ATT_DUPS
  FROM DUAL;

-- Every backed-up key still exists exactly once: expect REQ 1, ATT_MISSING 0.
SELECT (SELECT COUNT(*) FROM XXZP.XXZPI_PER_REQUISITIONS_ALL WHERE REQUISITION_ID = 100800) AS REQ,
       (SELECT COUNT(*) FROM (SELECT DISTINCT HEADER_ID FROM XXZP.XXZP_DUPFIX_ATT_BAK
                              MINUS SELECT HEADER_ID FROM XXZP.XXZP_ALL_ATTACHMENTS)) AS ATT_MISSING
  FROM DUAL;

-- Attachment rows removed: expect 3564 (TEST figure).
SELECT (SELECT COUNT(*) FROM XXZP.XXZP_DUPFIX_ATT_BAK) - (SELECT COUNT(*) FROM XXZP.XXZP_ALL_ATTACHMENTS
         WHERE HEADER_ID IN (SELECT HEADER_ID FROM XXZP.XXZP_DUPFIX_ATT_BAK)) AS ATT_ROWS_REMOVED
  FROM DUAL;
