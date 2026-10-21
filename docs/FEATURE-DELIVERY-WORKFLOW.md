# Feature Delivery Workflow

One lifecycle for every feature, whether it is built by hand or with an AI assistant. It applies
the approved process in [`server/docs/06` §5](../server/docs/06-ARCHITECTURE_DECISIONS_GUIDELINES.md)
and the Git policy in [`CONTRIBUTING.md`](../CONTRIBUTING.md) to the whole repository.

```text
Requirement & acceptance criteria
  → Inspect existing code (CI3 source, Oracle objects, this repository)
  → API / database / security impact assessment   ── approval gates G1–G4
  → Branch from updated main
  → Backend implementation (if needed)
  → Frontend integration (if needed)
  → Security checks
  → Tests and evidence
  → Pull Request review
  → Merge (by an approver)
  → Handoff record
```

Some features need only one side:

| Work | Typical scope |
|---|---|
| New screen over an **existing, documented** API | Frontend only |
| New or changed endpoint whose consumer comes later | Backend only (with OpenAPI) |
| New business capability | Backend first (contract + tests), then frontend |
| Copy, layout or accessibility correction | Frontend only |

## 1. Requirement and acceptance criteria

Write down, before coding:

- the business purpose and owner;
- acceptance criteria that can be tested ("an approver with `X:APPROVE` can approve a pending
  request; others receive 403");
- the users and permissions involved;
- what the existing CI3 feature does today, if this replaces one.

## 2. Inspect existing code first

| Question | Where to look |
|---|---|
| Which CI3 controllers, models and SQL implement the behaviour today? | Legacy CI3 source (outside this repository) |
| Which Oracle tables, columns, constraints, views, procedures and triggers are involved? | Read-only inspection of the Oracle data dictionary — never assume |
| Does an endpoint already exist? | `server/docs/openapi/openapi.yaml`, `server/src/modules/*/*.routes.js` |
| Does a screen, service or component already exist? | `client/src/features/`, `client/src/components/`, `client/src/config/appNavigation.js` |
| Which permission protects it? | Permission catalogue (`GET /api/v1/access-control/catalog`), `server/src/modules/access-control/securityCatalog.js` for the security module |

If evidence is missing, record the gap and ask. Do not invent tables, columns, statuses or APIs.

## 3. Impact assessment and approval gates

Record the impact in the PR description (and later in the handoff). Stop and obtain explicit
approval from the project owner / architecture lead **before implementing** anything that hits a
gate.

### Approval gates

| Gate | Requires approval before implementation |
|---|---|
| **G1 — Database** | Any DDL; any new table, column, index, view, procedure or trigger; any change to an existing business object; any data fix or migration script; any change to the 11 locked RBAC tables; any write run against Oracle TEST outside an approved test plan. Follow [`server/docs/API-AND-DATABASE-CHANGE-WORKFLOW.md`](../server/docs/API-AND-DATABASE-CHANGE-WORKFLOW.md). |
| **G2 — Security** | Changes to authentication, sessions, cookies, CSRF, MFA, password/recovery rules, the authorization evaluator, the administrator hierarchy, audit behaviour, rate limits or security headers. New permissions in the `SECURITY_ADMINISTRATION` module. |
| **G3 — Shared architecture** | Changes to the **behaviour or contracts** of centralized infrastructure (`server/src/{app.js,config,database,middleware,routes,shared}`, `client/src/{services,config,routes,app,layouts,components}`, providers) — for example how the API client, guards, navigation model, permission evaluation, middleware, error/response formats or database helpers work. Also: new dependencies, new cross-cutting patterns, breaking API changes, and extracting or promoting feature code into a shared location. See [what G3 does not cover](#what-does-not-need-g3). |
| **G4 — Legacy schema / CI3 coexistence** | Anything that changes data or behaviour the running CI3 application relies on, or moves write/job ownership between CI3 and the new backend. |

### What does not need G3

Registering a new business feature through the **established extension points** is normal feature
work, covered by the feature's own requirement and PR review, not by a separate architecture
decision:

- adding its routes, a business-domain navigation section and permission keys to
  `client/src/config/appNavigation.js`, its route lines to `client/src/app/router.jsx` and lazy
  page exports to `client/src/routes/RouteComponents.jsx`, exactly as described in
  [`client/docs/NEW-FEATURE-GUIDE.md`](../client/docs/NEW-FEATURE-GUIDE.md);
- mounting a new module router in `server/src/routes/api.routes.js` and documenting it in
  `server/docs/openapi/openapi.yaml` and `server/tests/api-docs.test.js`, as described in
  [`server/docs/DEVELOPER-MODULE-GUIDE.md`](../server/docs/DEVELOPER-MODULE-GUIDE.md);
- reusing existing shared components and helpers without changing them.

If the registration requires changing how any of those shared pieces behave, it is G3. This
clarification applies to G3 only: G1, G2 and G4 apply in full to every feature, including
database, security and CI3-coexistence aspects of a routine registration.

### Business permissions

New business **permissions** (module/resource/action rows) are catalogue data. The supported way to
create them is the existing catalogue API (`PERMISSION_CATALOG:MANAGE`, used by the Permission
Catalog screen) operated by an authorized administrator; inserting catalogue rows by SQL is a
database change under gate G1. Agree the codes in the requirement before implementation.

## 4. Branch

Follow [`CONTRIBUTING.md` §5](../CONTRIBUTING.md): start from an updated `main`
(`git pull --ff-only origin main`) and create `feat/<feature>`, `fix/<topic>`, etc. Never work on
`main`.

## 5. Backend implementation

Follow [`server/docs/DEVELOPER-MODULE-GUIDE.md`](../server/docs/DEVELOPER-MODULE-GUIDE.md):

- module folder with `*.routes.js`, `*.controller.js`, `*.service.js`, `*.repository.js`,
  `*.validation.js`;
- `authenticate` → (`requireCsrfToken` for changes) → `authorize(...)` → `validate(...)` on every
  protected route;
- business rules in the service, SQL with binds in the repository, writes in `withTransaction` on
  `POOLS.LOW`;
- OpenAPI updated in the same change, plus the route list in `server/tests/api-docs.test.js`.

## 6. Frontend integration

Follow [`client/docs/NEW-FEATURE-GUIDE.md`](../client/docs/NEW-FEATURE-GUIDE.md):

- feature folder under `client/src/features/<feature>/`;
- service built on the shared `apiClient`, with a response contract reader;
- route registered in `client/src/config/appNavigation.js` **and** `client/src/app/router.jsx`
  (same id), gated by its real permission;
- buttons gated with `usePermissions().can(...)` for their specific action;
- existing layout, styles and building blocks — no redesign.

## 7. Reuse, don't duplicate

| Need | Reuse | Never create |
|---|---|---|
| HTTP calls from React | `client/src/services/api/apiClient.js` | `axios`, another fetch wrapper |
| Current user / session | `useAuth()` | A second auth context or token storage |
| Permissions in React | `usePermissions()`, `appNavigation.js` | Role-name checks, a second permission store |
| Navigation, route protection | `appNavigation.js`, `AppRouteAccess` | Per-feature menus or guards |
| Backend config | `config` from `server/src/config/index.js` | `process.env` reads in modules |
| Oracle | `withConnection` / `withTransaction` / `POOLS` | New pools, ORMs, generic repositories |
| Errors / responses | `AppError`, `sendSuccess`, `sendPaginated`, `errorHandler` | Per-controller error formatting |
| Logging | `logger` | `console.*` |
| Validation | `validate()` + Joi schemas | Manual `req.body` checks |
| Audit | `server/src/modules/audit/securityAudit.service.js` (security events) | Ad-hoc audit tables |

If something reusable is missing, propose adding it once to the shared location (gate G3) rather
than building a private copy.

## 8. Security checks (before review)

- [ ] Every new endpoint has `authenticate` + `authorize` with the agreed permission; changes also
      have `requireCsrfToken`.
- [ ] Record-level and organizational rules are enforced in the service, not the frontend.
- [ ] Inputs validated with Joi; unknown fields rejected; SQL uses binds and allowlists.
- [ ] No secrets, personal data or production records in code, tests, examples or screenshots.
- [ ] Frontend shows nothing that the backend would refuse, and hides nothing as a substitute for
      backend checks.
- [ ] No placeholder or fake functionality (ZRV-FE-005).

## 9. Tests and evidence

- Backend: `npm run check` in `server/` (lint, format, tests) — see [backend testing](../server/docs/BACKEND-TESTING.md).
- Frontend: `npm run lint`, `npm test`, `npm run build` in `client/` — see [frontend testing](../client/docs/FRONTEND-TESTING.md).
- Oracle TEST verification only when authorized, recorded separately from mocked test results.
- Record the exact commands run and their results. **Never report a test as passed unless it was
  executed.**

## 10. Pull Request and merge

Open a PR into `main` with the content required by [`CONTRIBUTING.md` §9](../CONTRIBUTING.md):
purpose, scope, files, validation, database/configuration impact, screenshots, limitations.
Reviewers check the full diff, the gates, the tests and the absence of secrets. An approver merges
(squash merge preferred). Authors do not merge their own unreviewed work.

## 11. Handoff

Create `docs/handoffs/FEATURE-<NAME>.md` from the [handoff template](FEATURE-HANDOFF-TEMPLATE.md)
in the same PR (or a follow-up docs PR if the merge commit hash is needed). Historical backend
phase handoffs stay in `server/docs/handoffs/` and are not rewritten.

## Definition of done

A feature is complete only when **all** of these are true:

1. Acceptance criteria met and demonstrated.
2. Correct module/layer ownership; shared infrastructure reused; no unrelated changes.
3. Every endpoint documented in OpenAPI and listed in `server/tests/api-docs.test.js`.
4. Permissions enforced in the backend; navigation and buttons gated in the frontend with the same
   permission identities.
5. Lint and automated tests pass, with the executed commands recorded.
6. Any authorized Oracle TEST verification recorded with what was actually run.
7. No secrets, personal data, fake data or placeholder functionality.
8. Approval obtained for every gate that applied.
9. PR reviewed and merged into `main`.
10. Handoff record written.
