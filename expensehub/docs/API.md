# ExpenseHub — REST API Specification

Version 0.1 — 17 Oct 2026 · Base path `/api/v1` · JSON · Implements PRD §5

## 1. Conventions

- Auth: session cookie (TRD §5). Mutating requests require header `X-Requested-With: ExpenseHub`.
- Request/response schemas: Zod in `packages/shared/src/schemas/<module>.ts` — **the schema file is the contract**; this document lists endpoints and rules.
- Lists: `?page=1&pageSize=25&sort=-submittedAt&status=PENDING_APPROVAL&q=text` → `{ "items": [], "page": 1, "pageSize": 25, "total": 0 }`.
- Money in JSON: **string** with 2 decimals (`"1840.00"`) to avoid float issues; dates `YYYY-MM-DD`; timestamps ISO-8601 with offset.
- Errors: `{ "error": { "code": "POLICY_BLOCK", "message": "…", "details": {} } }`.
  Codes: `VALIDATION` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `SOD_VIOLATION` 403 · `NOT_FOUND` 404 · `INVALID_STATE` 409 · `VERSION_CONFLICT` 409 · `POLICY_BLOCK` 422 · `PREREQUISITE_MISSING` 422 · `RATE_LIMITED` 429 · `INTERNAL` 500 (no internal detail returned) · `FUSION_ERROR` 502. Source of truth: `packages/shared/src/errors.ts`.
- Optimistic locking: updates send `version`; mismatch → `VERSION_CONFLICT`.
- Access column: **Own** = claimant only; **Step** = current assignee of a pending step; **Fin** = FINANCE_AP/ACCOUNTANT for that BU; **Adm** = SYS_ADMIN.

## 2. Auth

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | `{username, password}` → sets cookie |
| POST | `/auth/logout` | any | |
| GET | `/auth/me` | any | person, roles per BU, BU, prerequisites status |
| POST | `/auth/password/request` | public | emails set/reset link (always 200) |
| POST | `/auth/password/reset` | public | `{token, password}` — signs out every other session |
| GET | `/auth/dev-users` | dev only (D-33) | demo users + dev password for the quick-login picker |
| POST | `/auth/dev-login` | dev only (D-33) | `{personNumber}` → sets cookie as that seeded user |
| GET | `/dev/mail` | dev only (D-33) | notification outbox rendered as emails |

Login and password endpoints are rate-limited to 10 per minute per IP (`RATE_LIMITED` 429). Dev-only routes are not registered at all unless `DEV_QUICK_LOGIN=true` and `NODE_ENV≠production`.

## 3. Reference data (read-only)

| Method | Path | Notes |
|---|---|---|
| GET | `/ref/expense-types` | active types with policy fields |
| GET | `/ref/coa?segment=COST_CENTER&q=` | segment values |
| GET | `/ref/rates?currency=USD&date=2026-10-12` | rate used for a date |
| GET | `/ref/trips/mine` | own approved trips |
| GET | `/ref/employees?q=` | Fin/Adm/approvers (for delegation pick) |
| GET | `/ref/options/public` | VAT rate, thresholds needed by the UI |

