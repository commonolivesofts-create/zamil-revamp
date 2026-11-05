-- LETTERS-SCHEMA-001 rollback. NOT APPLIED. Run as the application schema owner.
-- WARNING: dropping removes data. Run only if 01-migration.sql must be undone, and only after
-- exporting any business visa letters and certificate addressees saved since it was applied.

DROP TABLE XX_DIGI_BUSINESS_VISA_LETTERS PURGE;

ALTER TABLE XX_DIGI_SALARY_CERT DROP COLUMN TO_EMP_NAME;
ALTER TABLE XX_DIGI_SALARY_CERT_ARABIC DROP COLUMN TO_EMP_NAME;
