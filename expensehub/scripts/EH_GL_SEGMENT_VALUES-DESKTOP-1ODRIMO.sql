-- ============================================================================================
-- EH_GL_SEGMENT_VALUES — INT-04: values of the 6 chart-of-accounts segments
-- Catalog:     /Custom/ExpenseHub/EH_GL_SEGMENT_VALUES.xdo    Data source: ApplicationDB_FSCM
-- Parameters:  none
-- Run by:      ExpenseHub nightly 01:30 (full extract — a value missing here is disabled)
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  glSegmentValueCsv
--
-- COA (D-12): Company.Location.CostCenter.Account.000.000000, e.g. IPP.003.127.55251.000.000000
--
-- EDIT before use:  the six value set codes in seg_map (Setup and Maintenance → Manage Chart of
--                   Accounts Value Sets; OQ-14). Two segments may share a value set.
-- VERIFY in the test pod: FND_VS_VALUES_B.SUMMARY_FLAG (parent values are left out).
-- ============================================================================================
WITH seg_map AS (                                              -- EDIT: value set codes
  SELECT 'COMPANY'     AS segment, 'ZPI_Company'     AS value_set_code FROM dual UNION ALL
  SELECT 'LOCATION',               'ZPI_Location'                      FROM dual UNION ALL
  SELECT 'COST_CENTER',            'ZPI_CostCentre'                   FROM dual UNION ALL
  SELECT 'ACCOUNT',                'ZPI_Account'                       FROM dual UNION ALL
  SELECT 'SEGMENT5',               'ZPI_Product'                     FROM dual UNION ALL
  SELECT 'SEGMENT6',               'ZPI_Detailed_Ledger'                     FROM dual
)
SELECT
  sm.segment                                                      AS SEGMENT,
  v.value                                                         AS VALUE,
  NVL(tl.description, tl.translated_value)                        AS DESCRIPTION,
  NVL(v.enabled_flag, 'N')                                        AS ENABLED_FLAG,
  TO_CHAR(v.start_date_active, 'YYYY-MM-DD')                      AS START_DATE,
  TO_CHAR(v.end_date_active,   'YYYY-MM-DD')                      AS END_DATE
FROM seg_map sm
JOIN fnd_vs_value_sets vs
  ON  vs.value_set_code = sm.value_set_code
JOIN fnd_vs_values_b v
  ON  v.value_set_id = vs.value_set_id
LEFT JOIN fnd_vs_values_tl tl
  ON  tl.value_id = v.value_id
  AND tl.language = USERENV('LANG')
WHERE NVL(v.summary_flag, 'N') = 'N'                              -- postable (child) values only
ORDER BY sm.segment, v.value