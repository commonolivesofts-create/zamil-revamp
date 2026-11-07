import test from 'node:test'
import assert from 'node:assert/strict'
import { blankInterview, canCreateEmploymentOffer, COMP_KEYS, INTERVIEW_VALIDATION_FIELDS, interviewStepErrors, SPEC_KEYS } from '../src/features/hr-recruitment/interview/interviewModel.js'
import { blankOffer, completeOfferTranslations, offerCandidateFields, OFFER_VALIDATION_FIELDS, offerStepErrors, validateOffer } from '../src/features/hr-recruitment/offer/offerModel.js'
import { recruitmentStepProgress, reviewCompletion, reviewField } from '../src/features/hr-recruitment/shared/recruitmentSteps.js'
import { activeRecruitmentErrors, recruitmentValidation } from '../src/features/hr-recruitment/shared/recruitmentFieldErrors.js'

const TODAY = '2026-11-04'
const progress = (form, validate, furthest = 0) => recruitmentStepProgress(validate(form), furthest)

test('interview requires candidate details, each rating group and evaluation before review', () => {
  const form = blankInterview(TODAY)
  assert.equal(form.preScreeningDate, TODAY)
  assert.equal(progress(form, interviewStepErrors).unlocked, 0)
  Object.assign(form, { requisitionNumber: 'PR-100', candidateName: 'Candidate', divisionCode: 'Food', interviewTypeCode: 'Personal' })
  assert.equal(progress(form, interviewStepErrors).unlocked, 1)
  for (const key of SPEC_KEYS) form.spec[key].rating = 4
  assert.equal(progress(form, interviewStepErrors).unlocked, 2)
  for (const key of COMP_KEYS) form.comp[key].rating = 'N/A'
  assert.equal(progress(form, interviewStepErrors).unlocked, 3)
  form.outcome = 'PASSED'
  assert.equal(progress(form, interviewStepErrors).unlocked, 3, 'payroll is required by the API')
  form.payroll = '300000003618177'
  assert.equal(progress(form, interviewStepErrors).unlocked, 4)
  form.candidateName = ''
  const revisited = progress(form, interviewStepErrors, 4)
  assert.equal(revisited.unlocked, 4, 'previously unlocked steps stay reachable')
  assert.equal(revisited.firstInvalid, 0, 'saving still returns to the incomplete field')
})

test('offer requires candidate details before compensation and terms, then unlocks Review; allowances stay optional', () => {
  const form = blankOffer(TODAY)
  assert.equal(form.offerDate, TODAY)
  Object.assign(form, { position: 'Inspector', candidateNameEn: 'Candidate', division: '300000002689294' })
  assert.equal(progress(form, offerStepErrors).firstInvalid, 0)
  form.intNo = 'IA-100'
  assert.equal(progress(form, offerStepErrors).unlocked, 1, 'Starting date is required in Compensation & terms')
  form.benefits.start.en = TODAY
  assert.equal(progress(form, offerStepErrors).unlocked, 2)
  assert.equal(validateOffer(form).valid, true)
  form.benefits.basic.en = '-100'
  assert.equal(progress(form, offerStepErrors).firstInvalid, 1)
  form.benefits.basic.en = '4,500.50'
  assert.equal(validateOffer(form).valid, true)
  form.benefits.start.en = '2026-02-30'
  assert.equal(progress(form, offerStepErrors).firstInvalid, 1)
})

test('invalid optional interview answers block progression and read-only records allow every tab', () => {
  const form = blankInterview(TODAY)
  Object.assign(form, { requisitionNumber: 'PR-100', candidateName: 'Candidate', divisionCode: 'Food', interviewTypeCode: 'Personal', candidateAge: '20.5' })
  assert.ok(interviewStepErrors(form)[0].candidateAge)
  form.candidateAge = '20'
  form.expectedJoiningDate = '2026-11-31'
  assert.ok(interviewStepErrors(form)[0].expectedJoiningDate)
  assert.equal(recruitmentStepProgress(interviewStepErrors(form), 0, true).unlocked, 4)
})

