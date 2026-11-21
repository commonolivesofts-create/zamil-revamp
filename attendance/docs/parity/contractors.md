# Parity report: Contractors, Contractor Employees, Contractor Summary (phase 8)

**Phase:** 8 **Date:** 2026-11-21 **Reviewer:** Claude (for Nauman Mirza)

**CI3 reference:** `controllers/Contractor.php`, `models/{Contractor_model,Con_employee_model}.php`,
`views/pages/{contractor,con_employee,contractor_summary}/`, `assets/js/pages/{contractor,con_employee,contractor_summary}/`

**New implementation:** `apps/api/src/modules/contractors/`, `apps/web/src/features/contractors/`,
`packages/shared/src/modules/contractors.ts`

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

**Data:** `XXZP.XX_CONTRACTOR_INFO` and `XXZP.XX_CON_EMPLOYEE_INFO` in **production EBS**, read and written exactly
as CI3 does (same connection). Writes happen only when a user saves on the VPN; nothing was written during
this session.

## Contractors

| Item       | CI3                                                                                                                         | New                     | Outcome |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------- |
| List       | newest first, 30 per page, search (number / name / status), filters: number (exact), name (contains), status                | same                    | Same    |
| Columns    | #, Contractor Number, Contractor Name, Start Date, End Date, Status, Rate / Hour, Created, Action                           | same                    | Same    |
| Add / edit | Contractor Number (required, 50, unique), Name (required, 200), Status (Active / Inactive), Rate (number), Start / End Date | same rules and messages | Same    |
| Save       | next id = MAX + 1, creator = signed-in user, only changed columns updated, "No changes detected."                           | same                    | Same    |
| Delete     | confirm, "Contractor deleted successfully."                                                                                 | same                    | Same    |
| Export     | `contractor_data_*.csv`, CI3 serializer keys                                                                                | same                    | Same    |

## Contractor Employees

| Item          | CI3                                                                                                                                                                                                                                                                                                    | New                                       | Outcome                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------ |
| List          | newest first, 30 per page, search, filters: division, department, contractor #, status, from start / to end date                                                                                                                                                                                       | same                                      | Same                                                   |
| Form          | division, contractor (fills name, status and rate via `contractor/lookup`; clearing it clears all three), status, rate, employee # (automatic), name, iqamah, department, production, job (fills the title), direct boss (fills the name), place, replacement, dates, Ajeer / Sfda / Blacklist, remark | same fields                               | Same (boss picker: select instead of datalist: Design) |
| Employee #    | next number of the contractor, or the contractor number for the first one                                                                                                                                                                                                                              | same                                      | Same                                                   |
| Edit          | the list label ("IPP") was put in the Division select, so every edit failed with "The Division field is required."                                                                                                                                                                                     | stored code used                          | Fixed                                                  |
| Empty vs NULL | an empty field next to a NULL column counted as a change                                                                                                                                                                                                                                               | treated as equal ("No changes detected.") | Fixed (as for Shifts)                                  |
| Production    | disabled and cleared for QC, MAINTENANCE, W/H, ADMIN (on change and when an edit opens)                                                                                                                                                                                                                | same                                      | Same                                                   |
| Dates         | no date rules on the server                                                                                                                                                                                                                                                                            | no date-order rule (format only)          | Same                                                   |
| Export        | `contractor_employee_data_*.csv`, CI3 serializer keys                                                                                                                                                                                                                                                  | same                                      | Same                                                   |

## Contractor Summary

| Item       | CI3                                                                                                                                   | New                    | Outcome |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| Filters    | Division (IPP BU / FPP BU / ALL), Contractor Name, Department, From / To (this month), Run; runs on open                              | same                   | Same    |
| Tabs       | Summary (subtotal per contractor and division, totals), Report (daily, hours capped 0–11.5), Summary Group Wise                       | same                   | Same    |
| Division   | the Summary tab compared the label ("IPP BU") with the code ("IBM"): always empty                                                     | compares the code      | Fixed   |
| Department | the Report tab filtered on a column alias inside its own query: Oracle error ORA-00904                                                | filter applied outside | Fixed   |
| Group Wise | `SELECT *` around a `GROUP BY` when a contractor or department filter is set: Oracle error ORA-00979                                  | grouped correctly      | Fixed   |
| Totals     | footer totals on every tab (Summary hours and cost, Report hours, Group Wise employees and cost), 0.00 when empty                     | same                   | Same    |
| Exports    | CSV (summary keys), Excel per tab (`Contractor_Summary`, `Contractor_Report`, `Contractor_Group_Summary`), Print per tab; CI3 headers | same                   | Same    |

## Side-by-side check

EBS was not reachable during this session (no VPN), so the contractor pages were not compared live. Checked instead:

- **SQL and messages:** compared line by line with CI3.
- **Unit tests:** cover validation messages, the unique number check, the insert transaction and the two summary fixes.
- **Live, VPN off:** every contractor page shows the VPN message.

**To do on the VPN:** compare the read-only lists and summaries with CI3 first. Saves write to production EBS, as CI3 does.
