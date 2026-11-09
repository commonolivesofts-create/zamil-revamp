# ExpenseHub — Technical Requirements Document (TRD)

Version 0.1 — 17 Oct 2026 · Implements [PRD](PRD.md) · Data in [DRD](DRD.md) · Fusion details in [INTEGRATION.md](INTEGRATION.md) · Endpoints in [API.md](API.md)

---

## 1. Architecture

```
 Browser (React SPA, Vite)                       Oracle Fusion Cloud (test pod / prod pod)
   │  HTTPS JSON, httpOnly session cookie          ▲ REST (invoices, rates, workers)
   ▼                                               │ SOAP BIP runReport (HCM, COA, trips, quick pays, payments)
 Node.js API (Express)  ───── fusion adapter ──────┘
   │  ├─ auth / RBAC / SoD checks                   Mail (SMTP) · Teams webhook · WhatsApp (phase 2)
   │  ├─ domain services (policy, reports, approval, audit, payables)
   │  ├─ jobs (node-cron, in-process)
   │  ├─ receipt store (server disk)  ──▶  storage/receipts/
   │  ├─ OCR / QR workers (tesseract.js, QR decoder)
   │  └─ repository interfaces (UnitOfWork)
   ▼
 DATA_MODE=memory → storage/dev-data.json   (now, D-33)
 DATA_MODE=oracle → Oracle ADW — schema XXZP, EH_* objects (D-43; node-oracledb, thin mode)   (M8)
```

Until M8 there is **no database and no Fusion connection** (D-33): the API runs with `DATA_MODE=memory` and `FUSION_MODE=mock`, and notifications go to a dev outbox. See §3.1.

One API process is enough for ~170 users / ~25 claims a month (D-20). **Do not add** Redis, message queues, microservices, Docker or Kubernetes.

## 2. Technology stack

Use the latest stable version of each at scaffold time; record exact versions in `package.json`.

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 24 LTS | Current LTS |
| Language | TypeScript (strict) — pending OQ-28 | Type-safe money and status logic |
| Monorepo | npm workspaces (`apps/web`, `apps/api`, `packages/shared`) | No extra tooling |
| Web | React + Vite + React Router | SPA, fast dev server |
| Web data | TanStack Query | Caching, refetch after mutations |
| Forms | React Hook Form + Zod (schemas from `packages/shared`) | Same validation client & server |
| Styling | Tailwind CSS with design tokens as CSS variables | Fast to match prototype; tokens swap for ZPI brand |
| Icons / charts | lucide-react · Recharts | Matches prototype |
| API | Express 5 | Simple, well known |
| Validation | Zod | Shared with web |
| Data layer | Repository interfaces + `DATA_MODE=memory` store persisted to JSON (D-33) | Build all flows before ADW exists; Oracle swaps in without touching services |
| DB driver | `oracledb` (node-oracledb) **thin mode** — added in M8 | No Oracle Instant Client needed; supports ADW wallet |
| SQL | Hand-written SQL in Oracle repository modules (M8), bind variables only | Oracle-specific features (identity, triggers, JSON) |
| Migrations | Numbered SQL files in `db/migrations` — **written now as the design deliverable, not executed** (D-33); applied from M8 by `npm run db:migrate` (own small runner, table `EH_SCHEMA_MIGRATIONS`) | No ORM lock-in |
| Jobs | `node-cron` with a lock row in the job-runs repository (`EH_JOB_RUNS`) | In-process, survives restarts |
| Uploads | `multer` (disk storage to temp, then move) | |
| Image/PDF | `sharp` (thumbnails), `pdfjs-dist` (render page 1 for QR/OCR) | |
| QR | `jsqr` (on raw image data) | Decode ZATCA TLV |
| OCR | `tesseract.js` (provider interface) — OQ-23 | Local, free |
| Email | Outbox + dev Mail page / console transport now (D-33); `nodemailer` SMTP adapter switched on at go-live (OQ-25) | |
| Logs | `pino` (+ `pino-pretty` in dev) | Structured |
| Auth | Session JWT in httpOnly cookie; `bcrypt` for local accounts — OQ-22 | |
| Tests | Vitest (unit), Supertest (API), Playwright (a few e2e smoke tests) | |
| Lint/format | ESLint + Prettier | |

