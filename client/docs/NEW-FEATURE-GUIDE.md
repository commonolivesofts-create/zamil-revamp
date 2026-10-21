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
```

Use relative imports in `.js` modules you will test in Node (as existing feature modules do).

## 3. Service

```js
// widgetRequestService.js (ILLUSTRATIVE)
import { apiClient } from '../../services/api/apiClient.js'
import { readPage } from '../security-administration/securityAdminContract.js' // reuse, don't copy
import { readWidgetRequest } from './widgetRequestContract.js'

export function createWidgetRequestService({ client }) {
  return Object.freeze({
    async list({ page, limit, search } = {}, { signal } = {}) {
      const result = await client.get('/example-module/widget-requests', { params: { page, limit, search }, signal })
      return readPage(result, readWidgetRequest)       // { items, pagination }
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

Two places, same id. **`src/config/appNavigation.js`** — add the routes (and, for a new business
domain, a section in `navigationSections`; agree its label/icon in the requirement):

```js
// appNavigation.js (ILLUSTRATIVE additions)
const WIDGET_REQUESTS_VIEW = 'EXAMPLE_MODULE.WIDGET_REQUESTS:VIEW'
// navigationSections: { id: 'example-domain', label: 'Example domain', icon: 'boxes' },
{ id: 'widget-requests', path: '/example-domain/widget-requests', label: 'Widget requests', icon: 'package',
  section: 'example-domain', permission: WIDGET_REQUESTS_VIEW, requiresMfa: false, implemented: true },
{ id: 'widget-request', path: '/example-domain/widget-requests/:requestId', label: 'Widget request', icon: 'package',
  section: 'example-domain', permission: WIDGET_REQUESTS_VIEW, requiresMfa: false, implemented: true, nav: false },
```

Set `requiresMfa` explicitly on every permission-guarded route: `true` only where the backend
requires an MFA-verified session for that permission (today: the `SECURITY_ADMINISTRATION`
module), otherwise `false` — `tests/navigation.test.mjs` checks this strictly. Set
`implemented: true` only when the page works against the real backend.

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
protection and the route announcer: they all read `appNavigation.js`.

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
- [ ] Routes registered in `appNavigation.js` and `router.jsx` with the same id; detail pages `nav: false`.
- [ ] Every button gated by its own permission; backend enforcement confirmed.
- [ ] Loading, empty, error, denied and unknown-outcome states handled.
- [ ] Existing styles and building blocks used; works on mobile width and in dark mode.
- [ ] `npm run lint`, `npm test`, `npm run build` executed and results recorded.
- [ ] Browser check against the real backend with an allowed and a denied account (when authorized).
- [ ] Handoff written from the [template](../../docs/FEATURE-HANDOFF-TEMPLATE.md).
