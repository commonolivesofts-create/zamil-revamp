# New Feature Guide (Frontend)

An end-to-end walk-through of adding a business module to the existing frontend.

> **ILLUSTRATIVE EXAMPLE.** "Widget Requests", the module code `EXAMPLE_MODULE`, the resource
> `WIDGET_REQUESTS` and the endpoints `/api/v1/example-module/widget-requests` **do not exist**.
> They only show the pattern. Use your feature's real, approved names, endpoints and permissions.

Follow the team [feature delivery workflow](../../docs/FEATURE-DELIVERY-WORKFLOW.md) around these
steps (requirement, gates, branch, review, handoff).

## 0. Before writing frontend code

- [ ] The backend endpoints exist (or are being built in the same PR) and are documented in
      `server/docs/openapi/openapi.yaml` — read the real request/response schemas there or in Swagger UI.
- [ ] The permission identities are agreed (e.g. `EXAMPLE_MODULE.WIDGET_REQUESTS:VIEW`, `:CREATE`)
      and enforced by `authorize(...)` on each backend route.
- [ ] You have read [architecture](FRONTEND-ARCHITECTURE.md) and [shared components](SHARED-COMPONENTS-AND-PATTERNS.md).

If an endpoint does not exist, **do not build the screen against invented data**. Report the
dependency.

## 1. Folder and file responsibilities

```text
src/features/widget-requests/                   (ILLUSTRATIVE)
├── widgetRequestContract.js     Validate every API response (fail closed)
├── widgetRequestService.js      Endpoint functions over apiClient
├── widgetRequestActions.js      Permission keys used by routes and buttons
├── widgetRequestModel.js        Pure helpers (filters, labels) — testable in Node
└── pages/
    ├── WidgetRequestsPage.jsx         List page (route)
    └── WidgetRequestDetailPage.jsx    Detail page (route with :requestId, nav: false)
```

Keep JSX thin: put logic you want to unit-test in `.js` files (the Node test runner cannot import
JSX).

## 2. Response contract

```js
// widgetRequestContract.js (ILLUSTRATIVE) — keep only documented fields; reject anything else.
import { ApiError } from '../../services/api/apiClient.js'

const ID = /^[1-9][0-9]{0,18}$/                       // Oracle NUMBER IDs stay strings
const STATUSES = ['DRAFT', 'SUBMITTED']                // only verified backend values

export function readWidgetRequest(item) {
  if (!item || typeof item.requestId !== 'string' || !ID.test(item.requestId) ||
    !STATUSES.includes(item.status) || typeof item.title !== 'string') {
    throw new ApiError('The server returned an unexpected response.', { code: 'INVALID_RESPONSE' })
  }
  return Object.freeze({ requestId: item.requestId, status: item.status, title: item.title })
}

// `result` is the apiClient result: { data, pagination } (pagination already validated by apiClient).
export function readWidgetRequestPage(result) {
  if (!Array.isArray(result?.data) || !result.pagination) {
    throw new ApiError('The server returned an unexpected response.', { code: 'INVALID_RESPONSE' })
  }
  return Object.freeze({ items: Object.freeze(result.data.map(readWidgetRequest)), pagination: result.pagination })
}
```

Write the readers for your own feature; do not import another business module's contract file.

Use relative imports in `.js` modules you will test in Node (as existing feature modules do).

## 3. Service

```js
// widgetRequestService.js (ILLUSTRATIVE)
import { apiClient } from '../../services/api/apiClient.js'
import { readWidgetRequestPage } from './widgetRequestContract.js'

export function createWidgetRequestService({ client }) {
  return Object.freeze({
    async list({ page, limit, search } = {}, { signal } = {}) {
      const result = await client.get('/example-module/widget-requests', { params: { page, limit, search }, signal })
      return readWidgetRequestPage(result)             // { items, pagination }
    },
    async submit(requestId) {
      const { data } = await client.post(`/example-module/widget-requests/${requestId}/submit`, {})
      return readWidgetRequest(data)                   // CSRF header added by apiClient
    },
  })
}
export const widgetRequestService = createWidgetRequestService({ client: apiClient })
```

