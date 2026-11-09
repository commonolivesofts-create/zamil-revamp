# ExpenseHub — Phase 1 Build Plan

Version 0.1 — 17 Oct 2026 · For use with Claude Code in VS Code on localhost (D-02)

**How to use:** run **one milestone per Claude Code session**. Start each session with: *"Read AGENTS.md and docs/BUILD-PLAN.md. We are doing milestone Mx. Plan first, then build."* Close the milestone only when every "Done when" item is true. Run `npm run backup` at the end of each session (no Git).

Neither Oracle ADW nor Fusion access is needed until M8 (D-33): everything before runs with `DATA_MODE=memory` and `FUSION_MODE=mock`. Every open question uses its documented proposal (`// OQ-nn proposal` in code) until answered.

| # | Milestone | Depends on | Needs answered |
|---|---|---|---|
| M0 | Scaffold | — | OQ-28, OQ-29 |
| M1 | Data layer: repository interfaces + memory store + Oracle DDL files | M0 | — (OQ-20 moved to M8, D-33) |
| M2 | Auth, roles, shell | M1 | OQ-22 (proposal OK) |
| M3 | Setup screens + mock master data | M2 | OQ-32 (placeholders OK) |
| M4 | Expense capture + policy + receipts | M3 | OQ-08, OQ-14, OQ-23, OQ-24 |
| M5 | Reports + approval chain | M4 | **OQ-01, OQ-02** |
| M6 | Audit + accounting preview | M5 | **OQ-03**, OQ-33 |
| M7 | Payables hand-off + Quick Pays (mock) | M6 | OQ-07, OQ-16, OQ-19 |
| M8 | Oracle ADW + live Fusion | M7 | **OQ-12, OQ-13, OQ-14, OQ-15, OQ-20, OQ-21** |
| M9 | Dashboards + notifications | M5 | OQ-25 |
| M10 | Migration + UAT + go-live prep | M8, M9 | **OQ-09, OQ-31** |

---

### M0 — Scaffold
- npm workspaces: `apps/web`, `apps/api`, `packages/shared`; TypeScript strict; ESLint + Prettier; Vitest.
- Vite React app with Tailwind + tokens.css; Express API with `/health`; web proxies `/api` → :7385.
- `config.ts` with Zod env validation; `.env.example`; pino logger; error middleware.
- Root scripts from TRD §11 incl. `npm run backup` (Node script using `archiver`).
**Done when:** `npm install && npm run dev` opens the web page showing API health; `npm test`, `npm run lint`, `npm run typecheck` pass on Windows.

### M1 — Data layer: repository interfaces + memory store + Oracle DDL files (D-33)
- Repository interfaces for every DRD §3–4 entity, plus a `UnitOfWork` / `withTransaction` contract that services use. No service or route imports a concrete store.
- `DATA_MODE=memory` implementation: typed collections, identity sequences, unique-key and optimistic-lock (`version`) checks, transaction = snapshot + rollback on error; persisted atomically to `storage/dev-data.json`; first start loads the seed.
- Append-only history repositories (`append` + `list` only); status-transition map in `packages/shared/status.ts`; SoD guard helpers in the service layer.
- Seed data (DRD §6) as typed TypeScript, one source for the memory store now and the Oracle seed later; `npm run data:reset`.
- Oracle DDL in `db/migrations/*.sql` for all phase-1 tables, constraints and triggers DB-01…DB-09: **written, reviewed, not executed**.
**Done when:** `data:reset` and `dev` start cleanly from seed and survive a restart; a shared **repository contract test suite** passes against the memory store (the Oracle store must pass the same suite in M8); service-level tests prove self-approval, history update/delete and illegal status transitions are rejected; the seed integrity test passes.

### M2 — Auth, roles, app shell
- Local auth provider, session cookie, password set/reset (emails to the dev outbox / Mail page), lockout.
- Seeded demo users (one per role across IPP/FPP/APP) and a **dev-only quick-login picker** on the login page (never rendered or served when `NODE_ENV=production`).
- RBAC middleware + row-level helpers; `/auth/me`.
- Shell: sidebar, top bar, bottom tabs, role-based menu, dark mode.
**Done when:** seeded users can log in (password and quick-login); quick-login is absent in a production build; menus differ by role; API tests cover 401/403.

### M3 — Setup + master data (mock)
- Fusion adapter skeleton with mock mode; jobs INT-01/02/03/04/05a/05b/05c/06/07 reading fixtures; `EH_JOB_RUNS`; integration log.
- Setup screens: expense types, options, approval rules, audit rules, role assignments, prerequisites report, integration monitor (read-only), setup history.
**Done when:** "Run now" on each sync fills the mirror collections from fixtures; the 50 %-drop guard is tested; setup edits are logged.

### M4 — Expense capture, policy, receipts
- `packages/shared`: money, VAT, FX lookup, COA builder, ZATCA TLV decoder, policy engine — with unit tests first.
- Receipt upload, magic-byte check, SHA-256, QR → OCR pipeline (tesseract.js).
- Expense entry screen (UI-UX §5.2) with live checklist; unreported list; duplicate check (FR-CAP-10) if time allows.
**Done when:** all FR-CAP/FR-POL phase-1 tests pass; a receipt with a sample ZATCA QR fills seller, VAT no., total, VAT; BLOCK disables save.
**Status (18 Oct 2026): done.** Duplicate check (FR-CAP-10) included as WARN. Sample receipts: `npm run samples` → `docs/samples/`. OCR runs only when no valid QR (`OCR_PROVIDER=tesseract`, offline model). "Create report" on the list is a disabled placeholder until M5.

