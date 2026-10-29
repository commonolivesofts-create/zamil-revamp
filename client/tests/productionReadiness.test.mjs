// Stage 4: production readiness — branding, removed template functionality,
// deployment configuration, permission refresh and role-selector completeness.
// Mocked transport only.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import viteConfig, { DEV_PORT, apiProxy } from '../vite.config.js'
import { createApiClient } from '../src/services/api/apiClient.js'
import { readMyPermissions } from '../src/features/access/permissionContract.js'
import { createPermissionStore } from '../src/features/access/permissionStore.js'
import { ROLE_PAGE_LIMIT, createSecurityAdminService } from '../src/features/security-administration/securityAdminService.js'
import { authUser, deferred, recordingFetch, success } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

async function sourceFiles(dir = new URL('../src/', import.meta.url)) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
    if (entry.isDirectory()) files.push(...await sourceFiles(url))
    else if (/\.(jsx?|css)$/.test(entry.name)) files.push(url)
  }
  return files
}
const relative = (url) => url.pathname.split('/client/')[1]

// ------------------------------------------------------------ branding and template removal

test('the document is Zamil Digitalization branded, with no template branding or inline script', async () => {
  const html = await read('../index.html')
  assert.match(html, /<title>Zamil Digitalization<\/title>/)
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="%BASE_URL%favicon\.svg" \/>/)
  assert.equal(/orvexa/i.test(html.replace(/%BASE_URL%orvexa\/assets\/(css|vendor)\//g, '')), false, 'only the licensed stylesheet and icon-data paths remain')
  for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) assert.match(tag, /\bsrc=/, `${tag} must not be inline (CSP)`)
  const favicon = await read('../public/favicon.svg')
  assert.match(favicon, /<title>Zamil Digitalization<\/title>/)
})

test('the login page describes only implemented sign-in behaviour', async () => {
  const login = (await read('../src/pages/auth/LoginPage.jsx')).replace(/OrvexaIcon/g, '')
  for (const template of ['Orvexa', 'production AI', 'control plane', '37+', 'admin surfaces', 'RTL', 'Backend integration required', 'sparkles']) {
    assert.equal(login.includes(template), false, template)
  }
  assert.match(login, /<h2>Sign in to \{appConfig\.name\}<\/h2>/)
  assert.match(login, /aria-label=\{`About \$\{appConfig\.name\}`\}/)
})

test('no visible template wording remains in the signed-in shell', async () => {
  for (const file of ['../src/components/layout/LayoutCustomizer.jsx', '../src/components/layout/Header.jsx', '../src/components/layout/Sidebar.jsx', '../src/components/layout/CommandPalette.jsx']) {
    const visible = (await read(file)).replace(/OrvexaIcon|orvexa\w*|getOrvexa\w*|useOrvexaLayout/g, '')
    assert.equal(/Orvexa|template animations|Testing theme/i.test(visible), false, file)
  }
  const pages = await read('../src/pages/PhasePages.jsx')
  assert.equal(pages.includes('original interface template'), false)
  const announcement = await read('../src/routes/RouteComponents.jsx')
  assert.equal(announcement.includes("'Not available'"), false, 'unknown demo paths are announced as not found')
})

test('the language selector is gone and the interface is fixed to English, left-to-right', async () => {
  const header = await read('../src/components/layout/Header.jsx')
  for (const removed of ['Choose language', 'language-panel', 'setLanguage', 'orvexaLanguages', 'flags/', '<img']) assert.equal(header.includes(removed), false, removed)
  const layout = await read('../src/hooks/useOrvexaLayout.js')
  assert.equal(/orvexaLanguages|setLanguage|'rtl'/.test(layout), false)
  assert.match(layout, /document\.documentElement\.lang = 'en'/)
  assert.match(layout, /document\.documentElement\.dir = 'ltr'/)
  assert.match(layout, /RETIRED_KEYS = \['orvexa-language-v14', 'orvexa-direction-v16'\]/)
  const init = await read('../public/theme-init.js')
  assert.match(init, /root\.lang = 'en'/)
  assert.match(init, /root\.dir = 'ltr'/)
  assert.equal(init.includes('orvexa-language'), false, 'a stored language is never applied')
})

test('the template chart library and its demo widgets are not part of the application', async () => {
  const files = await sourceFiles()
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.equal(/apexcharts|ApexCharts|DashboardCharts|LiveRequests|liveRequestData|orvexaAsset|command-robot|images\/flags/.test(source), false, relative(file))
  }
  await assert.rejects(read('../public/orvexa/assets/images/orvexa-command-robot-v1.png'), { code: 'ENOENT' })
  await assert.rejects(read('../public/icons.svg'), { code: 'ENOENT' }, 'unused scaffold sprite')
})

// A reference to a console logging method (`console.log`, `console?.warn`,
// `console . error`), not any text containing "console." such as the template
// URL `pages/test-console.html`: `console` must not follow an identifier
// character, `$`, `-`, `/` or `.`, and must be followed by a console method.
const CONSOLE_METHODS = 'log|warn|error|info|debug|trace|dir|dirxml|table|group|groupCollapsed|groupEnd|time|timeEnd|timeLog|count|countReset|assert'
const CONSOLE_CALL = new RegExp(`(?<![\\w$\\-/.])console\\s*\\??\\.\\s*(?:${CONSOLE_METHODS})\\b`)