Validate path IDs before building URLs (see `segment()` in `securityAdminService.js`). Never fetch
every page to simulate pagination; request only the page shown.

## 4. Permission keys

```js
// widgetRequestActions.js (ILLUSTRATIVE)
export const WIDGET_REQUEST_ACTIONS = Object.freeze({
  VIEW: 'EXAMPLE_MODULE.WIDGET_REQUESTS:VIEW',
  CREATE: 'EXAMPLE_MODULE.WIDGET_REQUESTS:CREATE',
  SUBMIT: 'EXAMPLE_MODULE.WIDGET_REQUESTS:SUBMIT',
})
```

Use exactly the codes the backend `authorize()` calls use. Never infer access from role names.

## 5. Register navigation and routes

Two places, same id. **The module registry (`src/config/registry/`)** — define the module, its
resources, their actions and their navigation in `src/config/registry/modules/<name>.module.js`
and add it to `registeredModules` in `src/config/registry/index.js`. For a new business domain,
also add a group to `registry/navigationGroups.js` (agree its label and icon in the requirement).
`src/config/registry/module-registry.example.js` is the complete, annotated example (one and
several resources, several modules, internal and external links, resources without navigation,
imports into `index.js`); it is documentation only and must never be imported.

```js
// src/config/registry/modules/widgets.module.js (ILLUSTRATIVE)
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'EXAMPLE_MODULE', name: 'Example module', displayOrder: 100,
  resources: [{
    code: 'WIDGET_REQUESTS', name: 'Widget Requests', actions: ['VIEW', 'CREATE', 'APPROVE'],
    navigation: [
      { id: 'widget-requests', path: '/example-domain/widget-requests', title: 'Widget requests',
        icon: 'package', group: 'example-domain', order: 10 },
      { id: 'widget-request', path: '/example-domain/widget-requests/:requestId', title: 'Widget request',
        icon: 'package', group: 'example-domain', order: 11, hidden: true },
    ],
  }],
})
```

The registry derives each entry's permission (`EXAMPLE_MODULE.WIDGET_REQUESTS:VIEW`; another
action with `requiredAction`), validates codes, actions (only `registry/actions.js`), ids,
paths, groups and `alsoRequires` references when imported, and fails the tests and build on any
error. Set `requiresMfa: true` only where the backend requires an MFA-verified session for that
permission (today: the `SECURITY_ADMINISTRATION` module); every other permission-guarded entry
gets `requiresMfa: false`. Use `implemented: false` until the page works against the real
backend. Registry files stay plain JavaScript with relative imports (no React, Vite or `@/`
aliases), so Node.js tooling can read the same definitions.

**External destinations** (`type: 'external'`, `href`: an https URL or
`{ env: 'VITE_EXTERNAL_<NAME>' }`) are listed with the same permission checks, open in a new tab
(`noopener noreferrer`) and are never React routes. A missing or invalid URL hides the entry.
`VITE_` values are public: never put secrets in them. Adding a real external destination is a
security review (gate G2).

**`src/routes/RouteComponents.jsx`** — lazy page exports:

```js
export const WidgetRequestsPage = lazy(() => import('@/features/widget-requests/pages/WidgetRequestsPage.jsx'))
```

**`src/app/router.jsx`** — inside the `AppRouteAccess` children, one line per route, in exactly
this format (tests check it):

```jsx
{ path: 'example-domain/widget-requests', handle: { routeId: 'widget-requests' }, element: <WidgetRequestsPage /> },
```

That is all that is needed for the sidebar, command palette, dashboard links, direct-URL
protection and the route announcer: they all read `appNavigation.js`, which derives its data from
the registry.

## 6. Page: loading, empty, error, permissions, changes

