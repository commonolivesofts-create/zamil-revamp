# Parity report: Employee Details

**Phase:** 2 **Date:** 2026-11-20 **Reviewer:** pending

**CI3 reference:**

- `zamil-attendance/application/controllers/Employee_details.php`
- `models/Employee_model.php::get_employee_details`
- `views/pages/employee_details/list.php`
- `assets/js/pages/employee_details/list.js`

**New implementation:**

- `attendance/apps/api/src/modules/employees/`
- `attendance/apps/web/src/features/employees/EmployeeDetailsPage.tsx`
- shared: `packages/shared/src/modules/employees.ts`

**Test data:** test ADW (`zpadwtest_tp`), 168 current employees. Both apps were queried with the
same filters by an automated comparison script.

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

## 1. Routes and endpoints

| CI3                                                       | New                                                           | Outcome | Notes                        |
| --------------------------------------------------------- | ------------------------------------------------------------- | ------- | ---------------------------- |
| `GET /report/employee-details` (also `/employee_details`) | `GET /report/employee-details`; `/employee_details` redirects | Same    |                              |
| `POST employee_details/list` (raw JSON)                   | `POST /api/v1/employees/list`                                 | Same    | Typed, zod-validated request |
| `POST employee_details/export_employee` (form fields)     | `POST /api/v1/employees/export` (JSON)                        | Same    |                              |

## 2. Filters, search and pagination

| Filter                               | CI3 behaviour                                     | New behaviour                                               | Outcome                             |
| ------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| Employee (full name)                 | `UPPER(FULL_NAME) LIKE %v%`                       | Same                                                        | Same                                |
| Emp No, Email, Job title, Department | case-insensitive contains                         | Same                                                        | Same                                |
| User ID                              | contains (API only)                               | Same (API only)                                             | Same                                |
| Joining date                         | `TO_CHAR(JOINING_DATE,'YYYY-MM-DD') = v`          | `JOINING_DATE` in [day, day+1), same result, index friendly | Same                                |
| Current employees only               | `CURRENT_EMP_FLAG = 'Y'`                          | Same                                                        | Same                                |
| `%` and `_` typed by the user        | acted as SQL wildcards                            | matched literally (`ESCAPE`)                                | Fixed                               |
| Free-text search                     | supported by the API, but the UI always sent `''` | same: no search box                                         | Same                                |
| Page size                            | 30 (`paginate.pageLimit = 30`)                    | 30                                                          | Same (corrected 2026-11-21; was 10) |
| Order                                | `HEADER_ID DESC`                                  | `HEADER_ID DESC, EMPLOYEE_NUMBER` (stable paging)           | Same                                |
| Invalid input                        | invalid JSON → 400; other values unchecked        | zod validation → 400 with field issues                      | Fixed                               |

## 3. Response fields and table columns (in order)

| #   | Column           | CI3 source                                                                  | New source                  | Format                           | Outcome               |
| --- | ---------------- | --------------------------------------------------------------------------- | --------------------------- | -------------------------------- | --------------------- |
| –   | #                | row number                                                                  | row number                  | hidden in the mobile card layout | Same                  |
| 1   | Emp No           | EMPLOYEE_NUMBER                                                             | employeeNumber              |                                  | Same                  |
| 2   | Employee Name    | FULL_NAME                                                                   | fullName                    |                                  | Same                  |
| 3   | Email            | EMAIL_ADDRESS                                                               | email                       | `—` when empty                   | Same                  |
| 4   | Job Title        | JOB_TITLE                                                                   | jobTitle                    |                                  | Same                  |
| 5   | Department       | DEPARTMENT                                                                  | department                  |                                  | Same                  |
| 6   | Joining Date     | JOINING_DATE (Oracle NLS string)                                            | joiningDate (YYYY-MM-DD)    | shown as `15 Jan 2020`           | Design                |
| –   | Response payload | `SELECT d.*`: all 74 columns sent to the browser, salaries and IDs included | only the 7 displayed fields |                                  | Fixed (data exposure) |

## 4. Validation rules and messages

| Field        | CI3                         | New                                         | Outcome |
| ------------ | --------------------------- | ------------------------------------------- | ------- |
| Text filters | trimmed; non-scalar ignored | trimmed, max 100 characters, `''` = not set | Fixed   |
| Joining date | any string                  | ISO date only                               | Fixed   |

## 5. Create / update / delete behaviour

Not applicable (read-only report).

## 6. Export

| Item             | CI3                                                                                   | New                                                                                            | Outcome                        |
| ---------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| Format, encoding | CSV, no BOM                                                                           | CSV, UTF-8 with BOM (Excel shows Arabic names correctly)                                       | Fixed                          |
| Columns          | every `XX_DIGI_EMP_MASTER` column (74): salaries, passport and iqama numbers included | the same raw headers for the 7 employee fields; salary, document and other HR columns left out | Fixed (data exposure; confirm) |
| Rows             | all matching rows                                                                     | all matching rows                                                                              | Same                           |
| File name        | `employee_data_YYYYMMDD_HHMMSS.csv`                                                   | same                                                                                           | Same                           |

## 7. Business rules

| Rule                   | CI3 (file:line)         | New (file)                        | Outcome |
| ---------------------- | ----------------------- | --------------------------------- | ------- |
| Current employees only | `Employee_model.php:78` | `modules/employees/repository.ts` | Same    |

## 8. UI and UX

- [x] Matches the Zamil design (the client's report layout and Orvexa classes); checked in light and dark mode
- [x] Responsive: rows become cards below 900 px (checked at 390 px)
- [x] Loading, empty and error (with retry) states
- [x] Labelled controls; keyboard-reachable scrolling table; screen-reader caption

## 9. Side-by-side check (automated, same data)

| Scenario                     | CI3 total | New total | Row order | Outcome |
| ---------------------------- | --------- | --------- | --------- | ------- |
| No filters, page 1           | 168       | 168       | identical | Same    |
| No filters, page 2           | 168       | 168       | identical | Same    |
| Department                   | 19        | 19        | identical | Same    |
| Full name (lower-case input) | 2         | 2         | identical | Same    |
| Job title                    | 46        | 46        | identical | Same    |
| Joining date                 | 1         | 1         | identical | Same    |
| Employee number prefix       | 53        | 53        | identical | Same    |
| Search                       | 20        | 20        | identical | Same    |
| CSV export rows              | 168       | 168       | n/a       | Same    |

## 10. Issues found

| #   | Description                                                                            | Where                                     | Decision                                     | Status                  |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------- | ----------------------- |
| 1   | List and export exposed salaries and personal document numbers to every signed-in user | CI3 `get_employee_details` (`SELECT d.*`) | Return and export only the displayed columns | Fixed (confirm with HR) |

## Sign-off

- [x] Lint, typecheck, tests and build pass
- [ ] Export columns: confirm leaving out salary and document columns
- [x] README phase table updated
