-- ============================================================================================
-- EH_HCM_BUSINESS_TRIPS — INT-05a: approved business leave requests (D-09, D-11, D-46)
-- Catalog:     /Custom/ExpenseHub/EH_HCM_BUSINESS_TRIPS.xdo   Data source: ApplicationDB_HCM
-- Parameters:  P_ABSENCE_TYPES  (Text, comma-separated absence type names, e.g. Business Trip)
--              P_FROM_DATE      (Text, YYYY-MM-DD; ExpenseHub sends today − 365)
-- Run by:      ExpenseHub nightly 02:00 + on demand
-- Contract:    apps/api/src/integrations/fusion/contracts.ts  businessTripCsv
--
-- D-46: the destination is entered on the business leave request. Rather than guess which field
-- holds it, this report returns EVERY field of the request (ATTRIBUTE_CATEGORY, ATTRIBUTE1…30). ExpenseHub reads the destination from the field named in
-- its option TRIP_DESTINATION_FIELD (e.g. ATTRIBUTE3); the other fields are ignored.
-- `npm run fusion:bip-check EH_HCM_BUSINESS_TRIPS --show-fields` shows which field is filled.
-- DURATION_DAYS = calendar days, start and end inclusive.
--
-- EDIT before use:  bu_map (same as EH_HCM_EMPLOYEES).
-- Checked in the test pod (22 Oct 2026): ANC_PER_ABS_ENTRIES has no ABSENCE_REASON_ID here, so
-- the reason and comments are not returned; the ATTRIBUTE columns are the leave request's fields.
-- ============================================================================================
WITH params AS (
  SELECT NVL(TO_DATE(:P_FROM_DATE, 'YYYY-MM-DD'), TRUNC(SYSDATE) - 365) AS from_date,
         ',' || NVL(:P_ABSENCE_TYPES, 'Business Trip') || ','            AS type_list
    FROM dual
),
bu_map AS (                                                    -- Fusion BU names (read from the test pod, 22 Oct 2026)
  SELECT 'IPP BU' AS bu_name FROM dual UNION ALL
  SELECT 'FPP BU'             FROM dual UNION ALL
  SELECT 'APP BU'             FROM dual
)
SELECT
  TO_CHAR(apae.per_absence_entry_id)                              AS ABSENCE_ENTRY_ID,
  TO_CHAR(apae.person_id)                                         AS PERSON_ID,
  aat.name                                                        AS ABSENCE_TYPE,
  TO_CHAR(TRUNC(apae.start_date), 'YYYY-MM-DD')                   AS START_DATE,
  TO_CHAR(TRUNC(apae.end_date),   'YYYY-MM-DD')                   AS END_DATE,
  TO_CHAR(TRUNC(apae.end_date) - TRUNC(apae.start_date) + 1)      AS DURATION_DAYS,
  apae.approval_status_cd                                         AS APPROVAL_STATUS,
  -- Every field of the business leave request (D-46) ------------------------------------------
  apae.attribute_category                                         AS ATTRIBUTE_CATEGORY,
  apae.attribute1  AS ATTRIBUTE1,  apae.attribute2  AS ATTRIBUTE2,  apae.attribute3  AS ATTRIBUTE3,
  apae.attribute4  AS ATTRIBUTE4,  apae.attribute5  AS ATTRIBUTE5,  apae.attribute6  AS ATTRIBUTE6,
  apae.attribute7  AS ATTRIBUTE7,  apae.attribute8  AS ATTRIBUTE8,  apae.attribute9  AS ATTRIBUTE9,
  apae.attribute10 AS ATTRIBUTE10, apae.attribute11 AS ATTRIBUTE11, apae.attribute12 AS ATTRIBUTE12,
  apae.attribute13 AS ATTRIBUTE13, apae.attribute14 AS ATTRIBUTE14, apae.attribute15 AS ATTRIBUTE15,
  apae.attribute16 AS ATTRIBUTE16, apae.attribute17 AS ATTRIBUTE17, apae.attribute18 AS ATTRIBUTE18,
  apae.attribute19 AS ATTRIBUTE19, apae.attribute20 AS ATTRIBUTE20, apae.attribute21 AS ATTRIBUTE21,
  apae.attribute22 AS ATTRIBUTE22, apae.attribute23 AS ATTRIBUTE23, apae.attribute24 AS ATTRIBUTE24,
  apae.attribute25 AS ATTRIBUTE25, apae.attribute26 AS ATTRIBUTE26, apae.attribute27 AS ATTRIBUTE27,
  apae.attribute28 AS ATTRIBUTE28, apae.attribute29 AS ATTRIBUTE29, apae.attribute30 AS ATTRIBUTE30
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
  AND EXISTS (                                                  -- only IPP / FPP / APP people
        SELECT 1
          FROM per_all_assignments_m paam
          JOIN fun_all_business_units_v bu ON bu.bu_id = paam.business_unit_id
          JOIN bu_map bm                   ON bm.bu_name = bu.bu_name
         WHERE paam.person_id = apae.person_id
           AND paam.assignment_type = 'E'
           AND paam.primary_flag = 'Y'
           AND apae.start_date BETWEEN paam.effective_start_date AND paam.effective_end_date)
ORDER BY apae.start_date, apae.per_absence_entry_id
