import test from 'node:test'
import assert from 'node:assert/strict'
import {
  blankInterview,
  canCreateEmploymentOffer,
  COMP_KEYS,
  INTERVIEW_VALIDATION_FIELDS,
  interviewStepErrors,
  performanceSuggestion,
  SPEC_KEYS,
} from '../src/features/hr-recruitment/interview/interviewModel.js'
import {
  candidateInsight,
  groupByRequisition,
  suggestionsSummary,
  waitingBuckets,
  waitingDays,
} from '../src/features/hr-recruitment/interview/interviewSuggestionsModel.js'
import {
  MAX_COMPARE,
  comparisonCriteria,
  comparisonDecision,
  comparisonIds,
  comparisonRoster,
  comparisonScope,
  leadIndexes,
  noteSections,
  profileSections,
  requisitionOf,
  totalsOf,
} from '../src/features/hr-recruitment/interview/interviewComparisonModel.js'
import {
  arabicPeriod,
  autoArabic,
  blankOffer,
  completeOfferTranslations,
  offerCandidateFields,
  OFFER_VALIDATION_FIELDS,
  offerStepErrors,
  validateOffer,
} from '../src/features/hr-recruitment/offer/offerModel.js'
import { arDate, arabicDigits } from '../src/features/hr-recruitment/shared/hrFormat.js'
import {
  recruitmentStepProgress,
  reviewCompletion,
  reviewField,
} from '../src/features/hr-recruitment/shared/recruitmentSteps.js'
import {
  activeRecruitmentErrors,
  recruitmentValidation,
} from '../src/features/hr-recruitment/shared/recruitmentFieldErrors.js'

const TODAY = '2026-11-04'
const progress = (form, validate, furthest = 0) => recruitmentStepProgress(validate(form), furthest)

test('interview requires candidate details, each rating group and evaluation before review', () => {
  const form = blankInterview(TODAY)
  assert.equal(form.preScreeningDate, TODAY)
  assert.equal(progress(form, interviewStepErrors).unlocked, 0)
  Object.assign(form, {
    requisitionNumber: 'PR-100',
    candidateName: 'Candidate',
    divisionCode: 'Food',
    interviewTypeCode: 'Personal',
  })
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
  Object.assign(form, {
    position: 'Inspector',
    candidateNameEn: 'Candidate',
    division: '300000002689294',
  })
  assert.equal(progress(form, offerStepErrors).firstInvalid, 0)
  form.intNo = 'IA-100'
  assert.equal(
    progress(form, offerStepErrors).unlocked,
    1,
    'Starting date is required in Compensation & terms',
  )
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
  Object.assign(form, {
    requisitionNumber: 'PR-100',
    candidateName: 'Candidate',
    divisionCode: 'Food',
    interviewTypeCode: 'Personal',
    candidateAge: '20.5',
  })
  assert.ok(interviewStepErrors(form)[0].candidateAge)
  form.candidateAge = '20'
  form.expectedJoiningDate = '2026-11-31'
  assert.ok(interviewStepErrors(form)[0].expectedJoiningDate)
  assert.equal(recruitmentStepProgress(interviewStepErrors(form), 0, true).unlocked, 4)
})

test('server errors stay on the rejected benefit or rating until that exact value changes', () => {
  const offer = blankOffer(TODAY)
  offer.benefits.basic.en = '4500'
  const validation = recruitmentValidation(
    {
      code: 'VALIDATION_ERROR',
      details: [{ field: 'body.line.basicSalary', message: 'Invalid basic salary' }],
    },
    OFFER_VALIDATION_FIELDS,
    offer,
  )
  assert.equal(validation.step, 1)
  offer.benefits.housing.en = 'Company provided'
  assert.deepEqual(activeRecruitmentErrors(validation.errors, offer), {
    basic: 'Invalid basic salary',
  })
  offer.benefits.basic.en = '4600'
  assert.deepEqual(activeRecruitmentErrors(validation.errors, offer), {})
  const interview = blankInterview(TODAY)
  interview.spec.conf.rating = 6
  const rating = recruitmentValidation(
    {
      code: 'VALIDATION_ERROR',
      details: [{ field: 'personalSpec.rate1', message: 'Choose a valid rating' }],
    },
    INTERVIEW_VALIDATION_FIELDS,
    interview,
  )
  assert.equal(rating.step, 1)
  interview.spec.att.rating = 3
  assert.ok(activeRecruitmentErrors(rating.errors, interview)['spec.conf'])
  interview.spec.conf.rating = 5
  assert.deepEqual(activeRecruitmentErrors(rating.errors, interview), {})
})

