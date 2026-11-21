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

test('the interview drawer has a Hiring suggestions button and the highlighted offer action', async () => {
  const report = await read('interview/InterviewReportPage.jsx')
  assert.match(report, /drawerActions=\{\(row\) => \(/)
  assert.match(report, /Hiring suggestions/)
  assert.match(report, /<CreateEmploymentOffer row=\{row\} spotlight \/>/)
  assert.match(report, /resizableDrawer/)
  const details = await read('interview/InterviewDetails.jsx')
  assert.match(details, /shared\/components\/ReportDrawer\.jsx/)
  assert.match(details, /Score summary/)
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
    assert.match(source, /SectionHeading/, file)
  }
})
