-- Diagnostic: how employees' departments carry the GL cost center (codes and department names
-- only — no person data). Employees counted per department.
WITH asg AS (
  SELECT paam.organization_id, paam.default_code_comb_id
    FROM per_all_assignments_m paam
    JOIN fun_all_business_units_v bu ON bu.bu_id = paam.business_unit_id
   WHERE paam.assignment_type = 'E' AND paam.primary_flag = 'Y'
     AND paam.effective_latest_change = 'Y'
     AND TRUNC(SYSDATE) BETWEEN paam.effective_start_date AND paam.effective_end_date
     AND bu.bu_name IN ('IPP BU', 'FPP BU', 'APP BU')
)
SELECT * FROM (
  SELECT 'DEFAULT_ACCOUNT_SET' AS CHECK_NAME,
         CASE WHEN a.default_code_comb_id IS NULL THEN 'none' ELSE 'set' END AS ITEM,
         TO_CHAR(COUNT(*)) AS N
    FROM asg a
   GROUP BY CASE WHEN a.default_code_comb_id IS NULL THEN 'none' ELSE 'set' END
  UNION ALL
  -- The one default account that is set (pattern only)
  SELECT 'DEFAULT_ACCOUNT_EXAMPLE',
         gcc.segment1 || '.' || gcc.segment2 || '.' || gcc.segment3 || '.' || gcc.segment4 || '.' ||
         gcc.segment5 || '.' || gcc.segment6, TO_CHAR(COUNT(*))
    FROM asg a JOIN gl_code_combinations gcc ON gcc.code_combination_id = a.default_code_comb_id
   GROUP BY gcc.segment1, gcc.segment2, gcc.segment3, gcc.segment4, gcc.segment5, gcc.segment6
  UNION ALL
  -- Cost centre and location values with descriptions
  SELECT 'VALUES_' || vs.value_set_code, v.value || ' = ' || NVL(tl.description, '-') ||
         CASE WHEN v.enabled_flag = 'N' THEN ' (disabled)' END, '1'
    FROM fnd_vs_value_sets vs
    JOIN fnd_vs_values_b v ON v.value_set_id = vs.value_set_id
    LEFT JOIN fnd_vs_values_tl tl ON tl.value_id = v.value_id AND tl.language = USERENV('LANG')
   WHERE vs.value_set_code IN ('ZPI_CostCentre', 'ZPI_Location', 'ZPI_Company', 'ZPI_Product')
  UNION ALL
  -- Employees' work locations (codes) and BU
  SELECT 'EMPLOYEE_LOCATIONS', NVL(hla.location_code, '-') || ' / ' || bu.bu_name, TO_CHAR(COUNT(*))
    FROM per_all_assignments_m paam
    JOIN fun_all_business_units_v bu ON bu.bu_id = paam.business_unit_id
    LEFT JOIN hr_locations_all hla ON hla.location_id = paam.location_id
   WHERE paam.assignment_type = 'E' AND paam.primary_flag = 'Y' AND paam.effective_latest_change = 'Y'
     AND TRUNC(SYSDATE) BETWEEN paam.effective_start_date AND paam.effective_end_date
     AND bu.bu_name IN ('IPP BU', 'FPP BU', 'APP BU')
   GROUP BY hla.location_code, bu.bu_name
  UNION ALL
  -- Organization information contexts on the employees' departments
  SELECT 'DEPT_INFO_CONTEXTS', oi.org_information_context, TO_CHAR(COUNT(DISTINCT a.organization_id))
    FROM asg a
    JOIN hr_organization_information_f oi ON oi.organization_id = a.organization_id
     AND TRUNC(SYSDATE) BETWEEN oi.effective_start_date AND oi.effective_end_date
   GROUP BY oi.org_information_context
  UNION ALL
  -- Each department: name → GL cost center info (values only)
  SELECT 'DEPT_COST_CENTER',
         MAX(o.name) || ' => ' ||
         NVL(MAX(oi.org_information1), '-') || ' | ' || NVL(MAX(oi.org_information2), '-') || ' | ' ||
         NVL(MAX(oi.org_information3), '-') || ' | ' || NVL(MAX(oi.org_information4), '-') || ' | ' ||
         NVL(MAX(oi.org_information5), '-') || ' | ' || NVL(MAX(oi.org_information6), '-'),
         TO_CHAR(COUNT(*))
    FROM asg a
    JOIN hr_organization_units_f_tl o ON o.organization_id = a.organization_id
     AND o.language = USERENV('LANG')
     AND TRUNC(SYSDATE) BETWEEN o.effective_start_date AND o.effective_end_date
    LEFT JOIN hr_organization_information_f oi ON oi.organization_id = a.organization_id
     AND oi.org_information_context = 'PER_GL_COST_CENTER_INFO'
     AND TRUNC(SYSDATE) BETWEEN oi.effective_start_date AND oi.effective_end_date
   GROUP BY a.organization_id
)
ORDER BY 1, 2
