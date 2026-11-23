# Parity report: Daily Attendance, Leave Requests, Manager View (phase 7)

**Phase:** 7 **Date:** 2026-11-21 **Reviewer:** Claude (for Nauman Mirza)

**CI3 reference:** `controllers/{Daily_attendance,Leave_request,Manager}.php`,
`models/{Daily_attendance_model,Leave_model,Manager_model}.php`, `views/pages/{daily_attendance,leave,manager}/`,
`assets/js/pages/{daily-attendance,leave,manager}/`

**New implementation:** `apps/api/src/modules/{dailyAttendance,leaveRequests,manager}/`,
`apps/web/src/features/{dailyAttendance,leaveRequests,manager}/`, `apps/api/src/db/ebsSource.ts`

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

## EBS connection

| Item          | CI3                                                                                 | New                                                                                                 | Outcome           |
| ------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------- |
| Settings      | `EBS_DB_HOST/PORT/SID/USERNAME/PASSWORD/CONNECT_TIMEOUT` in `zamil-attendance/.env` | the same keys and values in `attendance/.env` (copied on first run)                                 | Same              |
| Connection    | `(DESCRIPTION=(CONNECT_TIMEOUT=…)(ADDRESS=…)(CONNECT_DATA=(SID=…)))`                | the same descriptor                                                                                 | Same              |
| VPN off       | PHP database error page                                                             | "Connect to the Zamil VPN (or office network) and try again." within ~10 s, then instantly for 30 s | Fixed             |
| Source switch | —                                                                                   | `EBS_SOURCE=ebs` (default) or `adw` for the copies of Option B in `EBS-CONNECTIVITY.md`             | Design (internal) |

## Daily Attendance

| Item           | CI3                                                                                                                                                                 | New                          | Outcome                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------- |
| Data           | first / last punch per employee per day from `ZPI.ICLOCK_TRANSACTION` + device tables (SQL verbatim)                                                                | same                         | Same                                   |
| Filters        | From / To (default today, Reset = today), Employee Search (name contains or exact number)                                                                           | same                         | Same (search wildcards escaped: Fixed) |
| Reversed range | "From date must be less than or equal to To date."                                                                                                                  | same                         | Same                                   |
| Tiles          | Scheduled, Checked In (on time), Late (total minutes), Not Checked In (absent), Missing Punch, Approved Leave (off-day) — late / absent / leave are always 0 in CI3 | same figures                 | Same                                   |
| Summary        | loaded every row into PHP to count                                                                                                                                  | counted in SQL, same figures | Same                                   |
| Columns        | #, Employee Code, Employee Name, Attendance Date (`DD-MON-YYYY`), Clock In, Clock Out, Work Hours (`0.00 hrs`)                                                      | same                         | Same                                   |
| Page size      | 15                                                                                                                                                                  | 15                           | Same                                   |
| Export         | `daily_attendance_YYYYMMDD_to_YYYYMMDD.csv`, BOM, 5 columns, header-only when empty                                                                                 | same                         | Same                                   |

## Leave Requests

| Item          | CI3                                                                                              | New                       | Outcome             |
| ------------- | ------------------------------------------------------------------------------------------------ | ------------------------- | ------------------- |
| Default dates | the dashboard period (21st before the latest processed date → that date); Reset returns to it    | same                      | Same                |
| Checks        | "Please select From Date and To Date." / "From Date cannot be greater than To Date."             | same                      | Same                |
| Tiles         | Approved, Pending (PENDING / AWAITING), Denied (DENIED / UNPLANNED), Total — by leave start date | same                      | Same                |
| Columns       | #, Employee, Type, From, To (as stored), Days, Status pill                                       | same                      | Same (pill: Design) |
| Page size     | 10                                                                                               | 10                        | Same                |
| Leave dates   | `TO_DATE(…, 'DD-MM-RR')` failed the page on one bad date                                         | bad dates read as no date | Fixed               |
| Leave balance | hard-coded 11.4 in the model, not shown on the page                                              | not shown                 | Same                |

## Manager View

| Item              | CI3                                                                                                                | New                                                                     | Outcome          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------- |
| Team              | current employees whose supervisor is the signed-in user (`USER_ID`)                                               | same                                                                    | Same             |
| Today             | any punch today = Present, else Absent (Late never set)                                                            | same                                                                    | Same             |
| This Period       | approved leave days (ADW), late days and overtime (EBS device table), 21st of last month to the 20th of this month | same                                                                    | Same             |
| Tiles             | Team Size, Present, Late, Absent, Pending Approvals                                                                | same                                                                    | Same             |
| Approval Queue    | AWAITING requests of the team, **no Approve / Deny buttons** (endpoint and script existed but were never wired)    | Approve / Deny buttons; only the manager's own team; only AWAITING rows | Fixed            |
| Access Model card | static table                                                                                                       | same content                                                            | Same             |
| EBS unreachable   | page failed                                                                                                        | team and approvals still shown, with the VPN notice                     | Fixed            |
| SQL               | employee numbers pasted into the SQL text                                                                          | bind variables, same rows                                               | Fixed (security) |

## Side-by-side check

EBS is reachable only on the Zamil VPN, which was off during this session, so the EBS pages could not be
compared live. Checked instead:

- **SQL:** the EBS queries were compared line by line with CI3.
- **Unit tests:** cover the summary maths, the export file, validation, the decision rules and the VPN-off behaviour.
- **Live, VPN off:** every EBS page answered with the VPN message within milliseconds after the first failure.
- **Live, ADW:** Leave Requests and the ADW part of Manager View ran on test ADW.

**To do on the VPN:** run the pages next to CI3 on the same day and compare the rows.
