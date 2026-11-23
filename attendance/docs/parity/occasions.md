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

Legend: **Same** = as CI3 · **Fixed** = real CI3 bug corrected · **Design** = visual only · **Open**

> **Rule (2026-11-21):** only the design differs from CI3. Behaviour, access (no roles), defaults and
> exports match CI3; the only exceptions are fixes for real CI3 bugs (marked **Fixed**).

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

| Item                    | CI3                                                                                                                                              | New                             | Outcome |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------- |
| Validation              | Name required, max 255; dates required, To ≥ From ("To Date must be on or after From Date."); Type max 100; Y/N fields required; Remarks max 500 | same, same messages             | Same    |
| Shift list              | trimmed, de-duplicated, comma-joined, NULL when empty                                                                                            | same                            | Same    |
| Shift values            | not validated at all                                                                                                                             | must be numeric IDs             | Fixed   |
| Y/N fields              | dropdowns, default Y                                                                                                                             | Yes/No radio buttons, default Y | Design  |
| Shifts input            | dropdown + pills                                                                                                                                 | checkbox list                   | Design  |
| CREATED_BY / UPDATED_BY | meant to write the user name (else user id), but always wrote `SYSTEM`                                                                           | the user name, else the user id | Fixed   |
| Messages                | "Occasion added / updated / deleted successfully."                                                                                               | same                            | Same    |
| Writes                  | any signed-in user                                                                                                                               | any signed-in user              | Same    |

## Export

The 22 CI3 keys in CI3 order and formats, no BOM, file `occasion_data_*.csv`. **Same.**

## Round-trip check (test ADW, both apps)

| Scenario                                                                            | Result |
| ----------------------------------------------------------------------------------- | ------ |
| One occasion created in each app; both apps list the same two, shift names resolved | Same   |
| Author recorded (CI3 wrote SYSTEM)                                                  | Fixed  |

## Sign-off

- [x] Gates pass
