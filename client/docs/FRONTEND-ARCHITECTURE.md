# Frontend Architecture

**Responsibility of this layer:** present Zamil Revamp to signed-in employees, call the backend
`/api/v1` API, and show only what the backend allows. The frontend holds no authority: sessions,
permissions and every business rule are decided by the backend.

## 1. Technology

| Item | Version / choice | Notes |
|---|---|---|
| UI | React 19 (`react`, `react-dom`) | Function components and hooks only |
| Build | Vite 8 with `@vitejs/plugin-react` | `@` alias → `client/src` |
| Routing | `react-router` (data router: `createBrowserRouter`) | Single route table in `src/app/router.jsx` |
| HTTP | Native Fetch through `src/services/api/apiClient.js` | No other HTTP library |
| QR rendering | `uqr` (pinned) | MFA enrollment only |
| Styling | Precompiled Orvexa design-system CSS + app CSS in `src/styles/` | No CSS framework build step |
| Language | JavaScript (ES modules), JSX | No TypeScript |
| Tests | Node built-in test runner (`node --test`) | See [testing](FRONTEND-TESTING.md) |

There is no global state library. State lives in two framework-free stores bound to React with
`useSyncExternalStore` (authentication and permissions) and in component state for everything else.

## 2. Application bootstrap

```text
src/main.jsx
└── <StrictMode>
    └── <AppProviders>                       src/app/AppProviders.jsx
        ├── <AppErrorBoundary>               last-resort rendering error page
        ├── <Suspense>                       fallback for lazy-loaded pages
        ├── <AuthProvider>                   src/features/auth/AuthProvider.jsx   → useAuth()
        └── <PermissionProvider>             src/features/access/PermissionProvider.jsx → usePermissions()
            └── <App>                        <RouterProvider router={router} />
```

