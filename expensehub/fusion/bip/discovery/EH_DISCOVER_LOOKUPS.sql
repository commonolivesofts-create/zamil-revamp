-- Diagnostic: the Payables invoice source and pay group lookup values (setup data only).
SELECT
  lv.lookup_type                                                  AS LOOKUP_TYPE,
  lv.lookup_code                                                  AS LOOKUP_CODE,
  lv.meaning                                                      AS MEANING,
  NVL(lv.enabled_flag, 'Y')                                       AS ENABLED
FROM fnd_lookup_values_vl lv
WHERE lv.lookup_type IN ('SOURCE', 'PAY GROUP', 'PAYMENT TERMS')
  AND lv.view_application_id = 200
ORDER BY lv.lookup_type, lv.lookup_code
