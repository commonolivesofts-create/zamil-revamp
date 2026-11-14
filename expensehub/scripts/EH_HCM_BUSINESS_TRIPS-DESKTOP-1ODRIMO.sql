-- ============================================================================================
-- EH_HCM_BUSINESS_TRIPS — INT-05a: approved business-trip absences (D-09, D-11)
-- Catalog:     /Custom/ExpenseHub/EH_HCM_BUSINESS_TRIPS.xdo   Data source: ApplicationDB_HCM
-- Parameters:  P_ABSENCE_TYPES  (Text, comma-separated absence type names, e.g. Business Trip)
--              P_FROM_DATE      (Text, YYYY-MM-DD; ExpenseHub sends today − 365)
-- Run by:      ExpenseHub nightly 02:00 + on demand
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  businessTripCsv
--
-- DURATION_DAYS = calendar days, start and end inclusive (per diem, OQ-11).
-- LOCATION_CLASS = DOMESTIC (Saudi Arabia) / GCC / INTERNATIONAL, from the destination country.
--
-- EDIT before use:  bu_map (same as EH_HCM_EMPLOYEES); the absence DFF columns that hold the
--                   destination and its country (OQ-10) — see the two lines marked EDIT below.
--                   Until a country DFF exists, every trip is DOMESTIC.
-- ============================================================================================
WITH params AS (
  SELECT NVL(TO_DATE(:P_FROM_DATE, 'YYYY-MM-DD'), TRUNC(SYSDATE) - 365) AS from_date,
         ',' || NVL(:P_ABSENCE_TYPES, 'Business Trip') || ','            AS type_list
    FROM dual
),
bu_map AS (                                                    -- EDIT: Fusion BU names
 SELECT 'IPP BU' AS bu_name, 'IPP' AS bu_code FROM dual UNION ALL
  SELECT 'FPP BU', AS bu_name           'FPP'    AS bu_code        FROM dual UNION ALL
  SELECT 'APP BU', AS bu_name           'APP'    AS bu_code        FROM dual
),
trips AS (
  SELECT apae.per_absence_entry_id,
         apae.person_id,
         aat.name                                   AS absence_type,
         TRUNC(apae.start_date)                     AS start_date,
         TRUNC(apae.end_date)                       AS end_date,
         apae.approval_status_cd,
         apae.attribute1                            AS destination,      -- EDIT: destination DFF
         UPPER(TRIM(apae.attribute2))               AS country_code      -- EDIT: ISO country DFF
    FROM params prm
    JOIN anc_per_abs_entries apae
      ON  apae.start_date >= prm.from_date
    JOIN anc_absence_types_f_tl aat
      ON  aat.absence_type_id = apae.absence_type_id
      AND aat.language = USERENV('LANG')
      AND apae.start_date BETWEEN aat.effective_start_date AND aat.effective_end_date
   WHERE apae.approval_status_cd = 'APPROVED'
     AND NVL(apae.absence_status_cd, 'X') <> 'ORA_WITHDRAWN'
     AND INSTR(prm.type_list, ',' || aat.name || ',') > 0
     AND EXISTS (                                               -- only IPP / FPP / APP people
           SELECT 1
             FROM per_all_assignments_m paam
             JOIN fun_all_business_units_v bu ON bu.bu_id = paam.business_unit_id
             JOIN bu_map bm                   ON bm.bu_name = bu.bu_name
            WHERE paam.person_id = apae.person_id
              AND paam.assignment_type = 'E'
              AND paam.primary_flag = 'Y'
              AND apae.start_date BETWEEN paam.effective_start_date AND paam.effective_end_date)
)
SELECT
  TO_CHAR(t.per_absence_entry_id)                                 AS ABSENCE_ENTRY_ID,
  TO_CHAR(t.person_id)                                            AS PERSON_ID,
  t.absence_type                                                  AS ABSENCE_TYPE,
  TO_CHAR(t.start_date, 'YYYY-MM-DD')                             AS START_DATE,
  TO_CHAR(t.end_date,   'YYYY-MM-DD')                             AS END_DATE,
  TO_CHAR(t.end_date - t.start_date + 1)                          AS DURATION_DAYS,
  t.destination                                                   AS DESTINATION,
  CASE
    WHEN t.country_code IS NULL OR t.country_code IN ('SA', 'SAU')              THEN 'DOMESTIC'
    WHEN t.country_code IN ('AE', 'BH', 'KW', 'OM', 'QA',
                            'ARE', 'BHR', 'KWT', 'OMN', 'QAT')                   THEN 'GCC'
    ELSE 'INTERNATIONAL'
  END                                                             AS LOCATION_CLASS,
  t.approval_status_cd                                            AS APPROVAL_STATUS
FROM trips t
ORDER BY t.start_date, t.per_absence_entry_id