New global providers are a shared-architecture change (gate G3 in the
[delivery workflow](../../docs/FEATURE-DELIVERY-WORKFLOW.md#approval-gates)).

## 3. Routing and protection

All routes are declared once in `src/app/router.jsx`; page components are lazy-loaded in
`src/routes/RouteComponents.jsx`.

```text
RouterShell (route announcer, scroll restoration)
├── /                      RootRedirect → /dashboard or /login
├── GuestOnlyRoute         /login, /forgot-password                    (AuthLayout)
├── (token links)          /password/setup, /password/reset, /mfa/recovery
├── MfaChallengeRoute      /mfa/verify, /mfa/enroll
├── ProtectedRoute         requires an authenticated session
│   └── AdminLayout        signed-in shell (sidebar, header, command palette)
│       ├── AppRouteAccess every application page; access from appNavigation.js
│       │   ├── dashboard, account/password, account/authenticator
│       │   └── security/... (Security Administration pages)
│       └── TemplateDemoRoute  /demo/* — development preview only; Not found otherwise
├── /403                   Access denied page
└── *                      Not found page
```

Every application page declares its id in the route `handle`, and `AppRouteAccess`
(`src/routes/RouteGuards.jsx`) looks that id up in `src/config/appNavigation.js`:

```jsx
// src/app/router.jsx (actual entry)
{ path: 'security/users', handle: { routeId: 'user-accounts' }, element: <UserAccountsPage /> },
```

```js
// src/config/appNavigation.js (actual entry)
{ id: 'user-accounts', path: '/security/users', label: 'User accounts', icon: 'users',
  section: 'security', permission: PERMISSIONS.USER_ACCOUNTS_VIEW, requiresMfa: true, implemented: true },
```

`routeAccess(route, access)` returns `allowed`, `pending`, `error`, `denied`, `mfa_required` or
`unavailable`. The guard renders the page only for `allowed`; unknown ids fail closed (Not found).
The **sidebar, command palette, dashboard "Available pages" and the guard all use the same
function**, so they can never disagree. Details: [shared components](SHARED-COMPONENTS-AND-PATTERNS.md#4-navigation-and-route-protection).

## 4. Layouts

| Layout | File | Used by |
|---|---|---|
| Signed-in shell | `src/layouts/AdminLayout.jsx` | All authenticated pages. Renders `Sidebar`, `Header`, `CommandPalette` (Ctrl/Cmd+K), `LayoutCustomizer`, the password-expired banner and the `<main id="main-content">` outlet. |
| Public pages | `src/layouts/AuthLayout.jsx` | Sign-in, MFA, password and recovery pages (each page owns its auth-shell markup). |

Feature pages render **inside** `AdminLayout`; they never render their own sidebar or header.

## 5. State boundaries

| State | Owner | Access |
|---|---|---|
| Session (status, user, session info, password expiry, MFA challenge) | `src/features/auth/authSession.js` | `useAuth()` |
| Effective permissions of the signed-in user | `src/features/access/permissionStore.js` | `usePermissions()` |
| CSRF tokens | `src/services/api/csrfStore.js` (memory only) | Used by `apiClient`; never by features |
| Layout preferences | `src/hooks/useOrvexaLayout.js` (`localStorage`, UI preferences only) | `AdminLayout` |
| Feature data (lists, records) | The feature's page/hooks | Loaded per page through the feature service |

Session status values: `preview`, `loading`, `guest`, `authenticated`, `mfa_required`, `error`.
Permission status values: `idle`, `loading`, `ready`, `error` — only `ready` grants anything.

Never copy server data into a global cache, `localStorage` or a module-level variable. Reload it
from the backend when needed.

## 6. Feature-oriented organization

A feature folder owns everything specific to one business area:

```text
src/features/security-administration/        (actual feature)
├── securityAdminService.js      API calls over apiClient
├── securityAdminContract.js     Response validation (fail closed)
├── securityActions.js           Permission identities used by its buttons
├── adminModel.js, adminForms.js, adminFeedback.js   Pure helpers (testable in Node)
├── adminRequests.js, useAdminData.js, useAccountSubject.js   Request/race handling and hooks
├── components/                  Feature components (AdminUi.jsx building blocks, dialogs, pickers)
└── pages/                       Route-level pages
```

| Centralized infrastructure (reuse, do not copy) | Feature-specific (keep inside the feature) |
|---|---|
| `src/services/api/*`, `src/features/auth/*`, `src/features/access/*` | The feature's service, contract, permission constants |
| `src/config/appNavigation.js`, `src/app/router.jsx`, `src/routes/*` | Its pages, dialogs and page-specific components |
| `src/layouts/*`, `src/components/*`, `src/styles/*` (shared CSS) | Its pure models, form checks, CSS that only it uses |

## 7. Design system

- The look and feel come from the licensed **Orvexa** CSS in `public/orvexa/assets/css/`
  (loaded in `index.html` in a fixed order) plus `theme-green.css`. These files are precompiled:
  **only classes that already exist in them work** — adding new Tailwind utility classes in JSX
  has no effect.
- App-owned styles live in `src/styles/` with the `zrv-` prefix and use the theme tokens
  (`--bg`, `--surface-solid`, `--surface-2`, `--line`, `--line-strong`, `--text`, `--muted`,
  `--primary`, `--primary-text`, `--mint(-text)`, `--amber(-text)`, `--danger(-text)`), which
  switch automatically in dark mode (`html.dark`).
- Icons: `<OrvexaIcon name="lucide-icon-name" />` (`src/components/icons/OrvexaIcon.jsx`, Lucide
  0.468 data). Icons are decorative (`aria-hidden`); give buttons text or `aria-label`.
- The interface is English-only, left-to-right.

Every new module uses these; **no per-module redesign**, no new UI framework. See
[shared components](SHARED-COMPONENTS-AND-PATTERNS.md#7-styling-and-theme).

## 8. Development preview (not authentication)

`VITE_AUTH_DEV_PREVIEW=true` in a **development** build renders the shell without a backend for
layout work: status `preview`, no user, no permissions, template demo pages under `/demo/*`.
Production builds can never enable it (`src/config/authConfig.js` requires `import.meta.env.DEV`).
Never use preview mode to test features, and never make real functionality depend on it.

## 9. Production rules

- **ZRV-FE-005:** no fake data, demo records, placeholder screens, nonfunctional buttons or
  invented metrics in production views.
- No secrets in `VITE_` variables.
- No `console.*` in application code (the DEV-only error boundary is the single exception).
- No `dangerouslySetInnerHTML`; no inline `<script>` in `index.html` (the deployment CSP forbids it).