## 4. Expenses and receipts — FR-CAP, FR-POL

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/expenses?unreported=true` | Own | |
| POST | `/expenses` | Own | creates unreported; server runs policy; any BLOCK → `422 POLICY_BLOCK` with `details.results`; WARNs stored as violations; returns expense + violations |
| GET | `/expenses/:id` | Own, Step, Fin | M4: own only (404 otherwise); Step/Fin from M5/M6 |
| PATCH | `/expenses/:id` | Own (report DRAFT or unreported) | body = full input + `version`; re-runs policy |
| DELETE | `/expenses/:id` | Own (unreported only) | 204; its receipts move to `RECEIPTS_DIR/_deleted/` |
| POST | `/expenses/validate` | Own | dry-run policy on an unsaved payload (live checklist); body may carry `expenseId` (the line being edited) |
| POST | `/receipts` | Own | multipart `file` (JPG/PNG/PDF by magic bytes, ≤ `MAX_UPLOAD_MB`); EXIF stripped; returns `{receiptId, url, qr:{found, valid, fields, errors}, ocr:{engine, fields}, duplicate}` |
| POST | `/receipts/:id/attach` | Own | not built — M4 attaches by `receiptId` in the expense payload |
| GET | `/receipts/:id/file` | Own, Step, Fin | streams file inline, `nosniff`; 404 when not allowed (no existence leak) |
| GET | `/receipts/inbox` | Own | emailed receipts not yet used (phase 2) |

## 5. Reports — FR-REP

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/reports?status=` | Own | summaries incl. `currentStep {stepName, assigneeName, since}` (FR-REP-07) |
| POST | `/reports` | Own | `{purpose, expenseIds[]}` → DRAFT; lines must be own and unreported |
| GET | `/reports/:id` | Own, any step assignee (past/current), Fin | lines, current-cycle steps (with `note` BELOW_THRESHOLD / SELF_APPROVAL), history, totals, `permissions` for the caller; 404 when not allowed |
| PATCH | `/reports/:id` | Own, DRAFT (purpose only while info requested) | `{purpose, expenseIds?, version}` — `expenseIds` = the full set of lines |
| DELETE | `/reports/:id` | Own | 204; only a DRAFT that never got a number; its lines become unreported |
| POST | `/reports/:id/submit` | Own | `{version}`; checks prerequisites (`422 PREREQUISITE_MISSING`, `details.checks`) and re-runs policy on every line (`422 POLICY_BLOCK`, `details.lines`); builds chain; assigns number (OQ-19) on first submit |
| POST | `/reports/:id/withdraw` | Own | `{version}`; PENDING_APPROVAL, no step approved yet; the pending approver is emailed |
| POST | `/reports/:id/correct` | Own | `{version}`; REJECTED → DRAFT; next submit starts cycle n+1 from step 1 |
| POST | `/reports/:id/reply-info` | Own | `{comment}`; answers an info request (OQ-06); the approver is emailed |
| GET | `/reports/:id/accounting-preview` | Own, Step, Fin | FR-ACC-01 (M6) |
| GET | `/reports/:id/status` | Own | not built — the list's `currentStep` and the detail's stepper answer FR-REP-07 |

## 6. Approvals — FR-APR

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/approvals/inbox` | approver | pending steps assigned to me, oldest first, with flags `OVER_LIMIT · MISSING_RECEIPT · DUPLICATE · FOREIGN_CURRENCY · QR_INVALID · INFO_REQUESTED` (delegation: phase 2) |
| POST | `/approvals/:stepId/approve` | Step | `{comment?}`; opens the next step and emails its approver, or → READY_FOR_PAYMENT after the last step (PENDING_AUDIT arrives with M6); returns the report detail |
| POST | `/approvals/:stepId/reject` | Step | `{comment}` mandatory; cancels the remaining steps; report → REJECTED |
| POST | `/approvals/:stepId/request-info` | Step | `{comment}` mandatory; report stays PENDING_APPROVAL with `infoRequested` (OQ-06) |

A step that is not assigned to the caller answers 404 (no probing); one already decided answers `409 INVALID_STATE`. DB-01: the claimant never decides their own step.
| GET | `/approvals/email-action/:token` | public → sign-in | phase 2, FR-APR-06 |
| GET/POST/DELETE | `/delegations` | approver | own delegations (phase 2) |

## 7. Audit — FR-AUD

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/audit/queue` | Audit step | PENDING_AUDIT reports whose open audit step is mine, with reasons and receipts verified |
| POST | `/audit/:reportId/receipts/:receiptId/verify` | Audit step | returns the report detail |
| POST | `/audit/:reportId/lines/:expenseId/adjust` | Audit step | `{approvedAmount, reason}`; 0 = disallow; ≤ claimed; totals recalculated (VAT pro-rated); claimant emailed (LINE_ADJUSTED) |
| POST | `/audit/:reportId/release` | Audit step | `{comment?}` → READY_FOR_PAYMENT; audit outcome RELEASED |
| POST | `/audit/:reportId/reject` | Audit step | `{comment}` mandatory → REJECTED; audit outcome REJECTED |

