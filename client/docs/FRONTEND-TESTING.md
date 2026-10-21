# Frontend Testing

How frontend work is verified. All commands run in `client/`.

## 1. Scripts

| Command | What it does | Needs backend? |
|---|---|---|
| `npm run lint` | ESLint (`eslint.config.js`: recommended JS, React Hooks, React Refresh rules) | No |
| `npm test` | `node --test "tests/*.test.mjs"` — every frontend test | No |
| `npm run build` | Vite production build into `dist/` | No |
| `node scripts/verify-production.mjs` | Static release checks on `dist/` (run after `npm run build`) | No |
| `npm run preview` | Serves `dist/` on `http://localhost:5199` with the `/api` proxy | Yes, for real use |
| `npm run dev` | Development server on `http://localhost:5199` | Yes, for real use |

There is no `check` script in `client/`; run lint, tests and build separately and record each
result.

## 2. How the tests work

- **Runner:** Node's built-in `node:test` with `node:assert/strict`. No browser, DOM or React
  rendering library is installed.
- **Consequence:** tests import plain `.js` modules (services, contracts, stores, models,
  configuration). JSX components cannot be imported; their important properties are protected by
  **static source assertions** (the test reads the `.jsx` file and checks for the required code,
  for example that a button uses a specific permission key, or that a route is registered).
  Design features so that logic lives in testable `.js` modules.
- **Transport is always mocked:** `tests/helpers/http.mjs` provides `recordingFetch`, `success`,
  `failure`, `noContent`, `deferred`, fixtures shaped like the OpenAPI contract, and
  `forbidBrowserStorage`. Tests create a client with
  `createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore })`. No test contacts a server or
  Oracle.

### Test files

| File | Covers |
|---|---|
| `apiClient.test.mjs` | Shared client: URLs, envelopes, errors, CSRF modes, timeouts, 401 events |
| `authContract.test.mjs`, `authService.test.mjs`, `authSession.test.mjs` | Authentication contract, endpoints, session state machine and races |
| `mfa.test.mjs`, `recovery.test.mjs`, `corrections.test.mjs` | MFA, password/recovery flows, Stage 1 regressions |
| `permissions.test.mjs` | Effective permissions: identity binding, stale responses, default deny |
| `navigation.test.mjs` | Route table, route access decisions, sidebar, command palette, dashboard, header |
| `securityAdministration.test.mjs` | Security Administration request contracts, races, duplicates, action visibility |
| `productionReadiness.test.mjs` | Branding, removed template code, dev server/preview config, permission refresh, role selector |
| `routing.test.mjs` | Safe return URLs, development-preview demo routes |
| `securityBoundaries.test.mjs` | No browser storage/cookies in auth and API code; dev proxy |
| `accessibility.test.mjs` | Screen-reader-only styles and route announcements |
| `deployment.test.mjs` | `vercel.json`: SPA fallback excludes `/api`, security headers, CSP |

### What a new feature should add

| Test type | Example |
|---|---|
| Contract | Reader accepts the documented response and rejects malformed data |
| Request | Correct method, path, query, body; CSRF header on changes; no request for an invalid ID |
| Errors | 401 ends the session; 403/409/422/429 messages; unknown outcomes are not success |
| Permissions | `routeAccess` allowed/denied/mfa_required for the new routes; buttons use their own keys |
| Integrity | No sample data, `console.*` or storage use in the new feature folder |

**Pinned expectations:** `navigation.test.mjs` and `securityAdministration.test.mjs` list the
implemented routes and the sidebar of an administrator. When you add or remove a route, update
those lists in the same PR. Never weaken or delete a test to make it pass; if a test conflicts with
an approved change, update its expectation and explain why in the PR.

## 3. Build and release checks

`npm run build` must succeed without new warnings you cannot explain. Then
`node scripts/verify-production.mjs` checks that required assets exist, there is no inline
`<script>` (the CSP forbids it), no template branding or images ship, the template chart library is
not bundled, and it prints the largest JavaScript chunks. Passing it means the **static** build is
consistent — not that the application works when deployed.

## 4. Browser verification (manual)

Against a real backend (`npm run dev` or `npm run preview`, backend on port 3000):

- Sign in, refresh a deep link (e.g. a detail page), sign out; session expiry returns to sign-in.
- For each new page: loading, empty, populated, error (stop the backend), access denied (account
  without the permission), MFA-required (security pages), mobile width and dark mode.
- Keyboard: Tab order, dialogs trap focus and close with Escape, focus returns to the trigger.
- Every button shown is permitted for that user; buttons the user may not use are absent.
- Changes: success message only after the backend confirmed; data refreshes.
- Browser console: no errors and no Content-Security-Policy violations (production build).

## 5. Mocked tests vs. real integration

| Evidence | Proves | Does **not** prove |
|---|---|---|
| `npm test` | Frontend logic against the documented contract | That the backend returns that contract, or that Oracle has the data |
| Browser + local backend + Oracle TEST | The integrated behaviour for the accounts and data used | Production behaviour, other accounts' permissions |

Oracle TEST checks write real rows (sign-ins write audit and session records). Run them only with
the accounts and scope you are authorized for, and report them separately from mocked results.
Permission scenarios need at least: an administrator with the permission, an ordinary employee
without it, and an account with an explicit DENY override if the feature is sensitive.
