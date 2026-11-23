# Parity report: Absence

**Phase:** 2 **Date:** 2026-11-20 **Reviewer:** pending

**CI3 reference:**

- `zamil-attendance/application/controllers/Absence.php`
- `models/Employee_model.php::get_absence_details`
- `views/pages/absence/list.php`
- `assets/js/pages/absence/list.js`

**New implementation:**

- `attendance/apps/api/src/modules/absences/`
- `attendance/apps/web/src/features/absences/`
- shared: `packages/shared/src/modules/absences.ts`

**Test data:** test ADW. **`XX_DIGI_EMP_ABSENCE_TYPE` is empty there**, so both apps return 0 rows.
The two queries were compared (both return 0 for the same period), and the SQL is covered by unit
tests. A row-by-row comparison needs test leave data (see Issues).

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

## 1. Routes and endpoints

| CI3                           | New                            | Outcome |
| ----------------------------- | ------------------------------ | ------- |
| `GET /report/absence`         | `GET /report/absence`          | Same    |
| `POST absence/list`           | `POST /api/v1/absences/list`   | Same    |
| `POST absence/export_absence` | `POST /api/v1/absences/export` | Same    |

## 2. Filters, search and pagination

| Filter                                     | CI3 behaviour                                                        | New behaviour                                                                            | Outcome                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Emp No                                     | `EMP_NO LIKE %v%`                                                    | Same                                                                                     | Same                                                                 |
| Employee, Department, Position, Leave type | case-insensitive contains                                            | Same                                                                                     | Same                                                                 |
| Approval status                            | select APPROVED / AWAITING / DENIED, matched with LIKE               | Same                                                                                     | Same                                                                 |
| Total days                                 | contains (API only; no UI field)                                     | Same                                                                                     | Same                                                                 |
| Leave from / to                            | overlap: end ≥ from, start ≤ to; UI converted the date to `DD-MM-YY` | same overlap, ISO dates bound with `TO_DATE(...,'YYYY-MM-DD')`                           | Same                                                                 |
| Stored dates that are not `DD-MM-YY`       | `TO_DATE` raised ORA-01861 and the whole page failed                 | `DEFAULT NULL ON CONVERSION ERROR`: the row is kept, it just doesn't match a date filter | Fixed                                                                |
| Default period                             | 21st of last month to the 20th of this month, every day of the month | same                                                                                     | Same                                                                 |
| Free-text search                           | API only (UI sent `''`)                                              | same: no search box                                                                      | Same                                                                 |
| Page size                                  | 30 (`paginate.pageLimit = 30`)                                       | 30                                                                                       | Same (corrected 2026-11-21; was 10)                                  |
| Reset                                      | clears every filter, the default dates too                           | same                                                                                     | Same (corrected 2026-11-21; Reset used to restore the default dates) |
| Order                                      | leave start date DESC (unparsable dates broke the query)             | leave start date DESC NULLS LAST, then Emp No                                            | Same                                                                 |

## 3. Columns (in order)

Emp No, Department, Employee Name, Position, Leave Start Date, Leave End Date, Total Days, Leave Type,
Approval Status: **Same**. Leave dates are shown as stored, as in CI3. The status badge colours follow
CI3: APPROVED = green, AWAITING = amber, DENIED = red.

## 4. Validation

Text filters are limited to 100 characters, and dates must be ISO dates; otherwise the API returns 400
with field issues. CI3 did no validation. **Fixed.**

## 5. Create / update / delete

Not applicable (read-only). Approve/deny lives in Manager View (phase 7).

## 6. Export

| Item      | CI3                            | New  | Outcome |
| --------- | ------------------------------ | ---- | ------- |
| Columns   | the 9 fields, raw column names | same | Same    |
| Encoding  | CSV, no BOM                    | same | Same    |
| File name | `absence_data_*.csv`           | same | Same    |

## 8. UI and UX

- [x] Zamil report layout, light and dark mode, responsive cards, all states
- [x] Filter badge shows the 2 default period filters; Reset returns to the current period

## 9. Side-by-side check

| Scenario                        | CI3    | New    | Outcome                        |
| ------------------------------- | ------ | ------ | ------------------------------ |
| Period 2026-10-21 to 2026-11-20 | 0 rows | 0 rows | Same (table empty in test ADW) |

## 10. Issues found

| #   | Description                                                         | Decision                                                                                                  | Status |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Test ADW has no leave data, so a row-level comparison is impossible | Load sample leave rows in test ADW (needs your approval), or compare later on data from the external feed | Open   |

## Sign-off

- [x] Lint, typecheck, tests and build pass
- [ ] Row-level comparison done once test data exists
