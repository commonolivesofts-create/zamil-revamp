import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

// Vercel `source` patterns are path-to-regexp; this one is also a valid JS regular expression.
const matches = (source, pathname) => new RegExp(`^${source}$`).test(pathname)

test('Vercel builds client/dist and refreshes SPA routes via index.html', () => {
  assert.equal(config.framework, 'vite')
  assert.equal(config.outputDirectory, 'dist')
  const spa = config.rewrites.filter(({ destination }) => destination === '/index.html')
  assert.equal(spa.length, 1)
  for (const pathname of ['/', '/dashboard', '/security/users/105', '/password/reset', '/apiary', '/login']) {
    assert.ok(matches(spa[0].source, pathname), pathname)
  }
})

// Stage 4 fix: the former catch-all `/(.*)` also answered API calls with index.html.
test('the SPA fallback never intercepts /api requests', () => {
  for (const { source, destination } of config.rewrites) {
    for (const pathname of ['/api/v1/auth/me', '/api/v1/users/105/disable', '/api/v1/access-control/me/permissions']) {
      assert.equal(destination === '/index.html' && matches(source, pathname), false, `${source} → ${destination} intercepts ${pathname}`)
    }
  }
})

test('a Content-Security-Policy allows only same-origin scripts and API calls', () => {
  const headers = new Map(config.headers.flatMap((entry) => entry.headers.map(({ key, value }) => [key.toLowerCase(), value])))
  const csp = Object.fromEntries(headers.get('content-security-policy').split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]))
  assert.deepEqual(csp['script-src'], ["'self'"], 'no inline or remote scripts')
  assert.deepEqual(csp['connect-src'], ["'self'"], 'API calls stay same-origin')
  assert.deepEqual(csp['frame-ancestors'], ["'none'"])
  assert.deepEqual(csp['object-src'], ["'none'"])
  assert.deepEqual(csp['base-uri'], ["'self'"])
  assert.ok(headers.get('permissions-policy').includes('camera=()'))
})

test('baseline security response headers do not cache private API data', () => {
  const names = new Map(config.headers.flatMap((entry) => entry.headers.map(({ key, value }) => [key.toLowerCase(), value])))
  assert.equal(names.get('x-content-type-options'), 'nosniff')
  assert.equal(names.get('x-frame-options'), 'DENY')
  assert.ok(!JSON.stringify(config).includes('Access-Control-Allow-Origin'))
  assert.ok(!JSON.stringify(config).includes('max-age=31536000'))
})