test('the console detector ignores URLs but finds genuine logging calls', () => {
  for (const harmless of ['"href": "pages/test-console.html"', 'const consoleUrl = "/demo/test-console"', 'my-console.log', 'admin/console.log', 'xconsole.log("x")', 'console.html']) {
    assert.equal(CONSOLE_CALL.test(harmless), false, harmless)
  }
  for (const logging of ['console.log("debug")', '  console.warn(x)', 'if (dev) console.error(e)', 'console.info(1)', 'console.debug()', 'console?.log(x)', 'console . table(rows)', 'const log = console.log', '(console.trace)()']) {
    assert.equal(CONSOLE_CALL.test(logging), true, logging)
  }
})

test('production source has no debug logging outside the DEV-only error boundary', async () => {
  const navigation = await read('../src/config/orvexaNavigation.js')
  assert.ok(navigation.includes('pages/test-console.html'), 'regression fixture: the template URL is still present')
  assert.equal(CONSOLE_CALL.test(navigation), false, 'a URL is not debug logging')
  for (const file of await sourceFiles()) {
    const source = await readFile(file, 'utf8')
    if (!CONSOLE_CALL.test(source)) continue
    assert.equal(relative(file), 'src/app/AppErrorBoundary.jsx')
    assert.match(source, /if \(import\.meta\.env\.DEV\) \{\s*console\.error/)
  }
})

test('the release check guards the Stage 4 guarantees', async () => {
  const script = await read('../scripts/verify-production.mjs')
  for (const required of ["'favicon.svg'", "'theme-init.js'", "'orvexa/assets/images'", "'icons.svg'", 'Inline <script>', 'ApexCharts', 'Template branding']) {
    assert.ok(script.includes(required), required)
  }
  assert.equal(script.includes('orvexa-command-robot'), false)
})

// ------------------------------------------------------------ environment and development server

test('the development and preview servers use port 5199 with the same-origin /api proxy', () => {
  assert.equal(DEV_PORT, 5199)
  for (const server of [viteConfig.server, viteConfig.preview]) {
    assert.equal(server.port, 5199)
    assert.equal(server.strictPort, true)
    assert.equal(server.proxy, apiProxy)
  }
})

test('the sample environment documents only real, public settings', async () => {
  const example = await read('../.env.example')
  const variables = [...example.matchAll(/^([A-Z_]+)=/gm)].map((match) => match[1])
  assert.deepEqual(variables, ['VITE_APP_NAME', 'VITE_API_BASE_URL', 'VITE_AUTH_DEV_PREVIEW', 'VITE_HR_EMPLOYEE_SERVICES_DEMO'])
  // Empty (unset): demo data in development builds only; the employee services backend does not exist yet.
  assert.match(example, /^VITE_HR_EMPLOYEE_SERVICES_DEMO=$/m)
  assert.match(example, /VITE_AUTH_DEV_PREVIEW=false/)
  assert.match(example, /http:\/\/localhost:5199/)
  assert.match(example, /AUTH_FRONTEND_BASE_URL=http:\/\/localhost:5199/)
  assert.equal(/password=|secret=|token=/i.test(example), false)
  const readme = await read('../README.md')
  assert.equal(readme.includes('This template provides a minimal setup'), false, 'not the Vite scaffold README')
  assert.match(readme, /\/api/)
})

// ------------------------------------------------------------ permission refresh after own-access changes

function fakePermissionService() {
  const calls = []
  return {
    calls,
    service: {
      getMyPermissions: (options) => {
        const pending = deferred()
        calls.push({ options, ...pending })
        return pending.promise
      },
    },
  }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))
const grants = (...keys) => readMyPermissions({
  userId: authUser.id,
  mfaVerified: true,
  permissions: keys.map((key) => {
    const [moduleCode, rest] = key.split('.')
    const [resourceCode, actionCode] = rest.split(':')
    return { permissionId: '1', moduleCode, resourceCode, actionCode, viaRole: true, viaOverride: false }
  }),
})
const signedIn = { status: 'authenticated', user: authUser }

test('refreshing loaded permissions keeps the page mounted, then applies the server answer', async () => {
  const fake = fakePermissionService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(signedIn)
  fake.calls[0].resolve(grants('SECURITY_ADMINISTRATION.ROLES:VIEW', 'SECURITY_ADMINISTRATION.ROLES:UPDATE'))
  await settle()
  store.reload()
  assert.equal(store.getSnapshot().status, 'ready', 'no loading state while refreshing')
  store.reload()
  assert.equal(fake.calls.length, 2, 'no duplicate refresh')
  fake.calls[1].resolve(grants('SECURITY_ADMINISTRATION.ROLES:VIEW'))
  await settle()
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:UPDATE'), false, 'a removed permission is gone')
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), true)
})

