import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

test('Vercel builds client/dist and refreshes SPA routes via index.html', () => {
  assert.equal(config.framework, 'vite')
  assert.equal(config.outputDirectory, 'dist')
  assert.ok(config.rewrites.some(({ source, destination }) => source === '/(.*)' && destination === '/index.html'))
})

test('baseline security response headers do not cache private API data', () => {
  const names = new Map(config.headers.flatMap((entry) => entry.headers.map(({ key, value }) => [key.toLowerCase(), value])))
  assert.equal(names.get('x-content-type-options'), 'nosniff')
  assert.equal(names.get('x-frame-options'), 'DENY')
  assert.ok(!JSON.stringify(config).includes('Access-Control-Allow-Origin'))
  assert.ok(!JSON.stringify(config).includes('max-age=31536000'))
})
