# Parity report: Shifts and Sub Shifts

**Phase:** 3 **Date:** 2026-11-21 **Reviewer:** pending

**CI3 reference:**

- `controllers/Shifts.php`
- `models/Shift_model.php`
- `views/pages/shifts/*`
- `controllers/Shift_details.php`
- `models/Shift_detail_model.php`
- `views/pages/shift_details/*`

**New implementation:**

- API: `apps/api/src/modules/shifts/`
- Web: `apps/web/src/features/setup/{ShiftsPage,SubShiftsPage,ShiftWeekPage}.tsx`
- Shared: `packages/shared/src/modules/shifts.ts`

**Test data:** test ADW. A round-trip script created a shift and its weekly times in the new app, read them in CI3, edited the shift in CI3, read the edit back in the new app, then deleted everything (results in §9).

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

## 1. Endpoints

| CI3                                                                   | New                                                                  | Outcome                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `POST shifts/list`, `shifts/export_shift`                             | `POST /api/v1/shifts/list`, `/shifts/export`                         | Same                                                            |
| `POST shifts/store`, `shifts/update/{uuid}`, `shifts/delete/{uuid}`   | `POST /shifts`, `PUT /shifts/{uuid}`, `DELETE /shifts/{uuid}`        | Same                                                            |
| `shifts/edit/{uuid}`                                                  | `GET /shifts/{uuid}`                                                 | Same                                                            |
| `shifts/view/{uuid}` (not linked anywhere; its save wiped Gross Time) | none                                                                 | Fixed (dead page not ported; the Sub Shifts editor replaces it) |
| `shifts/create` (empty method)                                        | none                                                                 | Fixed (dead)                                                    |
| `POST shift-details/list`                                             | `POST /shift-details/list`                                           | Same                                                            |
| `GET shift-details/create?shift_uuid=`, `POST shift-details/save`     | `GET` / `PUT /shift-details/{uuid}`                                  | Same                                                            |
| none                                                                  | `GET /shifts/choices` (shift dropdowns, inactive included as in CI3) | Same (internal; serves the same shift lists)                    |

## 2. Filters and list

- **Shifts filters:** name contains, status equals, start date and end date on the exact day, check in and check out exact. **Same.**
- **Search:** name, status, dates, times. **Same.**
- **Order and page size:** `ID DESC`, 30 per page. **Same.**
- **Sub Shifts:** filters by name and status, order `ID DESC`, and every shift is listed even without detail rows. **Same.**
  - Page size 20. **Same.**
  - **Design:** each weekday is one cell, "07:00–16:00 · Gross 00:15", or "Off" when the day has no times. CI3 showed 21 separate columns with `-`.

## 3. Columns

- **Shifts:** Shift Name (links to the Sub Shifts editor, as in CI3), Start, End, Status badge, Check In, Check Out, Weekday OT Cap, Weekend OT Cap, Created At, Action. **Same.**
  - **Fixed:** a cap of `0` is shown (CI3 displayed `-`).
- **Action column:** shown to every signed-in user, as in CI3.

## 4. Validation (messages use the CI3 wording)

| Field                    | CI3                                                                                     | New                                                                  | Outcome |
| ------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------- |
| Shift Name               | required, max 100, unique ("The Shift Name already exists. Please use a unique value.") | same, same messages                                                  | Same    |
| Start / End Date         | required; End ≥ Start ("End Date must be on or after Start Date.")                      | same                                                                 | Same    |
| Status                   | ACTIVE / INACTIVE                                                                       | same                                                                 | Same    |
| Check In / Check Out     | required only: the HH:MM rule existed but was not wired up                              | required, HH:MM ("The Check In field must be a valid time (HH:MM).") | Fixed   |
| Overtime caps            | free text, max 20, no format rule                                                       | same                                                                 | Same    |
| Check Out after Check In | rule existed, not wired up                                                              | not enforced (overnight shifts are valid)                            | Same    |
| Sub Shift rows           | Punch In/Out paired, HH:MM, Gross HH:MM; same messages                                  | same, field by field                                                 | Same    |

## 5. Create / update / delete

- **Update writes only changed columns.** If nothing changed: "No changes detected." **Same.**
  - **Fixed:** CI3 treated an empty cap and NULL as different, so it never said "No changes detected." in that case.
- **Delete:** CI3 hard-deleted the shift. It orphaned the weekly rows and left timetables pointing at a missing shift.
  - New: the shift and its weekly rows are deleted in one transaction.
  - Deletion is **refused while active timetables use the shift**: "This shift is assigned in N active timetable(s). Set the shift to INACTIVE instead, or end those assignments first." **Fixed.**
- **Sub Shifts save:** upsert per day in one transaction; the header status is copied to the detail rows. **Same.**
  - Messages: "Shift details saved successfully." / "Shift details updated successfully." **Same.**
- **Access:** any signed-in user can add, edit and delete, as in CI3. **Same.**

## 6. Export

- Shifts CSV: the 19 CI3 keys in CI3 order and formats, no BOM, file `shift_data_*.csv`. **Same.**
- Sub Shifts: no export, as in CI3. **Same.**

## 9. Round-trip check (test ADW, both apps)

| Scenario                                                           | Result |
| ------------------------------------------------------------------ | ------ |
| Shift created in the new app appears in CI3 with identical fields  | Same   |
| Weekly pivot identical (Sun 07:00–16:00, gross 00:15; Fri/Sat off) | Same   |
| Shift edited in CI3, change visible in the new app                 | Same   |
| Re-saving unchanged values: "No changes detected."                 | Same   |
| Deleting a shift with an active timetable is refused (409)         | Fixed  |

## Sign-off

- [x] Lint, typecheck, tests (repository SQL, validation, permissions) and build pass
- [x] Only design differences remain
