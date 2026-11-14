# ExpenseHub BI Publisher reports (D-44)

One SQL data model per report. Each file's header comment gives its catalog path, data source, parameters and contract, plus the `EDIT` and `[VERIFY]` points. The CSV columns must match `apps/api/src/integrations/fusion/contracts.ts` exactly.

| File | Interface |
|---|---|
| `EH_HCM_EMPLOYEES.sql` | INT-01/02/03 |
| `EH_AP_EMPLOYEE_PAYEES.sql` | INT-07 |
| `EH_GL_SEGMENT_VALUES.sql` | INT-04 |
| `EH_HCM_BUSINESS_TRIPS.sql` | INT-05a: every field of the business leave request; the destination field is chosen with the option `TRIP_DESTINATION_FIELD` (D-46) |
| `EH_PAY_QUICK_PAYS.sql` | INT-05b |

There is no grade-limit report: D-45 removed grade limits and per diem (allowances are calculated in Quick Pay).
| `EH_AP_INVOICE_PAYMENTS.sql` | INT-09 |

- **Setup guide for the Fusion admin:** `docs/BIP-SETUP.html`, generated from `guide.template.html` and these files by `npm run docs:bip`. Edit the sources, then regenerate.
- **Check the reports in the pod (read-only):** `npm run fusion:bip-check [REPORT ...] [--invoice-ids=1,2] [--show-fields]`. It prints counts, column names and contract problems only. The one exception is `--show-fields`, which adds up to 3 sample values per leave-request field so the destination field can be found.
