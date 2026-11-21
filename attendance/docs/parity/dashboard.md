# Parity report: Dashboard

**Phase:** 6 **Date:** 2026-11-21 **Reviewer:** Claude (for Nauman Mirza)

**CI3 reference:** `controllers/Dashboard.php`, `models/Dashboard_model.php`, `views/pages/home/main.php`,
`assets/js/pages/dashboard/main.js`

**New implementation:** `apps/api/src/modules/dashboard/`, `apps/web/src/features/dashboard/DashboardPage.tsx`,
`packages/shared/src/modules/dashboard.ts`

**Test data:** test ADW (`zpadwtest_tp`). Both apps were checked on the same data.

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

## Scope

The CI3 model builds a large payload, but the page shows only the items below; the new API returns exactly
these. Unused payload parts (daily trend, readiness, proposed KPIs, quick actions) are not shown by CI3 either.

| Item                  | CI3 source                                                                           | Outcome                                                       |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Payroll period        | latest processed date back to the 21st of the month before (PHP month overflow kept) | Same                                                          |
| Status pill           | "Ready for payroll review" at ≥ 95 % coverage, else "Processing attention required"  | Same (pill: Design)                                           |
| Payroll Readiness     | processed employees ÷ current employees, rounded, max 100 %                          | Same                                                          |
| Total Employees       | current employees                                                                    | Same                                                          |
| Missing Timetable     | current employees with no active timetable                                           | Same                                                          |
| Blank Punch Employees | CI3 counts **distinct supervisors** of current employees                             | Same (kept; see issues)                                       |
| Overtime Hours        | sum of OVERTIME in the period, 1 decimal; employees with overtime                    | Same                                                          |
| Department Snapshot   | current employees per department, largest first                                      | Same (horizontal Zamil bars instead of vertical bars: Design) |

## 9. Side-by-side check

CI3's embedded `dashboardPayload` compared with `GET /api/v1/dashboard` on the same data:

- **Figures:** period labels, coverage, processed and assigned employees, status, totals, missing timetable, blank punch, overtime and employees with overtime are all identical.
- **Department headcount:** all 29 departments identical, in the same order.

## 10. Issues found

| #   | Description                                                                                     | Decision                        | Status |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------- | ------ |
| 1   | "Blank Punch Employees" shows the number of distinct supervisors                                | Kept as CI3; confirm the intent | Open   |
| 2   | "Assigned employees" for readiness counts all current employees, not employees with a timetable | Kept as CI3; confirm the intent | Open   |
