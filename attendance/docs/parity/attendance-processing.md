# Parity report: Attendance processing (Generate Attendance)

**Phase:** 5 **Date:** 2026-11-21 **Reviewer:** Claude (for Nauman Mirza)

**CI3 reference:**

- `zamil-attendance/application/controllers/ProcessAttendance.php`
- `models/ProcessAttendanceModel.php`
- `views/pages/attendance_card/mdl-generate-attendance.php` (opened from Attendance Card and Interface)

**New implementation:**

- `attendance/apps/api/src/domain/processing/` (`metrics.ts`, `day.ts`: pure rules)
- `attendance/apps/api/src/modules/processing/` (`repository.ts`, `service.ts`, `routes.ts`)
- `attendance/apps/web/src/features/attendanceCard/ProcessDialog.tsx`
- `attendance/packages/shared/src/modules/processing.ts`

**Test data:** test ADW (`zpadwtest_tp`). Both apps were checked on the same data.

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

## 1. Routes and endpoints

| CI3                                                 | New                                            | Outcome | Notes                                                            |
| --------------------------------------------------- | ---------------------------------------------- | ------- | ---------------------------------------------------------------- |
| Department list rendered into the page              | `GET /api/v1/processing/departments`           | Same    | `Attendance_card_model::get_departments` (both CI3 pages use it) |
| `GET processattendance/get_employees_by_department` | `GET /api/v1/processing/employees?department=` | Same    | `ALL` → empty list; missing → "Department is required."          |
| `POST processattendance/process_attendance`         | `POST /api/v1/processing/run`                  | Same    | JSON in, the CI3 summary out (camelCase keys)                    |

## 4. Validation rules and messages

| Field      | CI3                                                           | New                                                                     | Outcome |
| ---------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| Department | "Please select department."                                   | same                                                                    | Same    |
| Employee   | "Please select employee." (not needed when department is ALL) | same; ALL forces ALL                                                    | Same    |
| From / To  | "Please select from date." / "Please select to date."         | same; invalid dates "Valid from/to date is required." (CI3 server text) | Same    |
| Range      | "From date must be less than or equal to to date."            | same                                                                    | Same    |

## 5. Run behaviour

| Item             | CI3                                                                                                                                      | New                                                                     | Outcome     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------- |
| Target employees | ALL/ALL: employees with punches in the range; dept/ALL: the department; dept/emp: that employee                                          | same queries                                                            | Same        |
| No employees     | "Attendance process failed." (reason only in `data.error`)                                                                               | same message; the reason is shown next to it                            | Design      |
| Rows written     | one `XX_DIGI_ATT_ATT_SHEET` row per employee per day; update if the day exists, else insert                                              | same (MERGE per employee, same columns and values)                      | Same        |
| Summary          | employees, processed, inserted, updated, present, weekly holiday, leave, absence without permission, blank punch, error rows, row errors | same fields                                                             | Same        |
| Summary shown    | `alert()` with employees / processed / inserted / updated                                                                                | the same four figures in the dialog (+ error rows when any) and a toast | Design      |
| Defaults         | 21st of last month to the 20th of this month                                                                                             | same                                                                    | Same        |
| Speed            | ~6 queries per employee-day                                                                                                              | ~6 queries per employee for the whole range, 4 employees at a time      | Same result |

## 7. Business rules

All rules are ported line by line; `metrics.ts` and `day.ts` cite the CI3 functions.

| Rule                                                                                                                                                                                   | Outcome                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Shift for the day: active timetable covering the date, latest start then highest id; weekly detail of that weekday                                                                     | Same                                                                                      |
| Weekend: 1 off day in the shift detail = Friday, 2+ = Friday and Saturday (by count, not by which day); a day with no detail punches is also off                                       | Same                                                                                      |
| ABSENCE priority: approved leave → occasion (for the employee's shift) → Weekend → no card = "Absence without permission" → blank punches (present when "Exclude timesheet") → present | Same                                                                                      |
| Late: after check-in, or after the gross time when that is later; same in/out punch = 0                                                                                                | Same                                                                                      |
| Early / overtime: against check-out, night shifts across midnight; overtime in hours (2 decimals) only when allowed, capped by the weekday/weekend cap (`2`, `1.5` or `H:MM`)          | Same                                                                                      |
| Weekend / occasion work: late 0, early 0, overtime = all worked hours (weekend cap), no total minutes                                                                                  | Same                                                                                      |
| Head-office shift (id 75 or "H.Office Shift"): 08:00–09:00 arrival, 9 hours, nothing after 18:00                                                                                       | Same                                                                                      |
| Name: master name, else the card name, else the employee profile                                                                                                                       | Same                                                                                      |
| Leave dates in 10 text formats                                                                                                                                                         | Same                                                                                      |
| An impossible leave date (e.g. `31-02-2024`) made Oracle fail every day of that employee (ORA-01847)                                                                                   | **Fixed**: read as no date (`DEFAULT NULL ON CONVERSION ERROR`), as in the Absence report |

## 9. Side-by-side check

**Function golden test** (`domain/processing/metrics.test.ts`): CI3's own `calculate_attendance_metrics`,
`time_to_minutes` and `parse_overtime_cap_hours` were run on PHP 8.5 for **6,000 generated employee-days**
plus edge-case times and caps. Our output is identical for every case. The fixture lives in
`domain/processing/golden/ci3-metrics.json`.

**Database golden run** (test ADW, same data, run by CI3 and then by the new app from the same start):

- **Data:** 4 employees in 2 departments, 2001-01-01 to 2001-01-14.
- **Shifts:** day shift (gross-time thresholds, Friday and Saturday off), night shift (Friday off, `1:30` cap) and the head-office shift.
- **Other inputs:** an occasion, approved and pending leave, and punches covering late, early, overtime caps, same punch, blank punches, missing punches, weekend work and `7:00 AM` / `0700` formats.

| Scenario                                | CI3     | New                             | Outcome |
| --------------------------------------- | ------- | ------------------------------- | ------- |
| Regrind / one employee (14 inserted)    | summary | identical                       | Same    |
| Regrind / ALL (14 inserted, 14 updated) | summary | identical                       | Same    |
| QHSE / ALL (employee without timetable) | summary | identical                       | Same    |
| ALL / ALL (42 updated)                  | summary | identical                       | Same    |
| Final `XX_DIGI_ATT_ATT_SHEET`           | 56 rows | 56 identical rows, every column | Same    |

All test rows (shifts, timetables, occasion, punches, leave, sheet rows) were deleted afterwards.

## 10. Issues found

| #   | Description                                                                                       | Where                                                 | Decision                           | Status |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------- | ------ |
| 1   | Impossible leave date stops processing for the employee                                           | `ProcessAttendanceModel::build_leave_date_expression` | Fix (safe parse)                   | Fixed  |
| 2   | Gross time `00:15` never changes lateness (the threshold is the later of check-in and gross time) | `calculate_attendance_metrics`                        | Keep CI3 behaviour (business rule) | Same   |
| 3   | A shift whose only day off is Saturday still marks Friday as Weekend                              | `get_weekend_days_for_shift`                          | Keep CI3 behaviour (business rule) | Same   |

## Sign-off

- [x] Lint, typecheck, tests and build pass
- [x] Every difference is Same, Design or Fixed (real bug)
- [x] README phase table updated
