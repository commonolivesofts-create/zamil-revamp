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
  'favicon.svg',
  'theme-init.js',
]
// Template and scaffold leftovers that must not ship (ZRV-FE-005).
const forbidden = [
  'orvexa/assets/images',
  'icons.svg',
]
const errors = []
for (const relative of required) {
  if (!existsSync(path.join(dist, relative))) errors.push(`Missing build asset: ${relative}`)
}
for (const relative of forbidden) {
  if (existsSync(path.join(dist, relative))) errors.push(`Template asset must not ship: ${relative}`)
}

if (existsSync(path.join(dist, 'index.html'))) {
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
  if (html.includes('%BASE_URL%')) errors.push('Unexpanded %BASE_URL% in built HTML')
  if (!html.includes('id="root"')) errors.push('Missing React root')
  // The deployment CSP (vercel.json) allows no inline script.
  for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
    if (!/\bsrc=/.test(tag)) errors.push('Inline <script> in built HTML is blocked by the Content-Security-Policy')
  }
  if (/orvexa/i.test(html.replace(/\/orvexa\/assets\/(css|vendor)\//g, ''))) errors.push('Template branding in built HTML')
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
  for (const item of chunks) {
    if (/ApexCharts/.test(readFileSync(path.join(assets, item.name), 'utf8'))) {
      errors.push(`Template chart library bundled in ${item.name}`)
    }
  }
  const large = chunks.filter((item) => item.bytes > 500 * 1024)
  if (large.length) console.log(`${large.length} chunk(s) exceed 500 KiB; inspect lazy-loaded vendor bundles. This is not an automatic failure.`)
}

if (errors.length) {
  console.error('Release checks failed:\n' + errors.map((error) => `  - ${error}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('Release checks: PASS (static build and local assets only; not a deployment or browser test).')
}
