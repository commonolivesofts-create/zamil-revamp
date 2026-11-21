// The global loading skeleton for report pages must mirror the real report
// table (header, tinted rows, pager) instead of a generic row grid.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the table skeleton renders a report-shaped table with configurable columns', async () => {
  const jsx = await read('src/components/feedback/ContentSkeleton.jsx')
  assert.match(jsx, /variant === 'table'/)
  assert.match(jsx, /zrv-content-skeleton__page-head/)
  assert.match(jsx, /zrv-content-skeleton__crumb/)
  assert.match(jsx, /zrv-content-skeleton__page-actions/)
  assert.match(jsx, /zrv-content-skeleton__stats/)
  assert.match(jsx, /zrv-content-skeleton__table-head/)
  assert.match(
    jsx,
    /table-panel[\s\S]*?zrv-content-skeleton__report-head/,
    'the heading lives inside the card, before the table head',
  )
  assert.match(jsx, /zrv-content-skeleton__row--tone\$\{row % 3\}/)
  assert.match(jsx, /zrv-content-skeleton__pager/)
  assert.match(jsx, /columns = 6/)
  assert.match(jsx, /rows = 8/)
  assert.doesNotMatch(jsx, /length: 4 \}, \(_, column\)/, 'no fixed 4-column grid')
})

test('report loading states use the table skeleton with real column count', async () => {
  const report = await read('src/features/hr-recruitment/shared/components/InsightReport.jsx')
  assert.match(report, /loadingVariant="table"/)
  assert.match(report, /skeletonColumns=\{columns\.length\}/)
  const admin = await read('src/features/security-administration/components/AdminUi.jsx')
  assert.match(admin, /loadingVariant = 'content'/)
  assert.match(admin, /variant=\{loadingVariant\}/)
})

test('in-report loading shows only the table, not a second page header and stats', async () => {
  const jsx = await read('src/components/feedback/ContentSkeleton.jsx')
  assert.match(jsx, /pageChrome = true/)
  assert.match(jsx, /\{pageChrome && \(/)
  const report = await read('src/features/hr-recruitment/shared/components/InsightReport.jsx')
  assert.match(report, /skeletonPageChrome=\{false\}/)
  const admin = await read('src/features/security-administration/components/AdminUi.jsx')
  assert.match(admin, /pageChrome=\{skeletonPageChrome\}/)
})

test('the table skeleton CSS matches the shared report table and card layout', async () => {
  const css = await read('src/components/feedback/ContentSkeleton.css')
  assert.match(css, /\.zrv-content-skeleton__stats[\s\S]*?grid-template-columns:\s*repeat\(4/)
  assert.match(css, /\.zrv-content-skeleton__report-head[\s\S]*?padding:\s*12px 16px/)
  assert.match(css, /\.zrv-content-skeleton__table-head[\s\S]*?min-height:\s*46px/)
  assert.match(css, /\.zrv-content-skeleton__row--tone1[\s\S]*?var\(--amber\)/)
  assert.match(
    css,
    /\.zrv-content-skeleton__table-head,\s*\.zrv-content-skeleton__row[\s\S]*?padding:\s*12px 16px/,
  )
  assert.match(css, /\.zrv-content-skeleton__td[\s\S]*?height:\s*12px/)
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.zrv-content-skeleton__table-head\s*\{[^}]*display:\s*none/,
  )
})
