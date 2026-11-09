-- Diagnostic: payee ids of the 5 test employee suppliers (ids only).
SELECT
  ps.segment1                                                     AS SUPPLIER_NUMBER,
  TO_CHAR(ps.party_id)                                            AS PARTY_ID,
  TO_CHAR(iep.ext_payee_id)                                       AS PAYEE_ID,
  NVL(TO_CHAR(iep.supplier_site_id), '-')                         AS SUPPLIER_SITE_ID,
  NVL(TO_CHAR(iep.party_site_id), '-')                            AS PARTY_SITE_ID,
  NVL(TO_CHAR(iep.org_id), '-')                                   AS ORG_ID,
  iep.payment_function                                            AS PAYMENT_FUNCTION
FROM poz_suppliers ps
JOIN iby_external_payees_all iep
  ON iep.payee_party_id = ps.party_id
WHERE ps.segment1 IN ('10023', '10035', '10036', '10037', '10038')
ORDER BY ps.segment1, iep.ext_payee_id
