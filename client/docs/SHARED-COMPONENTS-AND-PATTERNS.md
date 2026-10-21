# Shared Components and Patterns

What already exists, where it is, and how to use it. **Reuse these; do not create parallel
versions.** Paths are relative to `client/src/` (import with the `@/` alias).

## 1. Shared Fetch client — `services/api/apiClient.js`

The single HTTP client. It sends the HttpOnly session cookie (`credentials: 'include'`), attaches
the memory-held CSRF token to unsafe methods, enforces a timeout, validates the backend envelope
and converts failures into `ApiError`.

```js
import { apiClient, ApiError, isOutcomeUnknown } from '@/services/api/apiClient.js'

// ILLUSTRATIVE path — /example-module/widgets does not exist.
const { data, pagination, requestId, status } = await apiClient.get('/example-module/widgets', {
  params: { page: 1, limit: 25, search: 'abc' },   // undefined/null values are omitted
  signal,                                         // AbortSignal for cancellation
})
await apiClient.post('/example-module/widgets', { name: 'x' })   // CSRF header added automatically
```

| Option | Default | Meaning |
|---|---|---|
| `params` | — | Query parameters (primitives or `Date`) |
| `body` | — | JSON-serialized for `post`/`put`/`patch` |
| `signal` | — | Caller cancellation (`ABORTED`) |
| `timeout` | 15000 ms | Then `TIMEOUT` |
| `csrf` | `'session'` | `'session'`, `'challenge'` (MFA challenge endpoints only) or `'none'` (public endpoints) |
| `notifyUnauthorized` | `true` | A 401 ends the signed-in session; set `false` only for auth endpoints whose 401 means something else |
| `responseType` | `'json'` | `'json'`, `'text'`, `'blob'`, `'void'` |

Paths are relative to the API base (`/api/v1` by default, `config/apiConfig.js`) and must start
with `/`. The client rejects absolute URLs, `..` segments and query strings in the path.

**`ApiError`** carries `code` (stable backend code such as `FORBIDDEN`, `VALIDATION_ERROR`,
`NETWORK_ERROR`, `TIMEOUT`, `INVALID_RESPONSE`), `status`, `message` (safe to display), `details`
(`[{ field, message }]`), `requestId` and `retryAfterSeconds`.

**`isOutcomeUnknown(error)`** is true for network loss, timeout, unreadable responses and 500s:
a change may or may not have been applied. Never report it as success or as rejected, never retry
it automatically; reload the data and tell the user to check.

### Feature service + response contract pattern

Each feature wraps its endpoints in a service created from a client (so tests can inject a fake
fetch) and validates every response before use:

```js
// features/security-administration/securityAdminService.js (actual, abridged)
export function createSecurityAdminService({ client }) {
  return Object.freeze({
    async getUser(userId, { signal } = {}) {
      const { data } = await client.get(`/users/${segment(userId)}`, { signal })
      return readUserDetail(data)          // from securityAdminContract.js; throws INVALID_RESPONSE
    },
  })
}
export const securityAdminService = createSecurityAdminService({ client: apiClient })
```

Contract readers keep only documented fields, keep Oracle IDs as decimal strings, and reject a
malformed response as a whole. Examples: `features/auth/authContract.js`,
`features/access/permissionContract.js`, `features/security-administration/securityAdminContract.js`.

## 2. Authentication — `features/auth/`

```js
import useAuth from '@/features/auth/useAuth.js'
const { status, user, session, password, signOut } = useAuth()
```

| Field | Meaning |
|---|---|
| `status` | `preview` · `loading` · `guest` · `authenticated` · `mfa_required` · `error` |
| `user` | `{ id, username, employeeNumber, fullName, email, jobTitle, department }` (strings or null) |
| `session` | `{ expiresAt, idleTimeoutSeconds, mfaVerified }` |
| `password` | `{ expired, expiresAt }` |
| actions | `signIn`, `signOut`, `retrySession`, MFA, password and recovery operations used by the auth pages |

Feature pages normally need only `user` and `status`. Route guards already guarantee an
authenticated session inside `AdminLayout`. Never call auth endpoints directly from a feature.

## 3. Effective permissions — `features/access/`

```js
import usePermissions from '@/features/access/usePermissions.js'
const { status, can, mfaVerified, permissions, reload } = usePermissions()
if (can('EXAMPLE_MODULE.WIDGETS:CREATE')) { /* show the Create button */ }
```

- Loaded from `GET /api/v1/access-control/me/permissions` after sign-in/restore; cleared on
  sign-out; bound to the signed-in user id; stale responses are discarded.
