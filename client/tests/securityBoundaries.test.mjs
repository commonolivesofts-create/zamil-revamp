import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { apiProxy } from '../vite.config.js'

test('the development proxy keeps /api same-origin for the backend Origin check', () => {
  assert.deepEqual(Object.keys(apiProxy), ['/api'])
  // The backend's development listener (HTTP_HOST 127.0.0.1), not the dual-stack name localhost.
  assert.equal(apiProxy['/api'].target, 'http://127.0.0.1:3000')
  assert.equal(apiProxy['/api'].changeOrigin, false)
})

test('authentication and API modules never use browser storage, cookies or a CSRF meta tag', async () => {
  const roots = ['../src/features/auth/', '../src/services/api/']
  for (const root of roots) {
    const dir = new URL(root, import.meta.url)
    for (const name of await readdir(dir)) {
      const source = await readFile(new URL(name, dir), 'utf8')
      for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'csrf-token']) {
        assert.equal(source.includes(forbidden), false, `${root}${name} references ${forbidden}`)
      }
    }
  }
})
