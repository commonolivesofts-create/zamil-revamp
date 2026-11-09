-- ============================================================================================
-- EH_HCM_GRADE_LIMITS — INT-05c: expense limits by grade × location class (D-13, OQ-08)
-- Catalog:     /Custom/ExpenseHub/EH_HCM_GRADE_LIMITS.xdo     Data source: ApplicationDB_HCM
-- Parameters:  none
-- Run by:      ExpenseHub nightly 02:30 (full extract)
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  gradeLimitCsv
--
-- OQ-08 is still open (where HCM keeps the limits). This data model reads the PROPOSED home:
-- a User-Defined Table EH_EXPENSE_LIMITS (Setup and Maintenance → Manage User-Defined Tables):
--   Row name (Match type)  = GRADE|LOCATION_CLASS|EXPENSE_TYPE   e.g.  G6|GCC|MEALS
--   Column LIMIT_SAR       = limit per claim line in SAR          e.g.  200
--   Column DAILY_RATE_SAR  = per diem rate per day in SAR         e.g.  400 (PER_DIEM rows only)
--   Location classes: DOMESTIC, GCC, INTERNATIONAL.
--   Expense type codes: MEALS, HOTEL, AIRFARE, TAXI, MILEAGE, PER_DIEM, TELECOM, TRAINING, OTHER.
--   Date-effective rows give EFFECTIVE_FROM / EFFECTIVE_TO; a type with no row uses the default
--   limit on the ExpenseHub expense type.
-- If HR keeps the limits somewhere else (grade rates, a flexfield), replace this query and keep
-- the same output columns.
--
-- VERIFY in the test pod: FF_USER_* column names (BASE_USER_TABLE_NAME, ROW_LOW_RANGE_OR_NAME,
--                         BASE_USER_COLUMN_NAME).
-- ============================================================================================
WITH cells AS (
  SELECT r.user_row_id,
         r.row_low_range_or_name                                  AS row_name,
         r.effective_start_date,
         r.effective_end_date,
         c.base_user_column_name                                  AS column_name,
         ci.value
    FROM ff_user_tables t
    JOIN ff_user_rows_f r
      ON  r.user_table_id = t.user_table_id
    JOIN ff_user_columns c
      ON  c.user_table_id = t.user_table_id
    JOIN ff_user_column_instances_f ci
      ON  ci.user_row_id = r.user_row_id
      AND ci.user_column_id = c.user_column_id
      AND r.effective_start_date BETWEEN ci.effective_start_date AND ci.effective_end_date
   WHERE t.base_user_table_name = 'EH_EXPENSE_LIMITS'
)
SELECT
  UPPER(TRIM(REGEXP_SUBSTR(row_name, '[^|]+', 1, 1)))             AS GRADE_CODE,
  UPPER(TRIM(REGEXP_SUBSTR(row_name, '[^|]+', 1, 2)))             AS LOCATION_CLASS,
  UPPER(TRIM(REGEXP_SUBSTR(row_name, '[^|]+', 1, 3)))             AS EXPENSE_TYPE_CODE,
  MAX(CASE WHEN column_name = 'LIMIT_SAR'
           THEN TO_CHAR(ROUND(TO_NUMBER(value), 2), 'FM999999999990.00') END)      AS LIMIT_SAR,
  MAX(CASE WHEN column_name = 'DAILY_RATE_SAR'
           THEN TO_CHAR(ROUND(TO_NUMBER(value), 2), 'FM999999999990.00') END)      AS DAILY_RATE_SAR,
  TO_CHAR(effective_start_date, 'YYYY-MM-DD')                     AS EFFECTIVE_FROM,
  CASE WHEN effective_end_date < DATE '4712-12-31'
       THEN TO_CHAR(effective_end_date, 'YYYY-MM-DD') END         AS EFFECTIVE_TO
FROM cells
GROUP BY user_row_id, row_name, effective_start_date, effective_end_date
ORDER BY 1, 2, 3, 6