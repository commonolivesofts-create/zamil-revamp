-- Add the Arabic-only field used by salary-certificate-ar repository reads and writes.
-- Apply only after 00-precheck.sql confirms the table exists and EMP_NAME_LIST is absent.
ALTER TABLE XX_DIGI_SALARY_CERT_ARABIC
  ADD (EMP_NAME_LIST VARCHAR2(2000 CHAR));
