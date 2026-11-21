# Parity report: Occasions

**Phase:** 3 **Date:** 2026-11-21 **Reviewer:** pending

**CI3 reference:**

- `controllers/Occasion.php`
- `models/Occasion_model.php`
- `views/pages/occasion/*`

**New implementation:**

- API: `apps/api/src/modules/occasions/`
- Web: `apps/web/src/features/setup/OccasionsPage.tsx`
- Shared: `packages/shared/src/modules/occasions.ts`

Legend: **Same** · **Fixed** · **Changed** (needs approval) · **Open**

## Endpoints

- `occasion/list`, `export_occasion`, `store`, `update/{id}`, `delete/{id}` → `POST /occasions/list`, `/export`, `POST /occasions`, `PUT` and `DELETE /occasions/{id}`. **Same.**
- `occasion/view/{id}` (its view file was missing) and the unused `edit/{id}` are not ported. **Fixed.**

## List

- **Filters:** name contains, type contains, From Date / To Date (containment: starts on or after, ends on or before), Count As Present / Paid Holiday / Is Active, and shift (API only, as in CI3). **Same.**
- **Search:** occasion name. **Same.**
- **Shift names:** resolved with LISTAGG, as in CI3. **Same.**
- **Order:** From Date DESC, then ID DESC. CI3's paged query had no outer ORDER BY, so rows came back in arbitrary order. **Fixed.**
- **Page size:** 30. **Same.**
- **Columns:** Occasion Name, From, To, Shift, Type, Count As Present, Paid Holiday, Is Active (Yes/No badges), Created At, Action. **Same.**

## Create / update / delete

| Item                    | CI3                                                                                                                                              | New                             | Outcome           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------- |
| Validation              | Name required, max 255; dates required, To ≥ From ("To Date must be on or after From Date."); Type max 100; Y/N fields required; Remarks max 500 | same, same messages             | Same              |
| Shift list              | trimmed, de-duplicated, comma-joined, NULL when empty                                                                                            | same                            | Same              |
| Shift values            | not validated at all                                                                                                                             | must be numeric IDs             | Fixed             |
| Y/N fields              | dropdowns, default Y                                                                                                                             | Yes/No radio buttons, default Y | Changed           |
| Shifts input            | dropdown + pills                                                                                                                                 | checkbox list                   | Changed           |
| CREATED_BY / UPDATED_BY | always `SYSTEM` (the session key was never set)                                                                                                  | the signed-in employee number   | Fixed             |
| Messages                | "Occasion added / updated / deleted successfully."                                                                                               | same                            | Same              |
| Writes                  | anyone                                                                                                                                           | HR admin only                   | Changed (approve) |

## Export

Readable headers, UTF-8 BOM, file `occasion_data_*.csv`. CI3 exported 22 raw keys. **Changed.**

## Round-trip check (test ADW, both apps)

| Scenario                                                                            | Result |
| ----------------------------------------------------------------------------------- | ------ |
| One occasion created in each app; both apps list the same two, shift names resolved | Same   |
| Author recorded as the employee number                                              | Fixed  |

## Sign-off

- [x] Gates pass
- [ ] Changed items approved