## 3. Folder structure

```
expensehub/
├─ AGENTS.md  CLAUDE.md  README.md
├─ docs/                    PRD, TRD, DRD, INTEGRATION, API, UI-UX, BUILD-PLAN, DECISIONS, OPEN-QUESTIONS
├─ package.json             npm workspaces + root scripts
├─ .env.example             copy to .env (never commit secrets anywhere)
├─ secrets/                 ADW wallet, Fusion credentials file (not shared)
├─ storage/receipts/        receipt files (D-18)  YYYY/MM/<uuid>.<ext>
├─ storage/dev-data.json    memory-store snapshot (DATA_MODE=memory, D-33)
├─ backups/                 zip backups from npm run backup
├─ db/
│  ├─ migrations/           001_core.sql, 002_mirror.sql, … Oracle DDL — design deliverable, not executed until M8
│  └─ scripts/              data-reset.ts (now); migrate.ts, seed.ts, reset-dev.ts (M8)
├─ packages/shared/src/
│  ├─ money.ts              halala integer math, rounding
│  ├─ policy/               rule engine used by web (live) and api (authoritative)
│  ├─ status.ts             report/quick pay/advance status enums + allowed transitions
│  ├─ coa.ts                6-segment account build/parse/validate
│  ├─ zatca.ts              TLV decode + field validation
│  └─ schemas/              Zod schemas for every API payload
├─ apps/api/src/
│  ├─ server.ts  app.ts  config.ts (reads + validates env with Zod)
│  ├─ data/                 ports.ts (repository interfaces + DataLayer), entities.ts, index.ts (picks DATA_MODE),
│  │                        memory/ (store, persistence, repos), oracle/ (M8: pool.ts, tx.ts, repos),
│  │                        contract/ (repository contract tests run against every implementation),
│  │                        seed/ (typed seed: setup data + 16 demo users; loads through the repositories)
│  ├─ domain/               integrity.ts — service-layer SoD, history and transition guards (DB-01…DB-08)
│  ├─ auth/                 provider interface, local provider, session, rbac.ts
│  ├─ modules/<module>/     routes.ts, service.ts, *.test.ts (services use data/ports only)
│  │     expenses, receipts, reports, approvals, audit, payables, quickpays,
│  │     trips, advances, cards, setup, dashboards, notifications, migration, admin
│  ├─ integrations/fusion/  client.ts (REST), bip.ts (SOAP), mock/ (fixtures), int01…int09.ts
│  ├─ jobs/                 scheduler.ts + one file per job
│  └─ lib/                  errors.ts, logger.ts, storage.ts, ocr/, qr/
└─ apps/web/src/
   ├─ main.tsx  App.tsx  routes.tsx
   ├─ theme/                tokens.css (colours, radius, spacing), tailwind config
   ├─ components/           shell (sidebar, topbar, bottom tabs), ui (Button, Card, Table, Tag, Money, StatusPill, Stepper, Drawer)
   ├─ features/<module>/    pages + hooks per module
   └─ lib/                  api client, auth context, formatters
```

### 3.1 Data layer (D-33)

