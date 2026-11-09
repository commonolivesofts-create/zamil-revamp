-- ============================================================================================
-- EH_HCM_EMPLOYEES — INT-01/02/03: employees, supervisor, BU, default expense account
-- Catalog:     /Custom/ExpenseHub/EH_HCM_EMPLOYEES.xdo        Data source: ApplicationDB_HCM
-- Parameter:   P_AS_OF_DATE  (Text, YYYY-MM-DD; blank = today)
-- Run by:      ExpenseHub nightly 01:00 (full extract — an employee missing here is deactivated)
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  hcmEmployeeCsv
--
-- D-55: 169 of 170 employees have no default expense account in HCM; it is built from the
-- department → GL cost centre ("X Department" → "X Section"). Location 003 Dammam for all BUs
-- (confirmed 24 Oct 2026).
-- ============================================================================================
WITH params AS (
  SELECT NVL(TO_DATE(:P_AS_OF_DATE, 'YYYY-MM-DD'), TRUNC(SYSDATE)) AS as_of FROM dual
),
bu_map AS (                                                    -- Fusion BU names (read from the test pod, 22 Oct 2026)
  -- location_seg: D-55 Location segment per BU — 003 Dammam for all three (confirmed 24 Oct 2026).
  SELECT 'IPP BU' AS bu_name, 'IPP' AS bu_code, '003' AS location_seg FROM dual UNION ALL
  SELECT 'FPP BU',            'FPP',            '003'                 FROM dual UNION ALL
  SELECT 'APP BU',            'APP',            '003'                 FROM dual
),
-- D-55: GL cost centre of each "<X> Department" = the ZPI_CostCentre value described "<X> Section"
-- (or exactly the department name, e.g. "Product Development").
cost_centres AS (
  SELECT UPPER(TRIM(tl.description)) AS name_key, MIN(v.value) AS cost_centre
    FROM fnd_vs_value_sets vs
    JOIN fnd_vs_values_b v  ON v.value_set_id = vs.value_set_id
    JOIN fnd_vs_values_tl tl ON tl.value_id = v.value_id AND tl.language = USERENV('LANG')
   WHERE vs.value_set_code = 'ZPI_CostCentre'
     AND v.enabled_flag = 'Y'
   GROUP BY UPPER(TRIM(tl.description))
)
SELECT
  TO_CHAR(papf.person_id)                                         AS PERSON_ID,
  papf.person_number                                              AS PERSON_NUMBER,
  ppnf.display_name                                               AS FULL_NAME,
  pea.email_address                                               AS EMAIL,
  ( SELECT MAX(NVL2(ph.country_code_number, '+' || ph.country_code_number, NULL) || ph.phone_number)
             KEEP (DENSE_RANK FIRST ORDER BY DECODE(ph.phone_type, 'WM', 1, 2))
      FROM per_phones ph
     WHERE ph.person_id = papf.person_id
       AND ph.phone_type IN ('WM', 'HM')                          -- VERIFY: work / home mobile
       AND prm.as_of BETWEEN NVL(ph.date_from, prm.as_of) AND NVL(ph.date_to, prm.as_of)
  )                                                               AS MOBILE,
  TO_CHAR(paam.assignment_id)                                     AS ASSIGNMENT_ID,
  bm.bu_code                                                      AS BU_CODE,
  pj.name                                                         AS JOB_NAME,
  ( SELECT MAX(hla.location_code) FROM hr_locations_all hla
     WHERE hla.location_id = paam.location_id )                   AS LOCATION_CODE,
  TO_CHAR(pasf.manager_id)                                        AS SUPERVISOR_PERSON_ID,
  -- The HCM default expense account when set; otherwise (D-55) built from the department's
  -- cost centre: Company = BU, Location = BU default, Account 00000 (every expense type puts its
  -- own natural account here), Product 000, Detailed ledger 0000000.
  CASE
    WHEN gcc.code_combination_id IS NOT NULL THEN
      gcc.segment1 || '.' || gcc.segment2 || '.' || gcc.segment3 || '.' ||
      gcc.segment4 || '.' || gcc.segment5 || '.' || gcc.segment6
    WHEN cc.cost_centre IS NOT NULL THEN
      bm.bu_code || '.' || bm.location_seg || '.' || cc.cost_centre || '.00000.000.0000000'
  END                                                             AS DEFAULT_EXPENSE_ACCOUNT,
  CASE WHEN paam.assignment_status_type = 'ACTIVE' THEN 'Y' ELSE 'N' END AS ACTIVE_FLAG
FROM params prm
JOIN per_all_people_f papf
  ON prm.as_of BETWEEN papf.effective_start_date AND papf.effective_end_date
JOIN per_person_names_f ppnf
  ON  ppnf.person_id = papf.person_id
  AND ppnf.name_type = 'GLOBAL'
  AND prm.as_of BETWEEN ppnf.effective_start_date AND ppnf.effective_end_date
JOIN per_all_assignments_m paam
  ON  paam.person_id = papf.person_id
  AND paam.assignment_type = 'E'                                  -- employee assignments only
  AND paam.primary_flag = 'Y'
  AND paam.effective_latest_change = 'Y'
  AND prm.as_of BETWEEN paam.effective_start_date AND paam.effective_end_date
JOIN fun_all_business_units_v bu
  ON  bu.bu_id = paam.business_unit_id
JOIN bu_map bm
  ON  bm.bu_name = bu.bu_name                                     -- only IPP / FPP / APP people
LEFT JOIN per_email_addresses pea
  ON  pea.email_address_id = papf.primary_email_id
LEFT JOIN per_jobs_f_tl pj
  ON  pj.job_id = paam.job_id
  AND pj.language = USERENV('LANG')
  AND prm.as_of BETWEEN pj.effective_start_date AND pj.effective_end_date
LEFT JOIN per_assignment_supervisors_f pasf
  ON  pasf.assignment_id = paam.assignment_id
  AND pasf.manager_type = 'LINE_MANAGER'
  AND pasf.primary_flag = 'Y'
  AND prm.as_of BETWEEN pasf.effective_start_date AND pasf.effective_end_date
LEFT JOIN gl_code_combinations gcc
  ON  gcc.code_combination_id = paam.default_code_comb_id
LEFT JOIN hr_organization_units_f_tl dept
  ON  dept.organization_id = paam.organization_id
  AND dept.language = USERENV('LANG')
  AND prm.as_of BETWEEN dept.effective_start_date AND dept.effective_end_date
LEFT JOIN cost_centres cc
  ON  cc.name_key = UPPER(TRIM(REPLACE(dept.name, ' Department', ' Section')))
   OR cc.name_key = UPPER(TRIM(dept.name))
ORDER BY papf.person_number
