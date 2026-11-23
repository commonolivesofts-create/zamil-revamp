# Parity report: Timesheet

**Phase:** 6 **Date:** 2026-11-21 **Reviewer:** Claude (for Nauman Mirza)

**CI3 reference:** `controllers/Timesheet.php`, `models/Timesheet_model.php`, `views/pages/timesheet/list.php`,
`assets/js/pages/timesheet/list.js`

**New implementation:** `apps/api/src/modules/timesheet/routes.ts`, `apps/web/src/features/timesheet/TimesheetPage.tsx`,
`packages/shared/src/modules/timesheet.ts`

**Test data:** test ADW (`zpadwtest_tp`). Both apps were checked on the same data.

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

## 1. Routes

| CI3                            | New                             | Outcome |
| ------------------------------ | ------------------------------- | ------- |
| `POST report/timesheet/list`   | `POST /api/v1/timesheet/list`   | Same    |
| `POST report/timesheet/export` | `POST /api/v1/timesheet/export` | Same    |

## 2. Filters and paging

| Filter                      | CI3                                                                      | New  | Outcome                                                |
| --------------------------- | ------------------------------------------------------------------------ | ---- | ------------------------------------------------------ |
| Employee Number             | contains, case-insensitive                                               | same | Same (LIKE wildcards escaped: Fixed, as in every list) |
| Employee Name               | contains, case-insensitive                                               | same | Same                                                   |
| Shift                       | exact name (trimmed, case-insensitive), "All Shifts", every shift listed | same | Same                                                   |
| Attendance Date Start / End | inclusive range                                                          | same | Same                                                   |
| Defaults                    | 21st of last month to the 20th of this month                             | same | Same                                                   |
| Reset                       | clears every filter (dates too)                                          | same | Same                                                   |
| Page size                   | 50                                                                       | 50   | Same                                                   |
| Order                       | date newest first, then employee number                                  | same | Same                                                   |

## 3. Columns

#, Emp #, Employee Name, Shift, Attendance Date (`d M Y`), Attendance Day (weekday), Check In, Punch In, Check Out,
Punch Out, Total Minutes, Early, Late, Overtime, Absence, Delay, Total Overtime. **Same.**

- Delay = late not covered by overtime + early; Total Overtime = overtime left after late (CI3 SQL, verbatim).
  Values are Oracle's own text (e.g. `.5`), as CI3 showed them. **Same.**
- Punch In after Check In and Punch Out before Check Out in red; "Absence without permission" rows tinted. **Same** (colours: Design).

## 6. Export

`timesheet_data_YYYYMMDD_HHMMSS.csv`, no BOM, 13 columns (Employee Number … Absence), date as `d M Y`. **Same.**

## 9. Side-by-side check

Same processed test data (4 employees, 14 days) read by both apps: list with the period, employee number, shift
and employee name filters (56 / 14 / 14 / 14 rows) identical in every column, including Delay and Total Overtime;
export files identical. **Same.**
