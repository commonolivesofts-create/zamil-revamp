// Built-in Node.js release sanity checks, without another runtime dependency.
// Run AFTER npm run build: node scripts/verify-production.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const required = [
  'index.html',
  'orvexa/assets/css/tailwind.css',
  'orvexa/assets/css/admin-ux.css',
  'orvexa/assets/css/command-center-layout.css',
  'orvexa/assets/css/sidebar.css',
  'orvexa/assets/vendor/lucide.min.js',
  'orvexa/assets/images/orvexa-command-robot-v1.png',
  'orvexa/assets/images/orvexa-favicon.svg',
]
const errors = []
for (const relative of required) {
  if (!existsSync(path.join(dist, relative))) errors.push(`Missing build asset: ${relative}`)
}

if (existsSync(path.join(dist, 'index.html'))) {
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
  if (html.includes('%BASE_URL%')) errors.push('Unexpanded %BASE_URL% in built HTML')
  if (!html.includes('id="root"')) errors.push('Missing React root')
  // Vite's default deployment base is /. Other bases must be verified on their host.
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|data:|#)/i.test(url)) continue
    const pathname = url.split(/[?#]/)[0]
    if (!pathname || !pathname.startsWith('/')) continue
    if (!existsSync(path.join(dist, pathname.slice(1)))) {
      errors.push(`Broken local HTML asset reference: ${pathname}`)
    }
  }
}

const assets = path.join(dist, 'assets')
if (!existsSync(assets)) errors.push('Missing Vite assets output')
else {
  const chunks = readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, bytes: statSync(path.join(assets, name)).size }))
    .sort((a, b) => b.bytes - a.bytes)
  if (!chunks.length) errors.push('No JavaScript chunks emitted by Vite')
  console.log('Largest minified JavaScript chunks (KB):')
  for (const item of chunks.slice(0, 6)) {
    console.log(`  ${(item.bytes / 1024).toFixed(1).padStart(7)}  ${item.name}`)
  }
  const large = chunks.filter((item) => item.bytes > 500 * 1024)
  if (large.length) console.log(`${large.length} chunk(s) exceed 500 KiB; inspect lazy-loaded vendor bundles. This is not an automatic failure.`)
}

if (errors.length) {
  console.error('Release checks failed:\n' + errors.map((error) => `  - ${error}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('Phase 10 release checks: PASS (static build and local assets).')
}
