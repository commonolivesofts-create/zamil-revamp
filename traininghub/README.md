# TrainingHub — Zamil Training module

React 19 + Node.js (Express 5, TypeScript) — same stack, conventions, Oracle ADW schema and Fusion
pod as ExpenseHub. Fusion is used **only for employees** (names, jobs, departments, managers);
everything else — skills library, Job Skills Matrix, sessions, requests, approvals, attendance,
exams, results — lives in TrainingHub's own `TH_*` tables in ADW.

```
apps/api        Express API (/api/v1), domain services, Oracle + in-memory stores, Fusion sync
apps/web        React app (Vite, Tailwind 4, TanStack Query)
packages/shared zod input schemas, enums and DTO types used by both sides
fusion/bip      TH_HCM_EMPLOYEES.sql (BIP report for the employee sync)
db/schema.sql   generated DDL for review (npm run db:migrate writes it)
```

## Run locally (demo data, no ADW / Fusion needed)

```bash
npm install
npm run dev            # API http://localhost:7383, web http://localhost:7384
```
`.env` is created from `.env.example` on first start. `DATA_MODE=memory` + `FUSION_MODE=mock`
loads a demo set (22 IT/HR people, 12 IT positions, 12 sessions, requests in every state). Use
the quick sign-in on the login page; `npm run data:reset` starts over.

For the Zamil Test (LAN) host profile, start from PowerShell with `$env:APP_ENV='test'; npm run dev`.
Open `http://<this-PC's-LAN-IP>:7384`; the API on 7383 is proxied by the web app. Set
`APP_BASE_URL` in `.env` to that LAN URL if generated reset links must open from another device.

## Run against the test ADW and Fusion (same credentials as ExpenseHub)

1. `npm install`, then `npm run env:from-expensehub` — writes `.env` with the `DB_*`, `FUSION_*`
   and `BOOTSTRAP_ADMINS` values from `..\expensehub\.env`, `DATA_MODE=oracle`, `FUSION_MODE=live`
   (prints key names only). The ADW wallet goes in `secrets/wallet` (already copied).
2. `npm run db:ping` — proves wallet, user and network.
3. `npm run db:migrate -- --dry-run`, then `npm run db:migrate` — creates the `TH_*` tables
   (prefix guard: it only creates or adds `TH_*` objects, never drops or touches anything else in XXZP).
4. `npm run db:smoke` — round-trips every column type in a rolled-back transaction.
5. `npm run db:seed -- --approve-profiles` — skills library, 12 IT positions with profiles,
   eligibility rules, settings and the Direct manager → HR Lead workflow.
6. Employees: `npm run fusion:bip-deploy` (optional — deploys `/Custom/TrainingHub/TH_HCM_EMPLOYEES`
   with the BI author account) then `npm run fusion:sync`. Without the new report the sync falls
   back to ExpenseHub's `/Custom/ExpenseHub/EH_HCM_EMPLOYEES` (no department/position/grade).
7. `npm run dev`. `BOOTSTRAP_ADMINS` become System + HR admins on the first sync. Grant
   HR Lead / HR admin / Finance roles in **Setup → Employees & roles**; map Fusion jobs to
   positions in **Job Skills Matrix → Fusion job mapping**.

Sign-in: when opened on the same hostname as Zamil Revamp, TrainingHub validates the existing
Zamil session server-side and issues a bounded TrainingHub session. Signing out revokes the Zamil
session too. Without an active Zamil session, person-number + password sign-in remains available.
HR issues one-time passwords (Setup → Employees → Reset password), or set `INITIAL_PASSWORD` for a
pilot (must be changed at first sign-in). Keep `DEV_QUICK_LOGIN=true` only on test. By default,
SSO checks Zamil at `http://127.0.0.1:7381/api/v1` in both development and `APP_ENV=test`. Set
`ZAMIL_AUTH_API_BASE_URL` if needed, and
keep `ZAMIL_AUTH_SESSION_COOKIE_NAME`, `ZAMIL_AUTH_COOKIE_SECURE` and
`ZAMIL_AUTH_COOKIE_SAMESITE` aligned with Zamil's cookie settings.

## The four corrections

1. **Position skills** — a profile lists only the skills it needs. Owner/HR can add, change
   requirement/level/critical inline, replace one skill with another (keeps its level), remove,
   or copy from another position. Edits create a draft; employees stay on the last approved
   version until HR approves (versioned in `TH_POSITION_SKILLS_APPR`).
2. **Eligibility in setup** — every rule (18) is a row in `TH_ELIGIBILITY_RULES`: Block / Warn /
   Off, a parameter (cut-off days, yearly limit, cost cap, reason length) and an optional message.
3. **Approvals** — default route Direct manager → HR Lead (any holder of the HR Lead role).
   Setup → Approval workflow adds/removes/reorders steps: direct manager, manager's manager, a
   role, or a named person, each Always / above a cost / external only. Delegation, forwarding,
   bulk approve (no-cost only), reminders and waitlist promotion included.
4. **Navigation** — hidden; slides in when the pointer touches the left edge (thin handle),
   on keyboard focus or the menu button; Esc closes; the pin keeps it docked (remembered).

## Checks

`npm run typecheck` · `npm test` (API integration tests on the in-memory store) · `npm run build`.
