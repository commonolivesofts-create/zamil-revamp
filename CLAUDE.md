# Zamil Digitalization — Claude Code Project Instructions

**Product:** Zamil Digitalization, release **V 2.1.0** — modernization of an existing PHP
CodeIgniter 3 (CI3) enterprise application into a React frontend (`client/`) and a Node.js/Express
backend (`server/`) over the existing Oracle ADW schema. The repository keeps its technical name
`zamil-revamp`.
**Current state:** authentication, MFA, sessions, recovery, backend-authoritative RBAC, user
administration and the Security Administration screens are implemented (backend phases 01–07,
frontend stages 1–4). The foundation is feature-development-ready but **not**
production-deployment-ready (blockers in `server/docs/handoffs/PHASE-07-BACKEND-FINALIZATION.md`;
no security-audit retrieval API yet).
**Scope:** work only on the task the project owner has authorized in the current request. Frontend
(`client/`) and backend (`server/`) work are both in scope when that request authorizes them.

## Read first, then only what the task needs

1. [`docs/README.md`](docs/README.md) — documentation index and where each standard is implemented.
2. [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/FEATURE-DELIVERY-WORKFLOW.md`](docs/FEATURE-DELIVERY-WORKFLOW.md) — Git policy, feature lifecycle, approval gates, definition of done.
3. [`docs/SECURITY-ESSENTIALS.md`](docs/SECURITY-ESSENTIALS.md) — non-negotiable security rules.
4. Frontend work: [`client/docs/README.md`](client/docs/README.md). Backend work: [`server/docs/README.md`](server/docs/README.md) and [`server/CLAUDE.md`](server/CLAUDE.md).
5. [`server/docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md`](server/docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md) — locked authentication/RBAC decisions; **required before authentication, MFA, session or RBAC changes**.
6. The relevant sections of the approved architecture documents `server/docs/01`–`06` (not the whole set).
7. [`server/docs/08-IMPLEMENTATION_STATUS.md`](server/docs/08-IMPLEMENTATION_STATUS.md) and the relevant handoff (`server/docs/handoffs/`, `docs/handoffs/`) only when needed.

**Authority rule:** The owner's later, explicitly locked decisions documented in 07 prevail over
contradictory historical *behavioral policy* statements in 01–06. The deployed Oracle dictionary is
authoritative for **actual physical columns, constraints and datatypes**. If physical schema cannot
support an approved behavior, STOP that affected change and ask; do not invent DDL. Do not silently
edit the approved architecture documents (01–07) or historical records (08 history, phase
handoffs, `server/docs/rbac-schema/`, `FOUNDATION_VERIFICATION.md`).

## Technical baseline

- Backend: Node.js 24, Express 5, JavaScript ES Modules, modular monolith with feature-first
  Controller → Service → Repository; REST `/api/v1`, Joi, Pino, standardized API envelopes,
  OpenAPI 3.1, Node native tests and Supertest.
- Frontend: React 19, Vite 8, React Router, feature folders under `client/src/features/`, the shared
  Fetch client, `AuthProvider` / `PermissionProvider`, the central route table
  `client/src/config/appNavigation.js` and the existing design system. No new HTTP client, auth
  system, navigation registry or UI framework.
- Oracle Autonomous Database Serverless; reuse the LOW/HIGH pools, `withConnection` /
  `withTransaction`, bind variables and UTC event-time conventions.
- **Login:** `XX_DIGI_EMP_MASTER.USER_NAME` → `EMPLOYEE_NUMBER` → `XX_ZRV_USERS.PASSWORD_HASH` (Argon2id).
- All 11 existing Oracle RBAC tables / 122 approved columns are LOCKED. No DDL or seeded rows
  without explicit owner authorization.
- Password/session/MFA, administrator hierarchy, override DENY precedence, audits and recovery
  policies: see 07. The backend is authoritative for every permission decision.

## Administrator MFA

MFA is mandatory for administrators and other privileged accounts. The **only** approved exception
is `AUTH_ADMIN_MFA_REQUIRED=false`, which the backend accepts only under validated
local-development conditions: `NODE_ENV=development`, a loopback `HTTP_HOST` (`127.0.0.1` or
`::1`) and `TRUST_PROXY_HOPS=0` (otherwise startup fails). **UAT and production must require MFA**
(`AUTH_ADMIN_MFA_REQUIRED=true`, the default). The exception never marks a session MFA-verified,
never grants permissions and must not be extended, copied to the frontend, or replaced by any other
bypass. Details: [`docs/SECURITY-ESSENTIALS.md`](docs/SECURITY-ESSENTIALS.md).

## Operating boundaries

- Inspect the relevant code, documents and (read-only) Oracle dictionary before changing anything.
  Keep changes within the authorized scope; do not modify unrelated features.
- Never touch the Oracle wallet, `secrets/`, real `.env` / `.env.local` files, credentials, CI/CD or
  deployment configuration unless the owner explicitly authorizes that specific change.
- Respect the approval gates in [`docs/FEATURE-DELIVERY-WORKFLOW.md`](docs/FEATURE-DELIVERY-WORKFLOW.md):
  G1 database, G2 security, G3 shared architecture, G4 legacy schema / CI3 coexistence.
- No new production dependency without approval. No database writes — not even TEST data
  seeding or operator write flows — without explicit authorization for that run.
- Never print secrets, hashes, raw tokens, wallet bytes or real employee records in reports, logs,
  tests or documentation. The repository is public.
- No fake data, placeholder screens or nonfunctional controls (ZRV-FE-005).
- Keep implementation targeted and testable. Distinguish mocked tests from real Oracle
  integration tests; never claim unexecuted tests, builds or checks passed.

## Git workflow

Follow [`CONTRIBUTING.md`](CONTRIBUTING.md) and the delivery workflow:

- Never work, commit or push on `main`. Start each task branch from `main` updated with
  `git pull --ff-only origin main`, using the approved prefixes (`feat/`, `fix/`, `docs/`, …).
- Perform Git writes (branch creation, commits, pushes) only when the owner's current request
  authorizes them. Stage specific reviewed files, inspect `git diff --cached`, run
  `git diff --cached --check`, and use conventional commit messages.
- Use the repository's configured Git identity; verify the author before committing and never
  change Git configuration.
- Never force-push, rewrite history, merge, delete branches or change repository settings unless
  the owner explicitly instructs it. Pull Requests into `main` are reviewed and merged by the owner.

## Handoff discipline

- For each delivered feature, write `docs/handoffs/FEATURE-<NAME>.md` from
  [`docs/FEATURE-HANDOFF-TEMPLATE.md`](docs/FEATURE-HANDOFF-TEMPLATE.md) in the same branch.
- Update `server/docs/08-IMPLEMENTATION_STATUS.md` only to record actual backend status changes.
  Existing phase handoffs in `server/docs/handoffs/` are historical; do not rewrite them.
- Report what was actually executed, the results, limitations and anything requiring the owner's
  decision.
