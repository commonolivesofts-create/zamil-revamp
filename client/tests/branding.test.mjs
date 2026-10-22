// Official product identity: Zamil Digitalization, release V 2.1.0. The version appears only in
// approved low-emphasis places; technical identifiers keep their established names.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { appConfig } from '../src/config/appConfig.js'
import { apiConfig } from '../src/config/apiConfig.js'
import { accessEndpoints } from '../src/config/accessConfig.js'
import { apiProxy } from '../vite.config.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
async function walk(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
    if (entry.isDirectory()) files.push(...await walk(url))
    else files.push(url)
  }
  return files
}

test('one authoritative identity matching package.json', async () => {
  assert.equal(appConfig.name, 'Zamil Digitalization')
  assert.equal(appConfig.version, '2.1.0')
  assert.equal(appConfig.displayVersion, 'V 2.1.0')
  const pkg = JSON.parse(await read('../package.json'))
  assert.equal(pkg.version, appConfig.version)
  assert.equal(pkg.name, 'client', 'technical package name unchanged')
})

test('the version is shown only in the login footer and the sidebar footer', async () => {
  const uses = []
  for (const file of await walk(new URL('../src/', import.meta.url))) {
    const source = await readFile(file, 'utf8')
    const relative = file.pathname.split('/src/')[1]
    if (source.includes('appConfig.displayVersion')) uses.push(relative)
    if (relative !== 'config/appConfig.js') assert.equal(/\b2\.1\.0\b/.test(source), false, `${relative} duplicates the version`)
  }
  assert.deepEqual(uses.sort(), ['components/layout/Sidebar.jsx', 'pages/auth/LoginPage.jsx'])
  const login = await read('../src/pages/auth/LoginPage.jsx')
  assert.match(login, /<p className="zrv-app-version">\{appConfig\.displayVersion\}<\/p>/)
  assert.match(login, /<h1>\{appConfig\.name\}<\/h1>/, 'name alone as the primary heading')
  const sidebar = await read('../src/components/layout/Sidebar.jsx')
  assert.match(sidebar, /<p className="zrv-sidebar-version" title="Application version">\{appConfig\.displayVersion\}<\/p>/)
})

test('browser title and metadata use the name without the version', async () => {
  const html = await read('../index.html')
  assert.match(html, /<title>Zamil Digitalization<\/title>/)
  assert.match(html, /<meta name="description" content="Zamil Digitalization enterprise application" \/>/)
  assert.equal(/V 2\.1\.0|2\.1\.0/.test(html), false)
  assert.match(await read('../.env.example'), /^VITE_APP_NAME=Zamil Digitalization$/m)
})

test('auth screens name the application through appConfig', async () => {
  for (const file of ['features/auth/PasswordLinkForm.jsx', 'pages/auth/ForgotPasswordPage.jsx', 'pages/auth/ChangePasswordPage.jsx', 'pages/auth/MfaRecoveryPage.jsx', 'pages/auth/LoginPage.jsx']) {
    const source = await read(`../src/${file}`)
    assert.ok(source.includes('appConfig.name'), file)
    assert.match(source, /import \{ appConfig \} from '@\/config\/appConfig\.js'/, file)
  }
})

test('no former product name remains in the active frontend', async () => {
  const files = [
    ...await walk(new URL('../src/', import.meta.url)),
    new URL('../index.html', import.meta.url),
    new URL('../public/favicon.svg', import.meta.url),
    new URL('../public/theme-init.js', import.meta.url),
    new URL('../.env.example', import.meta.url),
  ]
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.equal(/Zamil Revamp/i.test(source), false, file.pathname)
  }
})

test('technical identifiers are unchanged by the rebranding', () => {
  assert.equal(apiConfig.baseUrl, '/api/v1')
  assert.deepEqual(Object.keys(apiProxy), ['/api'])
  assert.equal(accessEndpoints.myPermissions, '/access-control/me/permissions')
})