"Audit step" = the assignee of the open audit (Accountant) step — normally the BU accountant, their HCM supervisor for their own claim (D-34); everyone else gets 404. Selected reports also appear in `/approvals/inbox` with `kind: "AUDIT"`. `GET /reports/:id/accounting-preview` (FR-ACC-01) returns `{lines: [{side, kind, account, accountName, amountSar}], totalDr, totalCr, balanced}`.

## 8. Payables and Quick Pays — FR-PAY, FR-QP

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/payables` | FINANCE_AP | READY_FOR_PAYMENT, INVOICED and paid (90 days) reports of my BUs, each with `queue` READY / INVOICED / PAID / ERROR, Fusion invoice + payment, `syncError`, `payeeReady`; plus `fusionPodUrl` |
| POST | `/payables/send` | FINANCE_AP | `{ids[]}` → INT-08 per report; returns `{items: [{id, ok, invoiceNumber, reused, warnings} \| {id, ok:false, error}]}`; a report already invoiced returns `ok, reused` (FR-PAY-05) |
| POST | `/payables/:reportId/retry` | FINANCE_AP | same result shape |
| POST | `/payables/refresh-status` | FINANCE_AP | runs INT-09 now; returns the job run |
| GET | `/quick-pays?status=` | FINANCE_AP | status `NEW` (no invoice yet), `INVOICE_REQUESTED`, `INVOICED`, `PAID`, `ERROR`, `EXCLUDED` |
| POST | `/quick-pays/invoice` | FINANCE_AP | `{ids[]}`; numbers `QP-<BU>-<YYYY>-<6>` (OQ-19); also retries ERROR rows |
| POST | `/quick-pays/:id/exclude` | FINANCE_AP | `{reason}` → 204 |
| GET | `/quick-pays/mine` | Own | read-only |

Dev only (D-36, `FUSION_MODE=mock`, quick-login on): `GET /dev/fusion` (mock invoices + the EH record behind each) · `POST /dev/fusion/invoices/:id/{validate\|pay\|cancel\|void}` (then runs INT-09) · `POST /dev/fusion/auto-advance {enabled}` · `POST /dev/fusion/fail-next {target, httpStatus}`.

## 9. Advances (phase 2) — FR-ADV

`GET/POST /advances` (Own) · `POST /advances/:id/approve|reject` (Step) · `POST /advances/:id/disburse` (PETTY_CASHIER, `{voucherNo}`) · `POST /advances/:id/refund` (PETTY_CASHIER, `{amount, voucherNo}`).

## 10. Setup and admin — FR-SET

| Method | Path | Access |
|---|---|---|
| GET/POST/PATCH | `/setup/expense-types[/:id]` | Adm |
| GET/PATCH | `/setup/options` | Adm |
| GET/POST/PATCH | `/setup/approval-rules[/:id]` | Adm |
| GET/PATCH | `/setup/audit-rules` | Adm |
| GET/POST/DELETE | `/setup/role-assignments[/:id]` | Adm |
| GET | `/setup/prerequisites?bu=&failingOnly=true` | Adm, Fin (FR-SET-02) |
| GET | `/admin/integrations` | Adm, Fin — last run per interface |
| GET | `/admin/integrations/log?interface=&status=` | Adm |
| POST | `/admin/jobs/:jobName/run` | Adm — on-demand sync |
| GET | `/admin/setup-history` | Adm |
| POST | `/admin/migration/upload` · `/admin/migration/:batchId/commit` | Adm (FR-MIG) |

## 11. Dashboards — FR-DSH

`GET /dashboards/employee` · `GET /dashboards/approver` · `GET /dashboards/finance?bu=` — each returns the figures listed in PRD FR-DSH-01/02/03 computed from real data.

## 12. Health
`GET /health` → `{status, db: "ok"|"error", dataMode, fusionMode, notifyTransport, env, version, time, uptimeSeconds}` (no auth, no secrets; 503 when the data store is down). Schema: `packages/shared/src/schemas/health.ts`.
