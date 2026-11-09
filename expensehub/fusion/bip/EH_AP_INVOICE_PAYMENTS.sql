-- ============================================================================================
-- EH_AP_INVOICE_PAYMENTS — INT-09: payments of the invoices ExpenseHub created
-- Catalog:     /Custom/ExpenseHub/EH_AP_INVOICE_PAYMENTS.xdo  Data source: ApplicationDB_FSCM
-- Parameter:   P_INVOICE_IDS  (Text, comma-separated Fusion InvoiceIds, e.g. 300000050001,300000050002)
-- Run by:      ExpenseHub hourly 07:00–20:00, for invoices it is waiting on
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  invoicePaymentCsv
--
-- STATUS is the payment status (NEGOTIABLE, CLEARED, RECONCILED, VOIDED, …). ExpenseHub ignores
-- VOIDED payments and takes the latest of the others, so rows are ordered by payment date.
-- No parameter → no rows.
-- ============================================================================================
WITH ids AS (
  SELECT TO_NUMBER(TRIM(REGEXP_SUBSTR(:P_INVOICE_IDS, '[^,]+', 1, LEVEL))) AS invoice_id
    FROM dual
 CONNECT BY REGEXP_SUBSTR(:P_INVOICE_IDS, '[^,]+', 1, LEVEL) IS NOT NULL
)
SELECT
  TO_CHAR(aip.invoice_id)                                         AS INVOICE_ID,
  TO_CHAR(aca.check_number)                                       AS PAYMENT_NUMBER,
  TO_CHAR(aca.check_date, 'YYYY-MM-DD')                           AS PAYMENT_DATE,
  TO_CHAR(aip.amount, 'FM999999999990.00')                        AS AMOUNT,
  aca.status_lookup_code                                          AS STATUS
FROM ids
JOIN ap_invoice_payments_all aip
  ON  aip.invoice_id = ids.invoice_id
JOIN ap_checks_all aca
  ON  aca.check_id = aip.check_id
ORDER BY aip.invoice_id, aca.check_date, aip.invoice_payment_id