- `can(key)` is `true` only for a loaded permission of the current user (default deny).
- `reload()` refreshes in place; call it after a confirmed change that can alter the user's own
  access (see `useAdminAction({ refreshAccess: true })`).
- Permission keys are strings `MODULE.RESOURCE:ACTION`. Keep a feature's keys in one constants
  module (e.g. `features/security-administration/securityActions.js`).

## 4. Navigation and route protection

| File | Role |
|---|---|
| `config/appNavigation.js` | The only route/navigation/permission table: `PERMISSIONS`, `navigationSections`, `appRoutes`, `routeAccess`, `canAccessRoute`, `authorizedNavigation`, `paletteCommands`, `findAppRoute` |
| `app/router.jsx` | Registers each implemented route with `handle: { routeId }` under `AppRouteAccess` |
| `routes/RouteGuards.jsx` | `ProtectedRoute`, `GuestOnlyRoute`, `MfaChallengeRoute`, `AppRouteAccess`, `TemplateDemoRoute`, `RootRedirect` |
| `routes/RouteComponents.jsx` | Lazy page components and the screen-reader route announcer (labels come from `appNavigation.js`) |

`appRoutes` entry fields:

| Field | Meaning |
|---|---|
| `id`, `path`, `label`, `icon`, `section` | Identity, URL (may contain `:param`), sidebar text, Lucide icon, sidebar section (`workspace`, `security`, `account`; a new business-domain section is added as part of normal feature registration — agree its label and icon in the requirement) |
| `permission` | Required effective permission; omit for session-only pages |
| `alsoRequires` | Extra permissions the page needs to function (e.g. a picker that reads another list) |
| `requiresMfa` | The backend requires an MFA-verified session (all `SECURITY_ADMINISTRATION` pages) |
| `implemented` | `false` = approved destination with no screen yet: never routed, listed or searchable |
| `nav: false` | Detail page: guarded, but not shown in the sidebar/command palette |

The sidebar (`components/layout/Sidebar.jsx`), command palette (`components/layout/CommandPalette.jsx`),
dashboard and guard all derive from this table. Never add a menu link, shortcut or route anywhere
else.

## 5. Layout and shell components — `components/layout/`

`Sidebar.jsx`, `Header.jsx` (profile menu, sign-out, theme, layout settings), `CommandPalette.jsx`
(Ctrl/Cmd+K), `LayoutCustomizer.jsx`. They are rendered by `layouts/AdminLayout.jsx`; features do
not import them.

## 6. Reusable visual building blocks

### Generic states

| Component | Path | Use |
|---|---|---|
| `PageState` | `components/feedback/PageState.jsx` | Full-screen loading/error state (session checks); not inside the shell |
| `RouteNotice` | `pages/RouteNotice.jsx` | In-shell notice panel with an optional action link or button |
| `AccessDeniedPage`, `AccessPendingPage`, `AccessUnavailablePage`, `NotFoundPage` | `pages/PhasePages.jsx` | Used by the guards |
| `OrvexaIcon` | `components/icons/OrvexaIcon.jsx` | Icons |

### Data-page building blocks (currently in `features/security-administration/`)

These were built for Security Administration, but the ones listed below are generic. A business
feature **may reuse them from their current location** when their dependencies and contracts fit
its needs:

- **Fit:** check what a building block depends on before importing it. `AdminUi.jsx` (plus its
  stylesheet `src/styles/security-admin.css`), `adminRequests.js` and `adminFeedback.js` depend
  only on React, `OrvexaIcon` and the shared API client; `useAdminData.js` (`useResource`,
  `useAdminAction`) also uses `usePermissions`, so `useAdminAction` refreshes the signed-in user's
  permissions when asked. `adminForms.js` additionally imports the code pattern from
  `securityAdminContract.js`. `adminFeedback.js` translates account-related reason codes; other
  codes fall back to readable text.
- **No business coupling:** do not import Security Administration's business code — its service,
  contract, permission constants (`securityActions.js`), model (`adminModel.js` account/catalogue
  helpers), pages or domain dialogs — into another business module, and never make Security
  Administration depend on a business module. If you need similar business logic, write it in
  your own feature.