- **Ports:** `apps/api/src/data/ports.ts` declares one repository interface per DRD entity and a `UnitOfWork` with `withTransaction(fn)`. Services and routes import **only** these interfaces; `data/index.ts` builds the implementation from `DATA_MODE`. Adding the Oracle store in M8 must not change any service or route.
- **Memory store (`DATA_MODE=memory`):** typed collections keyed like the DRD tables; identity sequences; unique keys and optimistic locking (`version` → `VERSION_CONFLICT`) checked as Oracle would. A transaction works on a copy-on-write snapshot, commits by swapping it in and rolls back on any error; writes are serialised by an in-process mutex. After each commit the store is written atomically (temp file + rename) to `DATA_FILE`. On start: load `DATA_FILE` if present, else load the seed.
- **Integrity in the service layer:** status changes only via `transition()` against `packages/shared/status.ts`; history repositories expose `append` and `list` only (no update/delete); SoD guards (`assertNotClaimant` …) run in each service for DB-01…DB-04; DB-06…DB-09 are checked by the store's unique keys and service rules. The DDL triggers (DRD §5) become the second layer in M8.
- **Oracle DDL** lives in `db/migrations/*.sql` and must match the memory model (same tables, enums, keys); a test checks the enum CHECK lists against `status.ts`.
- **Seed:** `apps/api/src/data/seed/` is typed TypeScript, loads only through the repository interfaces, and is the single source for the memory store now and the Oracle seed later. Mirror data (employees, COA, rates, trips, Quick Pays) comes from the same Fusion mock fixtures the sync jobs read, so seed and sync agree.

## 4. Coding standards

1. **Money:** never use JS floating-point arithmetic for money. Convert to integer halalas (`Math.round(x*100)` only at input parsing), compute in integers, format at the edge. DB column type `NUMBER(14,2)`; rates `NUMBER(18,8)`.
2. **Dates:** store `TIMESTAMP WITH TIME ZONE` for events, `DATE` for business dates; display in `Asia/Riyadh`.
3. **Status changes** only through `reportService.transition(reportId, toStatus, actor, detail)` which checks the allowed-transition map in `packages/shared/status.ts`, writes `EH_REPORT_HISTORY`, and runs in the same unit of work (`withTransaction`).
4. **Data access:** only through repository interfaces (§3.1). In the Oracle store (M8): bind variables only — never string-concatenate user input; one repository function per query.
5. **Validation:** every route validates `params`, `query`, `body` with Zod from `packages/shared/schemas`.
6. **Errors:** throw `AppError(code, message, details?)` — the HTTP status comes from the code map in `packages/shared/src/errors.ts` so they can never disagree; one error middleware returns `{ "error": { "code", "message", "details" } }`.
7. **Authorisation:** every route declares required role(s) and a row-level check (`canViewReport`, `canActOnStep` …). Default deny.
8. **No feature without an ID:** each module file header lists the FR/INT IDs it implements.
9. **Windows-safe scripts:** use Node scripts and `cross-env`; no bash-only syntax; use `path.join`.
10. **Logs:** never log passwords, tokens, full bank data or receipt contents.

## 5. Authentication and authorisation

- **Provider interface** `AuthProvider { login(), logout(), currentUser() }` so OQ-22 (local vs Entra ID SSO) is swappable.
- **Local provider (phase 1 dev):** username = HCM person number; password bcrypt (cost 12, `bcryptjs` — pure JS, so no native build on Windows); first-login password set via emailed token (valid 24 h, only its SHA-256 stored); lock after 5 failed attempts for 15 min; unknown users cost the same bcrypt work (no enumeration by timing).
- **Session invalidation:** the JWT (`jose`) carries a fingerprint of the stored password hash, so a password change signs out every other session; a deactivated user or employee is signed out on the next request.
- **Dev quick-login (D-33):** seeded demo users (one per role across IPP/FPP/APP) have a known dev password; the login page shows a quick-login picker that calls `POST /auth/dev-login`. Both the route and the picker exist only when `NODE_ENV !== 'production'` and `DEV_QUICK_LOGIN=true`; the production build excludes the picker code. It signs in as a real user with that user's real roles — it is not a role switcher.
- **Session:** signed JWT (HS256, secret from env) in `httpOnly; SameSite=Strict; Secure (prod)` cookie, 8 h absolute, 30 min idle (refresh on activity). CSRF: require header `X-Requested-With: ExpenseHub` on mutating requests.
- **Roles:** `EMPLOYEE` (implicit for active employees), `APPROVER_HR`, `APPROVER_FIN_MGR`, `APPROVER_CEO`, `ACCOUNTANT`, `FINANCE_AP`, `PETTY_CASHIER`, `CARD_ADMIN`, `SYS_ADMIN`; assigned per BU in `EH_ROLE_ASSIGNMENTS`. Line-manager approval needs no role — it is derived from the supervisor hierarchy.
- **SoD:** service-layer checks, covered by tests, now (D-33); DB triggers (DRD §5) are added in M8 as the last line of defence.

