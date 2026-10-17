import test from 'node:test'
import assert from 'node:assert/strict'
import { safeReturnTo } from '../src/config/authRouting.js'
import { orvexaNavigation } from '../src/config/orvexaNavigation.js'
import { getOrvexaRoute, getOrvexaSection, orvexaDemoRoutes } from '../src/config/orvexaRoutes.js'

test('safe internal deep links survive sign-in redirects', () => {
  assert.equal(safeReturnTo('/dashboard'), '/dashboard')
  assert.equal(safeReturnTo('/demo/live-operations?tab=alerts#details'), '/demo/live-operations?tab=alerts#details')
  assert.equal(safeReturnTo('/dashboard?filter=a%20b'), '/dashboard?filter=a%20b')
})

test('external, guest, and malformed return paths are rejected', () => {
  for (const value of [
    'https://evil.example', 'javascript:alert(1)', '//evil.example/path',
    '/\\evil.example', '/login', '/forgot-password', '/',
    '/dashboard\nnext', '/dashboard\rnext', '/dashboard\0next',
    '', null, {},
  ]) {
    assert.equal(safeReturnTo(value), '/dashboard', String(value))
  }
})

test('original navigation is preserved and maps to unique demo URLs', () => {
  assert.equal(orvexaNavigation[0].label, 'Dashboard')
  assert.equal(getOrvexaRoute(orvexaNavigation[0]), '/dashboard')
  assert.equal(orvexaDemoRoutes.length, 48)
  const all = orvexaDemoRoutes.map((page) => page.path)
  assert.equal(new Set(all).size, all.length)
  for (const item of orvexaDemoRoutes) {
    assert.equal(getOrvexaRoute(item), item.path)
    assert.equal(getOrvexaSection(item.path), item.sectionId)
  }
  assert.equal(getOrvexaRoute({ id: 'external', href: 'https://evil.example' }), null)
  assert.equal(getOrvexaRoute({ id: 'bad', href: '../secret.html' }), null)
})
