// The route and navigation configuration of the signed-in application, derived
// from the developer-controlled module registry (config/registry/). The
// sidebar, the command palette, the protected-route guard and
// permission-controlled actions all decide access through routeAccess() here,
// so no surface can show or open a page that another one would refuse.
//
// Access is decided only from the backend's already-resolved effective
// permissions (GET /access-control/me/permissions), never from role names or
// identities. The backend still authorizes every API request.
import { orvexaDemoRoutes } from './orvexaRoutes.js'
import { templateDemosAvailable } from './authRouting.js'
import { NAVIGATION_GROUPS, registry } from './registry/index.js'
import { resolveExternalHref } from './externalDestinations.js'

// Each navigation entry (registry `entries`, in display order):
// `permission`: required effective permission `MODULE.RESOURCE:ACTION` (none =
// any signed-in user). `alsoRequires`: further permissions the page needs to
// work at all (the account and role pickers read lists guarded by another
// permission). `requiresMfa`: the backend also requires an MFA-verified session
// (every SECURITY_ADMINISTRATION permission). `nav: false`: a detail page
// reached from another page (path parameters); guarded like any page but never
// listed in the sidebar or command palette. `implemented: false`: an approved
// destination that is not available; never routed, listed or searchable, so no
// placeholder screen appears. Security audit stays unimplemented: the backend
// has no audit retrieval API.
// Internal entries (`path`) are React routes. External entries
// (`type: 'external'`) carry a resolved https `href`, are never routed or
// matched as a route, and are hidden when their destination does not resolve.
export const navigationEntries = Object.freeze(registry.entries.map((entry) => {
  if (entry.type !== 'external') return entry
  const href = resolveExternalHref(entry.href)
  return Object.freeze({ ...entry, href, implemented: entry.implemented && href !== null })
}))

export const navigationSections = NAVIGATION_GROUPS

// Internal application routes only.
export const appRoutes = Object.freeze(navigationEntries.filter((entry) => entry.type !== 'external'))

// Permission identities used by the Security Administration navigation,
// named RESOURCE_ACTION (for example USER_ACCOUNTS_VIEW).
export const PERMISSIONS = Object.freeze(Object.fromEntries(
  navigationEntries
    .flatMap((entry) => [entry.permission, ...(entry.alsoRequires || [])])
    .filter((key) => key?.startsWith('SECURITY_ADMINISTRATION.'))
    .map((key) => [key.slice(key.indexOf('.') + 1).replace(':', '_'), key]),
))

export const implementedRoutes = Object.freeze(appRoutes.filter((route) => route.implemented))

// `/security/users/:userId` matches `/security/users/105`; a parameter matches one non-empty segment.
function matchesPath(pattern, path) {
  const expected = pattern.split('/')
  const actual = path.split('/')
  return expected.length === actual.length &&
    expected.every((segment, index) => (segment.startsWith(':') ? actual[index] !== '' : segment === actual[index]))
}

export function findAppRoute(pathname) {
  if (typeof pathname !== 'string') return null
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return appRoutes.find((route) => route.path === path) || appRoutes.find((route) => matchesPath(route.path, path)) || null
}

// Access decision for one route, given the permission state
// ({ status, mfaVerified, has }) exposed by usePermissions():
//   allowed | pending (still loading) | error (could not be loaded) |
//   denied | mfa_required | unavailable (not implemented or unknown).
// Default deny: anything other than `allowed` never renders or lists the route.
export function routeAccess(route, access) {
  if (!route?.implemented) return 'unavailable'
  if (!route.permission) return 'allowed'
  if (access?.status === 'loading') return 'pending'
  if (access?.status === 'error') return 'error'
  if (access?.status !== 'ready' || typeof access.has !== 'function') return 'denied'
  if (![route.permission, ...(route.alsoRequires || [])].every((key) => access.has(key) === true)) return 'denied'
  // The MFA condition mirrors the backend: waived only when the server reports the
  // local-development exception (adminMfaRequired === false); the session is still unverified.
  if (route.requiresMfa && access.mfaVerified !== true && access.adminMfaRequired !== false) return 'mfa_required'
  return 'allowed'
}

export const canAccessRoute = (route, access) => routeAccess(route, access) === 'allowed'

// Sidebar sections containing only listed entries (internal routes and
// resolved external destinations) the user may open; empty sections are
// omitted. `routes` is replaceable for tests only.
export function authorizedNavigation(access, routes = navigationEntries) {
  return navigationSections
    .map((section) => ({ ...section, items: routes.filter((route) => route.section === section.id && route.nav !== false && canAccessRoute(route, access)) }))
    .filter((section) => section.items.length)
}

// Command palette entries: the same authorized entries as the sidebar. An
// external entry carries `href` instead of `path`. Template demo pages are
// added only in the development preview, never for a session.
export function paletteCommands(access, authStatus, routes = navigationEntries) {
  const commands = authorizedNavigation(access, routes).flatMap((section) =>
    section.items.map((route) => (route.type === 'external'
      ? { id: route.id, label: route.label, icon: route.icon, href: route.href, external: true, group: section.label }
      : { id: route.id, label: route.label, icon: route.icon, path: route.path, group: section.label })))
  if (!templateDemosAvailable(authStatus)) return commands
  return [...commands, ...orvexaDemoRoutes
    .filter((demo) => demo.path.startsWith('/demo/'))
    .map((demo) => ({ id: `demo-${demo.id}`, label: demo.label, icon: demo.icon, path: demo.path, group: 'Template demos (preview only)' }))]
}

export function searchCommands(commands, query, limit = 12) {
  const term = String(query ?? '').trim().toLowerCase()
  return commands.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(term)).slice(0, limit)
}
