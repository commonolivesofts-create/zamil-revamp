# Zamil Digitalization — Frontend

React 19 + Vite 8 single-page application for Zamil Digitalization: sign-in, MFA,
password and recovery workflows, backend-authoritative RBAC navigation, the
signed-in dashboard and Security Administration.

Developer guides: [`docs/README.md`](docs/README.md) (frontend) and
[`../docs/README.md`](../docs/README.md) (team-wide onboarding and workflow).

The backend (`../server`) is authoritative for authentication, sessions and
every permission decision. This application holds no credentials: sessions are
HttpOnly cookies set by the backend, and CSRF tokens are kept in memory only.

## Development

```powershell
npm install
npm run dev        # starts Zamil web + TrainingHub + ExpenseHub; backend stays separate
```

The client dev command starts the Zamil frontend on :7382 and both linked hubs on :7384 (TrainingHub)
and :7386 (ExpenseHub). The hub APIs run on :7383 and :7385 and are reached through their web proxies.
It inherits `APP_ENV` from the client/server environment files, so the Test (LAN) profile is applied
to all three frontends and both hub APIs. Use `npm run dev:web` to run only the Zamil frontend.

Install each hub's dependencies once with `npm install` from its folder. To stop all three frontends
and both hubs, press Ctrl+C in the client terminal. The Zamil backend remains a separate process in
`server/`.

Copy `.env.example` to `.env.local` to set public client options. Set the same
`APP_ENV` in `client/.env.local` and `server/.env`:

| `APP_ENV` | Frontend | Backend |
|---|---|---|
| `development` | `http://localhost:7382` | `http://127.0.0.1:7381` |
| `Test` | `http://10.10.2.160:7382` (listens on all interfaces) | `0.0.0.0:7381` |
| empty | Production profile | Production profile |

For LAN testing, run `npm run dev` in both `client` and `server`, and open
`http://10.10.2.160:7382`. The sidebar hub links use the same host at ports 7384
and 7386; their APIs are proxied on 7383 and 7385. Test mode uses HTTP-compatible
session cookies; keep it on the trusted test network. Keep `VITE_AUTH_DEV_PREVIEW=false`
for real integration testing.

| Script | Purpose |
|---|---|
| `npm run dev` | Zamil frontend on :7382 and TrainingHub/ExpenseHub on :7384/:7386 |
| `npm run dev:web` | Zamil frontend only on port 7382 |
| `npm run lint` | ESLint |
| `npm test` | Node native tests (`tests/*.test.mjs`, mocked transport only) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serves `dist/` on port 7382 with the same `/api` proxy |
| `node scripts/verify-production.mjs` | Static release checks after a build |

## Deployment requirements

- **Same origin.** The frontend and `/api` must be served on one HTTPS origin.
  The backend sends no CORS headers, uses a `__Host-` session cookie and checks
  the `Origin` of state-changing requests.
- **API routing.** `vercel.json` serves `index.html` for every path except
  `/api/…`. Requests to `/api/…` must reach the backend, for example with a
  hosting rewrite or a gateway in front of both. That rewrite needs the backend
  URL and is not part of this repository.
- **Backend settings.** `AUTH_FRONTEND_BASE_URL` must be the public frontend
  origin; behind a TLS-terminating proxy set `TRUST_PROXY_HOPS` so the backend
  computes its own origin correctly.
- **Security headers.** `vercel.json` sets a Content-Security-Policy without
  inline scripts (the theme bootstrap is `public/theme-init.js`). Verify the
  policy in the target browser before release.

## Structure

- `src/features/auth` — authentication state machine and contracts.
- `src/features/access` — effective permissions (`GET /access-control/me/permissions`).
- `src/config/appNavigation.js` — the single route/navigation/permission table.
- `src/features/security-administration` — Security Administration screens.
- `public/orvexa/assets` — the licensed Orvexa stylesheets and icon data the
  design system is built on (see `THIRD_PARTY_NOTICES.md` there).
