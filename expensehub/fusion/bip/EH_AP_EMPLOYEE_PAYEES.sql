-- ============================================================================================
-- EH_AP_EMPLOYEE_PAYEES — INT-07: can this employee be paid through Payables?
-- Catalog:     /Custom/ExpenseHub/EH_AP_EMPLOYEE_PAYEES.xdo   Data source: ApplicationDB_FSCM
-- Parameters:  none
-- Run by:      ExpenseHub nightly 01:00, right after EH_HCM_EMPLOYEES
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  apPayeeCsv
--
-- D-47: the employee's supplier is the one whose EMPLOYEE_ID is the person, else the supplier
-- named exactly like the employee (unique names only — Finance's 10035–10038 have no employee
-- link); site <BU>-EMP or any pay site in the BU. Supplier numbers are NOT person numbers.
-- Returns FLAGS ONLY. Never add bank account numbers, IBANs or bank names to this report.
--
-- EDIT before use:  the three business unit names in bu_map (same as EH_HCM_EMPLOYEES).
-- VERIFY in the test pod: POZ_SUPPLIERS.END_DATE_ACTIVE, POZ_SITE_ASSIGNMENTS_ALL_M.BU_ID,
--                         the IBY payee / instrument tables.
-- ============================================================================================
WITH params AS (
  SELECT TRUNC(SYSDATE) AS as_of FROM dual
),
bu_map AS (                                                    -- Fusion BU names (read from the test pod, 22 Oct 2026)
  SELECT 'IPP BU' AS bu_name, 'IPP' AS bu_code FROM dual UNION ALL
  SELECT 'FPP BU',            'FPP'            FROM dual UNION ALL
  SELECT 'APP BU',            'APP'            FROM dual
),
emp AS (
  SELECT papf.person_id, papf.person_number, bm.bu_code, bu.bu_id,
         UPPER(TRIM(ppnf.display_name))                                   AS name_key,
         COUNT(*) OVER (PARTITION BY UPPER(TRIM(ppnf.display_name)))      AS same_name
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
    JOIN fun_all_business_units_v bu ON bu.bu_id = paam.business_unit_id
    JOIN bu_map bm                   ON bm.bu_name = bu.bu_name
),
candidates AS (
  SELECT e.person_id,
         e.bu_code,
         e.bu_id,
         ps.party_id,
         ps.segment1                 AS supplier_number,
         ps.end_date_active          AS supplier_end_date,
         site.vendor_site_id,
         site.vendor_site_code,
         site.inactive_date          AS site_inactive_date,
         -- D-47: the supplier linked to the person (EMPLOYEE_ID) wins; then a site named
         -- <BU>-EMP; then any pay site in the employee's BU.
         ROW_NUMBER() OVER (
           PARTITION BY e.person_id
           ORDER BY CASE WHEN ps.employee_id = e.person_id THEN 0
                         WHEN ps.vendor_id IS NOT NULL THEN 1 ELSE 2 END,
                    CASE WHEN site.vendor_site_code = e.bu_code || '-EMP' THEN 0
                         WHEN site.vendor_site_id IS NOT NULL THEN 1 ELSE 2 END,
                    site.vendor_site_id
         )                           AS rn
    FROM emp e
    CROSS JOIN params prm
    -- D-47: the supplier's employee link; otherwise a supplier whose name is exactly this
    -- employee's full name, and only when no other employee has that name. Never the supplier
    -- number (12 ordinary suppliers share person numbers).
    LEFT JOIN hz_parties hp
      ON  e.same_name = 1
      AND UPPER(TRIM(hp.party_name)) = e.name_key
    LEFT JOIN poz_suppliers ps
      ON  ps.employee_id = e.person_id
       OR (ps.employee_id IS NULL AND ps.party_id = hp.party_id)
    LEFT JOIN poz_supplier_sites_all_m site
      ON  site.vendor_id = ps.vendor_id
      AND site.pay_site_flag = 'Y'
      AND prm.as_of BETWEEN site.effective_start_date AND site.effective_end_date
      AND (site.vendor_site_code = e.bu_code || '-EMP' OR site.prc_bu_id = e.bu_id)
),
payee AS (
  SELECT * FROM candidates WHERE rn = 1
)
SELECT
  TO_CHAR(p.person_id)                                            AS PERSON_ID,
  p.supplier_number                                               AS SUPPLIER_NUMBER,
  p.vendor_site_code                                              AS SUPPLIER_SITE,
  p.bu_code                                                       AS BU_CODE,
  CASE
    WHEN p.vendor_site_id IS NOT NULL
     AND NVL(p.supplier_end_date,  prm.as_of + 1) > prm.as_of
     AND NVL(p.site_inactive_date, prm.as_of + 1) > prm.as_of
     AND EXISTS (                                               -- site assigned to the BU
           SELECT 1
             FROM poz_site_assignments_all_m psa
            WHERE psa.vendor_site_id = p.vendor_site_id
              AND psa.bu_id = p.bu_id                           -- VERIFY: client BU column
              AND NVL(psa.inactive_date, prm.as_of + 1) > prm.as_of)
    THEN 'Y' ELSE 'N'
  END                                                             AS SITE_ACTIVE_FLAG,
  CASE
    WHEN p.party_id IS NOT NULL
     AND EXISTS (                                               -- an active disbursement bank account
           SELECT 1
             FROM iby_external_payees_all iep
             JOIN iby_pmt_instr_uses_all ipiu
               ON  ipiu.ext_pmt_party_id = iep.ext_payee_id
               AND ipiu.instrument_type  = 'BANKACCOUNT'
               AND ipiu.payment_flow     = 'DISBURSEMENTS'
               AND prm.as_of BETWEEN NVL(ipiu.start_date, prm.as_of) AND NVL(ipiu.end_date, prm.as_of)
             JOIN iby_ext_bank_accounts ieba
               ON  ieba.ext_bank_account_id = ipiu.instrument_id
               AND prm.as_of BETWEEN NVL(ieba.start_date, prm.as_of) AND NVL(ieba.end_date, prm.as_of)
            WHERE iep.payee_party_id = p.party_id
              AND (iep.supplier_site_id IS NULL OR iep.supplier_site_id = p.vendor_site_id))
    THEN 'Y' ELSE 'N'
  END                                                             AS HAS_ACTIVE_BANK_FLAG
FROM payee p
CROSS JOIN params prm
ORDER BY p.person_id
