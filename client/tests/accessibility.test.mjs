// Regression: screen-reader-only text (e.g. "Page: Dashboard") was rendered
// visibly because no loaded stylesheet defined .sr-only.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('.sr-only is defined as visually hidden but not removed from the accessibility tree', async () => {
  const css = await read('../src/index.css')
  const rule = /\.sr-only\s*\{([^}]*)\}/.exec(css)?.[1]
  assert.ok(rule, '.sr-only rule exists in src/index.css')
  for (const declaration of ['position: absolute', 'width: 1px', 'height: 1px', 'overflow: hidden', 'clip: rect(0, 0, 0, 0)', 'white-space: nowrap']) {
    assert.ok(rule.includes(declaration), declaration)
  }
  assert.equal(/display\s*:\s*none|visibility\s*:\s*hidden/.test(rule), false)
  assert.match(await read('../src/main.jsx'), /import '\.\/index\.css'/)
})

test('the route announcement stays a polite live region using .sr-only', async () => {
  const source = await read('../src/routes/RouteComponents.jsx')
  assert.match(source, /<p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Page: \{pageName\}<\/p>/)
  assert.equal(/aria-hidden/.test(source), false)
})

test('every sr-only usage is covered by an app-owned stylesheet', async () => {
  const files = []
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
      if (entry.isDirectory()) await walk(url)
      else if (/\.jsx?$/.test(entry.name)) files.push(url)
    }
  }
  await walk(new URL('../src/', import.meta.url))
  const users = []
  for (const file of files) if ((await readFile(file, 'utf8')).includes('sr-only')) users.push(file.pathname.split('/src/')[1])
  assert.ok(users.includes('routes/RouteComponents.jsx'))
  assert.match(await read('../src/index.css'), /\.sr-only\s*\{/, `used by: ${users.join(', ')}`)
})
