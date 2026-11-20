# Parity report: Function & Feature

**Phase:** 2 **Date:** 2026-11-20 **Reviewer:** pending

**CI3 reference:**

- `zamil-attendance/application/controllers/Function_feature.php`
- `views/pages/function_feature/index.php`
- `assets/js/pages/function_feature/list.js`

**New implementation:**

- `attendance/apps/web/src/features/functionFeature/` (static; no API)

## Content

- The catalogue (`catalogue.ts`) was **generated from the CI3 controller array**, not retyped: 7 groups,
  35 features. Titles, descriptions, statuses, priorities and benefits are identical.
- Summary cards: Total 35 · Available 16 · Proposed 19 · High priority 24. These equal the CI3
  controller's counts, and a unit test pins them.
- Group icons were mapped from Tabler (`ti ti-…`) to the equivalent Lucide icons used by Zamil.

## Behaviour

| Item                                              | CI3                                                     | New                                                 | Outcome |
| ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- | ------- |
| Route                                             | `/function_feature`                                     | `/function-feature` (`/function_feature` redirects) | Same    |
| Search                                            | text across the card's text                             | title, description, benefit and group title         | Same    |
| Category / Status / Priority filters              | yes                                                     | yes                                                 | Same    |
| Clear                                             | resets all filters                                      | resets all filters                                  | Same    |
| Result count ("N features shown") and empty state | yes                                                     | yes                                                 | Same    |
| Groups with no matching features                  | hidden                                                  | hidden                                              | Same    |
| Script reference                                  | layout pointed to a missing `function_feature/index.js` | n/a                                                 | Fixed   |

## UI

- [x] Zamil overview cards and filter styling; light and dark mode; responsive grid
- [x] Status and priority shown as badges: Available = green; priority high = red, medium = amber, low = grey

## Sign-off

- [x] Tests pin the catalogue counts and filter behaviour
- [x] No differences requiring approval
