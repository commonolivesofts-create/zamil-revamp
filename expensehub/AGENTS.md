# ExpenseHub — Agent Guide

ExpenseHub is the employee expense-claim web app for Zamil Plastic Industries (IPP, FPP, APP). Oracle Fusion stays the system of record; ExpenseHub captures, approves, audits and hands approved claims to Fusion Payables.

## Read first
1. `docs/DECISIONS.md` — **settled**; never re-open a decision.
2. `docs/OPEN-QUESTIONS.md` — 🔴 do not build past without an answer *unless D-33 says to use the proposal*; 🟡 build behind config using the proposal; ⚪ later phase.
3. `docs/BUILD-PLAN.md` — the current milestone and its "Done when".
4. Then the spec you need: `PRD` (what), `TRD` (how), `DRD` (data), `INTEGRATION` (Fusion), `API` (endpoints), `UI-UX` (screens).
5. `docs/reference/expensehub.html`, if present, is a **visual reference only**.

## Working rules
- **One milestone per session.** Plan first, then build. Close it only when every "Done when" item is true.
- Development defaults to localhost; the owner also authorizes the Zamil Test (LAN) profile via `APP_ENV=test` (D-02). **No Git.** Run `npm run backup` at the end of every session.
- **D-33:** no database and no Fusion yet. `DATA_MODE=memory`, `FUSION_MODE=mock`, notifications to the dev outbox. Services and routes use **repository interfaces only** (`apps/api/src/data/ports.ts`). Oracle DDL goes in `db/migrations/*.sql` and is not executed.
- **Open questions:** use the documented proposal and mark the code `// OQ-nn proposal`.
- SoD, append-only history and status transitions are enforced in the **service layer** and tested.
- Every module file header lists the FR/INT IDs it implements (TRD §4.8).
- Money in integer halalas; never JS floats. Dates: `Asia/Riyadh` display.
- No hard-coded UI text (all strings in `locales/en.json`); CSS logical properties only (RTL-ready).
- Windows-safe scripts: Node scripts, `cross-env`, `path.join`; no bash-only syntax.
- Never log passwords, tokens, bank data or receipt contents. Never put secrets in code.
- Do not add Redis, queues, microservices, Docker or Kubernetes (TRD §1).

## Commands
| Command | Does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run dev` | API :7385 + web :7386 (web proxies `/api`) |
| PowerShell: `$env:APP_ENV='test'; npm run dev` | Test (LAN): API :7385 + web :7386 bind to all interfaces |
| `npm run data:reset` | Delete `storage/dev-data.json` and reload seed data (memory mode) |
| `npm test` | Unit, service and API tests (fresh in-memory store per test) |
| `npm run samples` | Write demo receipts (valid ZATCA QR PNG + PDF, invalid QR, no-QR for OCR) to `docs/samples/` |
| `npm run e2e` | Playwright smoke tests (first time: `npx playwright install chromium` in `apps/web`) |
| `npm run build` | Production web build; fails if dev-only code (quick-login, dev mail, demo password) leaks into it |
| `npm run lint` · `npm run typecheck` · `npm run format` | Quality gates — must pass before a milestone closes |
| `npm run backup` | Zip source + `storage/` to `backups/expensehub-YYYYMMDD-HHmm.zip` |
| `npm run db:migrate` · `db:seed` · `db:reset-dev` | **M8 only** — Oracle ADW (`DATA_MODE=oracle`), schema `XXZP`, `EH_*` objects only (D-43) |
| `npm run db:ping` | ADW connection check (prints user, DB, `EH_*` object count — never secrets) |
| `npm run fusion:bip-check [REPORT…]` | Runs the BIP reports in the Fusion pod (read-only) against their CSV contracts; prints counts and problems, never row data |
| `npm run docs:bip` | Rebuilds `docs/BIP-SETUP.html` from `fusion/bip/` (edit the `.sql` files, then run this) |

## Dev sign-in
16 seeded demo users (D-35, person numbers 1001–1016) cover every role across IPP/FPP/APP; all share the dev password `ExpenseHub2026`. In development the login page has a **quick-login picker** (dev only, compiled out of production builds). It signs in as a real seeded user — it is not a role switcher. Password links and other emails appear on the dev Mail page (`/dev/mail`). Mock Fusion Payables invoices are moved through validated / paid / cancelled / voided on the dev **Fusion simulator** (`/dev/fusion`, D-36).
