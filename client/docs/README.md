# Frontend Documentation (`client/`)

React 19 + Vite 8 single-page application. Team-wide guides are in [`../../docs/`](../../docs/README.md);
setup and scripts in [`../README.md`](../README.md).

## Reading order

| # | Document | Purpose |
|---|---|---|
| 1 | [Frontend architecture](FRONTEND-ARCHITECTURE.md) | Providers, routing, layouts, state boundaries, design system |
| 2 | [Shared components and patterns](SHARED-COMPONENTS-AND-PATTERNS.md) | What exists, where it is, what you must reuse |
| 3 | [New feature guide](NEW-FEATURE-GUIDE.md) | Adding a business module end to end (illustrative example) |
| 4 | [Frontend testing](FRONTEND-TESTING.md) | Scripts, test organization, browser and integration checks |

## Source tree

```text
client/
├── index.html                      Document shell: Orvexa stylesheets, theme-init.js, lucide icon data
├── vite.config.js                  Port 5199 (strict), same-origin /api proxy to :3000, @ → src alias
├── vercel.json                     Static hosting: SPA fallback (excluding /api), security headers, CSP
├── public/
│   ├── favicon.svg, theme-init.js  Branding; saved layout preferences applied before first paint
│   └── orvexa/assets/              Licensed design-system CSS (precompiled) and Lucide icon data
├── scripts/verify-production.mjs   Static release checks for dist/
├── tests/                          Node native tests (*.test.mjs) and helpers/http.mjs
└── src/
    ├── main.jsx, App.jsx           Entry: <AppProviders><App/></AppProviders>; App renders the router
    ├── app/                        AppProviders, AppErrorBoundary, router.jsx (route table)
    ├── config/                     appNavigation.js (routes/permissions), api/auth/access/app config,
    │                               authRouting.js, orvexaNavigation.js + orvexaRoutes.js (dev preview only)
    ├── services/api/               apiClient.js (shared Fetch client), csrfStore.js, apiEvents.js
    ├── features/
    │   ├── auth/                   Session state machine, auth service/contract, MFA and password UI parts
    │   ├── access/                 Effective-permission store, provider, usePermissions()
    │   ├── dashboard/              Signed-in dashboard (real profile, session and permissions only)
    │   └── security-administration/ User accounts, roles, grants, catalogue, overrides, recovery
    ├── routes/                     RouteGuards.jsx (guards), RouteComponents.jsx (lazy pages, announcer)
    ├── layouts/                    AdminLayout.jsx (signed-in shell), AuthLayout.jsx
    ├── components/                 layout/ (Sidebar, Header, CommandPalette, LayoutCustomizer),
    │                               feedback/PageState, icons/OrvexaIcon
    ├── pages/                      auth/ (sign-in, MFA, password, recovery pages), PhasePages, RouteNotice
    ├── hooks/useOrvexaLayout.js    Theme, sidebar, density, motion and accent preferences
    └── styles/                     App-owned CSS (zrv-* classes) on top of the design-system CSS
```

**Known leftovers (not used by the application):** `src/App.css`, `src/assets/hero.png`,
`src/assets/react.svg`, `src/assets/vite.svg` (Vite scaffold) and `public/orvexa/favicon.ico` are
not referenced anywhere. Removing them is a separate cleanup change; do not build on them.