test('review distinguishes missing required fields, optional answers, zero and invalid answers', () => {
  const sections = [
    {
      title: 'Details',
      rows: [
        reviewField('Candidate', 'Candidate', true),
        reviewField('Date', '', true),
        reviewField('Salary', 0),
        reviewField('Comment', ''),
        reviewField('Reference', 'bad', true, 'Choose an approved reference'),
      ],
    },
  ]
  assert.deepEqual(reviewCompletion(sections), { complete: 1, total: 3 })
  assert.equal(sections[0].rows[2].hasValue, true)
  assert.equal(sections[0].rows[3].required, false)
  assert.equal(sections[0].rows[4].complete, false)
})

test('creating an offer requires an approved, passed assessment and carries its exact references', () => {
  const assessment = { assessmentNumber: 'IA-100', status: 'APPROVED', outcome: 'PASSED' }
  assert.equal(canCreateEmploymentOffer(assessment), true)
  for (const changed of [
    { status: 'INCOMPLETE' },
    { status: 'REJECTED' },
    { outcome: 'HOLD' },
    { outcome: 'FAILED' },
    { assessmentNumber: '' },
  ]) {
    assert.equal(canCreateEmploymentOffer({ ...assessment, ...changed }), false)
  }
  const candidate = {
    intNo: 'IA-100',
    candidateName: 'Candidate',
    positionName: 'Inspector',
    requisitionNo: 'PR-100',
  }
  assert.deepEqual(offerCandidateFields(candidate), {
    candidateNameEn: 'Candidate',
    position: 'Inspector',
    intNo: 'IA-100',
    reqNo: 'PR-100',
  })
  const secondCandidateWithSameName = { ...candidate, intNo: 'IA-101', requisitionNo: 'PR-101' }
  assert.equal(offerCandidateFields(secondCandidateWithSameName).intNo, 'IA-101')
})

test('interview performance suggestions explain strong, mixed, weak, incomplete, and unapproved assessments', () => {
  const rated = (keys, rating) =>
    Object.fromEntries(keys.map((key) => [key, { rating, remark: '' }]))
  const base = {
    status: 'APPROVED',
    outcome: 'PASSED',
    spec: rated(SPEC_KEYS, 5),
    comp: rated(COMP_KEYS, 5),
  }

  assert.equal(performanceSuggestion(base).action, 'Consider offer')
  assert.equal(
    performanceSuggestion({ ...base, spec: rated(SPEC_KEYS, 3) }).action,
    'Consider offer',
    'Good and Outstanding bands coexist without a weighted score',
  )
  assert.equal(
    performanceSuggestion({ ...base, comp: rated(COMP_KEYS, 1) }).action,
    'Do not recommend',
  )
  assert.equal(
    performanceSuggestion({
      ...base,
      spec: { ...rated(SPEC_KEYS, 5), health: { rating: null, remark: '' } },
    }).action,
    'Hold for review',
  )
  assert.equal(performanceSuggestion({ ...base, status: 'INCOMPLETE' }).action, 'Hold for review')
  assert.match(
    performanceSuggestion({ ...base, outcome: 'HOLD' }).reasons.join(' '),
    /outcome is Hold/,
  )
})

