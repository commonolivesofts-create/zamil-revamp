# Parity report: Timetable

**Phase:** 3 **Date:** 2026-11-21 **Reviewer:** pending

**CI3 reference:**

- `controllers/Timetable.php`
- `models/Timetable_model.php`
- `views/pages/timetable/*`

**New implementation:**

- API: `apps/api/src/modules/timetables/`
- Web: `apps/web/src/features/setup/TimetablePage.tsx`
- Shared: `packages/shared/src/modules/timetables.ts`

Legend: **Same** · **Fixed** · **Changed** (needs approval) · **Open**

## Endpoints

- `timetable/list` and `export_timetable` → `POST /timetables/list` and `/export`. **Same.**
- `timetable/store`, which with a `uuid` meant "edit" → `POST /timetables` (new) and `PUT /timetables/{uuid}` (edit). **Same** behaviour, clearer routes.
- `timetable/delete/{id|uuid}` → `DELETE /timetables/{uuid}`. **Same.**
- `timetable/get_employee_by_number` → `GET /timetables/employee/{empNo}`. Same three messages: "Employee Number must be numeric.", "Please enter at least 3 digits for Employee Number.", "Employee not found for the provided Employee Number." **Same.**
- Dead routes (`create`, `view`, plus `update_timetable()`, `assignment_exists()`) are not ported. **Fixed.**

## List

- **Filters:** Emp No contains, Employee contains, Shift, Status, Start / End date on the exact day.
- **Order and page size:** `ID DESC`, 30 per page.
- **Content:** every version is shown, ACTIVE and INACTIVE. **Same.**
- **Created At:** formatted explicitly. CI3 read raw TIMESTAMPs without a format, so the column usually showed `-`. **Fixed.**

## Versioned save (CI3 saveTimetableVersion)

Steps, in one transaction:

1. On an edit, the edited row is set INACTIVE.
2. Other ACTIVE rows for the same employee and shift are set INACTIVE.
3. A new row is inserted with a new UUID.

**Same.** Differences:

| Item                                                     | CI3                                                                                                                                | New                                                                           | Outcome         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------- |
| Overtime Allowed / Exclude Timesheet                     | collected, then **never saved** (always `N`); the edit form did not load them                                                      | saved, and loaded on edit                                                     | Fixed           |
| Status chosen in the form                                | validated, then overwritten with ACTIVE                                                                                            | honoured: saving INACTIVE ends the assignment, and other rows are not touched | Fixed (approve) |
| Several ACTIVE rows for one employee on different shifts | possible                                                                                                                           | still possible (unchanged); processing uses the latest                        | Same (flagged)  |
| Validation                                               | Employee Number positive; Name required, max 150; Shift must exist ("Selected shift does not exist."); Start required; End ≥ Start | same messages                                                                 | Same            |
| Name lookup                                              | on every keystroke, no debounce                                                                                                    | when the number field loses focus                                             | Changed         |
| UPDATED_AT on deactivated rows                           | not touched                                                                                                                        | set                                                                           | Fixed           |

## Permissions

Viewing is open to all signed-in users. Add, edit and delete need HR admin. **Changed (approve).**

## Round-trip check (test ADW, both apps)

| Scenario                                                                        | Result |
| ------------------------------------------------------------------------------- | ------ |
| Create, then edit in the new app; CI3 shows 2 rows, newest ACTIVE, old INACTIVE | Same   |
| Overtime flag `Y` visible in CI3                                                | Fixed  |
| Employee lookup returns the master name                                         | Same   |

## Sign-off

- [x] Gates pass; repository versioning and rollback covered by tests
- [ ] Changed items approved (honouring Status, HR-admin-only writes)
