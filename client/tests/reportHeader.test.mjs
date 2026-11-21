// Report headers keep every action on one line at laptop widths, and the
// refresh timestamp is page metadata under the title rather than between the
// action buttons.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('the refresh stamp lives in the title block, not the action row', async () => {
  const jsx = await read('features/hr-recruitment/shared/components/InsightReport.jsx')
  const title = jsx.match(/<div className="zrv-ir-head__title">([\s\S]*?)<\/div>/)?.[1] ?? ''
  assert.match(title, /zrv-ir-stamp/)
  const actions =
    jsx.match(/<div className="zrv-ir-head__actions">([\s\S]*?)<\/div>\s*<\/header>/)?.[1] ?? jsx
  assert.doesNotMatch(actions.slice(0, 900), /zrv-ir-stamp/)
})

test('utility actions are compact and keep accessible labels', async () => {
  const jsx = await read('features/hr-recruitment/shared/components/InsightReport.jsx')
  assert.match(jsx, /zrv-ir-btn--utility/g)
  assert.match(jsx, /zrv-ir-btn__label/)
  assert.match(jsx, /aria-label=\{T\.filter\}/)
  assert.match(jsx, /aria-label=\{T\.refresh\}/)
  assert.match(jsx, /aria-label=\{T\.exportCsv\}/)
  assert.match(jsx, /aria-label=\{T\.exportPdf\}/)
})

test('the header CSS prevents wrapping and collapses utility labels at laptop widths', async () => {
  const css = await read('styles/hr-insight-report.css')
  assert.match(
    css,
    /@media \(min-width: 901px\)\s*\{[\s\S]*?\.zrv-ir-head__actions\s*\{[^}]*flex-wrap:\s*nowrap/,
  )
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 1600px\)/)
  assert.match(css, /\.zrv-ir-btn--utility \.zrv-ir-btn__label\s*\{[^}]*display:\s*none/)
  assert.match(css, /\.zrv-ir-head__title \.zrv-ir-stamp\s*\{[^}]*margin:\s*3px 0 0/)
})
