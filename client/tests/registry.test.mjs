// Phase 2A: developer-controlled module/resource registry. The derived
// navigation must stay identical to the pre-registry configuration; definitions
// are validated; external destinations are safe; the example is isolated.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { STANDARD_ACTIONS, isStandardAction } from '../src/config/registry/actions.js'
import { RegistryError, buildRegistry, defineModule, validateExternalUrl } from '../src/config/registry/defineModule.js'
import { NAVIGATION_GROUPS, registeredModules, registry } from '../src/config/registry/index.js'
import { EXAMPLE_GROUPS, EXAMPLE_MODULES } from '../src/config/registry/module-registry.example.js'
import { resolveExternalHref } from '../src/config/externalDestinations.js'
import {
  PERMISSIONS, appRoutes, authorizedNavigation, findAppRoute, implementedRoutes, navigationEntries,
  navigationSections, paletteCommands, resolveNavigationEntries, routeAccess,
} from '../src/config/appNavigation.js'
import { SECURITY_ACTIONS } from '../src/features/security-administration/securityActions.js'
import { SECURITY_MODULE, SECURITY_RESOURCES } from '../../server/src/modules/access-control/securityCatalog.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const plain = (value) => JSON.parse(JSON.stringify(value))
const SA = 'SECURITY_ADMINISTRATION'

// ---------------------------------------------------------------- unchanged navigation

// The exact navigation before the registry (pre-Phase 2A appNavigation.js), in order.
const PRE_REGISTRY_ROUTES = [
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard', section: 'workspace', implemented: true },
  { id: 'user-accounts', path: '/security/users', label: 'User accounts', icon: 'users', section: 'security', permission: `${SA}.USER_ACCOUNTS:VIEW`, requiresMfa: true, implemented: true },
  { id: 'user-account', path: '/security/users/:userId', label: 'User account', icon: 'user-round', section: 'security', permission: `${SA}.USER_ACCOUNTS:VIEW`, requiresMfa: true, implemented: true, nav: false },
  { id: 'roles', path: '/security/roles', label: 'Roles', icon: 'user-cog', section: 'security', permission: `${SA}.ROLES:VIEW`, requiresMfa: true, implemented: true },
  { id: 'user-roles', path: '/security/user-roles', label: 'User roles', icon: 'user-check', section: 'security', permission: `${SA}.USER_ROLES:VIEW`, alsoRequires: [`${SA}.USER_ACCOUNTS:VIEW`], requiresMfa: true, implemented: true },
  { id: 'user-role-assignments', path: '/security/user-roles/:userId', label: 'User roles', icon: 'user-check', section: 'security', permission: `${SA}.USER_ROLES:VIEW`, requiresMfa: true, implemented: true, nav: false },
  { id: 'role-permissions', path: '/security/role-permissions', label: 'Role permissions', icon: 'key-round', section: 'security', permission: `${SA}.ROLE_PERMISSIONS:VIEW`, alsoRequires: [`${SA}.ROLES:VIEW`], requiresMfa: true, implemented: true },
  { id: 'permission-catalog', path: '/security/permission-catalog', label: 'Permission catalog', icon: 'list-tree', section: 'security', permission: `${SA}.PERMISSION_CATALOG:VIEW`, requiresMfa: true, implemented: true },
  { id: 'permission-overrides', path: '/security/permission-overrides', label: 'Permission overrides', icon: 'shield-half', section: 'security', permission: `${SA}.USER_PERMISSION_OVERRIDES:VIEW`, alsoRequires: [`${SA}.USER_ACCOUNTS:VIEW`], requiresMfa: true, implemented: true },
  { id: 'user-permission-overrides', path: '/security/permission-overrides/:userId', label: 'Permission overrides', icon: 'shield-half', section: 'security', permission: `${SA}.USER_PERMISSION_OVERRIDES:VIEW`, requiresMfa: true, implemented: true, nav: false },
  { id: 'security-audit', path: '/security/audit', label: 'Security audit', icon: 'file-search', section: 'security', permission: `${SA}.SECURITY_AUDIT:VIEW`, requiresMfa: true, implemented: false },
  { id: 'account-password', path: '/account/password', label: 'Password', icon: 'key-round', section: 'account', implemented: true },
  { id: 'account-authenticator', path: '/account/authenticator', label: 'Authenticator app', icon: 'smartphone', section: 'account', implemented: true },
]

