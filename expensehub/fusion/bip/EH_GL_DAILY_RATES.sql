-- ============================================================================================
-- EH_GL_DAILY_RATES — INT-06: daily conversion rates to SAR (the REST fallback, INTEGRATION §4)
-- Catalog:     /Custom/ExpenseHub/EH_GL_DAILY_RATES.xdo       Data source: ApplicationDB_FSCM
-- Parameters:  P_TO_CURRENCY (Text, default SAR) · P_RATE_TYPE (Text, e.g. Corporate; blank = all)
--              P_FROM_DATE   (Text, YYYY-MM-DD; ExpenseHub sends yesterday, or −365 days on first run)
-- Run by:      ExpenseHub daily 06:00
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  glDailyRateCsv
--
-- Why a report: the currencyRates REST resource in this pod cannot be filtered (23 Oct 2026).
-- ============================================================================================
SELECT
  gdr.from_currency                                               AS FROM_CURRENCY,
  gdr.to_currency                                                 AS TO_CURRENCY,
  gdct.user_conversion_type                                       AS RATE_TYPE,
  TO_CHAR(gdr.conversion_date, 'YYYY-MM-DD')                      AS RATE_DATE,
  TO_CHAR(gdr.conversion_rate, 'FM999999990.00000000')            AS RATE
FROM gl_daily_rates gdr
JOIN gl_daily_conversion_types gdct
  ON  gdct.conversion_type = gdr.conversion_type
WHERE gdr.to_currency = NVL(:P_TO_CURRENCY, 'SAR')
  AND gdr.conversion_date >= NVL(TO_DATE(:P_FROM_DATE, 'YYYY-MM-DD'), TRUNC(SYSDATE) - 365)
  AND (:P_RATE_TYPE IS NULL OR gdct.user_conversion_type = :P_RATE_TYPE)
  AND gdr.conversion_rate > 0
ORDER BY gdr.from_currency, gdr.conversion_date