```jsx
// pages/WidgetRequestsPage.jsx (ILLUSTRATIVE, abridged)
import { useState } from 'react'
import usePermissions from '@/features/access/usePermissions.js'
import { AdminPage, Feedback, Pagination, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useAdminAction, useResource } from '@/features/security-administration/useAdminData.js'
import { WIDGET_REQUEST_ACTIONS } from '../widgetRequestActions.js'
import { widgetRequestService } from '../widgetRequestService.js'

export default function WidgetRequestsPage() {
  const { can } = usePermissions()
  const [page, setPage] = useState(1)
  const requests = useResource(`widget-requests:${page}`, (signal) => widgetRequestService.list({ page, limit: 25 }, { signal }))
  const action = useAdminAction()

  const submit = async (id) => {
    const outcome = await action.run(() => widgetRequestService.submit(id), { success: 'Request submitted.' })
    if (outcome.status !== 'ignored') requests.reload()   // refresh after success AND unknown outcomes
  }

  return (
    <AdminPage eyebrow="Example domain" title="Widget requests">
      <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />
      <ResourceState resource={requests} label="widget requests" empty="There are no widget requests.">
        {({ items, pagination }) => (
          <>
            {/* table in <div className="ux-table-wrap"><table className="ux-table zrv-admin-table"> */}
            {items.map((item) => can(WIDGET_REQUEST_ACTIONS.SUBMIT) && item.status === 'DRAFT' && (
              <button key={item.requestId} type="button" className="btn-secondary" disabled={action.pending} onClick={() => submit(item.requestId)}>Submit</button>
            ))}
            <Pagination pagination={pagination} onPage={setPage} disabled={requests.refreshing} />
          </>
        )}
      </ResourceState>
    </AdminPage>
  )
}
```

Rules shown above:

- **Loading/error/empty** come from `ResourceState`; failures offer Retry; a 401 ends the session
  automatically (the guard redirects to sign-in).
- **Each button checks its own action permission** with `can(...)`. The backend still decides.
- **Changes** go through `useAdminAction`: one at a time, never auto-retried, success only when the
  backend confirmed it, unknown outcomes explained and the data reloaded.
- Sensitive changes use `ConfirmDialog`.
- If a change can affect the signed-in user's own permissions, pass `refreshAccess: true`.
- **No sample rows, fake counts or placeholder buttons** — if data is missing, show the empty state.

## 7. Tests

Add `tests/widgetRequests.test.mjs` (ILLUSTRATIVE name) covering at least:

- the contract reader accepts the documented shape and rejects malformed data;
- the service sends the right method, path, query and body, with the CSRF header on changes
  (use `recordingFetch` and `createApiClient` from `tests/helpers/http.mjs` and `apiClient.js`,
  as in `tests/securityAdministration.test.mjs`);
- route access: allowed with the permission, denied without it (`routeAccess` from `appNavigation.js`);
- static checks that each button uses its specific permission key.

Then **update the pinned route expectations** in `tests/navigation.test.mjs` (the implemented-route
list and the administrator sidebar list). These tests are intentionally strict so that route
changes are always deliberate; update them, never delete them. See [frontend testing](FRONTEND-TESTING.md).

## 8. Checklist before the PR

- [ ] Real endpoints and permissions only; nothing invented.
- [ ] Module registered in `src/config/registry/` and routes in `router.jsx` with the same id; detail pages `hidden: true`.
- [ ] Every button gated by its own permission; backend enforcement confirmed.
- [ ] Loading, empty, error, denied and unknown-outcome states handled.
- [ ] Existing styles and building blocks used; works on mobile width and in dark mode.
- [ ] `npm run lint`, `npm test`, `npm run build` executed and results recorded.
- [ ] Browser check against the real backend with an allowed and a denied account (when authorized).
- [ ] Handoff written from the [template](../../docs/FEATURE-HANDOFF-TEMPLATE.md).
