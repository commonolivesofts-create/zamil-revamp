import test from 'node:test'
import assert from 'node:assert/strict'
import { blankRequisition, requisitionFieldIssues } from '../src/features/hr-recruitment/requisition/requisitionModel.js'
import { blankInterview, validateInterview } from '../src/features/hr-recruitment/interview/interviewModel.js'
import { blankOffer, validateOffer } from '../src/features/hr-recruitment/offer/offerModel.js'
import { orientationStepErrors } from '../src/features/hr-recruitment/orientation/orientationForm.js'
import { blankProbation, probationStepErrors } from '../src/features/hr-recruitment/probation/probationForm.js'

const date = '2026-11-06'

test('form text checks use stored byte limits for Arabic, not only input character limits', () => {
  const requisition = { ...blankRequisition(date), jobTitle: 'ع'.repeat(76) }
  assert.match(requisitionFieldIssues(requisition).find((issue) => issue.key === 'jobTitle').message, /150-byte/)

  const interview = blankInterview(date)
  interview.spec.conf.remark = 'ع'.repeat(101)
  assert.match(validateInterview(interview).errors['spec.conf.remark'], /200-byte/)

  const offer = blankOffer(date)
  offer.comments = 'ع'.repeat(251)
  assert.match(validateOffer(offer).errors.comments, /500-byte/)

  const probation = { ...blankProbation(), comment: 'ع'.repeat(251), comments: 'Valid' }
  assert.match(probationStepErrors(probation, { saved: true })[2].comment, /500-byte/)
})

test('interview rejects scientific notation, letters, fractions and out-of-range ages', () => {
  const form = blankInterview(date)
  for (const age of ['abc', '2e1', '17', '71', '20.5']) {
    form.candidateAge = age
    assert.equal(validateInterview(form).errors.candidateAge, 'Enter a whole-number age from 18 to 70.')
  }
  form.candidateAge = '18'
  assert.equal(validateInterview(form).errors.candidateAge, undefined)
  form.candidateAge = '70'
  assert.equal(validateInterview(form).errors.candidateAge, undefined)
})

test('orientation detects a conflicting row and accepts adjacent sessions', () => {
  const first = { department: 'HR', fromDate: date, toDate: date, timeFrom: '12:00:00', timeTo: '13:00:00' }
  const second = { ...first, department: 'Safety' }
  const form = { employee: { employeeNumber: 'E100' }, fromOrient: date, lines: [first, second] }
  assert.match(orientationStepErrors(form)[1]['line:1:timeFrom'], /overlaps/)
  form.lines[1].timeFrom = '13:00:00'
  form.lines[1].timeTo = '14:00:00'
  assert.equal(orientationStepErrors(form)[1]['line:1:timeFrom'], undefined)
})