- **No duplicates:** never copy a building block into your feature to modify it.
- **Approval before changing or extracting:** changing the behaviour or props of these building
  blocks, or extracting them into a shared folder (e.g. `src/components/`), changes shared
  architecture and needs approval (gate G3 in the
  [delivery workflow](../../docs/FEATURE-DELIVERY-WORKFLOW.md#approval-gates)). If a building block
  does not fit, raise it rather than forking it.

| Export | File | Purpose |
|---|---|---|
| `AdminPage` | `components/AdminUi.jsx` | Page header (eyebrow, title, description, actions) + content |
| `Panel` | same | Card section with title, description and actions |
| `ResourceState` | same | Loading / error-with-retry / not-found / empty states for a `useResource()` result |
| `Pagination` | same | Previous/next with page and total (stays usable past the last page) |
| `Badge`, `ActiveBadge`, `DetailList` | same | Status pills and label/value lists |
| `Dialog`, `DialogActions`, `ConfirmDialog` | same | Accessible modal: focus moves in, Tab is trapped, Escape/backdrop close unless busy, focus returns |
| `Feedback` | same | Success (`role=status`), failure or unknown-outcome (`role=alert`) message |
| `Field` | same | Label, hint and error wrapper for an input |
| `useResource(key, load)` | `useAdminData.js` | Load data for a key with cancellation; newer requests always win; `reload()` |
| `useAdminAction()` | same | One change at a time (double clicks ignored), outcome feedback, permission refresh |
| `createLatestRequest`, `createSubmissionGuard` | `adminRequests.js` | Framework-free race/duplicate primitives |
| `fieldProps`, `checkSearch`, `checkCode`, `checkName`, `readFutureInstant`, … | `adminForms.js` | Accessible input attributes and checks mirroring backend Joi rules |
| `describeFailure`, `formatInstant` | `adminFeedback.js` | Safe error explanation; local date-time |

Usage pattern (actual, from `pages/RolesPage.jsx`, abridged):

```jsx
const roles = useResource(`roles:${page}`, (signal) => securityAdminService.listRoles({ page, limit: PAGE_SIZE }, { signal }))
const action = useAdminAction()
// ...
<ResourceState resource={roles} label="roles" empty="No roles are defined.">
  {({ items, pagination }) => ( /* table + <Pagination /> */ )}
</ResourceState>
// a confirmed change:
await action.run(() => securityAdminService.deactivateRole(id), { success: 'Role deactivated.', refreshAccess: true })
```

### Forms, dialogs and accessibility rules

- Use `<Field>` + `fieldProps(id, { hint, error })` so labels, hints and errors are linked.
- Validate on submit; focus or announce the first error; keep the form enabled while editing.
- Put confirmations for sensitive changes in `ConfirmDialog`; keep the dialog open on failure and
  show the backend message inside it.
- Every button is a `<button type="button">` (or `submit` in a form) with visible text or
  `aria-label`. Tables have a `<caption>` (can be `sr-only`) and `scope="col"` headers.
- Loading text uses `role="status"`; failures use `role="alert"`.

## 7. Styling and theme

| Source | Use for |
|---|---|
| `public/orvexa/assets/css/*.css` (precompiled, do not edit) | Layout shell, `ux-*` and `btn-*` classes: `ux-panel`, `ux-input`, `ux-select`, `ux-textarea`, `ux-table-wrap` + `ux-table`, `ux-badge`, `btn-primary`, `btn-secondary`, `field` |
| `src/styles/workspace.css` | Dashboard cards and sidebar states (`zrv-card`, `zrv-dash*`) |
| `src/styles/security-admin.css` | Admin pages, dialogs, badges, tables (`zrv-admin-*`, `zrv-dialog*`, `zrv-catalog*`) |
| `src/styles/auth.css`, `route-states.css` | Auth pages and in-shell notices |
| Feature CSS | Only for genuinely feature-specific layout, `zrv-<feature>-` prefix, theme tokens only |

Rules: use the theme tokens (never hard-coded colours), keep spacing and typography consistent with
existing pages, support dark mode via tokens, and make layouts work from mobile widths (tables sit
in `ux-table-wrap`, which scrolls horizontally; grids collapse to one column under ~960 px as in
`security-admin.css`).

## 8. Keep local vs. reuse — summary

| Reuse (shared) | Keep feature-local |
|---|---|
| `apiClient`, `ApiError`, `isOutcomeUnknown` | Endpoint functions and response readers for your API |
| `useAuth`, `usePermissions` | Your permission-key constants |
| `appNavigation.js`, router, guards | Your page components |
| Layout shell, `PageState`, `RouteNotice`, `OrvexaIcon` | Business-specific widgets |
| Generic AdminUi building blocks, `useResource`, `useAdminAction` (when they fit) | Pure helpers and business logic for your data |
| Theme tokens and existing CSS classes | CSS used by your feature only |