// HR recruitment (session-only module HR_RECRUITMENT, owner-approved): three
// forms and their hidden record pages in the "Human resources" group, switched
// by VITE_FEATURE_HR_RECRUITMENT; off here (unset outside a development build).
const HR = 'human-resources'
const HR_SWITCH = { env: 'VITE_FEATURE_HR_RECRUITMENT' }
const HR_RECRUITMENT_ROUTES = [
  { id: 'hr-requisition', path: '/hr/recruitment/requisition', label: 'Personnel requisition', icon: 'clipboard-list', section: HR, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-requisition-record', path: '/hr/recruitment/requisition/:requisitionId', label: 'Personnel requisition', icon: 'clipboard-list', section: HR, implemented: false, enabledBy: HR_SWITCH, nav: false },
  { id: 'hr-interview', path: '/hr/recruitment/interview', label: 'Interview assessment', icon: 'messages-square', section: HR, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-interview-record', path: '/hr/recruitment/interview/:assessmentId', label: 'Interview assessment', icon: 'messages-square', section: HR, implemented: false, enabledBy: HR_SWITCH, nav: false },
  { id: 'hr-offer', path: '/hr/recruitment/offer', label: 'Employment offer', icon: 'file-signature', section: HR, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-offer-record', path: '/hr/recruitment/offer/:offerId', label: 'Employment offer', icon: 'file-signature', section: HR, implemented: false, enabledBy: HR_SWITCH, nav: false },
  { id: 'hr-orientation', path: '/hr/recruitment/orientation', label: 'Orientation schedule', icon: 'calendar-clock', section: HR, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-orientation-record', path: '/hr/recruitment/orientation/:scheduleId', label: 'Orientation schedule', icon: 'calendar-clock', section: HR, implemented: false, enabledBy: HR_SWITCH, nav: false },
  { id: 'hr-probation', path: '/hr/recruitment/probation-evaluation', label: 'Probation evaluation', icon: 'clipboard-check', section: HR, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-probation-record', path: '/hr/recruitment/probation-evaluation/:evaluationId', label: 'Probation evaluation', icon: 'clipboard-check', section: HR, implemented: false, enabledBy: HR_SWITCH, nav: false },
  { id: 'hr-periodwise-employees', path: '/hr/reports/periodwise-employees', label: 'Periodwise employees', icon: 'chart-column', section: HR, implemented: false, enabledBy: HR_SWITCH },
]
// Group order: workspace, human resources, security, account.
const EXPECTED_ROUTES = [PRE_REGISTRY_ROUTES[0], ...HR_RECRUITMENT_ROUTES, ...PRE_REGISTRY_ROUTES.slice(1)]

test('the derived routes, sections and permission names equal the pre-registry configuration exactly', () => {
  assert.deepEqual(plain(appRoutes), EXPECTED_ROUTES)
  assert.deepEqual(plain(navigationEntries), EXPECTED_ROUTES, 'no external or extra entries are active')
  for (const [index, route] of appRoutes.entries()) {
    assert.deepEqual(Object.keys(route), Object.keys(EXPECTED_ROUTES[index]), `${route.id}: same fields, same order`)
  }
  assert.deepEqual(plain(navigationSections), [
    { id: 'workspace', label: 'Workspace', icon: 'layout-dashboard', standalone: true },
    { id: HR, label: 'Human resources', icon: 'users-round' },
    { id: 'security', label: 'Security administration', icon: 'shield-check' },
    { id: 'account', label: 'My account', icon: 'user-round' },
  ])
  assert.deepEqual(plain(PERMISSIONS), {
    USER_ACCOUNTS_VIEW: `${SA}.USER_ACCOUNTS:VIEW`,
    ROLES_VIEW: `${SA}.ROLES:VIEW`,
    USER_ROLES_VIEW: `${SA}.USER_ROLES:VIEW`,
    ROLE_PERMISSIONS_VIEW: `${SA}.ROLE_PERMISSIONS:VIEW`,
    PERMISSION_CATALOG_VIEW: `${SA}.PERMISSION_CATALOG:VIEW`,
    USER_PERMISSION_OVERRIDES_VIEW: `${SA}.USER_PERMISSION_OVERRIDES:VIEW`,
    SECURITY_AUDIT_VIEW: `${SA}.SECURITY_AUDIT:VIEW`,
  })
  assert.ok(Object.isFrozen(appRoutes) && appRoutes.every(Object.isFrozen))
  assert.deepEqual(registeredModules.map((module) => module.code), ['COMMON', SA, 'HR_RECRUITMENT'], 'only the approved modules are active')
  assert.equal(registeredModules.find((module) => module.code === 'HR_RECRUITMENT').rbac, false, 'HR recruitment registers no Oracle permissions')
})

test('every implemented internal route has exactly one React Router entry with the same path, and back', async () => {
  const router = await read('../src/app/router.jsx')
  const routerRoutes = [...router.matchAll(/path: '([^']+)', handle: \{ routeId: '([^']+)' \}/g)]
    .map(([, path, id]) => ({ id, path: `/${path}` }))
  // The source lists every page that is implemented with all feature switches
  // on; the router keeps only this build's implemented pages (implementedOnly).
  const allSwitchesOn = Object.fromEntries(registry.entries.filter((e) => e.enabledBy).map((e) => [e.enabledBy.env, 'true']))
  const switchable = resolveNavigationEntries(registry.entries, allSwitchesOn).filter((r) => r.type !== 'external' && r.implemented)
  assert.deepEqual(
    routerRoutes.map((r) => `${r.id} ${r.path}`).sort(),
    switchable.map((r) => `${r.id} ${r.path}`).sort(),
  )
  assert.ok(implementedRoutes.every((r) => routerRoutes.some((line) => line.id === r.id)))
  assert.match(router, /children: implementedOnly\(\[/)
  assert.ok(!routerRoutes.some((r) => r.id === 'security-audit'), 'unimplemented pages are never routed')
})

test('Security Administration equals the complete backend catalogue: 8 resources, 23 permissions', () => {
  const module = registeredModules.find((item) => item.code === SA)
  assert.equal(module.name, SECURITY_MODULE.name)
  assert.equal(module.description, SECURITY_MODULE.description)
  assert.equal(module.displayOrder, SECURITY_MODULE.displayOrder)
  assert.deepEqual(
    module.resources.map(({ code, name, actions }) => ({ code, name, actions: [...actions] })),
    SECURITY_RESOURCES.map(({ code, name, actions }) => ({ code, name, actions: [...actions] })),
  )
  const backend = SECURITY_RESOURCES.flatMap((r) => r.actions.map((a) => `${SA}.${r.code}:${a}`))
  const registered = registry.permissions.filter((p) => p.moduleCode === SA).map((p) => p.key)
  assert.equal(module.resources.length, 8)
  assert.equal(registered.length, 23)
  assert.deepEqual(registered, backend)
  assert.deepEqual(registry.permissions.map((p) => p.key), backend, 'the common module adds no permissions')
  for (const key of Object.values(SECURITY_ACTIONS)) assert.ok(registered.includes(key), `${key} is registered`)
  for (const key of new Set(navigationEntries.flatMap((e) => [e.permission, ...(e.alsoRequires || [])]).filter(Boolean))) {
    assert.ok(registered.includes(key), `navigation uses only registered permissions: ${key}`)
  }
})

test('common links need authentication only; Security Administration keeps permission, alsoRequires and MFA', () => {
  const common = appRoutes.filter((route) => !route.permission && route.implemented).map((route) => route.id)
  assert.deepEqual(common, ['dashboard', 'account-password', 'account-authenticator'])
  for (const access of [{ status: 'loading' }, { status: 'error' }, { status: 'ready', has: () => false }]) {
    for (const id of common) assert.equal(routeAccess(appRoutes.find((r) => r.id === id), access), 'allowed')
    for (const { id } of HR_RECRUITMENT_ROUTES) assert.equal(routeAccess(appRoutes.find((r) => r.id === id), access), 'unavailable', `${id} is switched off`)
  }
  const security = appRoutes.filter((route) => route.section === 'security')
  assert.ok(security.every((route) => route.requiresMfa === true && route.permission.startsWith(`${SA}.`)))
  const all = { status: 'ready', has: () => true, mfaVerified: false, adminMfaRequired: true }
  assert.ok(security.filter((r) => r.implemented).every((route) => routeAccess(route, all) === 'mfa_required'))
  assert.ok(security.filter((r) => r.implemented).every((route) => routeAccess(route, { ...all, adminMfaRequired: false }) === 'allowed'))
  const userRoles = appRoutes.find((r) => r.id === 'user-roles')
  const withoutAccounts = { status: 'ready', mfaVerified: true, has: (key) => key !== PERMISSIONS.USER_ACCOUNTS_VIEW }
  assert.equal(routeAccess(userRoles, withoutAccounts), 'denied')
  assert.equal(routeAccess(appRoutes.find((r) => r.id === 'security-audit'), { ...all, mfaVerified: true }), 'unavailable')
})

// ---------------------------------------------------------------- external destinations

test('external URLs: only absolute https with a host name or IP address and no credentials', () => {
  for (const url of [
    'https://reports.example.com/production', 'https://10.20.30.40:8443/portal?plant=1', 'https://[2001:db8::1]/x',
  ]) assert.ok(validateExternalUrl(url), url)
  for (const url of [
    'http://reports.example.com', 'javascript:alert(1)', 'data:text/html,x', '//reports.example.com',
    'https://user:pass@reports.example.com', 'https://token@reports.example.com', 'https://reports.example.com/a b',
    'https://reports.example.com\\x', '/dashboard', 'ftp://files.example.com', '', null, 42,
  ]) assert.equal(validateExternalUrl(url), null, String(url))
  assert.equal(resolveExternalHref({ env: 'VITE_EXTERNAL_PORTAL' }, { VITE_EXTERNAL_PORTAL: ' https://10.0.0.5/portal ' }), 'https://10.0.0.5/portal')
  assert.equal(resolveExternalHref({ env: 'VITE_EXTERNAL_PORTAL' }, {}), null, 'unresolved')
  assert.equal(resolveExternalHref({ env: 'VITE_EXTERNAL_PORTAL' }, { VITE_EXTERNAL_PORTAL: 'http://10.0.0.5' }), null, 'invalid')
})

function moduleWith(navigation, extra = {}) {
  return defineModule({
    code: 'TEST_MODULE', name: 'Test', displayOrder: 1,
    resources: [{ code: 'THINGS', name: 'Things', actions: ['VIEW', 'RUN'], navigation }],
    ...extra,
  })
}
const GROUPS = [{ id: 'g', label: 'Group', icon: 'circle' }]

test('navigation type: missing or internal is a route; only explicit external is external; others fail', () => {
  const built = buildRegistry([moduleWith([
    { id: 'a', path: '/a', title: 'A', icon: 'circle', group: 'g', order: 1 },
    { id: 'b', type: 'internal', path: '/b', title: 'B', icon: 'circle', group: 'g', order: 2 },
    { id: 'c', type: 'external', href: 'https://c.example.com/', title: 'C', icon: 'circle', group: 'g', order: 3 },
  ])], GROUPS)
  assert.deepEqual(built.entries.map((e) => [e.id, e.type ?? 'internal', e.path ?? e.href]), [
    ['a', 'internal', '/a'], ['b', 'internal', '/b'], ['c', 'external', 'https://c.example.com/'],
  ])
  for (const type of ['link', 'EXTERNAL', null, '']) {
    assert.throws(() => moduleWith([{ id: 'x', type, path: '/x', title: 'X', icon: 'circle', group: 'g', order: 1 }]), /unknown navigation type/)
  }
})

test('external entries are permission-filtered, hidden when unresolved and never routed or matched', async () => {
  const built = buildRegistry([moduleWith([
    { id: 'reports', type: 'external', href: 'https://reports.example.com/', title: 'Reports', icon: 'circle', group: 'security', order: 1, requiredAction: 'RUN' },
    { id: 'portal', type: 'external', href: { env: 'VITE_EXTERNAL_TEST_PORTAL' }, title: 'Portal', icon: 'circle', group: 'security', order: 2 },
  ])], NAVIGATION_GROUPS)
  const entries = built.entries.map((entry) => {
    const href = resolveExternalHref(entry.href, {})
    return { ...entry, href, implemented: entry.implemented && href !== null }
  })
  const allowed = { status: 'ready', mfaVerified: true, has: () => true }
  const denied = { status: 'ready', mfaVerified: true, has: (key) => !key.endsWith(':RUN') }
  assert.deepEqual(authorizedNavigation(allowed, entries)[0].items.map((e) => e.id), ['reports'], 'unresolved env hidden')
  assert.deepEqual(authorizedNavigation(denied, entries), [], 'requires its permission')
  assert.deepEqual(paletteCommands(allowed, 'authenticated', entries), [
    { id: 'reports', label: 'Reports', icon: 'circle', href: 'https://reports.example.com/', external: true, group: 'Security administration' },
  ])
  assert.ok(appRoutes.every((route) => route.type !== 'external' && route.path), 'no external entry is an app route')
  assert.equal(findAppRoute('https://reports.example.com/'), null)
  const link = await read('../src/components/navigation/ExternalNavigationLink.jsx')
  assert.match(link, /target=\{EXTERNAL_LINK_TARGET\} rel=\{EXTERNAL_LINK_REL\}/)
  const destinations = await read('../src/config/externalDestinations.js')
  assert.match(destinations, /EXTERNAL_LINK_TARGET = '_blank'/)
  assert.match(destinations, /EXTERNAL_LINK_REL = 'noopener noreferrer'/)
  assert.match(destinations, /EXTERNAL_WINDOW_FEATURES = 'noopener,noreferrer'/)
  const palette = await read('../src/components/layout/CommandPalette.jsx')
  assert.match(palette, /window\.open\(item\.href, EXTERNAL_LINK_TARGET, EXTERNAL_WINDOW_FEATURES\)/)
  for (const file of ['layout/Sidebar.jsx', 'layout/Header.jsx']) {
    assert.match(await read(`../src/components/${file}`), /type === 'external'[\s\S]*ExternalNavigationLink/, file)
  }
})

// ---------------------------------------------------------------- validation

test('definitions are validated: duplicates, unknown actions, references, groups and fields fail', () => {
  const entry = (overrides = {}) => ({ id: 'x', path: '/x', title: 'X', icon: 'circle', group: 'g', order: 1, ...overrides })
  const cases = [
    [() => defineModule({ code: 'bad', name: 'Bad', displayOrder: 1, resources: [] }), /code must match/],
    [() => defineModule({ code: 'M', name: 'M', displayOrder: 1, resources: [{ code: 'R', name: 'R', actions: ['VIEW', 'VIEW'] }] }), /duplicate action/],
    [() => defineModule({ code: 'M', name: 'M', displayOrder: 1, resources: [{ code: 'R', name: 'R', actions: ['FLY'] }] }), /not in the standard action catalogue/],
    [() => defineModule({ code: 'M', name: 'M', displayOrder: 1, resources: [{ code: 'R', name: 'R', actions: ['VIEW'] }, { code: 'R', name: 'R2', actions: ['VIEW'] }] }), /duplicate resource code/],
    [() => defineModule({ code: 'M', name: 'M', displayOrder: 1, resources: [{ code: 'R', name: 'R', actions: ['VIEW'], extra: 1 }] }), /unknown property "extra"/],
    [() => moduleWith([entry({ requiredAction: 'APPROVE' })]), /requiredAction APPROVE is not an action/],
    [() => moduleWith([entry({ href: 'https://x.example.com' })]), /internal entry has a path, not an href/],
    [() => moduleWith([entry({ type: 'external', href: 'https://x.example.com' })]), /external entry has an href, not a path/],
    [() => moduleWith([entry({ path: undefined, type: 'external', href: 'http://x.example.com' })]), /absolute https URL/],
    [() => moduleWith([entry({ path: undefined, type: 'external', href: { env: 'VITE_API_BASE_URL' } })]), /VITE_EXTERNAL_/],
    [() => moduleWith([entry({ path: undefined, type: 'external', href: 'https://x.example.com', hidden: true })]), /cannot be hidden/],
    [() => moduleWith([entry({ path: 'relative' })]), /absolute application route/],
    [() => moduleWith([entry({ enabledBy: { env: 'VITE_API_BASE_URL' } })]), /VITE_FEATURE_/],
    [() => moduleWith([entry({ enabledBy: 'VITE_FEATURE_X' })]), /enabledBy: must be an object/],
    [() => moduleWith([entry({ enabledBy: { env: 'VITE_FEATURE_X', default: true } })]), /unknown property "default"/],
    [() => moduleWith([entry({ path: undefined, type: 'external', href: 'https://x.example.com', enabledBy: { env: 'VITE_FEATURE_X' } })]), /internal entries only/],
    [() => defineModule({ code: 'C', name: 'C', rbac: false, navigation: [entry({ requiredAction: 'VIEW' })] }), /require no permission/],
    [() => buildRegistry([moduleWith([entry(), entry({ path: '/y', order: 2 })])], GROUPS), /duplicate navigation id/],
    [() => buildRegistry([moduleWith([entry(), entry({ id: 'y', order: 2 })])], GROUPS), /duplicate route path/],
    [() => buildRegistry([moduleWith([entry(), entry({ id: 'y', path: '/y' })])], GROUPS), /order 1 is already used/],
    [() => buildRegistry([moduleWith([entry({ group: 'nope' })])], GROUPS), /unknown group/],
    [() => buildRegistry([moduleWith([entry({ alsoRequires: ['OTHER:VIEW'] })])], GROUPS), /not a registered permission/],
    [() => buildRegistry([moduleWith([]), moduleWith([])], GROUPS), /duplicate module code/],
    [() => buildRegistry([{ code: 'RAW', resources: [] }], GROUPS), /defineModule/],
  ]
  for (const [run, message] of cases) assert.throws(run, (error) => error instanceof RegistryError && message.test(error.message), String(message))
  // Cross-module navigation ids and paths are checked across the whole registry.
  assert.throws(() => buildRegistry([...registeredModules, defineModule({
    code: 'OTHER', name: 'Other', displayOrder: 5,
    resources: [{ code: 'R', name: 'R', actions: ['VIEW'], navigation: [{ id: 'roles', path: '/other', title: 'O', icon: 'circle', group: 'security', order: 99 }] }],
  })], NAVIGATION_GROUPS), /duplicate navigation id/)
})

test('the action catalogue keeps every existing code and satisfies the Oracle ACTION_CODE rule', () => {
  const existing = ['VIEW', 'CREATE', 'UPDATE', 'DEACTIVATE', 'ACTIVATE', 'DISABLE', 'REVOKE_SESSIONS', 'MANAGE', 'GRANT', 'REVOKE', 'ASSIGN', 'ISSUE', 'EXPORT']
  for (const code of existing) assert.ok(isStandardAction(code), code)
  for (const [code, item] of Object.entries(STANDARD_ACTIONS)) {
    assert.equal(item.code, code)
    assert.match(code, /^[A-Z][A-Z0-9_]*$/)
    assert.ok(code.length <= 40 && item.name && item.category && item.description)
  }
  assert.equal(isStandardAction('toString'), false)
})

// ---------------------------------------------------------------- example isolation and purity

test('the example is valid on its own but never imported, registered or routed', async () => {
  const example = buildRegistry(EXAMPLE_MODULES, EXAMPLE_GROUPS)
  assert.equal(example.entries.find((e) => e.id === 'example-sales-orders').type, undefined, 'default internal')
  assert.equal(example.entries.find((e) => e.id === 'example-production-dashboard').type, 'external')
  assert.ok(EXAMPLE_MODULES.find((m) => m.code === 'EXAMPLE_PRODUCTION').resources.some((r) => !r.navigation.length))

  const exampleIds = new Set(example.entries.map((e) => e.id))
  const exampleCodes = new Set(EXAMPLE_MODULES.map((m) => m.code))
  assert.ok(!navigationEntries.some((e) => exampleIds.has(e.id) || e.path?.startsWith('/example')))
  assert.ok(!registeredModules.some((m) => exampleCodes.has(m.code)))

  const files = await readdir(new URL('../src/', import.meta.url), { recursive: true })
  for (const file of files.filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.endsWith('module-registry.example.js'))) {
    const source = await read(`../src/${file.replaceAll('\\', '/')}`)
    assert.doesNotMatch(source, /(from|import\()\s*['"][^'"]*module-registry\.example/, `${file} must not import the example`)
  }
})

test('registry definitions are plain JavaScript usable by Node.js tooling (no React, Vite or aliases)', async () => {
  const dir = new URL('../src/config/registry/', import.meta.url)
  const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.js'))
  assert.ok(files.length >= 6)
  for (const file of files) {
    const source = await read(`../src/config/registry/${file.replaceAll('\\', '/')}`)
    assert.doesNotMatch(source, /import\.meta|from ['"](react|react-router|vite)|from ['"]@\//, file)
  }
})