## 6. Domain services (key logic)

| Service | Responsibility | IDs |
|---|---|---|
| `policyEngine` (shared) | Given expense, type (its limit, D-45), options → list of `{rule, level: PASS/WARN/BLOCK, message}` | FR-POL-* |
| `expenseService` | Create/update/delete unreported expense; FX conversion; VAT; account build; duplicate check | FR-CAP-* |
| `receiptService` | Store file, SHA-256, thumbnail, run QR then OCR, save JSON results | FR-CAP-02/03/04 |
| `reportService` | Create, submit, withdraw, correct, transitions, totals, netting | FR-REP-* |
| `approvalService` | Build chain from rules at submit, resolve approver (supervisor/role/delegate), act, escalate | FR-APR-* |
| `auditService` | Select (rules + deterministic sample), adjust lines, release/reject | FR-AUD-* |
| `payablesService` | Build invoice payload, send (idempotent), poll status, attach receipts | FR-PAY-*, INT-08/09 |
| `quickPayService` | Queue, create invoice, exclude | FR-QP-* |
| `accountingPreview` | Journal lines for a report (no persistence) | FR-ACC-01 |
| `notificationService` | Outbox table `EH_NOTIFICATIONS`; dispatcher job sends via email/Teams/WhatsApp adapters | FR-NTF-01 |

**Approval chain build (at submit):** pick the chain — `CEO_CLAIMANT` when the claimant holds `APPROVER_CEO`, else `STANDARD` (D-37); read its active `EH_APPROVAL_RULES` ordered by `seq`; for each rule evaluate its condition (`ALWAYS` / `TOTAL_GT` amount); resolve approver: `SUPERVISOR` → claimant's supervisor; `ROLE` → role holder for claimant's BU; apply active delegation; if resolved approver = claimant → go to that person's HCM supervisor, also for role steps, never the BU backup (FR-APR-07, D-34); insert `EH_APPROVAL_STEPS`. Chain is frozen at submit; rule changes affect new submissions only.

## 7. Jobs (node-cron, `Asia/Riyadh`)

| Job | Schedule | Does |
|---|---|---|
| `sync-hcm` (INT-01/02/03/07) | 01:00 daily + on demand | Employees, supervisors, default accounts, payee status |
| `sync-coa` (INT-04) | 01:30 daily | Segment values |
| `sync-trips-quickpays` (INT-05) | 02:00 daily + on demand | Business trips, Quick Pays |
| `sync-rates` (INT-06) | 06:00 daily | Corporate rates |
| `send-invoices` (INT-08) | hourly (only if option enabled, OQ-16) | Ready-for-payment → Fusion |
| `poll-invoice-status` (INT-09) | hourly 07:00–20:00 | Invoiced → Paid |
| `approval-sla` | hourly | Reminders day 2, escalation day 3 (phase 2) |
| `notification-dispatch` | every minute | Send outbox |

Each run inserts `EH_JOB_RUNS` (start, end, status, counts). A run is skipped if the previous run of the same job is still `RUNNING` and younger than 2 h. A failed run emails System Admin + Finance AP (template `SYNC_FAILED`).

