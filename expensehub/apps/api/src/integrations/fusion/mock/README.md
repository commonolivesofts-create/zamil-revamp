# Fusion mock fixtures (FUSION_MODE=mock, D-33)

Each file reproduces what one Fusion interface returns (INTEGRATION.md §4). Column names and formats match the BIP CSV / REST contracts exactly, so the same parsers (`../contracts.ts`) and mappers (`../mappers.ts`) work in live mode.

| File | Interface | Edge cases included |
|---|---|---|
| `EH_HCM_EMPLOYEES.csv` | INT-01/02/03 | CEO and 1016 with no supervisor; 1017 inactive |
| `EH_AP_EMPLOYEE_PAYEES.csv` | INT-07 | 1014 has no active bank (`payee_ok='N'`); 1017 site inactive |
| `EH_GL_SEGMENT_VALUES.csv` | INT-04 | disabled location 004; end-dated cost centre 199 |
| `EH_HCM_BUSINESS_TRIPS.csv` | INT-05a | trip 300000030003 has no destination (DFF empty) |
| `EH_PAY_QUICK_PAYS.csv` | INT-05b | two run results in one payroll action (unique key is action + run result) |
| `currencyRates.json` | INT-06 (REST) | EUR has no rate after 2026-10-05 (stale-rate warning) |

The dev seed loads these files too, so seed data and sync results always agree. All people are fictional (`@zpi-demo.test`).
