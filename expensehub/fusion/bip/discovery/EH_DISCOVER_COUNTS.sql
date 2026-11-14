-- Diagnostic (D-44): counts behind the ExpenseHub report filters. Aggregates only — no person data.
SELECT * FROM (
  -- Employees (primary 'E' assignments today) per business unit name
  SELECT 'EMPLOYEES_BY_BU' AS CHECK_NAME, bu.bu_name AS ITEM, TO_CHAR(COUNT(*)) AS N
    FROM per_all_assignments_m paam
    JOIN fun_all_business_units_v bu ON bu.bu_id = paam.business_unit_id
   WHERE paam.assignment_type = 'E' AND paam.primary_flag = 'Y'
     AND paam.effective_latest_change = 'Y'
     AND TRUNC(SYSDATE) BETWEEN paam.effective_start_date AND paam.effective_end_date
   GROUP BY bu.bu_name
  UNION ALL
  -- Assignment types present today (in case employees are not 'E')
  SELECT 'ASSIGNMENT_TYPES', paam.assignment_type || ' / primary ' || paam.primary_flag, TO_CHAR(COUNT(*))
    FROM per_all_assignments_m paam
   WHERE TRUNC(SYSDATE) BETWEEN paam.effective_start_date AND paam.effective_end_date
     AND paam.effective_latest_change = 'Y'
   GROUP BY paam.assignment_type, paam.primary_flag
  UNION ALL
  -- Absence types with entries in the last 365 days, by approval status
  SELECT 'ABSENCE_TYPES', aat.name || ' [' || apae.approval_status_cd || ']', TO_CHAR(COUNT(*))
    FROM anc_per_abs_entries apae
    JOIN anc_absence_types_f_tl aat
      ON aat.absence_type_id = apae.absence_type_id AND aat.language = USERENV('LANG')
     AND apae.start_date BETWEEN aat.effective_start_date AND aat.effective_end_date
   WHERE apae.start_date >= TRUNC(SYSDATE) - 365
   GROUP BY aat.name, apae.approval_status_cd
  UNION ALL
  -- Payroll action types in the last 365 days
  SELECT 'PAYROLL_ACTION_TYPES', ppa.action_type, TO_CHAR(COUNT(*))
    FROM pay_payroll_actions ppa
   WHERE ppa.effective_date >= TRUNC(SYSDATE) - 365
   GROUP BY ppa.action_type
  UNION ALL
  -- Elements paid by QuickPay ('Q') in the last 365 days
  SELECT 'QUICKPAY_ELEMENTS', pet.base_element_name, TO_CHAR(COUNT(*))
    FROM pay_payroll_actions ppa
    JOIN pay_payroll_rel_actions ppra ON ppra.payroll_action_id = ppa.payroll_action_id
    JOIN pay_run_results prr ON prr.payroll_rel_action_id = ppra.payroll_rel_action_id
    JOIN pay_element_types_f pet ON pet.element_type_id = prr.element_type_id
     AND ppa.effective_date BETWEEN pet.effective_start_date AND pet.effective_end_date
   WHERE ppa.action_type = 'Q' AND ppa.effective_date >= TRUNC(SYSDATE) - 365
   GROUP BY pet.base_element_name
  UNION ALL
  -- Value sets that contain the chart-of-accounts values of D-12 (IPP.003.127.55251.000.000000)
  SELECT 'COA_VALUE_SETS', vs.value_set_code || ' e.g. ' || MIN(v.value), TO_CHAR(COUNT(*))
    FROM fnd_vs_values_b v
    JOIN fnd_vs_value_sets vs ON vs.value_set_id = v.value_set_id
   WHERE v.value IN ('IPP','FPP','APP','003','127','55251','55210','000','000000')
   GROUP BY vs.value_set_code
  UNION ALL
  -- Segment 6 candidates: value sets whose code looks like "detail ledger", with value counts
  SELECT 'LEDGER_VALUE_SETS', vs.value_set_code || ' e.g. ' || MIN(v.value), TO_CHAR(COUNT(v.value_id))
    FROM fnd_vs_value_sets vs
    LEFT JOIN fnd_vs_values_b v ON v.value_set_id = vs.value_set_id
   WHERE UPPER(vs.value_set_code) LIKE '%LEDGER%' OR UPPER(vs.value_set_code) LIKE '%DETAIL%'
   GROUP BY vs.value_set_code
  UNION ALL
  -- Daily rates in the last 365 days by target currency and conversion type
  SELECT 'DAILY_RATES', gdr.to_currency || ' / ' || gdct.user_conversion_type || ' / latest ' ||
         TO_CHAR(MAX(gdr.conversion_date), 'YYYY-MM-DD'), TO_CHAR(COUNT(*))
    FROM gl_daily_rates gdr
    JOIN gl_daily_conversion_types gdct ON gdct.conversion_type = gdr.conversion_type
   WHERE gdr.conversion_date >= TRUNC(SYSDATE) - 365
   GROUP BY gdr.to_currency, gdct.user_conversion_type
  UNION ALL
  -- QuickPay results in the last 90 days by element classification (amounts summed)
  SELECT 'QUICKPAY_CLASSIFICATIONS', pec.base_classification_name || ' / total ' ||
         TO_CHAR(SUM(TO_NUMBER(prrv.result_value))), TO_CHAR(COUNT(DISTINCT ppra.payroll_rel_action_id))
    FROM pay_payroll_actions ppa
    JOIN pay_payroll_rel_actions ppra ON ppra.payroll_action_id = ppa.payroll_action_id
    JOIN pay_run_results prr ON prr.payroll_rel_action_id = ppra.payroll_rel_action_id
    JOIN pay_element_types_f pet ON pet.element_type_id = prr.element_type_id
     AND ppa.effective_date BETWEEN pet.effective_start_date AND pet.effective_end_date
    JOIN pay_ele_classifications pec ON pec.classification_id = pet.classification_id
    JOIN pay_input_values_f piv ON piv.element_type_id = pet.element_type_id AND piv.base_name = 'Pay Value'
     AND ppa.effective_date BETWEEN piv.effective_start_date AND piv.effective_end_date
    JOIN pay_run_result_values prrv ON prrv.run_result_id = prr.run_result_id
     AND prrv.input_value_id = piv.input_value_id
   WHERE ppa.action_type = 'Q' AND ppa.effective_date >= TRUNC(SYSDATE) - 90
   GROUP BY pec.base_classification_name
  UNION ALL
  -- The employee suppliers Finance created (10035–10038): type, employee link, name match
  SELECT 'EMPLOYEE_SUPPLIERS',
         ps.segment1 || ' type=' || NVL(ps.vendor_type_lookup_code, '-') ||
         ' employee_id=' || NVL(TO_CHAR(ps.employee_id), 'none') ||
         ' name_matches_person=' || (SELECT MAX(p.person_number) FROM per_person_names_f n
                                       JOIN per_all_people_f p ON p.person_id = n.person_id
                                      WHERE n.name_type = 'GLOBAL'
                                        AND TRUNC(SYSDATE) BETWEEN n.effective_start_date AND n.effective_end_date
                                        AND TRUNC(SYSDATE) BETWEEN p.effective_start_date AND p.effective_end_date
                                        AND UPPER(TRIM(n.display_name)) = UPPER(TRIM(hp.party_name))) ||
         ' sites=' || (SELECT COUNT(*) FROM poz_supplier_sites_all_m s WHERE s.vendor_id = ps.vendor_id),
         '1'
    FROM poz_suppliers ps
    JOIN hz_parties hp ON hp.party_id = ps.party_id
   WHERE ps.segment1 IN ('10035', '10036', '10037', '10038')
  UNION ALL
  -- Their sites: name, pay flag, procurement BU, dates, client-BU assignments
  SELECT 'EMPLOYEE_SUPPLIER_SITES',
         ps.segment1 || ' site=' || s.vendor_site_code || ' pay=' || NVL(s.pay_site_flag, '-') ||
         ' prc_bu=' || NVL((SELECT b.bu_name FROM fun_all_business_units_v b WHERE b.bu_id = s.prc_bu_id), '-') ||
         ' latest=' || NVL(s.effective_latest_change, '-') ||
         ' dates=' || TO_CHAR(s.effective_start_date, 'YYYY-MM-DD') || '..' || TO_CHAR(s.effective_end_date, 'YYYY-MM-DD') ||
         ' inactive=' || NVL(TO_CHAR(s.inactive_date, 'YYYY-MM-DD'), '-') ||
         ' assigned_bus=' || (SELECT COUNT(*) FROM poz_site_assignments_all_m a WHERE a.vendor_site_id = s.vendor_site_id),
         '1'
    FROM poz_suppliers ps
    JOIN poz_supplier_sites_all_m s ON s.vendor_id = ps.vendor_id
   WHERE ps.segment1 IN ('10023', '10035', '10036', '10037', '10038')
  UNION ALL
  -- Their bank set-up: payee records and bank-account instrument uses (counts only)
  SELECT 'EMPLOYEE_SUPPLIER_BANKS',
         ps.segment1 || ' payees=' ||
         (SELECT COUNT(*) FROM iby_external_payees_all iep WHERE iep.payee_party_id = ps.party_id) ||
         ' bank_uses=' ||
         (SELECT COUNT(*) FROM iby_external_payees_all iep
            JOIN iby_pmt_instr_uses_all u ON u.ext_pmt_party_id = iep.ext_payee_id
           WHERE iep.payee_party_id = ps.party_id AND u.instrument_type = 'BANKACCOUNT') ||
         ' accounts_owned=' ||
         (SELECT COUNT(*) FROM iby_account_owners o WHERE o.account_owner_party_id = ps.party_id),
         '1'
    FROM poz_suppliers ps
   WHERE ps.segment1 IN ('10023', '10035', '10036', '10037', '10038')
  UNION ALL
  -- Suppliers whose number equals a person number (D-42)
  SELECT 'SUPPLIERS_MATCHING_PERSON_NUMBERS', 'count', TO_CHAR(COUNT(*))
    FROM poz_suppliers ps
   WHERE EXISTS (SELECT 1 FROM per_all_people_f p WHERE p.person_number = ps.segment1)
)
ORDER BY 1, 2
