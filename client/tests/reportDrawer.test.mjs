// The report drawers share one detail toolkit. The requisition drawer must read
// approval labels from REQUISITION_TEXT.status (T.status), not from
// T.report.status — the report has no `status` key, which used to throw
// "Cannot read properties of undefined (reading 'Approved')" on an Approved row.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const FEATURES = new URL('../src/features/hr-recruitment/', import.meta.url)
const read = (path) => readFile(new URL(path, FEATURES), 'utf8')

test('requisition drawer reads status from the top-level text catalogue', async () => {
  const source = await read('requisition/RequisitionDetails.jsx')
  assert.match(source, /T\.status\[detail\.status\]/)
  assert.doesNotMatch(source, /R\.status/)
})

test('the interview shortcut lives in the drawer sticky bar with a highlight', async () => {
  const report = await read('requisition/RequisitionReportPage.jsx')
  assert.match(
    report,
    /drawerActions=\{\(row\) => <CreateInterviewAssessment row=\{row\} spotlight \/>\}/,
  )
  const details = await read('requisition/RequisitionDetails.jsx')
  assert.doesNotMatch(details, /CreateInterviewAssessment/, 'no duplicate button in the body')
  const insight = await read('shared/components/InsightReport.jsx')
  assert.match(insight, /drawerActions\s*\?\s*drawerActions\(selected\)/)
  const css = await readFile(
    new URL('../src/styles/hr-insight-report.css', import.meta.url),
    'utf8',
  )
  assert.match(css, /\.zrv-ir-drawer__actions\s*\{[^}]*position:\s*sticky/)
  assert.match(css, /@keyframes zrv-ir-spotlight/)
})

test('reports keep their actions only in the drawer, not in a table column', async () => {
  const files = [
    'requisition/RequisitionReportPage.jsx',
    'interview/InterviewReportPage.jsx',
    'offer/OfferReportPage.jsx',
  ]
  for (const file of files) {
    const source = await read(file)
    assert.doesNotMatch(source, /label:\s*'Actions'/, `${file} has no Actions column`)
  }
})

test('the interview drawer has no summary hero, band scores and trailing Hiring suggestions', async () => {
  const report = await read('interview/InterviewReportPage.jsx')
  assert.match(
    report,
    /drawerActions=\{\(row\) => <CreateEmploymentOffer row=\{row\} spotlight \/>\}/,
  )
  assert.match(report, /drawerActionsAfter/)
  assert.match(report, /Hiring suggestions/)
  assert.doesNotMatch(report, /\n\s*summary=\{\(row\)/, 'no summary hero in the drawer')
  assert.match(report, /resizableDrawer/)
  const details = await read('interview/InterviewDetails.jsx')
  assert.match(details, /shared\/components\/ReportDrawer\.jsx/)
  assert.match(details, /<BandBar/)
  assert.match(details, /zrv-ir-detail-scores/)
})

test('every drawer pins its action bar to the bottom and the first section has no top rule', async () => {
  const css = await readFile(
    new URL('../src/styles/hr-insight-report.css', import.meta.url),
    'utf8',
  )
  const actions = css.match(/\.zrv-ir-drawer__actions\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(actions, /position:\s*sticky/)
  assert.match(actions, /margin:\s*auto 0 0/)
  const body = css.match(/\n\.zrv-ir-drawer__body\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(body, /flex:\s*1 1 auto/)
  assert.match(body, /overflow-y:\s*auto/)
  const shared = await read('shared/components/ReportDrawer.jsx')
  assert.match(shared, /zrv-ir-detail--bare/)
  for (const file of ['interview/InterviewDetails.jsx', 'requisition/RequisitionDetails.jsx']) {
    assert.match(await read(file), /<DetailSection[\s\S]*?bare/, file)
  }
})

test('loading skeletons mirror the drawer sections with no top divider', async () => {
  const shared = await read('shared/components/ReportDrawer.jsx')
  assert.match(shared, /export function DetailSkeleton\(\{ sections = \[\] \}\)/)
  assert.match(shared, /bare=\{index === 0\}/)
  const files = [
    'interview/InterviewDetails.jsx',
    'requisition/RequisitionDetails.jsx',
    'orientation/OrientationReportPage.jsx',
  ]
  for (const file of files) {
    const source = await read(file)
    assert.match(source, /<DetailSkeleton\s+sections=/, file)
  }
  const css = await readFile(new URL('../src/styles/report-drawer.css', import.meta.url), 'utf8')
  assert.match(css, /\.zrv-ir-detail-skeleton-grid/)
  assert.match(css, /\.zrv-ir-detail-skeleton-bars/)
  assert.match(css, /\.zrv-ir-detail--bare\s*\{[^}]*border-top:\s*0/)
})

test('the drawer uses one smooth GPU slide with no staggered content re-animation', async () => {
  const css = await readFile(
    new URL('../src/styles/hr-insight-report.css', import.meta.url),
    'utf8',
  )
  const panel = css.match(/\.zrv-ir-drawer\.zrv-hr-rp-drawer \.zrv-dialog\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(panel, /animation:\s*zrv-ir-drawer-in/)
  assert.match(panel, /0\.56s cubic-bezier\(0\.22, 1, 0\.36, 1\)/)
  assert.doesNotMatch(panel, /will-change|transform-origin|scale/)
  assert.match(css, /@keyframes zrv-ir-drawer-in[\s\S]*?translate3d\(32px, 0, 0\)/)
  assert.doesNotMatch(css, /@keyframes zrv-ir-drawer-in[\s\S]*?translate3d\(100%/)
  assert.doesNotMatch(css, /\.zrv-ir-drawer__body > :nth-child/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?animation:\s*none/)
  // Only the insight stylesheet owns the drawer slide.
  const recruitment = await readFile(
    new URL('../src/styles/hr-recruitment.css', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(recruitment, /zrv-hr-slide/)
  const closing =
    css.match(/\.zrv-ir-drawer\.zrv-ir-is-closing \.zrv-dialog\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(closing, /0\.4s cubic-bezier\(0\.45, 0, 0\.55, 1\)/)
  // The unmount timer must outlast the close animation or the exit snaps off.
  const report = await read('shared/components/InsightReport.jsx')
  assert.match(report, /DRAWER_EXIT_MS = 420/)
})

test('all report drawers use the shared detail toolkit', async () => {
  const files = [
    'requisition/RequisitionDetails.jsx',
    'interview/InterviewDetails.jsx',
    'orientation/OrientationReportPage.jsx',
  ]
  for (const file of files) {
    const source = await read(file)
    assert.match(source, /shared\/components\/ReportDrawer\.jsx/, file)
    assert.match(source, /DetailFacts/, file)
    assert.match(source, /DetailSection|SectionHeading/, file)
  }
})
