# Attendance: Zamil Attendance System (React + Node.js)

This app rebuilds the legacy CodeIgniter 3 attendance system ([`../zamil-attendance/`](../zamil-attendance/))
as a TypeScript monorepo:

- an Express 5 API;
- a React 19 web app;
- a shared zod package.

It follows the architecture of [`../traininghub/`](../traininghub/) and [`../expensehub/`](../expensehub/),
and **looks exactly like the main Zamil Digitalization client** ([`../client/`](../client/)).

> **Status:** Phases 0–6 done: platform; Employee Details, Absence, Function & Feature; Shifts, Sub
> Shifts, Timetable, Occasions; Attendance Card with file upload; attendance processing (Generate Attendance); Timesheet, Payroll File, Alerts & Exceptions, Dashboard. Other menu items show a "planned" notice. See [Phases](#phases) and [`docs/parity/`](docs/parity/).

## Hard rules

1. **Never modify `zamil-attendance/`.** It is the reference implementation. Every module is compared
   against it (see [Parity method](#parity-method)).
2. **Same data, same tables.** The new app reads and writes the same Oracle objects as the CI3 app, so both
   can run side by side on the test ADW and be compared.
3. **Test databases only** in development: the Zamil Revamp test ADW, and an EBS test instance once one is
   available. Never use production. Schema changes need explicit approval and go through
   [`../zamil-attendance/db/attendance_schema.sql`](../zamil-attendance/db/attendance_schema.sql).
4. **One design system.** Use the main client's Orvexa CSS, icons and theme. No Tailwind, no copied
   tokens, no new UI framework.
5. **No secrets in git.** All credentials live in `attendance/.env` (git-ignored); `.env.example`
   documents the keys.
6. **Only the design changes.** Behaviour, access and data stay exactly as in CI3: no roles, no new
   rules, same defaults, same exports. The only exceptions are fixes for real CI3 bugs that saved wrong
   data or broke pages; each one is listed in the parity reports.

## Architecture

```
attendance/
  README.md  AGENTS.md  .env.example  package.json (npm workspaces)  tsconfig.base.json
  eslint.config.js  .prettierrc.json  vitest.config.ts  .gitignore
  apps/api/                Express 5 + TypeScript (tsx), node-oracledb thin, pino, zod, helmet
    src/server.ts          bootstrap, graceful shutdown
    src/app.ts             middleware chain, /api/v1 mount, error handler
    src/config.ts          zod-validated env -> typed AppConfig
    src/services.ts        composition root (pools, repositories, services)
    src/auth/              zamil-sso.ts, session.ts, middleware.ts, identity.ts
    src/db/                oracle.ts (ADW + EBS pools), sql.ts (binds, paging, CSV streaming)
    src/modules/<module>/  routes.ts, service.ts, repository.ts, *.test.ts
    src/domain/            payrollPeriod.ts, processing/ (pure, unit-tested business rules)
    src/lib/               errors.ts, logger.ts, csv.ts
  apps/web/                React 19 + Vite + TypeScript, TanStack Query, react-router
    src/app/               router (lazy routes), providers, AuthGate
    src/shell/             AppShell, Sidebar, Header (Orvexa markup mirrored from client/)
    src/components/        shared building blocks (see DRY building blocks)
    src/features/<module>/ Page.tsx, hooks.ts, columns.ts, form.tsx
    src/lib/               api.ts, zamil-login.ts, format.ts, export.ts
    src/styles/            attendance-only CSS (zat- prefix)
  packages/shared/         zod schemas, DTO types, enums, error codes, payroll period
  scripts/                 ensure-env.mjs, sync-orvexa.mjs
  docs/parity/             one CI3-vs-new comparison report per module
```

| Concern        | Choice                                                                                      | Source pattern                                  |
| -------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Ports          | API **7387**, web **7388** (web proxies `/api` to the API)                                  | Hubs use 7383/7384 and 7385/7386                |
| Runtime        | Node.js 24, ES modules, TypeScript strict                                                   | `expensehub/package.json`, `tsconfig.base.json` |
| API            | Express 5, zod validation, helmet, pino with redaction                                      | `expensehub/apps/api/src/app.ts`                |
| Error envelope | `{ error: { code, message, details? } }` with shared `ERROR_HTTP_STATUS`                    | `expensehub/packages/shared/src/errors.ts`      |
| Lists          | `POST /…/list` with `{ page, limit, filters, search }` and response `{ items, pagination }` | Same shape as the CI3 list endpoints, typed     |
| Database       | node-oracledb **thin** mode; ADW pool (wallet, alias `zpadwtest_tp`) + EBS pool             | `traininghub/apps/api/src/db/oracle.ts`         |
| Web data       | TanStack Query (query-key factories per feature), one `api.ts` fetch wrapper                | `expensehub/apps/web/src/lib/api.ts`            |
| Tests          | Vitest + supertest (stubbed repositories); golden tests for processing                      | `expensehub/apps/api/src/test-utils.ts`         |
| Quality gates  | `npm run lint`, `typecheck`, `test`, `build`                                                | `expensehub/AGENTS.md`                          |

### Why the ADW alias is `_tp`

The ADW `_high` service turns on parallel DML. A transaction that reads a table after writing it then fails
with **ORA-12838**. The attendance import and shift-detail save both do this. The CI3 app was moved to
`zpadwtest_tp` for the same reason.

## Authentication: Zamil single sign-on

The app has no login page. It reuses the Zamil session, exactly like TrainingHub and ExpenseHub:

1. The web app calls `GET /api/v1/auth/me`. On a 401 it calls `POST /api/v1/auth/sso`.
2. The API reads the HttpOnly Zamil cookie (`zr_session` / `__Host-zr_session`; same hostname, any port)
   and validates it server-side with `GET {ZAMIL_AUTH_API_BASE_URL}/auth/me`.
3. The returned employee number is mapped to `XX_DIGI_EMP_MASTER.USER_ID`. The API then issues its own
   `at_session` cookie: HttpOnly, SameSite=Strict, an 8 h absolute limit capped at the Zamil expiry, and
   30 min idle. The Zamil session is re-validated on later requests.
4. Every non-GET request must send `X-Requested-With: Attendance` (CSRF guard; same origin through the
   Vite proxy).
5. Signing out revokes the central Zamil session (`/auth/csrf` then `/auth/logout`) and returns to the
   Zamil login. Port `7388` is added to the hub port list in `lib/zamil-login.ts`.

The source to reuse is `traininghub/apps/api/src/auth/{zamil-sso,session}.ts`. Moving it into a package
shared by all three hubs is a later step that needs architecture approval.

**Access** is the same as CI3: every employee signed in through Zamil can open every page and change
every record. There are no roles.

## Databases

| Pool | Target (development)                                                                                                                                                  | Objects                                                                                                                                                                                                                            | Used by                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| ADW  | Zamil Revamp **test** ADW, schema `XXZP`, wallet `../secrets/oracle/Wallet_zpadwtest`, alias `zpadwtest_tp`                                                           | `XX_DIGI_EMP_MASTER`, `XX_DIGI_SHIFT_PR`, `XX_DIGI_SHIFT_PR_DTL`, `XX_DIGI_TIMETABLE_PR`, `XX_DIGI_ATT_OCCASIONS`, `XX_DIGI_ATT_ATT_CARD`, `XX_DIGI_ATT_ATT_SHEET`, `XX_DIGI_ATT_PYRL_FILE_ADJ`, `XX_DIGI_EMP_ABSENCE_TYPE`        | Almost every module                         |
| EBS  | E-Business Suite. Today only production (`ZPIL`) exists, and it is unreachable off-LAN. A **test instance and least-privilege account are required** before Phase 7/8 | `ZPI.ICLOCK_TRANSACTION`, `ZPI.PERSONNEL_EMPLOYEE`, `ZPI.ATT_PAYLOADBASE`, `ZPI.XX_TIMETABLE`, `XXZP.XX_CONTRACTOR_INFO`, `XXZP.XX_CON_EMPLOYEE_INFO`, `HR_ORGANIZATION_UNITS`, `PER_JOBS_TL`, `PER_PEOPLE_X`, `PER_ASSIGNMENTS_X` | Daily Attendance, Manager View, Contractors |

Data formats the code must respect (they come from the existing tables):

- Time-of-day values are `'HH24:MI'` strings.
- In `ATT_SHEET`, LATE, EARLY and TOTAL_MINUTES are **minutes** and OVERTIME is **hours**, all stored as
  numeric strings.
- Leave dates in `XX_DIGI_EMP_ABSENCE_TYPE` are free-text strings (`DD-MM-YY` and others).
- Occasion `SHIFT_ID` is a comma-separated list of shift IDs.

## Design system

The UI must be indistinguishable from the main Zamil client, including light/dark mode, accent theme,
density and responsive layout.

- **Reuse, don't copy.** `scripts/sync-orvexa.mjs` copies these into `apps/web/public/` before dev and build
  (the output is git-ignored):
  - `client/public/orvexa/assets/css/*`
  - `client/public/orvexa/assets/vendor/lucide.min.js`
  - `client/public/theme-init.js`

  `client/` stays the single source of truth.

- The client's own layout and report stylesheets are **imported directly** through the `@zamil`
  Vite alias (`apps/web/src/styles/index.ts`): `index.css`, `workspace.css`, `hr-insight-report.css`,
  `report-table.css`, `security-admin*.css`, `PageState.css`, `ContentSkeleton.css`. They are never
  copied.
- `apps/web/index.html` links the stylesheets **in the same order as `client/index.html`**, ending with
  `theme-green.css`, and loads `theme-init.js` and `lucide.min.js` as external scripts (no inline
  scripts).
- Use only existing template and app classes: `ux-panel`, `ux-input`, `ux-select`, `ux-table-wrap`,
  `ux-table`, `ux-badge`, `btn-primary`, `btn-secondary`, `zrv-*`, `sidebar-*`. Attendance-specific CSS
  lives in `src/styles/` with the **`zat-`** prefix, using the design tokens (`--primary`, `--surface`,
  `--text`, `--line`, …). Never hard-code colours.
- Icons: a TypeScript port of `client/src/components/icons/OrvexaIcon.jsx` (Lucide 0.468 via
  `window.lucide`). The Shell markup mirrors `client/src/components/layout/{Sidebar,Header}.jsx`.
- Follow [`../client/docs/SHARED-COMPONENTS-AND-PATTERNS.md`](../client/docs/SHARED-COMPONENTS-AND-PATTERNS.md),
  [`../client/docs/RESPONSIVE-REVIEW.md`](../client/docs/RESPONSIVE-REVIEW.md) and
  [`../docs/FORM-UX-QUALITY.md`](../docs/FORM-UX-QUALITY.md):
  - accessible labels and inline errors;
  - 44 px touch targets;
  - layouts that work from 320 to 1920 px;
  - every state shown (loading, empty, error).
- Navigation keeps the CI3 menu groups: **Main**, **Reports**, **Contractors**, **Interface & Jobs**,
  **Planning**.

## Coding standards

### DRY building blocks (build once in Phase 1, reuse in every module)

| Building block                                                                                                                | Where                     | Replaces in CI3                                                       |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------- |
| `listQuerySchema` + `paged<T>()`                                                                                              | `packages/shared`         | about 15 copies of `get_X_list('total'\|'list')` + pagination helpers |
| `listRepository` helpers (whitelisted filters, `OFFSET/FETCH`, binds, count)                                                  | `apps/api/src/db/sql.ts`  | Hand-built SQL per model                                              |
| CSV export (UTF-8 BOM, same columns as CI3)                                                                                   | `apps/api/src/lib/csv.ts` | `fputcsv` per controller                                              |
| `ReportPage` (filters, columns, KPI cards, pager, export) driven by config                                                    | `apps/web/src/components` | One view + JS file per list                                           |
| `DataTable`, `FilterPanel`, `Pager`, `Dialog`, `ConfirmDialog`, `Field`, `Toast`, `Badge`, `KpiCard`, `PageState`, `Skeleton` | `apps/web/src/components` | Bootstrap markup, Toastify, SweetAlert2                               |
| `useCrud(resource)` hooks (list / create / update / delete + cache invalidation)                                              | `apps/web/src/lib`        | Per-page jQuery AJAX                                                  |
| `payrollPeriod(date)` (21st to 20th)                                                                                          | `packages/shared`         | Four different definitions in CI3                                     |
| Time helpers (`HH:MM` ↔ minutes, overnight wrap)                                                                              | `packages/shared`         | Repeated in several models                                            |

### React rules

- Function components and hooks only. One component per file, named exports, PascalCase `.tsx`.
- **Server state lives in TanStack Query.** Local UI state uses `useState`/`useReducer`. No global store.
- No business rules in JSX. Rules live in `packages/shared` or `apps/api/src/domain` and are unit-tested.
- Typed props, with no `any`. Inputs are validated with the same zod schema on both sides.
- Routes are lazy-loaded per feature, with `Suspense` and skeleton fallbacks.
- No `console.*`, no `dangerouslySetInnerHTML`, no fake data in production views.
- Accessibility: semantic HTML, labelled controls, focus-trapped dialogs, keyboard support.

### API rules

- Controller (routes) → service → repository. SQL only in repositories, always with **bind variables**
  (never string-built values; the CI3 Manager model concatenates them).
- Every request is validated with zod, and every error goes through the shared envelope.
- Writes run in one transaction, with an audit user (`USER_ID`) where the table has one.
- Long work (attendance processing) runs as a background job with progress, not one blocking request.

## Module inventory

Each CI3 module and the phase where it is rebuilt. Unless noted, the CI3 files are
`application/controllers/<X>.php`, `models/<X>_model.php`, `views/pages/<x>/` and
`assets/js/pages/<x>/`.

| Module                                                  | CI3 entry points                                                                                                     | Tables (DB)                                                                        | Kind             | Phase |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------- | ----- |
| Employee Details                                        | `/report/employee-details`, `employee_details/list`, `/export_employee`                                              | EMP_MASTER (ADW)                                                                   | Report           | 2     |
| Absence                                                 | `/report/absence`, `absence/list`, `/export_absence`                                                                 | EMP_ABSENCE_TYPE (ADW)                                                             | Report           | 2     |
| Function & Feature                                      | `/function_feature`                                                                                                  | none (static)                                                                      | Static           | 2     |
| Shifts                                                  | `/shifts`, `list`, `store`, `edit/{uuid}`, `update/{uuid}`, `delete/{uuid}`, `view/{uuid}`, `export_shift`           | SHIFT_PR, SHIFT_PR_DTL (ADW)                                                       | CRUD             | 3     |
| Sub Shifts                                              | `/shift-details`, `list`, `create?shift_uuid=`, `save`                                                               | SHIFT_PR_DTL (ADW)                                                                 | Weekly editor    | 3     |
| Timetable                                               | `/timetable`, `list`, `store`, `edit`, `update`, `delete`, `export_timetable`, `get_employee_by_number`              | TIMETABLE_PR, SHIFT_PR, EMP_MASTER (ADW)                                           | Versioned CRUD   | 3     |
| Occasions                                               | `/occasion`, `list`, `store`, `edit/{id}`, `update/{id}`, `delete/{id}`, `export_occasion`                           | ATT_OCCASIONS, SHIFT_PR (ADW)                                                      | CRUD             | 3     |
| Attendance Card                                         | `/report/attendance-card`, `list`, `export`, `/interface`, `attendance_card/upload_attendance_file` (preview/import) | ATT_ATT_CARD, EMP_MASTER (ADW)                                                     | Report + import  | 4     |
| Process Attendance                                      | `processattendance/get_employees_by_department`, `processattendance/process_attendance`                              | reads 7 tables, writes ATT_ATT_SHEET (ADW)                                         | Engine           | 5     |
| Timesheet                                               | `/report/timesheet`, `list`, `export`                                                                                | ATT_ATT_SHEET (ADW)                                                                | Report           | 6     |
| Payroll File                                            | `/report/payroll-file`, `list`, `export`, `save-adjustment`                                                          | ATT_ATT_SHEET, ATT_PYRL_FILE_ADJ (ADW)                                             | Report + adjust  | 6     |
| Alerts & Exceptions                                     | `/alerts-exceptions` (page + AJAX), `/export`                                                                        | ATT_SHEET, ATT_CARD, EMP_MASTER, TIMETABLE_PR, ATT_OCCASIONS (ADW)                 | Rules report     | 6     |
| Dashboard                                               | `/` (server-rendered payload)                                                                                        | 7 ADW tables                                                                       | KPIs             | 6     |
| Daily Attendance                                        | `/daily-attendance`, `daily_attendance/list`, `/export`                                                              | ZPI.* biometric (EBS)                                                              | Live report      | 7     |
| Leave Requests                                          | `/leave-requests`, `leave_request/list`                                                                              | EMP_ABSENCE_TYPE (ADW)                                                             | Report           | 7     |
| Manager View                                            | `/manager`, `/manager/approve-absence`                                                                               | EMP_MASTER, EMP_ABSENCE_TYPE (ADW) + ZPI.* (EBS)                                   | Team + approvals | 7     |
| Contractors / Contractor Employees / Contractor Summary | `/contractor…`, `/contractor/employees…`, `/report/contractor-summary…`                                              | XX_CONTRACTOR_INFO, XX_CON_EMPLOYEE_INFO, ZPI.ICLOCK_TRANSACTION, HR lookups (EBS) | CRUD + summary   | 8     |

**Data flow:** Shifts → Sub Shifts → Timetable (+ Occasions) → Attendance Card import → **Process
Attendance** → Timesheet / Payroll File / Alerts / Dashboard.

## Phases

Each phase follows the same loop: **build → compare with CI3 → fix → write the parity report → review**.
A phase starts only when it is requested.

| #   | Phase             | Scope                                                                                                                                                                                     | Depends on          | Status                                                   |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------- |
| 0   | Plan              | This README, the parity template                                                                                                                                                          | —                   | **Done**                                                 |
| 1   | Platform          | Workspace scaffold, config/env, ADW + EBS pools, SSO + session, error envelope, logging; web shell with Orvexa sync, the DRY building blocks; entry in `client/scripts/dev-with-hubs.mjs` | 0                   | **Done**                                                 |
| 2   | Read-only reports | Employee Details, Absence, Function & Feature (proves the list/filter/export pattern)                                                                                                     | 1                   | **Done**: [parity](docs/parity/)                         |
| 3   | Setup data        | Shifts → Sub Shifts → Timetable → Occasions                                                                                                                                               | 1                   | **Done**                                                 |
| 4   | Raw punches       | Attendance Card list, file upload preview + import (CSV/XLSX, batched MERGE), Interface page                                                                                              | 3                   | **Done**                                                 |
| 5   | Processing engine | Port `ProcessAttendanceModel` as pure functions; golden tests against CI3 output on the same data; batched reads (same run and summary as CI3)                                            | 3, 4                | **Done**: [parity](docs/parity/attendance-processing.md) |
| 6   | Processed outputs | Timesheet, Payroll File + adjustment, Alerts & Exceptions, Dashboard                                                                                                                      | 5                   | **Done**: [parity](docs/parity/)                         |
| 7   | EBS live + people | Daily Attendance, Leave Requests, Manager View + approvals                                                                                                                                | 1 + EBS test access | Not started                                              |
| 8   | Contractors       | Contractors, Contractor Employees, Contractor Summary                                                                                                                                     | 1 + EBS test access | Not started                                              |
| 9   | Cutover           | Point the Zamil sidebar `attendance-system` link at `http://localhost:7388/`, update onboarding, freeze the CI3 app                                                                       | 2–8                 | Not started                                              |

## Parity method

For every module, create `docs/parity/<module>.md` from [`docs/parity/_TEMPLATE.md`](docs/parity/_TEMPLATE.md)
and compare the new module with the CI3 app item by item:

- routes;
- request filters and pagination;
- response fields;
- table columns and order;
- validation rules and messages;
- exports;
- create/update/delete behaviour;
- business rules.

Run both apps on the same test-ADW data:

- CI3: `http://localhost/zamil-attendance/`
- New: `http://localhost:7388/`

One Zamil login serves both apps. Each difference is recorded as **Same**, **Design** (visual only) or
**Fixed** (a real CI3 bug, with the reason). Nothing else may differ.

### Known CI3 issues (do not port blindly)

| Issue                                                                                                 | CI3 location                                                                 | Plan                                                 |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Payroll period defined four different ways                                                            | Dashboard, Manager, Leave, Timesheet/Payroll JS                              | One shared `payrollPeriod()` (21st to 20th)          |
| No roles or permissions; CSRF off                                                                     | whole app                                                                    | Same access as CI3 (no roles); CSRF header           |
| Manager Approve/Deny buttons never rendered                                                           | `views/pages/manager/index.php`, `mgrDecideAbsence()`                        | Wire it, with permission checks                      |
| High-overtime alert compares hours with a 120-minute threshold                                        | `Alerts_exceptions_model::build_query`                                       | Fixed in phase 6: compared in minutes                |
| Daily Attendance `status` filter ignored; summary loads every row                                     | `Daily_attendance_model`                                                     | Implement the filter; aggregate in SQL               |
| Timetable "Overtime allowed" / "Exclude timesheet" never saved                                        | `Timetable_model::insert_timetable`                                          | Fixed in phase 3: both flags saved                   |
| `TRIM(x) <> ''` never true in Oracle (empty department lists)                                         | `ProcessAttendanceModel:28`, `Manager_model:61`, `Attendance_card_model:274` | Use `IS NOT NULL`                                    |
| Payroll overtime netted against lateness twice; NULL late zeroes OT                                   | `Payroll_file_model::get_payroll_file_list`                                  | Ported as CI3 (phase 6); **needs business sign-off** |
| Dashboard "Blank Punch Employees" counts distinct supervisors                                         | `Dashboard_model::get_exception_summary`                                     | Ported as CI3 (phase 6); confirm intent              |
| Payroll edit form pre-filled with values its own rules reject                                         | `assets/js/pages/payroll_file/list.js`                                       | Fixed in phase 6: rounded to 2 decimals              |
| Processing makes about 7 queries per employee-day, synchronously                                      | `ProcessAttendanceModel::process_attendance_range`                           | Phase 5: reads batched per employee, same results    |
| One impossible leave date (e.g. `31-02-2024`) fails processing for that employee                      | `ProcessAttendanceModel::build_leave_date_expression`                        | Fixed in phase 5: read as no date                    |
| Shift delete leaves timetables pointing at it                                                         | `Shift_model`                                                                | Fixed in phase 3: refused while in use               |
| Dead code: legacy month processor, `contractor/form`, `occasion/view`, `Shifts::create`, duplicate JS | various                                                                      | Not ported                                           |

## Definition of done (per phase)

- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass in `attendance/`.
- API tests cover every new endpoint (validation, permissions, happy path); business rules have unit tests.
- Every screen works in light and dark mode, from 320 to 1920 px, and with the keyboard.
- The parity report is complete, and every difference is Same, Design or Fixed (real bug).
- No secrets in git. `zamil-attendance/` is unchanged.
- This README's phase table is updated.

## Run locally

```powershell
cd attendance
npm install
npm run db:ping     # proves wallet, credentials and network; lists the attendance tables
npm run dev         # API http://127.0.0.1:7387, web http://localhost:7388
```

- **First run:** `npm run dev` creates `.env` from `.env.example` with a random `SESSION_SECRET`. When
  `../server/.env` exists, it also copies the test-ADW credentials (names are printed, values never
  are). It then copies the Orvexa assets from `../client/public`.
- **Sign-in:** start Zamil first (`server`: `npm run dev`; `client`: `npm run dev`). Sign in at
  `http://localhost:7382`, then open `http://localhost:7388` on the same hostname. Without a Zamil
  session you are sent to the Zamil login.
- **One command for everything:** once `attendance/` is installed, `client` `npm run dev` also starts
  this app, alongside TrainingHub and ExpenseHub.
- **The Zamil sidebar link:** **Human resources → Attendance System** still points at the CI3 app until
  cutover (Phase 9). To try the new app from it now, set
  `VITE_EXTERNAL_ATTENDANCE_SYSTEM=http://localhost:7388/` in `client/.env`.

**Checks:** `npm run lint` · `npm run typecheck` · `npm test` · `npm run build`

**Install note:** npm 11 warns that the esbuild and oracledb install scripts were not approved. Neither
is needed: esbuild ships its Windows binary as an optional dependency, and oracledb runs in thin mode.
