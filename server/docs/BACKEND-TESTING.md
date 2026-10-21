# Backend Testing

How backend work is verified. Commands run in `server/`.

## 1. Scripts

| Command | What it does | Touches Oracle? |
|---|---|---|
| `npm run check` | `npm run lint && npm run format:check && npm test` — **required before handing over work** | No |
| `npm test` | `node --import ./tests/setup.js --test` — all tests in `tests/` | No |
| `npm run lint` / `npm run lint:fix` | ESLint | No |
| `npm run format` / `npm run format:check` | Prettier | No |
| `npm run db:status` | Standalone LOW/HIGH connectivity diagnostic with its own short-lived pools | Read-only |
| `npm run db:verify-auth` | Executes the authentication SQL read-only against the configured database | Read-only |
| `npm run db:rbac-post-check`, `db:users-check`, `db:setup-check`, `db:phase06-check` | Read-only post/pre-checks for specific controlled TEST runs | Read-only |
| `npm run auth:password-reminders` | Counts accounts due for password-expiry reminders; sends nothing | Read-only |
| `npm run smtp:verify` | Checks the SMTP connection and authentication; sends no e-mail | Read-only DB identity check |
| `npm run db:bootstrap-test` | Prints the TEST bootstrap plan; **writes only with `-- --apply`** and interactive confirmation | Read-only by default |
| `npm run auth:mfa-test`, `auth:rbac-test`, `auth:users-test`, `auth:setup-test`, `auth:rbac-user-test`, `auth:recovery-test` | Interactive operator flows that sign in and drive the real API against TEST | **Write** (sessions, audit, and the scenario's changes; recovery flows can send e-mail) |

The read-only and operator scripts exist for **authorized** Oracle TEST verification of the
security phases. Do not run the writing flows, or `--apply`, without explicit authorization for
that run. Never run any of them against production.

## 2. How the automated tests work

- **Runner:** Node's built-in `node:test` (`describe`/`it`) with `node:assert/strict`; HTTP tests use
  **Supertest** against `createApp(...)` without opening a port.
- **Hermetic environment:** `tests/setup.js` sets `NODE_ENV=test` and silences logging before the
  configuration module loads.
- **No database:** Oracle is replaced by in-memory test doubles. `createApp(config, { api })` and
  `createApiRouter(appConfig, deps)` accept repositories and `db.withConnection` /
  `db.withTransaction` substitutes. The doubles live in `tests/helpers/`:

| Helper | Provides |
|---|---|
| `authFakes.js` | `createAuthStore()` (employees, users, sessions, audit in memory), `createTestApp(store)`, `sessionCookie()` and auth helpers |
| `rbacFakes.js` | `installRbac(store)`, `seedSecurityCatalog()`, `assign`, `grant`, `signIn(...)` returning cookie + CSRF token |
| `usersFakes.js`, `recoveryFakes.js` | User-administration and recovery repositories and delivery doubles |

Typical API test (actual pattern from `tests/users-admin.test.js`, abridged):

```js
import request from 'supertest';
import { createAuthStore, createTestApp } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';

const store = createAuthStore();
const rbac = installRbac(store, { syncPrivilegeFlags: true });
const app = createTestApp(store);
const session = await signIn(store, someUser);
const res = await request(app).get('/api/v1/users').set('Cookie', session.cookie);
assert.equal(res.status, 403);
```

Fixtures use fictional people and numbers. Never copy real employee data into tests.

## 3. What a new endpoint must be tested for

| Scenario | Expectation |
|---|---|
| Success | Correct status (200/201/204), envelope, fields and pagination metadata |
| Validation | `400 VALIDATION_ERROR` with field details; unknown fields rejected; no input echoed |
| No session | `401` |
| Missing permission / explicit DENY override / inactive catalogue entry | `403 FORBIDDEN`, audited as `ACCESS_DENIED` |
| MFA-required permission without MFA (security module) | `403` |
| Changes without `X-CSRF-Token` or with a foreign Origin | `403 CSRF_REJECTED` |
| Not found / conflict / business rule | `404`, `409`, `422` as documented |
| Record or organization scope | Another owner's record is refused or concealed |
| Transactions | A failure after the first write rolls everything back; audit rows commit with the change |
| Pagination and sorting | `limit` max 100; unsupported `sortBy` rejected |
| OpenAPI | Route listed in `tests/api-docs.test.js`; spec still validates as OpenAPI 3.1 |

Security regression suites to keep green: `rbac-authorization.test.js`,
`security-hardening.test.js`, `auth-*.test.js`, `users-admin.test.js`, `audit-append-only.test.js`.

## 4. Mocked results vs. real database verification

| Evidence | Proves | Does **not** prove |
|---|---|---|
| `npm run check` passing | Routing, validation, authorization logic, service rules and error contracts against the doubles | That the SQL is valid, that the Oracle objects/columns exist, performance, grants, CI3 compatibility |
| Read-only Oracle TEST scripts | The SQL parses/executes and reads the expected TEST objects | Write behaviour |
| Authorized TEST run of a flow | The integrated behaviour for that data at that time | Production behaviour |

Report these separately, with the exact commands, counts and dates. A repository change that has
only been tested with doubles must say so explicitly ("SQL not executed against Oracle").

## 5. Rules

- Never assume a destructive or writing test is permitted; ask first.
- Never point tests at production or at another developer's data.
- Never claim a test, SQL statement or integration passed unless it was executed and you have the
  output.
- Never weaken or delete a test to make a change pass; update an expectation only when an approved
  behaviour change requires it, and explain it in the PR.