test("hiring suggestions decide from each candidate's own bands, with no ranking", () => {
  const assessment = (overrides = {}) => ({
    assessmentId: '1001',
    candidateName: 'Sample Candidate',
    requisitionNo: 'REQ-1',
    positionTitle: 'Sample Role',
    status: 'APPROVED',
    outcome: 'PASSED',
    personalSpecTotal: 36,
    jobCompetencyTotal: 27,
    interviewDate: '2026-11-01',
    ...overrides,
  })

  assert.equal(candidateInsight(assessment()).decision.label, 'Offer-ready')
  assert.equal(
    candidateInsight(assessment({ jobCompetencyTotal: 12 })).decision.label,
    'Needs review',
    'a Poor group passed overall still needs review',
  )
  assert.equal(
    candidateInsight(assessment({ personalSpecTotal: null })).decision.label,
    'Needs review',
    'a missing total is unrated',
  )
  assert.equal(
    candidateInsight(assessment({ personalSpecTotal: 0 })).decision.label,
    'Needs review',
    'a stored 0 is a Poor score, not unrated',
  )
  assert.equal(waitingDays('2026-11-01', '2026-11-14'), 13)

  const groups = groupByRequisition(
    [
      assessment(),
      assessment({ assessmentId: '1002', personalSpecTotal: 22 }),
      assessment({ assessmentId: '1003', requisitionNo: 'REQ-2', jobCompetencyTotal: 8 }),
    ],
    '2026-11-14',
  )
  assert.deepEqual(
    groups.map((group) => group.requisitionNo),
    ['REQ-1', 'REQ-2'],
  )
  assert.deepEqual(suggestionsSummary(groups), {
    requisitions: 2,
    total: 3,
    ready: 2,
    review: 1,
    oldest: 13,
  })
  assert.deepEqual(
    waitingBuckets(groups.flatMap((group) => group.candidates)).map((bucket) => [
      bucket.label,
      bucket.count,
    ]),
    [
      ['0–7 days', 0],
      ['8–14 days', 3],
      ['15–30 days', 0],
      ['31+ days', 0],
    ],
  )
})

test('candidate comparison shows each group and criterion without combining or ranking them', () => {
  const rated = (keys, rating) =>
    Object.fromEntries(keys.map((key) => [key, { rating, remark: '' }]))
  const record = (overrides = {}) => ({
    assessmentId: '1001',
    assessmentNumber: 'IA-1',
    candidateName: 'A Candidate',
    status: 'APPROVED',
    outcome: 'PASSED',
    interviewDate: '2026-11-01',
    requisitionNumber: 'REQ-1',
    positionTitle: 'Inspector',
    candidateAge: 30,
    nationality: 'Saudi',
    relevantExperienceYears: 5,
    currentTotal: 10000,
    expectedTotal: 12000,
    personalSpecification: { ...rated(SPEC_KEYS, 4), conf: { rating: 5, remark: 'Clear' } },
    competency: rated(COMP_KEYS, 3),
    ...overrides,
  })

  const totals = totalsOf(record())
  assert.deepEqual([totals.spec.total, totals.spec.complete, totals.spec.band], [33, true, 'GOOD'])
  assert.deepEqual([totals.comp.total, totals.comp.complete, totals.comp.band], [18, true, 'GOOD'])
  assert.equal(
    totalsOf(record({ competency: { ...rated(COMP_KEYS, 3), ot: { rating: null, remark: '' } } }))
      .comp.complete,
    false,
    'a partly scored group is not complete',
  )
  assert.equal(comparisonDecision(record()).decision.key, 'READY')
  assert.equal(comparisonDecision(record({ status: 'INPROCESS' })).decision.key, 'REVIEW')

  const [spec, comp] = comparisonCriteria([
    record(),
    record({ assessmentId: '1002', personalSpecification: rated(SPEC_KEYS, 4) }),
  ])
  assert.deepEqual(
    [spec.key, spec.rows.length, comp.rows.length],
    ['spec', SPEC_KEYS.length, COMP_KEYS.length],
  )
  assert.equal(spec.rows[0].label, 'Self confidence')
  assert.deepEqual(
    spec.rows[0].values.map((value) => value.rating),
    [5, 4],
  )
  assert.deepEqual(spec.rows[0].lead, [0], 'only the highest rating in that criterion is marked')
  assert.deepEqual(leadIndexes([4, 4]), [], 'equal scores mark nobody')
  assert.deepEqual(leadIndexes([5, null]), [])
  assert.deepEqual(leadIndexes([3, 5, 5]), [1, 2])

  const profile = Object.fromEntries(
    profileSections([record()])
      .flatMap((section) => section.rows)
      .map((row) => [row.key, row.values[0]]),
  )
  assert.equal(profile.nationality, 'Saudi')
  assert.equal(profile.change, '+20%')
  assert.equal(profile.number, 'IA-1')
  assert.deepEqual(
    noteSections([record()]).map((row) => row.key),
    ['strengths', 'weakness', 'specRemarks', 'compRemarks'],
  )
  assert.equal(comparisonRoster([record()], '2026-11-14')[0].wait, 13)

  assert.equal(comparisonRoster([record()], '2026-11-14')[0].requisition, 'REQ-1')
  assert.equal(
    requisitionOf({ requisitionNo: 'REQ-9' }),
    'REQ-9',
    'report rows carry requisitionNo',
  )
  assert.equal(requisitionOf({}), '')

  assert.equal(comparisonScope([record(), record({ assessmentId: '1002' })]).mixed, false)
  const mixed = comparisonScope([
    record(),
    record({ assessmentId: '1002', requisitionNumber: 'REQ-2' }),
  ])
  assert.equal(mixed.mixed, true, 'different requisitions cannot be compared')
  assert.deepEqual(mixed.labels, ['REQ-1', 'REQ-2'])
  assert.equal(
    comparisonScope([
      record({ requisitionNumber: '' }),
      record({ assessmentId: '1002', requisitionNumber: '' }),
    ]).mixed,
    false,
    'records without a requisition only compare with each other',
  )
  assert.equal(
    comparisonScope([record({ requisitionNumber: '' }), record({ assessmentId: '1002' })]).mixed,
    true,
  )

  assert.deepEqual(comparisonIds('101,102,101,abc,0, 103'), ['101', '102', '103'])
  assert.equal(
    comparisonIds(Array.from({ length: 9 }, (_, index) => String(index + 1)).join(',')).length,
    MAX_COMPARE,
  )
})