### M5 — Reports and approvals
- Create report, submit (prerequisites + blocks), number assignment, withdraw, correct.
- Chain builder from rules; inbox; approve / reject / request info; self-approval skip (FR-APR-07).
- Report drawer with stepper, items, approvals, history.
**Done when:** a SAR 6,000 report goes Line Manager → CEO → HR → Finance Manager → Accountant (per OQ-01 answer); a SAR 1,000 report skips CEO; the CEO's own claim goes Finance Manager → HR Manager → Accountant (D-37); a role holder's own claim goes to their HCM supervisor (D-34); every transition is in history.
**Status (18 Oct 2026): done** on the OQ-01 / OQ-02 proposals (D-38). Also built: request info + reply (OQ-06 proposal), draft delete, home "recent claims" and approvals count, workflow emails to the dev outbox. Until M6 the Accountant step is a normal approval and the last approval sets READY_FOR_PAYMENT.

### M6 — Audit + accounting preview
- Audit selector (rules + deterministic 10 %), audit workspace, verify receipt, adjust/disallow line, release, reject.
- Accounting preview endpoint + tab.
**Done when:** each audit rule has a test that selects a report; adjustments recalc totals and notify; preview debits = credits.
**Status (18 Oct 2026): done** on the OQ-03 / OQ-33 proposals (D-39). Audit queue + workspace, inbox audit rows, accounting preview tab in the report drawer and the workspace; resubmission resets audit adjustments.

### M7 — Payables hand-off + Quick Pays (mock Fusion)
- Invoice payload builder (INTEGRATION §5.3) with unit tests; idempotency check; send/retry; INT-09 poller; status mapping table.
- Finance payables screen; Quick Pay queue and invoice flow.
- Dev Fusion simulator panel (D-36): mark mock invoices validated / paid / cancelled / voided, auto-advance switch, "Open in Fusion test pod" link.
**Done when:** in mock mode a report goes READY → INVOICED → PAID from the simulator panel; sending twice creates one invoice; a mock 400 shows on the Errors tab with Retry.
**Status (18 Oct 2026): done** on the OQ-07 / OQ-16 / OQ-17 / OQ-18 / OQ-19 proposals. INT-08 (idempotent send, receipts attached, 4xx not retried) and INT-09 (hourly 07:00–20:00 job + "Refresh status") for reports and Quick Pays; Payables and Quick Pay screens; Fusion invoice + payment on the report; dev Fusion simulator. The live REST/BIP client stays M8.

### M8 — Oracle ADW + live Fusion (test pod)
- **Oracle ADW (OQ-20):** `oracledb` pool (thin mode, wallet), migration runner + `EH_SCHEMA_MIGRATIONS`, apply the `db/migrations` DDL, Oracle repository implementation (`DATA_MODE=oracle`), Oracle seed from the same seed module; `db:migrate`, `db:seed`, `db:reset-dev`.
- **Live Fusion:** build the 8 BIP reports in Fusion (Zaid), switch `FUSION_MODE=live`, verify every **[VERIFY]** field in INTEGRATION.md and update the doc.
- End-to-end: real employee in test pod → invoice validated → paid by a payment process request → PAID in ExpenseHub.
**Done when:** the repository contract suite passes against Oracle with **no change to services or routes**; SQL tests prove self-approval and history update are rejected by the triggers; phase-1 exit criterion is met in the **test** pod; INTEGRATION.md has no remaining [VERIFY] for phase-1 interfaces.

### M9 — Dashboards + notifications
- Employee, approver, finance dashboards from real data.
- Notification templates (submit, approve-next, reject, info request, audit adjustment, invoiced, paid) on the outbox; dev Mail page + console transport (D-33). SMTP adapter and Teams channel webhook (OQ-26 = A) are written behind the adapter interface but only switched on in M10.
**Done when:** each event puts one message for the right person on the dev Mail page; dashboards match totals computed directly from the repositories.
**Status (18 Oct 2026): done.** Employee / approver / finance dashboards (`/dashboards/*`) on a role-aware home (SVG charts, no chart library); new "invoiced" email; dispatcher with outbox, SMTP and Teams-channel adapters (SMTP and Teams off until M10: set `NOTIFY_TRANSPORT=smtp` + `SMTP_*`, `TEAMS_WEBHOOK_URL`). Open advance shows "—" until phase 2.

### M10 — Migration, UAT, go-live prep
- Migration import (dry run → commit) per OQ-09.
- UAT script per role; fix list; security checklist (TRD §13); production `.env` (`DATA_MODE=oracle`, `FUSION_MODE=live`, SMTP per OQ-25); backup of `storage/`.
**Done when:** Finance signs off UAT; first real claim paid in **production** (phase-1 exit).

---

## Phase 2 and 3 (outline)
**Phase 2:** cash advances + netting, duplicate check (if not in M4), ZATCA signature check, delegation/reminder/escalation, approve from email, receipts by email, Teams personal + WhatsApp, integration retry UI.
**Phase 3:** SAB card import and itemization, PWA + camera, Arabic RTL, spend analytics.
