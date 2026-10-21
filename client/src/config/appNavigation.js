// The single route and navigation configuration of the signed-in application.
// The sidebar, the command palette, the protected-route guard and
// permission-controlled actions all decide access through routeAccess() here,
// so no surface can show or open a page that another one would refuse.
//
// Access is decided only from the backend's already-resolved effective
// permissions (GET /access-control/me/permissions), never from role names or
// identities. The backend still authorizes every API request.
import { orvexaDemoRoutes } from './orvexaRoutes.js'
import { templateDemosAvailable } from './authRouting.js'

// Permission identities: `MODULE_CODE.RESOURCE_CODE:ACTION_CODE`.
export const PERMISSIONS = Object.freeze({
  USER_ACCOUNTS_VIEW: 'SECURITY_ADMINISTRATION.USER_ACCOUNTS:VIEW',
  ROLES_VIEW: 'SECURITY_ADMINISTRATION.ROLES:VIEW',
  USER_ROLES_VIEW: 'SECURITY_ADMINISTRATION.USER_ROLES:VIEW',
  ROLE_PERMISSIONS_VIEW: 'SECURITY_ADMINISTRATION.ROLE_PERMISSIONS:VIEW',
  PERMISSION_CATALOG_VIEW: 'SECURITY_ADMINISTRATION.PERMISSION_CATALOG:VIEW',
  USER_PERMISSION_OVERRIDES_VIEW: 'SECURITY_ADMINISTRATION.USER_PERMISSION_OVERRIDES:VIEW',
  SECURITY_AUDIT_VIEW: 'SECURITY_ADMINISTRATION.SECURITY_AUDIT:VIEW',
})

export const navigationSections = Object.freeze([
  Object.freeze({ id: 'workspace', label: 'Workspace', icon: 'layout-dashboard', standalone: true }),
  Object.freeze({ id: 'security', label: 'Security administration', icon: 'shield-check' }),
  Object.freeze({ id: 'account', label: 'My account', icon: 'user-round' }),
])

// `permission`: required effective permission (none = any signed-in user).
// `requiresMfa`: the backend also requires an MFA-verified session (every
// SECURITY_ADMINISTRATION permission).
// `implemented: false`: an approved destination whose screen is not built yet.
// It is never routed, listed or searchable, so no placeholder screen appears.
export const appRoutes = Object.freeze([
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard', section: 'workspace', implemented: true },
  { id: 'user-accounts', path: '/security/users', label: 'User accounts', icon: 'users', section: 'security', permission: PERMISSIONS.USER_ACCOUNTS_VIEW, requiresMfa: true, implemented: false },
  { id: 'roles', path: '/security/roles', label: 'Roles', icon: 'user-cog', section: 'security', permission: PERMISSIONS.ROLES_VIEW, requiresMfa: true, implemented: false },
  { id: 'user-roles', path: '/security/user-roles', label: 'User roles', icon: 'user-check', section: 'security', permission: PERMISSIONS.USER_ROLES_VIEW, requiresMfa: true, implemented: false },
  { id: 'role-permissions', path: '/security/role-permissions', label: 'Role permissions', icon: 'key-round', section: 'security', permission: PERMISSIONS.ROLE_PERMISSIONS_VIEW, requiresMfa: true, implemented: false },
  { id: 'permission-catalog', path: '/security/permission-catalog', label: 'Permission catalog', icon: 'list-tree', section: 'security', permission: PERMISSIONS.PERMISSION_CATALOG_VIEW, requiresMfa: true, implemented: false },
  { id: 'permission-overrides', path: '/security/permission-overrides', label: 'Permission overrides', icon: 'shield-half', section: 'security', permission: PERMISSIONS.USER_PERMISSION_OVERRIDES_VIEW, requiresMfa: true, implemented: false },
  { id: 'security-audit', path: '/security/audit', label: 'Security audit', icon: 'file-search', section: 'security', permission: PERMISSIONS.SECURITY_AUDIT_VIEW, requiresMfa: true, implemented: false },
  { id: 'account-password', path: '/account/password', label: 'Password', icon: 'key-round', section: 'account', implemented: true },
  { id: 'account-authenticator', path: '/account/authenticator', label: 'Authenticator app', icon: 'smartphone', section: 'account', implemented: true },
].map((route) => Object.freeze(route)))

export const implementedRoutes = Object.freeze(appRoutes.filter((route) => route.implemented))

export function findAppRoute(pathname) {
  if (typeof pathname !== 'string') return null
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return appRoutes.find((route) => route.path === path) || null
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
  if (access.has(route.permission) !== true) return 'denied'
  if (route.requiresMfa && access.mfaVerified !== true) return 'mfa_required'
  return 'allowed'
}

export const canAccessRoute = (route, access) => routeAccess(route, access) === 'allowed'

// Sidebar sections containing only routes the user may open; empty sections are omitted.
// `routes` is replaceable for tests only.
export function authorizedNavigation(access, routes = appRoutes) {
  return navigationSections
    .map((section) => ({ ...section, items: routes.filter((route) => route.section === section.id && canAccessRoute(route, access)) }))
    .filter((section) => section.items.length)
}

// Command palette entries: the same authorized routes as the sidebar. Template
// demo pages are added only in the development preview, never for a session.
export function paletteCommands(access, authStatus, routes = appRoutes) {
  const commands = authorizedNavigation(access, routes).flatMap((section) =>
    section.items.map((route) => ({ id: route.id, label: route.label, icon: route.icon, path: route.path, group: section.label })))
  if (!templateDemosAvailable(authStatus)) return commands
  return [...commands, ...orvexaDemoRoutes
    .filter((demo) => demo.path.startsWith('/demo/'))
    .map((demo) => ({ id: `demo-${demo.id}`, label: demo.label, icon: demo.icon, path: demo.path, group: 'Template demos (preview only)' }))]
}

export function searchCommands(commands, query, limit = 12) {
  const term = String(query ?? '').trim().toLowerCase()
  return commands.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(term)).slice(0, limit)
}
