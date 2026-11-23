-- Destructive: this removes all EMP_NAME_LIST values written after the migration.
-- Preserve those values before running the rollback.
ALTER TABLE XX_DIGI_SALARY_CERT_ARABIC
  DROP COLUMN EMP_NAME_LIST;
