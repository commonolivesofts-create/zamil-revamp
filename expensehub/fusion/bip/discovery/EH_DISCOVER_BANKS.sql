-- Diagnostic: do the 5 test employees have a payroll bank account in HCM? Counts and flags only —
-- never account numbers or IBANs.
SELECT
  p.person_number                                                 AS PERSON_NUMBER,
  TO_CHAR(COUNT(DISTINCT ppm.personal_payment_method_id))         AS PAYMENT_METHODS,
  TO_CHAR(COUNT(DISTINCT ppm.bank_account_id))                    AS BANK_ACCOUNTS,
  TO_CHAR(MAX(ppm.bank_account_id))                               AS BANK_ACCOUNT_ID,
  MAX(CASE WHEN ba.iban IS NOT NULL THEN 'Y' ELSE 'N' END)        AS HAS_IBAN,
  MAX(ba.currency_code)                                           AS CURRENCY
FROM per_all_people_f p
JOIN pay_pay_relationships_dn prd
  ON  prd.person_id = p.person_id
JOIN pay_personal_payment_methods_f ppm
  ON  ppm.payroll_relationship_id = prd.payroll_relationship_id
  AND TRUNC(SYSDATE) BETWEEN ppm.effective_start_date AND ppm.effective_end_date
LEFT JOIN iby_ext_bank_accounts ba
  ON  ba.ext_bank_account_id = ppm.bank_account_id
WHERE p.person_number IN ('2172', '1653', '2280', '1854', '2502')
  AND TRUNC(SYSDATE) BETWEEN p.effective_start_date AND p.effective_end_date
GROUP BY p.person_number
ORDER BY p.person_number
