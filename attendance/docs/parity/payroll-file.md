# Parity report: Payroll File

**Phase:** 6 **Date:** 2026-11-21 **Reviewer:** Claude (for Nauman Mirza)

**CI3 reference:** `controllers/Payroll_file.php`, `models/Payroll_file_model.php`, `views/pages/payroll_file/list.php`,
`assets/js/pages/payroll_file/list.js`

**New implementation:** `apps/api/src/modules/payrollFile/`, `apps/web/src/features/payrollFile/PayrollFilePage.tsx`,
`packages/shared/src/modules/payrollFile.ts`

**Test data:** test ADW (`zpadwtest_tp`). Both apps were checked on the same data.

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

## 1. Routes

| CI3                                        | New                                    | Outcome |
| ------------------------------------------ | -------------------------------------- | ------- |
| `POST report/payroll-file/list`            | `POST /api/v1/payroll-file/list`       | Same    |
| `POST report/payroll-file/export`          | `POST /api/v1/payroll-file/export`     | Same    |
| `POST report/payroll-file/save-adjustment` | `POST /api/v1/payroll-file/adjustment` | Same    |

## 2. Filters and paging

| Filter          | CI3                                          | New  | Outcome |
| --------------- | -------------------------------------------- | ---- | ------- |
| Employee Number | exact                                        | same | Same    |
| Employee Name   | contains, case-insensitive                   | same | Same    |
| From / To Date  | inclusive range; invalid dates ignored       | same | Same    |
| Defaults        | 21st of last month to the 20th of this month | same | Same    |
| Reset           | clears every filter                          | same | Same    |
| Page size       | 30                                           | 30   | Same    |

## 3. Columns and values

#, Emp No, Emp Name, Late, Early, TOT_DELAY, Overtime hrs (shown with 2 decimals), Absence WO, Action. **Same.**

The SQL is CI3's, verbatim:

1. **Each day:** overtime is netted against that day's late minutes.
2. **Totals:** the totals are netted again across days.
3. **Adjustments:** when both dates are set, a saved adjustment for exactly that range replaces the employee's figures, and is netted the same way.

Values are Oracle's own text (e.g. `.2`), as CI3 showed and exported them. **Same.**

## 5. Adjustment

| Item              | CI3                                                                                                         | New                           | Outcome               |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------- |
| Needs dates       | "From Date and To Date are required before editing payroll file."                                           | same                          | Same                  |
| Fields            | Employee Name (read-only), Late, Early, Total Delay (= Late + Early, read-only), Overtime Hours, Absence WO | same                          | Same                  |
| Rules / messages  | numbers with up to 2 decimals; Absence WO whole; To Date on or after From Date; CI3 messages                | same                          | Same                  |
| Save              | MERGE on employee + exact date range; "Payroll adjustment saved successfully."                              | same                          | Same                  |
| Pre-filled values | raw Oracle text (`.5`, `4.2133…`), rejected by CI3's own rules and the 0.01 step                            | numbers rounded to 2 decimals | **Fixed**             |
| Date range used   | the date inputs, even if not applied                                                                        | the applied filters           | Same (the list shown) |

## 6. Export

`payroll_file_data_YYYYMMDD_HHMMSS.csv`, no BOM, Emp No, Emp Name, Late, Early, Total Delay, Overtime Hours,
Absence WO, values exactly as listed. **Same.**

## 9. Side-by-side check

Same processed data read by both apps:

| Scenario                                                    | Outcome |
| ----------------------------------------------------------- | ------- |
| Date range, no dates (no-adjustment branch), exact employee | Same    |
| Adjustment saved by CI3, list read by both                  | Same    |
| Adjustment saved by the new app, list read by both          | Same    |
| Export files                                                | Same    |

## 10. Issues found

| #   | Description                                                                  | Decision                                 | Status |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------- | ------ |
| 1   | Overtime netted against late twice (per day, then on totals and adjustments) | Kept as CI3; **needs business sign-off** | Open   |
| 2   | Edit form pre-filled with values its own validation rejects                  | Fix                                      | Fixed  |