test('offer translations convert locally and preserve manual Arabic values', async () => {
  const form = blankOffer(TODAY)
  form.benefits.basic.en = '4,500'
  form.benefits.start.en = TODAY
  const calls = []
  const converters = {
    async numberToArabic(number) {
      calls.push(number)
      return 'Translated salary'
    },
    async hijriDate(date) {
      calls.push(date)
      return 'Translated date'
    },
  }
  const prepared = await completeOfferTranslations(form, converters)
  // Only the optional salary-words helper is called; dates never use Hijri.
  assert.deepEqual(calls, [4500])
  assert.equal(prepared.benefits.basic.ar, 'Translated salary')
  assert.equal(prepared.benefits.start.ar, arDate(TODAY))
  assert.equal(form.benefits.basic.ar, '', 'the edited form snapshot is not mutated')
  form.benefits.basic = { en: '4500', ar: 'Manual salary', linked: false }
  form.benefits.start.ar = 'Existing date'
  calls.length = 0
  const manual = await completeOfferTranslations(form, converters)
  assert.equal(manual.benefits.basic.ar, 'Manual salary')
  assert.deepEqual(calls, [])
  form.benefits.basic = { en: '4500', ar: '', linked: true }
  form.benefits.start.ar = ''
  const unavailable = await completeOfferTranslations(form, {
    ...converters,
    async numberToArabic() {
      throw new Error('unavailable')
    },
  })
  assert.equal(
    unavailable.benefits.basic.ar,
    autoArabic('basic', '4500'),
    'a failed helper still leaves an Arabic amount on the field',
  )
  assert.equal(unavailable.benefits.start.ar, arDate(TODAY))
})

test('Arabic dates use the Gregorian calendar with Arabic numerals', () => {
  assert.equal(arDate('2026-11-20'), '٢٠/١١/٢٠٢٦')
  assert.equal(arDate('2026-01-05'), '٠٥/٠١/٢٠٢٦')
  assert.equal(arDate('not-a-date'), '')
  assert.equal(arabicDigits('SAR 4,500.00'), 'SAR ٤,٥٠٠.٠٠')
  assert.equal(autoArabic('start', '2026-11-20'), '٢٠/١١/٢٠٢٦')
  assert.equal(autoArabic('basic', '4500'), '٤٬٥٠٠')
  assert.equal(arabicPeriod('6 months'), '٦ شهر')
  assert.equal(autoArabic('probation', '3 months'), '٣ أشهر')
  assert.equal(autoArabic('probation', '6 months'), '٦ أشهر')
})