Implementation note (M3): a small built-in timer scheduler (`apps/api/src/jobs/scheduler.ts`) replaces `node-cron` — every phase-1 job is "daily at HH:MM" Riyadh time (no daylight saving), and the next-run time feeds the integration monitor. `JOBS_ENABLED=false` turns scheduling off; "Run now" still works. M7 added hourly windows (`send-invoices`, `poll-invoice-status`: on the hour, 07:00–20:00). M9: `notification-dispatch` is an in-process every-minute loop (`modules/notifications/dispatcher.ts`), not an `EH_JOB_RUNS` job — a row a minute would drown the integration monitor; each message carries its own status, attempts (max 5) and error. Transports: `outbox` (dev — console line, messages stay on the dev Mail page), `smtp` (nodemailer, OQ-25; a sent password link is cleared from the outbox), and a Teams channel webhook for Finance events (OQ-26 A) when `TEAMS_WEBHOOK_URL` is set.

## 8. Fusion adapter

- `FUSION_MODE=mock|live`. **mock** (the only mode until M8, D-33) serves JSON/CSV fixtures from `integrations/fusion/mock/` and runs a simulated Fusion Payables that keeps created invoices in the data store, so the idempotency query, attachments, INT-09 polling (validated → paid / cancelled / voided) and injected errors (400, 429, 5xx, timeout) behave like live. The INT-08/09 logic, payload builder, retries and integration log are the real code; going live swaps only the transport client and the [VERIFY] field names.
- REST client: base URL from env, basic auth (or OAuth if OQ-21), `Accept: application/json`, timeout 30 s, 3 retries with backoff 2 s / 10 s / 30 s on 5xx/timeout only.
- BIP client: SOAP `ExternalReportWSSService` `runReport`, output CSV, base64 decode, parse with `csv-parse`.
- Every call → `EH_INTEGRATION_LOG` (request with secrets stripped, response truncated to 32 KB, http status, duration, retries).
- Full spec: [INTEGRATION.md](INTEGRATION.md).

## 9. Receipt storage, QR and OCR

- Path: `${RECEIPTS_DIR}/YYYY/MM/<uuid>.<ext>`; DB stores relative path, mime, size, SHA-256.
- Accept `image/jpeg`, `image/png`, `application/pdf`; verify by magic bytes, not only extension; max 10 MB; strip EXIF GPS from images.
- Served by `GET /api/v1/receipts/:id/file` after `canViewReceipt` check; `Content-Disposition: inline`.
- Pipeline on upload (synchronous is fine at this volume, target < 10 s): PDF → render page 1 → image; decode QR → if ZATCA TLV, validate (shared `zatca.ts`) → run OCR only for fields QR did not supply → save `qr_json`, `ocr_json`, `qr_valid`.
- Never delete receipt files of submitted reports (D-18); unreported-expense deletion moves the file to `storage/receipts/_deleted/`.
- Backup of `storage/` is part of `npm run backup`.

## 10. Configuration (`.env.example`)

```
NODE_ENV=development
APP_ENV=development                    # development (loopback) | test (LAN listeners)
API_PORT=7385
WEB_PORT=7386
APP_BASE_URL=http://localhost:7386
SESSION_SECRET=change-me-64-chars
TZ=Asia/Riyadh

DATA_MODE=memory                        # memory | oracle (oracle from M8, D-33)
DATA_FILE=./storage/dev-data.json

# Required only when DATA_MODE=oracle (M8)
# DB_USER=EXPENSEHUB
# DB_PASSWORD=
# DB_CONNECT_STRING=expensehub_low      # TNS alias from the ADW wallet
# DB_WALLET_DIR=../secrets/oracle/Wallet_zpadwtest
# DB_WALLET_PASSWORD=
# DB_POOL_MIN=1
# DB_POOL_MAX=5

FUSION_MODE=mock                        # mock | live (live from M8)
# Required only when FUSION_MODE=live
# FUSION_BASE_URL=https://<pod>.fa.<dc>.oraclecloud.com
# FUSION_USER=
# FUSION_PASSWORD=
FUSION_REST_VERSION=11.13.18.05
FUSION_BIP_PATH_PREFIX=/Custom/ExpenseHub

RECEIPTS_DIR=./storage/receipts
MAX_UPLOAD_MB=10
OCR_PROVIDER=tesseract                  # tesseract | none
NOTIFY_TRANSPORT=outbox                 # outbox (dev Mail page + console) | smtp (go-live, OQ-25)
# Required only when NOTIFY_TRANSPORT=smtp
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_FROM=ExpenseHub <expensehub@zamilplastic.com>
TEAMS_WEBHOOK_URL=
AUTH_PROVIDER=local                     # local | entra
DEV_QUICK_LOGIN=true                    # ignored (always off) when NODE_ENV=production
```

