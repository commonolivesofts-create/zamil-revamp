-- ============================================================================================
-- EH_PAY_QUICK_PAYS — INT-05b: QuickPay results that Finance invoices through Payables (D-10)
-- Catalog:     /Custom/ExpenseHub/EH_PAY_QUICK_PAYS.xdo       Data source: ApplicationDB_HCM
-- Parameters:  P_ELEMENTS   (Text, comma-separated element names, e.g. Business Trip Allowance)
--              P_FROM_DATE  (Text, YYYY-MM-DD; ExpenseHub sends today − 90)
-- Run by:      ExpenseHub nightly 02:00 + on demand
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  quickPayCsv
-- Key:         PAYROLL_ACTION_ID + RUN_RESULT_ID (one row per element result)
--
-- EDIT before use:  bu_map (same as EH_HCM_EMPLOYEES).
-- VERIFY in the test pod: QuickPay action type 'Q'; run result status values; that the element
--                   names in P_ELEMENTS match PAY_ELEMENT_TYPES_F.BASE_ELEMENT_NAME (OQ-07).
-- ============================================================================================
WITH params AS (
  SELECT NVL(TO_DATE(:P_FROM_DATE, 'YYYY-MM-DD'), TRUNC(SYSDATE) - 90) AS from_date,
         ',' || :P_ELEMENTS || ','                                      AS element_list
    FROM dual
),
bu_map AS (                                                    -- EDIT: Fusion BU names
  SELECT 'IPP BU' AS bu_name, 'IPP' AS bu_code FROM dual UNION ALL
  SELECT 'FPP BU', AS bu_name           'FPP'    AS bu_code        FROM dual UNION ALL
  SELECT 'APP BU', AS bu_name           'APP'    AS bu_code        FROM dual
)
SELECT
  TO_CHAR(ppa.payroll_action_id)                                  AS PAYROLL_ACTION_ID,
  TO_CHAR(prr.run_result_id)                                      AS RUN_RESULT_ID,
  TO_CHAR(pprd.person_id)                                         AS PERSON_ID,
  pet.base_element_name                                           AS ELEMENT_NAME,
  TO_CHAR(ROUND(TO_NUMBER(prrv.result_value), 2), 'FM999999999990.00') AS PAY_VALUE,
  TO_CHAR(ppa.effective_date, 'YYYY-MM-DD')                       AS EFFECTIVE_DATE,
  bm.bu_code                                                      AS BU_CODE
FROM params prm
JOIN pay_payroll_actions ppa
  ON  ppa.action_type = 'Q'                                       -- VERIFY: QuickPay
  AND ppa.effective_date >= prm.from_date
JOIN pay_payroll_rel_actions ppra
  ON  ppra.payroll_action_id = ppa.payroll_action_id
  AND ppra.action_status = 'C'                                    -- completed
JOIN pay_pay_relationships_dn pprd
  ON  pprd.payroll_relationship_id = ppra.payroll_relationship_id
JOIN pay_run_results prr
  ON  prr.payroll_rel_action_id = ppra.payroll_rel_action_id
JOIN pay_element_types_f pet
  ON  pet.element_type_id = prr.element_type_id
  AND ppa.effective_date BETWEEN pet.effective_start_date AND pet.effective_end_date
JOIN pay_input_values_f piv
  ON  piv.element_type_id = pet.element_type_id
  AND piv.base_name = 'Pay Value'
  AND ppa.effective_date BETWEEN piv.effective_start_date AND piv.effective_end_date
JOIN pay_run_result_values prrv
  ON  prrv.run_result_id = prr.run_result_id
  AND prrv.input_value_id = piv.input_value_id
JOIN per_all_assignments_m paam                                   -- BU at the effective date
  ON  paam.person_id = pprd.person_id
  AND paam.assignment_type = 'E'
  AND paam.primary_flag = 'Y'
  AND paam.effective_latest_change = 'Y'
  AND ppa.effective_date BETWEEN paam.effective_start_date AND paam.effective_end_date
JOIN fun_all_business_units_v bu
  ON  bu.bu_id = paam.business_unit_id
JOIN bu_map bm
  ON  bm.bu_name = bu.bu_name
WHERE INSTR(prm.element_list, ',' || pet.base_element_name || ',') > 0
  AND TO_NUMBER(prrv.result_value) <> 0
ORDER BY ppa.effective_date, ppa.payroll_action_id, prr.run_result_id