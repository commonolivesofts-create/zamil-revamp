# Parity report: <Module name>

**Phase:** <n>  **Date:** <YYYY-MM-DD>  **Reviewer:** <name>

**CI3 reference:**
- `zamil-attendance/application/controllers/<X>.php`
- `models/<X>_model.php`
- `views/pages/<x>/`
- `assets/js/pages/<x>/`

**New implementation:**
- `attendance/apps/api/src/modules/<module>/`
- `attendance/apps/web/src/features/<module>/`

**Test data:** test ADW (`zpadwtest_tp`). Both apps were checked on the same data.

Outcome legend: **Same** = identical behaviour · **Fixed** = CI3 bug corrected (give the reason) ·
**Changed** = an intentional, approved difference · **Open** = not resolved yet.

## 1. Routes and endpoints
| CI3 | New | Outcome | Notes |
|---|---|---|---|
| `GET /…` | `GET /api/v1/…` | | |

## 2. Filters, search and pagination
| Filter | CI3 behaviour | New behaviour | Outcome |
|---|---|---|---|
| | | | |

## 3. Response fields and table columns (in order)
| # | Column | CI3 source | New source | Format | Outcome |
|---|---|---|---|---|---|
| 1 | | | | | |

## 4. Validation rules and messages
| Field | CI3 rule / message | New rule / message | Outcome |
|---|---|---|---|
| | | | |

## 5. Create / update / delete behaviour
| Action | CI3 | New | Outcome |
|---|---|---|---|
| | | | |

## 6. Export
| Item | CI3 | New | Outcome |
|---|---|---|---|
| Format, encoding, BOM | | | |
| Columns and order | | | |

## 7. Business rules
| Rule | CI3 (file:line) | New (file) | Outcome |
|---|---|---|---|
| | | | |

## 8. UI and UX
- [ ] Matches the Zamil design (Orvexa classes, tokens), in light and dark mode
- [ ] Responsive from 320 to 1920 px; touch targets 44 px
- [ ] Loading, empty and error states
- [ ] Keyboard and screen-reader labels; focus-trapped dialogs

## 9. Side-by-side check
| Scenario | CI3 result | New result | Outcome |
|---|---|---|---|
| | | | |

## 10. Issues found
| # | Description | Where | Decision | Status |
|---|---|---|---|---|
| | | | | |

## Sign-off
- [ ] Lint, typecheck, tests and build pass
- [ ] Every difference is Same, Fixed or Changed (approved)
- [ ] README phase table updated
