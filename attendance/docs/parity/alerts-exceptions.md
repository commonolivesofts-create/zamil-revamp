# Parity report: Alerts & Exceptions

**Phase:** 6 **Date:** 2026-11-21 **Reviewer:** Claude (for Nauman Mirza)

**CI3 reference:** `controllers/Alerts_exceptions.php`, `models/Alerts_exceptions_model.php`,
`views/pages/alerts_exception/{index,_results}.php`, `assets/js/pages/alerts_exception/list.js`

**New implementation:** `apps/api/src/modules/alerts/`, `apps/web/src/features/alerts/AlertsPage.tsx`,
`packages/shared/src/modules/alerts.ts`

**Test data:** test ADW (`zpadwtest_tp`). Both apps were checked on the same data.

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

## 1. Routes

| CI3                                        | New                               | Outcome                                    |
| ------------------------------------------ | --------------------------------- | ------------------------------------------ |
| `GET alerts-exceptions` (page + AJAX HTML) | `POST /api/v1/alerts/list` (JSON) | Same data; HTML rendered by React (Design) |
| `GET alerts-exceptions/export`             | `POST /api/v1/alerts/export`      | Same                                       |

## 2. Filters

From Date, To Date (default 1st of this month to today; swapped when reversed), Exception Type (6 types), Severity
(High / Medium / Low; unknown values ignored). Reset returns to this month. Page size 15. **Same.**

## 3. Summary and queue

- **Summary tiles:** Total, High Severity, Missing Punch, Same Punch, Missing Shift, Missing Occasion, Missing Timetable, with CI3's notes.
  They count by date only; the type and severity filters don't change them. **Same.**
- **Queue:** #, Exception, Severity, Employee (name + Emp #), Date (`DD Mon YYYY`), Details.
  It is ordered by severity, newest date, then name, and High rows are tinted. **Same** (badges and tints: Design).
- **Rules:** the six exception queries are CI3's SQL, verbatim, except one fix:

| Rule          | CI3                                                                                                        | New                                                      | Outcome   |
| ------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| High Overtime | OVERTIME (hours) compared with a 120-**minute** threshold, so it never fired; message said "1.5 minute(s)" | hours × 60 compared with 120 minutes; message in minutes | **Fixed** |

## 6. Export

`attendance_exceptions_YYYYMMDD_HHMMSS.csv` with a UTF-8 BOM and 12 readable columns. Type and severity filters are applied, and an empty result gives a header-only file. **Same.**

## 9. Side-by-side check

Same processed data, 2001-01-01 to 2001-01-14:

- **Summary:** identical (16 exceptions in CI3; 22 in the new app = 16 + 6 High Overtime rows CI3 could never find).
- **Exports:** identical, unfiltered and filtered by type and severity, when High Overtime rows are excluded from the comparison.
