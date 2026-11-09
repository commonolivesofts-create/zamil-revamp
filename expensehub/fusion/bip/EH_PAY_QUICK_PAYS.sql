-- ============================================================================================
-- EH_PAY_QUICK_PAYS — INT-05b: QuickPays that Finance invoices through Payables (D-10, D-48)
-- Catalog:     /Custom/ExpenseHub/EH_PAY_QUICK_PAYS.xdo       Data source: ApplicationDB_HCM
-- Parameters:  P_ELEMENTS   (Text, optional comma-separated element names; blank = every QuickPay)
--              P_FROM_DATE  (Text, YYYY-MM-DD; ExpenseHub sends today − 90)
-- Run by:      ExpenseHub nightly 02:00 + on demand
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  quickPayCsv
--
-- D-48: one row per QuickPay (payroll relationship action); PAY_VALUE = its total = the sum of
-- the Standard and Supplemental Earnings it paid. That total becomes the invoice amount.
-- Key: PAYROLL_ACTION_ID + RUN_RESULT_ID (here the payroll relationship action id).
-- ============================================================================================
WITH params AS (
  SELECT NVL(TO_DATE(:P_FROM_DATE, 'YYYY-MM-DD'), TRUNC(SYSDATE) - 90) AS from_date,
         ',' || :P_ELEMENTS || ','                                      AS element_list,
         :P_ELEMENTS                                                    AS elements
    FROM dual
),
bu_map AS (                                                    -- Fusion BU names (read from the test pod, 22 Oct 2026)
  SELECT 'IPP BU' AS bu_name, 'IPP' AS bu_code FROM dual UNION ALL
  SELECT 'FPP BU',            'FPP'            FROM dual UNION ALL
  SELECT 'APP BU',            'APP'            FROM dual
),
results AS (
  SELECT ppa.payroll_action_id,
         ppra.payroll_rel_action_id,
         pprd.person_id,
         ppa.effective_date,
         pet.base_element_name,
         TO_NUMBER(prrv.result_value) AS amount
    FROM params prm
    JOIN pay_payroll_actions ppa
      ON  ppa.action_type = 'Q'                                   -- QuickPay
      AND ppa.effective_date >= prm.from_date
    JOIN pay_payroll_rel_actions ppra
      ON  ppra.payroll_action_id = ppa.payroll_action_id          -- (rolled-back ones are gone)
    JOIN pay_pay_relationships_dn pprd
      ON  pprd.payroll_relationship_id = ppra.payroll_relationship_id
    JOIN pay_run_results prr
      ON  prr.payroll_rel_action_id = ppra.payroll_rel_action_id
    JOIN pay_element_types_f pet
      ON  pet.element_type_id = prr.element_type_id
      AND ppa.effective_date BETWEEN pet.effective_start_date AND pet.effective_end_date
    JOIN pay_ele_classifications pec
      ON  pec.classification_id = pet.classification_id
      AND pec.base_classification_name IN ('Standard Earnings', 'Supplemental Earnings')
    JOIN pay_input_values_f piv
      ON  piv.element_type_id = pet.element_type_id
      AND piv.base_name = 'Pay Value'
      AND ppa.effective_date BETWEEN piv.effective_start_date AND piv.effective_end_date
    JOIN pay_run_result_values prrv
      ON  prrv.run_result_id = prr.run_result_id
      AND prrv.input_value_id = piv.input_value_id
   WHERE prm.elements IS NULL
      OR INSTR(prm.element_list, ',' || pet.base_element_name || ',') > 0
)
SELECT
  TO_CHAR(r.payroll_action_id)                                    AS PAYROLL_ACTION_ID,
  TO_CHAR(r.payroll_rel_action_id)                                AS RUN_RESULT_ID,
  TO_CHAR(r.person_id)                                            AS PERSON_ID,
  SUBSTR(LISTAGG(DISTINCT r.base_element_name, ', ' ON OVERFLOW TRUNCATE '...')
           WITHIN GROUP (ORDER BY r.base_element_name), 1, 240)   AS ELEMENT_NAME,
  TO_CHAR(ROUND(SUM(r.amount), 2), 'FM999999999990.00')           AS PAY_VALUE,
  TO_CHAR(r.effective_date, 'YYYY-MM-DD')                         AS EFFECTIVE_DATE,
  MAX(bm.bu_code)                                                 AS BU_CODE
FROM results r
JOIN per_all_assignments_m paam                                   -- BU at the effective date
  ON  paam.person_id = r.person_id
  AND paam.assignment_type = 'E'
  AND paam.primary_flag = 'Y'
  AND paam.effective_latest_change = 'Y'
  AND r.effective_date BETWEEN paam.effective_start_date AND paam.effective_end_date
JOIN fun_all_business_units_v bu
  ON  bu.bu_id = paam.business_unit_id
JOIN bu_map bm
  ON  bm.bu_name = bu.bu_name
GROUP BY r.payroll_action_id, r.payroll_rel_action_id, r.person_id, r.effective_date
HAVING ROUND(SUM(r.amount), 2) > 0
ORDER BY r.effective_date, r.payroll_action_id, r.payroll_rel_action_id