`config.ts` validates these with Zod at start-up and refuses to start on a missing required value. Requirements are conditional: `DB_*` only when `DATA_MODE=oracle`, `FUSION_BASE_URL/USER/PASSWORD` only when `FUSION_MODE=live`, `SMTP_*` only when `NOTIFY_TRANSPORT=smtp`. `NODE_ENV=production` with `DATA_MODE=memory` or `FUSION_MODE=mock` refuses to start.

## 11. Local development

| Command | Does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run dev` | API on :7385 and web on :7386 together (`concurrently`) — web proxies `/api` to API |
| PowerShell: `$env:APP_ENV='test'; npm run dev` | Test (LAN): web :7386 and API :7385 bind to all interfaces; use this PC's LAN IP and set `APP_BASE_URL` for links |
| `npm run data:reset` | Delete `storage/dev-data.json` and reload the seed (memory mode; refuses if `NODE_ENV=production`) |
| `npm run db:migrate` | *(M8)* Apply new migrations to ADW |
| `npm run db:seed` | *(M8)* Load the seed module into ADW |
| `npm run db:reset-dev` | *(M8)* Drop and recreate all EH objects (refuses if `NODE_ENV=production`) |
| `npm test` | Unit + API tests |
| `npm run e2e` | Playwright smoke tests |
| `npm run lint` / `npm run typecheck` | |
| `npm run backup` | Zip source (excl. `node_modules`, `storage`) + `storage/` to `backups/expensehub-YYYYMMDD-HHmm.zip` (replaces Git history, D-02) |

## 12. Testing requirements

- **Unit (must):** money, VAT, FX, policy engine, account builder, ZATCA decoder, status transitions, approval chain builder, audit selector, netting, invoice payload builder. Target ≥ 90 % lines in `packages/shared`.
- **API (must):** each endpoint's happy path, auth failure, role failure, SoD failure, validation failure.
- **Service integrity (must, now — D-33):** SoD (self-approval, self-audit, self-adjust), history append-only, illegal status transitions, optimistic locking — tested at the service layer.
- **Repository contract (must):** one shared suite run against every data implementation (memory now, Oracle in M8).
- **DB (must, M8):** SoD triggers and history immutability tested with direct SQL.
- **E2E (should):** employee submits → three approvers approve → accountant releases → finance sends → mock pays → status Paid.
- Tests use a fresh in-memory store per test (D-43: there is no separate test schema — Oracle repository tests run inside a transaction that is rolled back) — never `storage/dev-data.json` or dev data.

## 13. Security checklist (phase 1)
`helmet`, CORS only `APP_BASE_URL`, rate-limit login (10/min/IP), upload checks (§9), dev quick-login absent in production (§5), bind variables, output encoding (React default), no secrets in logs, receipts outside web root, `npm audit` clean of high/critical before each milestone sign-off.

## 14. Open questions for this document
OQ-20, OQ-21, OQ-22, OQ-23, OQ-24, OQ-25, OQ-26, OQ-28, OQ-29, OQ-30. See [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).