test('server errors stay on the rejected benefit or rating until that exact value changes', () => {
  const offer = blankOffer(TODAY)
  offer.benefits.basic.en = '4500'
  const validation = recruitmentValidation({ code: 'VALIDATION_ERROR', details: [{ field: 'body.line.basicSalary', message: 'Invalid basic salary' }] }, OFFER_VALIDATION_FIELDS, offer)
  assert.equal(validation.step, 1)
  offer.benefits.housing.en = 'Company provided'
  assert.deepEqual(activeRecruitmentErrors(validation.errors, offer), { basic: 'Invalid basic salary' })
  offer.benefits.basic.en = '4600'
  assert.deepEqual(activeRecruitmentErrors(validation.errors, offer), {})
  const interview = blankInterview(TODAY)
  interview.spec.conf.rating = 6
  const rating = recruitmentValidation({ code: 'VALIDATION_ERROR', details: [{ field: 'personalSpec.rate1', message: 'Choose a valid rating' }] }, INTERVIEW_VALIDATION_FIELDS, interview)
  assert.equal(rating.step, 1)
  interview.spec.att.rating = 3
  assert.ok(activeRecruitmentErrors(rating.errors, interview)['spec.conf'])
  interview.spec.conf.rating = 5
  assert.deepEqual(activeRecruitmentErrors(rating.errors, interview), {})
})

test('review distinguishes missing required fields, optional answers, zero and invalid answers', () => {
  const sections = [{ title: 'Details', rows: [
    reviewField('Candidate', 'Candidate', true),
    reviewField('Date', '', true),
    reviewField('Salary', 0),
    reviewField('Comment', ''),
    reviewField('Reference', 'bad', true, 'Choose an approved reference'),
  ] }]
  assert.deepEqual(reviewCompletion(sections), { complete: 1, total: 3 })
  assert.equal(sections[0].rows[2].hasValue, true)
  assert.equal(sections[0].rows[3].required, false)
  assert.equal(sections[0].rows[4].complete, false)
})

test('creating an offer requires an approved, passed assessment and carries its exact references', () => {
  const assessment = { assessmentNumber: 'IA-100', status: 'APPROVED', outcome: 'PASSED' }
  assert.equal(canCreateEmploymentOffer(assessment), true)
  for (const changed of [{ status: 'INCOMPLETE' }, { status: 'REJECTED' }, { outcome: 'HOLD' }, { outcome: 'FAILED' }, { assessmentNumber: '' }]) {
    assert.equal(canCreateEmploymentOffer({ ...assessment, ...changed }), false)
  }
  const candidate = { intNo: 'IA-100', candidateName: 'Candidate', positionName: 'Inspector', requisitionNo: 'PR-100' }
  assert.deepEqual(offerCandidateFields(candidate), { candidateNameEn: 'Candidate', position: 'Inspector', intNo: 'IA-100', reqNo: 'PR-100' })
  const secondCandidateWithSameName = { ...candidate, intNo: 'IA-101', requisitionNo: 'PR-101' }
  assert.equal(offerCandidateFields(secondCandidateWithSameName).intNo, 'IA-101')
})

test('offer save waits for missing automatic translations and preserves manual Arabic values', async () => {
  const form = blankOffer(TODAY)
  form.benefits.basic.en = '4,500'
  form.benefits.start.en = TODAY
  const calls = []
  const converters = {
    async numberToArabic(number) { calls.push(number); return 'Translated salary' },
    async hijriDate(date) { calls.push(date); return 'Translated date' },
  }
  const prepared = await completeOfferTranslations(form, converters)
  assert.deepEqual(calls, [4500, TODAY])
  assert.equal(prepared.benefits.basic.ar, 'Translated salary')
  assert.equal(prepared.benefits.start.ar, 'Translated date')
  assert.equal(form.benefits.basic.ar, '', 'the edited form snapshot is not mutated')
  form.benefits.basic = { en: '4500', ar: 'Manual salary', linked: false }
  form.benefits.start.ar = 'Existing date'
  calls.length = 0
  const manual = await completeOfferTranslations(form, converters)
  assert.equal(manual.benefits.basic.ar, 'Manual salary')
  assert.deepEqual(calls, [])
  form.benefits.start.ar = ''
  const unavailable = await completeOfferTranslations(form, { ...converters, async hijriDate() { throw new Error('unavailable') } })
  assert.equal(unavailable.benefits.start.ar, '', 'optional Arabic can still be entered manually if a helper is unavailable')
})
