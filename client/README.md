# Zamil Revamp — Frontend

React 19 + Vite 8 single-page application for Zamil Revamp: sign-in, MFA,
password and recovery workflows, backend-authoritative RBAC navigation, the
signed-in dashboard and Security Administration.

The backend (`../server`) is authoritative for authentication, sessions and
every permission decision. This application holds no credentials: sessions are
HttpOnly cookies set by the backend, and CSRF tokens are kept in memory only.

## Development

```powershell
npm install
npm run dev        # http://localhost:5199, /api proxied to http://localhost:3000
```

Copy `.env.example` to `.env.local` only if you need to change a public
setting. Keep `VITE_AUTH_DEV_PREVIEW=false` for real integration testing.

| Script | Purpose |
|---|---|
| `npm run dev` | Development server on port 5199 with the same-origin `/api` proxy |
| `npm run lint` | ESLint |
| `npm test` | Node native tests (`tests/*.test.mjs`, mocked transport only) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serves `dist/` on port 5199 with the same `/api` proxy |
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
