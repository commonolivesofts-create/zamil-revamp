-- ============================================================================================
-- TH_HCM_EMPLOYEES — employees for TrainingHub (the only Fusion data TrainingHub reads)
-- Catalog:     /Custom/TrainingHub/TH_HCM_EMPLOYEES.xdo        Data source: ApplicationDB_HCM
-- Parameter:   P_AS_OF_DATE  (Text, YYYY-MM-DD; blank = today)
-- Run by:      TrainingHub nightly sync (full extract — an employee missing here is deactivated)
-- Mapper:      apps/api/src/integrations/fusion/employees.ts
-- Same population as ExpenseHub's EH_HCM_EMPLOYEES (IPP / FPP / APP), plus department,
-- position and grade, which the Job Skills Matrix uses to map people to positions.
-- ============================================================================================
WITH params AS (
  SELECT NVL(TO_DATE(:P_AS_OF_DATE, 'YYYY-MM-DD'), TRUNC(SYSDATE)) AS as_of FROM dual
),
bu_map AS (
  SELECT 'IPP BU' AS bu_name, 'IPP' AS bu_code FROM dual UNION ALL
  SELECT 'FPP BU',            'FPP'            FROM dual UNION ALL
  SELECT 'APP BU',            'APP'            FROM dual
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
       AND ph.phone_type IN ('WM', 'HM')
       AND prm.as_of BETWEEN NVL(ph.date_from, prm.as_of) AND NVL(ph.date_to, prm.as_of)
  )                                                               AS MOBILE,
  TO_CHAR(paam.assignment_id)                                     AS ASSIGNMENT_ID,
  bm.bu_code                                                      AS BU_CODE,
  pj.name                                                         AS JOB_NAME,
  dept.name                                                       AS DEPARTMENT_NAME,
  pos.name                                                        AS POSITION_NAME,
  grd.name                                                        AS GRADE_NAME,
  ( SELECT MAX(hla.location_code) FROM hr_locations_all hla
     WHERE hla.location_id = paam.location_id )                   AS LOCATION_CODE,
  TO_CHAR(pasf.manager_id)                                        AS SUPERVISOR_PERSON_ID,
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
  AND paam.assignment_type = 'E'
  AND paam.primary_flag = 'Y'
  AND paam.effective_latest_change = 'Y'
  AND prm.as_of BETWEEN paam.effective_start_date AND paam.effective_end_date
JOIN fun_all_business_units_v bu
  ON  bu.bu_id = paam.business_unit_id
JOIN bu_map bm
  ON  bm.bu_name = bu.bu_name
LEFT JOIN per_email_addresses pea
  ON  pea.email_address_id = papf.primary_email_id
LEFT JOIN per_jobs_f_tl pj
  ON  pj.job_id = paam.job_id
  AND pj.language = USERENV('LANG')
  AND prm.as_of BETWEEN pj.effective_start_date AND pj.effective_end_date
LEFT JOIN hr_organization_units_f_tl dept
  ON  dept.organization_id = paam.organization_id
  AND dept.language = USERENV('LANG')
  AND prm.as_of BETWEEN dept.effective_start_date AND dept.effective_end_date
LEFT JOIN hr_all_positions_f_tl pos
  ON  pos.position_id = paam.position_id
  AND pos.language = USERENV('LANG')
  AND prm.as_of BETWEEN pos.effective_start_date AND pos.effective_end_date
LEFT JOIN per_grades_f_tl grd
  ON  grd.grade_id = paam.grade_id
  AND grd.language = USERENV('LANG')
  AND prm.as_of BETWEEN grd.effective_start_date AND grd.effective_end_date
LEFT JOIN per_assignment_supervisors_f pasf
  ON  pasf.assignment_id = paam.assignment_id
  AND pasf.manager_type = 'LINE_MANAGER'
  AND pasf.primary_flag = 'Y'
  AND prm.as_of BETWEEN pasf.effective_start_date AND pasf.effective_end_date
ORDER BY papf.person_number