test('a failed refresh denies everything; a sign-out during a refresh wins', async () => {
  const fake = fakePermissionService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(signedIn)
  fake.calls[0].resolve(grants('SECURITY_ADMINISTRATION.ROLES:VIEW'))
  await settle()
  store.reload()
  fake.calls[1].reject(new Error('network'))
  await settle()
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), false)

  store.reload()
  store.sync({ status: 'guest' })
  fake.calls[2].resolve(grants('SECURITY_ADMINISTRATION.ROLES:VIEW'))
  await settle()
  assert.equal(store.getSnapshot().status, 'idle')
})

test('confirmed changes that can alter the signed-in user\'s own access refresh permissions', async () => {
  const action = await read('../src/features/security-administration/useAdminData.js')
  assert.match(action, /if \(refreshAccess && \(outcome\.status === 'success' \|\| outcome\.status === 'unknown'\)\) reloadPermissions\(\)/)
  const expected = {
    'RolesPage.jsx': 2, // activate, deactivate
    'RolePermissionsPage.jsx': 1, // revoke (grants: RoleGrantDialog below)
    'PermissionCatalogPage.jsx': 1, // activate/deactivate
  }
  for (const [file, count] of Object.entries(expected)) {
    const source = await read(`../src/features/security-administration/pages/${file}`)
    assert.equal((source.match(/refreshAccess: true/g) || []).length, count, file)
  }
  // Phase 2C multi-grant: refresh after any confirmed or uncertain grant, or a permission refusal.
  const grantDialog = await read('../src/features/security-administration/components/RoleGrantDialog.jsx')
  assert.match(grantDialog, /if \(result\.accessMayHaveChanged \|\| result\.results\.some\(\(item\) => describeFailure\(item\.error\)\.permissionChanged\)\) reloadPermissions\(\)/)
})

// ------------------------------------------------------------ role selector completeness

const role = (n) => ({ roleId: String(n), roleCode: `ROLE_${n}`, roleName: `Role ${n}`, description: null, isActive: true, createdAt: '2026-10-02T08:00:00.000Z', updatedAt: null })

test('the role selector reads every page instead of truncating at 100 roles', async () => {
  const total = 230
  const { fetchImpl, calls } = recordingFetch((url) => {
    const params = new URL(url, 'https://local.invalid').searchParams
    const page = Number(params.get('page'))
    const limit = Number(params.get('limit'))
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - (page - 1) * limit)) }, (_, i) => role((page - 1) * limit + i + 1))
    const totalPages = Math.ceil(total / limit)
    return success(items, 200, { pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } })
  })
  const service = createSecurityAdminService({ client: createApiClient({ baseUrl: '/api/v1', fetchImpl }) })
  const result = await service.listAllRoles()
  assert.equal(ROLE_PAGE_LIMIT, 100)
  assert.equal(result.complete, true)
  assert.equal(result.items.length, 230)
  assert.equal(new Set(result.items.map((item) => item.roleId)).size, 230)
  assert.deepEqual(calls.map((call) => new URL(call.url, 'https://l.invalid').searchParams.get('page')), ['1', '2', '3'])
  assert.ok(calls.every((call) => call.init.method === 'GET'))
})

test('an unbounded role list stops at the safety bound and says so', async () => {
  const { fetchImpl, calls } = recordingFetch((url) => {
    const page = Number(new URL(url, 'https://local.invalid').searchParams.get('page'))
    return success([role(page)], 200, { pagination: { page, limit: 100, total: 1e6, totalPages: 1e4, hasNextPage: true, hasPreviousPage: page > 1 } })
  })
  const service = createSecurityAdminService({ client: createApiClient({ baseUrl: '/api/v1', fetchImpl }) })
  const result = await service.listAllRoles()
  assert.equal(result.complete, false)
  assert.equal(calls.length, 50)
  const page = await read('../src/features/security-administration/pages/UserRoleAssignmentsPage.jsx')
  assert.match(page, /securityAdminService\.listAllRoles\(\{ signal \}\)/)
  assert.match(page, /Only the first \$\{data\.items\.length\} roles could be listed\./)
})

// ------------------------------------------------------------ list states

test('paginated lists stay navigable past the last page; missing records are not retried', async () => {
  const ui = await read('../src/features/security-administration/components/AdminUi.jsx')
  assert.match(ui, /if \(!pagination \|\| \(pagination\.totalPages <= 1 && pagination\.page <= 1\)\)/)
  assert.match(ui, /if \(data\?\.pagination\) return data\.pagination\.total === 0/)
  assert.match(ui, /resource\.status === 'error' && resource\.error\?\.status === 404/)
  for (const file of ['components/UserDirectory.jsx', 'components/ProvisionAccountDialog.jsx', 'pages/RolesPage.jsx', 'pages/RolePermissionsPage.jsx']) {
    const source = await read(`../src/features/security-administration/${file}`)
    assert.equal(/isEmpty=\{\(data\) => data\.items\.length === 0\}/.test(source), false, `${file} must not treat an empty page as an empty result`)
  }
})
