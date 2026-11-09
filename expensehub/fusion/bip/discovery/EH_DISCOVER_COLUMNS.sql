-- Diagnostic (D-44): column names of the Fusion tables the ExpenseHub reports read. Metadata only.
SELECT
  table_name                                                      AS TABLE_NAME,
  LISTAGG(column_name, ',' ON OVERFLOW TRUNCATE '...' WITH COUNT)
    WITHIN GROUP (ORDER BY column_name)                           AS COLUMN_LIST
FROM (
  SELECT DISTINCT table_name, column_name
    FROM all_tab_columns
   WHERE table_name IN (
     'PER_PHONES','HR_LOCATIONS_ALL','ANC_PER_ABS_ENTRIES','ANC_ABSENCE_TYPES_F_TL',
     'POZ_SUPPLIERS','POZ_SUPPLIER_SITES_ALL_M','POZ_SITE_ASSIGNMENTS_ALL_M',
     'IBY_EXTERNAL_PAYEES_ALL','IBY_PMT_INSTR_USES_ALL','IBY_EXT_BANK_ACCOUNTS',
     'PAY_PAYROLL_ACTIONS','PAY_PAYROLL_REL_ACTIONS','PAY_RUN_RESULTS','PAY_RUN_RESULT_VALUES',
     'PAY_INPUT_VALUES_F','PAY_ELEMENT_TYPES_F','PAY_PAY_RELATIONSHIPS_DN',
     'FND_VS_VALUES_B','FND_VS_VALUES_TL','FND_VS_VALUE_SETS','AP_CHECKS_ALL','AP_INVOICE_PAYMENTS_ALL')
     AND (column_name NOT LIKE 'ATTRIBUTE%' AND column_name NOT LIKE 'GLOBAL_ATTRIBUTE%')
)
GROUP BY table_name
ORDER BY table_name
