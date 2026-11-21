# Parity report: Attendance Card, Upload and Interface

**Phase:** 4 **Date:** 2026-11-21 **Reviewer:** pending

**CI3 reference:**

- `controllers/Attendance_card.php`
- `models/Attendance_card_model.php`
- `libraries/Attendance_file_reader.php`
- `views/pages/attendance_card/*`

**New implementation:**

- API: `apps/api/src/modules/attendanceCard/` (`fileParser.ts`, `repository.ts`, `routes.ts`)
- Web: `apps/web/src/features/attendanceCard/`

Legend: **Same** · **Fixed** · **Changed** (needs approval) · **Open**

## List (`/report/attendance-card`)

- **Filters:** Employee number contains, Employee name contains, Attendance date on the exact day. **Same.**
- **Search:** number, name, date. **Same.**
- **Order:** date DESC, then employee. **Same.**
- **Page size:** 30. **Same.**
- **Columns:** Employee Number, Employee Name, Attendance Date, Punch In, Punch Out. **Same.**
- **Punch display:** stored values are normalised to `HH:MM`, as CI3 did.
  - **Fixed:** `8:05` is now zero-padded.
  - **Fixed:** words that `strtotime` happened to accept, such as "noon", no longer show as times.
- **Export:** same five columns. **Changed:** ISO dates (CI3 used `d M Y`), UTF-8 BOM, file `attendance_card_data_*.csv`.
- **Header button:** the CI3 page had "Generate Attendance", which is phase 5. Here HR admins get "Upload File" instead. **Changed.**

## Upload (preview, then import)

**Same as CI3:**

- CSV and XLSX up to 10 MB; `.xls` refused with the CI3 message.
- The header row is found by name (Employee ID, Date, First Punch, Last Punch; First Name optional). `_`, `-` and extra spaces are ignored in header names.
- Both punches are required.
- Row errors use the CI3 texts, joined with commas: "Employee ID is empty", "Invalid date", "Invalid First Punch", "Invalid Last Punch", "Duplicate employee/date in uploaded file".
- The first duplicate in a file wins. The preview shows up to 100 rows and 100 errors. The import re-sends the file.
- Only employees active in `XX_DIGI_EMP_MASTER` are imported, and their master name replaces the name in the file.
- MERGE on employee + day, in batches of 200, in one transaction (any error rolls back the whole file).
- Messages: "Attendance file validated successfully.", "Attendance file imported successfully.", "No valid attendance rows were found."

**Fixed (CI3 bugs):**

| CI3 bug                                                                                                   | New behaviour                                                                |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `8.30` was read as a day fraction and stored as **07:12**; `0830` and `8` became 00:00                    | `8.30` and `0830` → 08:30; a bare `8` is rejected                            |
| `20240115` was treated as an Excel serial (far-future date)                                               | read as 2024-01-15                                                           |
| `5/1/2024` was read US-style (May 1), while `05/01/2024` was 5 January                                    | both day-first; month-first only when day-first is impossible (`01/15/2024`) |
| `strtotime` fallback accepted "now", "noon", `25:00`                                                      | unreadable values are rejected                                               |
| XLSX: empty rows skipped, so row numbers drifted; `sheet1.xml` used even when not the first visible sheet | real file row numbers; the first visible sheet is used                       |
| Inactive or unknown employees were dropped silently and the result still said "imported successfully"     | reported as **Skipped** with row numbers in the result                       |
| Import errors showed the wrong row numbers                                                                | real file row numbers                                                        |
| Header error named First Name as required                                                                 | "First Name is optional" in the message                                      |
| Import button stayed disabled after a failure                                                             | the user can retry                                                           |

**Changed:**

- Importing requires HR admin.
- The result table also lists skipped rows.

## Interface page (`/interface`)

- **Upload Attendance File:** works.
- **Generate Attendance** (the processing engine): shown as "Planned · phase 5".
- CI3 included both modals on the same page. **Same** layout intent.

## Round-trip check (test ADW, both apps)

| Scenario                                                        | Result |
| --------------------------------------------------------------- | ------ |
| Preview: 2 valid, 1 in-file duplicate; `7.58` read as 07:58     | Fixed  |
| Import: 1 inserted; an unknown employee is skipped and reported | Fixed  |
| CI3 shows the imported row with the master name, 07:58–16:05    | Same   |
| Re-importing the same file updates instead of duplicating       | Same   |
| Test rows removed afterwards                                    | done   |

## Sign-off

- [x] Gates pass; the file parser has 32 unit tests (dates, times, header detection, CSV/XLSX)
- [ ] Changed items approved
