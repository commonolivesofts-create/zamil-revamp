// The interview time is stamped by the system, and the assessment report
// offers bulk deletion instead of the row comparison tools.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  blankInterview,
  HR_FIELDS,
  interviewPayload,
} from '../src/features/hr-recruitment/interview/interviewModel.js'
import { businessNowTime } from '../src/features/hr-recruitment/shared/hrFormat.js'

const REPORT = new URL(
  '../src/features/hr-recruitment/interview/InterviewReportPage.jsx',
  import.meta.url,
)
const SHARED_CSS = new URL('../src/styles/hr-insight-report.css', import.meta.url)
const TIME = /^\d{2}:\d{2}$/

test('assessment time is generated, never a form field', () => {
  assert.equal(
    HR_FIELDS.some(([key]) => key === 'interviewTime'),
    false,
  )
  const blank = blankInterview('2026-11-20')
  assert.match(blank.interviewTime, TIME)
  // A saved value is sent as-is; a missing one is stamped on serialization.
  assert.equal(interviewPayload(blank).interviewTime, blank.interviewTime)
  assert.match(interviewPayload({ ...blank, interviewTime: '' }).interviewTime, TIME)
  assert.match(businessNowTime(new Date('2026-11-20T11:05:00Z')), TIME)
})

test('assessment report uses the shared bulk delete instead of compare tools', async () => {
  const source = await readFile(REPORT, 'utf8')
  assert.match(source, /useReportBulkDelete/)
  assert.match(source, /ACTIONS\.INTERVIEW_DELETE/)
  // Approved assessments are blocked from selection in the UI.
  assert.match(source, /row\.status === 'APPROVED'/)
  assert.doesNotMatch(source, /openComparison/)
  assert.doesNotMatch(source, /MAX_COMPARE/)
  assert.doesNotMatch(source, /Compare\{/)
})

test('all recruitment report listings share the one bulk-delete implementation', async () => {
  const reports = [
    'requisition/RequisitionReportPage.jsx',
    'interview/InterviewReportPage.jsx',
    'offer/OfferReportPage.jsx',
    'orientation/OrientationReportPage.jsx',
    'probation/ProbationReportPage.jsx',
  ]
  for (const name of reports) {
    const url = new URL(`../src/features/hr-recruitment/${name}`, import.meta.url)
    const source = await readFile(url, 'utf8')
    assert.match(source, /useReportBulkDelete/, `${name} uses the shared bulk-delete hook`)
    assert.match(source, /\{confirmation\}/, `${name} renders the shared confirmation`)
    assert.doesNotMatch(source, /createPortal/, `${name} has no copy of the dialog`)
  }
})

test('table tools are right-aligned once, in the shared report stylesheet', async () => {
  const css = await readFile(SHARED_CSS, 'utf8')
  const rule = css.match(/\.zrv-ir-tabletools\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(rule, /margin-left:\s*auto/)
  assert.match(rule, /justify-content:\s*flex-end/)
  const source = await readFile(REPORT, 'utf8')
  assert.doesNotMatch(source, /margin-left:\s*auto/)
})
