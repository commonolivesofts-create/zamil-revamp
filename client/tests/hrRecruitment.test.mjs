// HR recruitment (forms 1060, 1061, 1062): business rules, response contracts,
// services over the shared API client (mocked transport), the owner-approved
// in-memory demo adapter and its flag, navigation, and static checks of the
// JSX pages. No backend, Oracle or browser storage is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { appRoutes, canAccessRoute, findAppRoute, paletteCommands, routeAccess } from '../src/config/appNavigation.js'
import { registeredModules } from '../src/config/registry/index.js'
import { businessToday, daysBetween, toAmount } from '../src/features/hr-recruitment/shared/hrFormat.js'
import { resolveDemoMode } from '../src/features/hr-recruitment/hrRecruitmentConfig.js'
import { HR_RECRUITMENT_ACTIONS } from '../src/features/hr-recruitment/hrRecruitmentActions.js'
import { INTERVIEW_TEXT } from '../src/features/hr-recruitment/hrRecruitmentText.js'
import {
  readInterview, readLookups, readOffer, readPage, readRequisition, readRequisitionListItem,
} from '../src/features/hr-recruitment/hrRecruitmentContract.js'
import { createHrRecruitmentServices, selectClient } from '../src/features/hr-recruitment/hrRecruitmentService.js'
import { createDemoClient } from '../src/features/hr-recruitment/demo/demoClient.js'
import { DEMO_LOOKUPS, createDemoRecords } from '../src/features/hr-recruitment/demo/demoData.js'
import {
  approvalRoute, blankRequisition, isRequisitionLocked, leadTime, minimumEducation, requisitionChecks, requisitionFormFromRecord,
  requisitionPayload, requisitionProgress,
} from '../src/features/hr-recruitment/requisition/requisitionModel.js'
import {
  BANDS, COMP_KEYS, SCORE_MAX, SPEC_KEYS, bandLabel, bandOf, blankInterview, interviewDoneSteps, interviewFormFromRecord,
  interviewPayload, interviewStatus, isInterviewLocked, linkedPosition, ratedCount, salaryDelta, sumRatings, validateInterview,
} from '../src/features/hr-recruitment/interview/interviewModel.js'
import {
  autoArabic, blankOffer, englishDisplay, isOfferLocked, issuedStatus, monthlyPackage, offerDoneSteps, offerFormFromRecord,
  offerPayload, packageArcs, validateOffer,
} from '../src/features/hr-recruitment/offer/offerModel.js'
import { SESSION_TOKEN, failure, forbidBrowserStorage, recordingFetch, success } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const FEATURE = '../src/features/hr-recruitment/'
const TODAY = '2026-10-27'

// ------------------------------------------------------------ form fixtures

const completeRequisition = (overrides = {}) => ({
  ...blankRequisition(TODAY), jobTitle: 'Quality Inspector', departmentCode: 'QUAL', neededDate: '2026-12-31',
  reason: 'REPLACEMENT', replacementFor: 'Departing inspector', budgeted: 'yes', budgetedSalary: '6500',
  educationCodes: ['DIP'], gccExperienceCode: 'Y2_5', workExperienceCode: 'Y5_10', skills: ['SPC'], ...overrides,
})

const rate = (keys, rating) => Object.fromEntries(keys.map((key) => [key, { rating, remark: '' }]))
const completeInterview = (overrides = {}) => ({
  ...blankInterview(TODAY, { payrollDefault: 'IPP BU', maritalDefault: 'SINGLE' }),
  requisitionNumber: 'PRQ-2026-0001', divisionCode: 'IPP', interviewTypeCode: 'F2F', candidateName: 'Sample Candidate',
  spec: rate(SPEC_KEYS, 4), comp: rate(COMP_KEYS, 4), outcome: 'PASSED', ...overrides,
})

const offerLookups = { reportFormat: 'FPP BU', probation: DEMO_LOOKUPS.offer.probation }
const completeOffer = () => {
  const form = blankOffer(TODAY, offerLookups)
  form.position = 'Quality Inspector'
  form.candidateNameEn = 'Sample Candidate'
  form.benefits.basic = { en: '6000', ar: '', linked: true }
  form.benefits.start = { en: '2026-12-01', ar: '', linked: true }
  return form
}

// ------------------------------------------------------------ requisition rules

test('requisition: every required answer is checked, in its step', () => {
  const empty = requisitionChecks(blankRequisition(TODAY)).filter((check) => !check.ok).map((check) => [check.step, check.key])
  assert.deepEqual(empty, [
    [0, 'jobTitle'], [0, 'departmentCode'], [1, 'reason'], [1, 'replacementFor'], [1, 'budgeted'],
    [2, 'educationCodes'], [2, 'gccExperienceCode'], [2, 'workExperienceCode'], [2, 'skills'],
  ], 'the needed date defaults to today; basic salary is never required')
  assert.equal(requisitionChecks(completeRequisition()).every((check) => check.ok), true)
  assert.equal(requisitionChecks(completeRequisition({ neededDate: '' })).find((check) => check.key === 'neededDate').ok, false)
})

test('requisition: replacement asks "Replacement for", addition asks the reason for addition', () => {
  const keys = (form) => requisitionChecks(form).map((check) => check.key)
  assert.ok(keys(completeRequisition({ reason: 'REPLACEMENT' })).includes('replacementFor'))
  assert.ok(!keys(completeRequisition({ reason: 'REPLACEMENT' })).includes('additionReason'))
  const addition = completeRequisition({ reason: 'ADDITION', replacementFor: '' })
  assert.ok(keys(addition).includes('additionReason') && !keys(addition).includes('replacementFor'))
  assert.equal(requisitionChecks(addition).find((check) => check.key === 'additionReason').ok, false)
  assert.equal(requisitionChecks({ ...addition, additionReason: 'New line' }).every((check) => check.ok), true)
  assert.equal(requisitionChecks(completeRequisition({ replacementFor: '   ' })).find((check) => check.key === 'replacementFor').ok, false)
})

test('requisition: the budgeted salary is required only for a budgeted position', () => {
  const salary = (form) => requisitionChecks(form).find((check) => check.key === 'budgetedSalary')
  assert.equal(salary(completeRequisition({ budgetedSalary: '' })).ok, false)
  assert.equal(salary(completeRequisition({ budgeted: 'no', budgetedSalary: '' })), undefined)
  assert.equal(salary(completeRequisition({ budgeted: '', budgetedSalary: '' })), undefined)
})

test('requisition: progress opens the earliest step with a problem; review is done once a file is attached', () => {
  const progress = requisitionProgress(completeRequisition({ skills: [], budgetedSalary: '' }))
  assert.equal(progress.firstStep, 1, 'budgeted salary (step 2) before skills (step 3)')
  assert.deepEqual(progress.missing.map((check) => check.label), ['budgeted salary', 'skills'])
  assert.deepEqual(progress.doneSteps, [true, false, false, false])
  const done = requisitionProgress(completeRequisition({ attachments: [{ fileName: 'jd.pdf', sizeBytes: 10 }] }))
  assert.deepEqual(done.doneSteps, [true, true, true, true])
  assert.equal(done.firstStep, -1)
  assert.equal(done.done, done.total)
})

test('requisition: lead time warns for past, today and under 30 days', () => {
  assert.deepEqual(leadTime(TODAY, '2026-10-26'), { tone: 'warn', days: -1, text: 'Date is in the past' })
  assert.deepEqual(leadTime(TODAY, TODAY), { tone: 'warn', days: 0, text: 'Needed today' })
  assert.equal(leadTime(TODAY, '2026-10-28').text, 'Urgent · 1 day away')
  assert.equal(leadTime(TODAY, '2026-11-25').text, 'Urgent · 29 days away')
  assert.deepEqual(leadTime(TODAY, '2026-11-26'), { tone: '', days: 30, text: '30 days of lead time' })
  assert.equal(leadTime(TODAY, ''), null)
  assert.equal(leadTime(TODAY, 'not-a-date'), null)
})

test('requisition: a position that is not budgeted adds the Finance step before final approval', () => {
  const route = DEMO_LOOKUPS.approvalRoute
  const codes = (budgeted) => approvalRoute(route, budgeted).map((step) => step.code)
  assert.deepEqual(codes('yes'), ['LINE_MANAGER', 'HR_MANAGER', 'GENERAL_MANAGER'])
  assert.deepEqual(codes(''), ['LINE_MANAGER', 'HR_MANAGER', 'GENERAL_MANAGER'], 'no answer yet: no extra step')
  assert.deepEqual(codes('no'), ['LINE_MANAGER', 'HR_MANAGER', 'FINANCE', 'GENERAL_MANAGER'])
  assert.deepEqual(approvalRoute(route, 'no').map((step) => step.added), [false, false, true, false])
  assert.deepEqual(approvalRoute(null, 'no'), [])
  assert.deepEqual(approvalRoute({ steps: route.steps, unbudgetedStep: null }, 'no').length, 3)
})

test('requisition: the request body sends only the answers that apply', () => {
  const replacement = requisitionPayload(completeRequisition({ additionReason: 'stale', jobTitle: '  Inspector  ' }))
  assert.equal(replacement.jobTitle, 'Inspector')
  assert.equal(replacement.additionReason, '', 'answer of the other reason is dropped')
  assert.equal(replacement.budgeted, true)
  assert.equal(replacement.budgetedSalary, 6500)
  assert.equal('attachments' in replacement, false, 'attachments only when supported')
  const unbudgeted = requisitionPayload(completeRequisition({ budgeted: 'no', budgetedSalary: '9000' }))
  assert.equal(unbudgeted.budgeted, false)
  assert.equal(unbudgeted.budgetedSalary, null)
  const blank = requisitionPayload(blankRequisition(TODAY))
  assert.deepEqual([blank.reason, blank.budgeted, blank.departmentCode], [null, null, null])
  const withFiles = requisitionPayload(completeRequisition({ attachments: [{ fileName: 'jd.pdf', sizeBytes: 2048, extra: 1 }] }), { attachments: true })
  assert.deepEqual(withFiles.attachments, [{ fileName: 'jd.pdf', sizeBytes: 2048 }])
  for (const field of ['requisitionNumber', 'status', 'requesterName', 'basicSalary']) assert.equal(field in replacement, false, `${field} is server-assigned`)
})

test('requisition: the minimum education and the lock follow the record', () => {
  assert.deepEqual(minimumEducation(['BSC', 'DIP', 'MSC'], DEMO_LOOKUPS.educationLevels), { name: 'Diploma', more: 2 })
  assert.equal(minimumEducation([], DEMO_LOOKUPS.educationLevels), null)
  assert.equal(isRequisitionLocked('SUBMITTED'), true)
  assert.equal(isRequisitionLocked('DRAFT'), false)
  const record = readRequisition(createDemoRecords().requisitions[0])
  const form = requisitionFormFromRecord(record)
  assert.equal(form.budgeted, 'yes')
  assert.equal(form.budgetedSalary, '6500')
  assert.deepEqual(requisitionPayload(form).educationCodes, ['DIP', 'BSC'])
})

// ------------------------------------------------------------ interview rules

test('interview: score bands and totals (Personal specification /40, Competency /30)', () => {
  assert.deepEqual(SCORE_MAX, { spec: 40, comp: 30 })
  const spec = (total) => bandOf(total, BANDS.spec, true)[1]
  assert.deepEqual([spec(0), spec(19), spec(20), spec(34), spec(35), spec(40)], ['POOR', 'POOR', 'GOOD', 'GOOD', 'OUTSTANDING', 'OUTSTANDING'])
  const comp = (total) => bandOf(total, BANDS.comp, true)[1]
  assert.deepEqual([comp(14), comp(15), comp(24), comp(25), comp(30)], ['POOR', 'GOOD', 'GOOD', 'OUTSTANDING', 'OUTSTANDING'])
  assert.deepEqual(bandOf(0, BANDS.spec, false), [-1, null])
  assert.equal(bandLabel(0, BANDS.spec, false), 'Not rated')
  assert.equal(bandLabel(36, BANDS.spec, true), 'Outstanding')
  const ratings = { ...rate(SPEC_KEYS, 5), conf: { rating: null, remark: '' } }
  assert.equal(sumRatings(ratings), 35)
  assert.equal(ratedCount(ratings, SPEC_KEYS), 7)
  assert.equal(sumRatings(rate(COMP_KEYS, 3)), 18)
})

test('interview: HR required fields, ranges, totals and dates are validated on the HR tab', () => {
  const blank = validateInterview(blankInterview(TODAY))
  assert.deepEqual(Object.keys(blank.errors).sort(), ['candidateName', 'divisionCode', 'interviewTypeCode', 'requisitionNumber'].sort(), 'pre-screening date defaults to today')
  assert.equal(blank.errors.candidateName, 'Candidate name is required')
  assert.equal(blank.firstStep, 0)
  const errorsOf = (overrides) => validateInterview(completeInterview(overrides)).errors
  assert.deepEqual(errorsOf({ preScreeningDate: '' }), { preScreeningDate: 'Pre-screening date is required' })
  assert.deepEqual(errorsOf({ candidateAge: '18' }), {})
  assert.deepEqual(errorsOf({ candidateAge: '70' }), {})
  assert.equal(errorsOf({ candidateAge: '17' }).candidateAge, 'Enter a number from 18 to 70')
  assert.equal(errorsOf({ candidateAge: '71' }).candidateAge, 'Enter a number from 18 to 70')
  assert.equal(errorsOf({ relevantExperienceYears: '51' }).relevantExperienceYears, 'Enter a number from 0 to 50')
  assert.deepEqual(errorsOf({ relevantExperienceYears: '0' }), {})
  assert.equal(errorsOf({ expectedBasic: '-1' }).expectedBasic, 'Enter a number from 0')
  assert.equal(errorsOf({ expectedBasic: '5000', expectedTotal: '4000' }).expectedTotal, 'Total can’t be less than basic')
  assert.deepEqual(errorsOf({ expectedBasic: '5000', expectedTotal: '5000' }), {})
  assert.equal(errorsOf({ currentBasic: '5000', currentTotal: '4999' }).currentTotal, 'Total can’t be less than basic')
  assert.equal(errorsOf({ preScreeningDate: '2026-10-27', expectedJoiningDate: '2026-10-26' }).expectedJoiningDate, 'Joining date is before pre-screening')
  assert.deepEqual(errorsOf({ preScreeningDate: '2026-10-27', expectedJoiningDate: '2026-10-27' }), {})
})

test('interview: save needs all four tabs; validation opens the first tab with a problem', () => {
  assert.equal(validateInterview(completeInterview()).valid, true)
  const missingSpec = validateInterview(completeInterview({ spec: { ...rate(SPEC_KEYS, 4), eng: { rating: null, remark: '' } } }))
  assert.equal(missingSpec.firstStep, 1)
  assert.deepEqual(missingSpec.missing.spec, ['eng'])
  assert.equal(validateInterview(completeInterview({ comp: rate(COMP_KEYS, null) })).firstStep, 2)
  const noOutcome = validateInterview(completeInterview({ outcome: '' }))
  assert.equal(noOutcome.firstStep, 3)
  assert.equal(noOutcome.missing.outcome, true)
  assert.equal(validateInterview(completeInterview({ candidateName: '', outcome: '' })).firstStep, 0, 'HR before Evaluation')
  assert.equal(INTERVIEW_TEXT.errors.incomplete, 'Please fulfil Personal Specification, Competency and Evaluation data to save form')
})

test('interview: status is Incomplete → Complete → Submitted; Submitted is read-only', () => {
  assert.equal(interviewStatus(blankInterview(TODAY), undefined), 'INCOMPLETE')
  assert.equal(interviewStatus(completeInterview(), undefined), 'COMPLETE')
  assert.equal(interviewStatus(completeInterview({ outcome: '' }), 'COMPLETE'), 'INCOMPLETE', 'edits after save are reflected')
  assert.equal(interviewStatus(blankInterview(TODAY), 'SUBMITTED'), 'SUBMITTED')
  assert.deepEqual(interviewDoneSteps(completeInterview({ outcome: 'HOLD' })), [true, true, true, true])
  assert.equal(isInterviewLocked('SUBMITTED'), true)
  assert.equal(isInterviewLocked('COMPLETE'), false)
  assert.equal(blankInterview(TODAY, { payrollDefault: 'IPP BU' }).payroll, 'IPP BU', 'payroll default')
})

test('interview: "Position apply for" comes only from a submitted requisition with that number', () => {
  const submitted = { requisitionNumber: 'PRQ-2026-0001', status: 'SUBMITTED', jobTitle: 'Quality Inspector' }
  assert.equal(linkedPosition('PRQ-2026-0001', submitted), 'Quality Inspector')
  assert.equal(linkedPosition('  prq-2026-0001 ', submitted), 'Quality Inspector', 'case-insensitive, trimmed')
  assert.equal(linkedPosition('PRQ-2026-0002', submitted), '')
  assert.equal(linkedPosition('PRQ-2026-0001', { ...submitted, status: 'DRAFT' }), '')
  assert.equal(linkedPosition('', submitted), '')
  assert.equal(linkedPosition('PRQ-2026-0001', null), '')
  assert.equal(salaryDelta('8400', '7300'), 15)
  assert.equal(salaryDelta('6000', '8000'), -25)
  assert.equal(salaryDelta('', '7300'), null)
})

test('interview: the request body converts numbers and never carries server-assigned values', () => {
  const body = interviewPayload(completeInterview({ candidateAge: '31', expectedBasic: '', interviewers: [' A ', '', 'C'] }))
  assert.equal(body.candidateAge, 31)
  assert.equal(body.expectedBasic, null)
  assert.equal(body.maritalStatusCode, 'SINGLE')
  assert.deepEqual(body.interviewers, ['A', '', 'C'])
  assert.equal(body.personalSpecification.conf.rating, 4)
  for (const field of ['assessmentNumber', 'status', 'adminManagerName', 'positionTitle']) assert.equal(field in body, false, `${field} is server-assigned`)
  const record = readInterview(createDemoRecords().interviews[0])
  assert.deepEqual(interviewPayload(interviewFormFromRecord(record)).personalSpecification, record.personalSpecification)
})

// ------------------------------------------------------------ offer rules

test('offer: Arabic fills itself from English (amounts, dates, quick picks, probation default)', () => {
  assert.equal(autoArabic('basic', '4500'), '٤٬٥٠٠ ريال سعودي شهرياً')
  assert.equal(autoArabic('housing', '1,500'), '١٬٥٠٠ ريال سعودي شهرياً')
  assert.equal(autoArabic('housing', 'Company accommodation'), '', 'amount rows auto-fill amounts only; the quick pick sets both languages')
  assert.equal(autoArabic('transport', 'about 500'), '', 'not an amount and not a quick pick')
  assert.equal(autoArabic('vacation', '30 days per year'), '٣٠ يوماً في السنة')
  assert.equal(autoArabic('medical', 'Something else'), '')
  assert.match(autoArabic('start', '2026-12-01'), /ديسمبر (2026|٢٠٢٦)/, 'Arabic month; digits depend on the runtime locale data')
  assert.equal(autoArabic('probation', DEMO_LOOKUPS.offer.probation.en, { probation: DEMO_LOOKUPS.offer.probation }), DEMO_LOOKUPS.offer.probation.ar)
  assert.equal(autoArabic('basic', ''), '')
  assert.equal(englishDisplay('basic', '4500'), 'SAR 4,500 per month')
  assert.equal(englishDisplay('housing', 'Company accommodation'), 'Company accommodation')
  assert.equal(englishDisplay('start', '2026-12-01'), '01 Dec 2026')
})

test('offer: monthly package = basic + housing + transport, yearly = × 12', () => {
  const benefits = { basic: { en: '6,000' }, housing: { en: '1500' }, transport: { en: 'Company transport' } }
  assert.deepEqual(monthlyPackage(benefits), { parts: [6000, 1500, 0], monthly: 7500, yearly: 90000 })
  assert.deepEqual(monthlyPackage({ basic: { en: '' }, housing: { en: '' }, transport: { en: '' } }), { parts: [0, 0, 0], monthly: 0, yearly: 0 })
  const arcs = packageArcs([6000, 1500, 0], 100, 0)
  assert.deepEqual(arcs.map((arc) => arc.length), [80, 20, 0])
  assert.deepEqual(arcs.map((arc) => arc.offset), [-0, -80, -100])
  assert.deepEqual(packageArcs([0, 0, 0], 100).map((arc) => arc.length), [0, 0, 0])
  assert.equal(toAmount('4,500.50'), 4500.5)
  assert.equal(toAmount('-5'), null)
})

test('offer: issuing needs position, candidate name, basic salary and starting date', () => {
  const blank = validateOffer(blankOffer(TODAY, offerLookups))
  assert.deepEqual(Object.keys(blank.errors), ['position', 'candidateNameEn', 'basic', 'start'])
  assert.equal(blank.firstStep, 0)
  const noBasic = completeOffer()
  noBasic.benefits.basic = { en: '', ar: '', linked: true }
  assert.equal(validateOffer(noBasic).firstStep, 1)
  const noStart = completeOffer()
  noStart.benefits.start = { en: '', ar: '', linked: true }
  assert.equal(validateOffer(noStart).firstStep, 2)
  assert.equal(validateOffer(completeOffer()).valid, true)
})

test('offer: defaults, sign-off, issue status and the read-only issued state', () => {
  const blank = blankOffer(TODAY, offerLookups)
  assert.equal(blank.reportFormat, 'FPP BU')
  assert.deepEqual(blank.benefits.probation, { en: '3 months with the possibility to be extend to 6 Months.', ar: 'ثلاثة أشهر مع قابلية تمديدها إلى ستة أشهر.', linked: true })
  assert.equal(blank.salutation, 'MR')
  const signed = completeOffer()
  signed.signatures = { hrManager: '2026-10-27T08:00:00Z', generalManager: '2026-10-27T08:05:00Z', applicant: null }
  assert.equal(offerDoneSteps(signed)[3], true)
  assert.equal(offerDoneSteps(completeOffer())[3], false)
  assert.equal(issuedStatus(signed.signatures), 'ISSUED')
  assert.equal(issuedStatus({ ...signed.signatures, applicant: '2026-10-27T09:00:00Z' }), 'ACCEPTED')
  assert.deepEqual(['DRAFT', 'ISSUED', 'ACCEPTED'].map(isOfferLocked), [false, true, true])
  const record = readOffer(createDemoRecords().offers[0])
  const body = offerPayload(offerFormFromRecord(record))
  assert.deepEqual(body.benefits.basic, { en: '6000', ar: '٦٬٠٠٠ ريال سعودي شهرياً', autoArabic: true })
  for (const field of ['offerNumber', 'status', 'currency']) assert.equal(field in body, false, `${field} is server-assigned`)
})

// ------------------------------------------------------------ dates (KSA business time)

test('business dates use KSA time, not the browser time zone', () => {
  assert.equal(businessToday(new Date('2026-10-26T21:30:00Z')), '2026-10-27', '00:30 in Riyadh')
  assert.equal(businessToday(new Date('2026-10-26T20:30:00Z')), '2026-10-26', '23:30 in Riyadh')
  assert.equal(daysBetween('2026-10-27', '2026-11-26'), 30)
  assert.equal(daysBetween('2026-10-27', 'x'), null)
})

// ------------------------------------------------------------ contract

test('contracts accept the documented shapes and reject malformed responses', () => {
  const lookups = readLookups(DEMO_LOOKUPS)
  assert.equal(lookups.offer.currency, 'SAR')
  assert.deepEqual(lookups.offer.signatories.map((s) => [s.role, s.name, s.title]), [
    ['HR_MANAGER', 'Saad AL Essa', 'HR Manager'], ['GENERAL_MANAGER', 'Bader Alsulaim', 'General Manager'],
  ])
  assert.ok(Object.isFrozen(lookups) && Object.isFrozen(lookups.departments[0]))
  const records = createDemoRecords()
  assert.equal(readRequisition(records.requisitions[0]).requisitionNumber, 'PRQ-2026-0001')
  assert.equal(readInterview(records.interviews[0]).outcome, 'PASSED')
  assert.equal(readOffer(records.offers[0]).status, 'DRAFT')
  const rejects = (fn) => assert.throws(fn, (error) => error.code === 'INVALID_RESPONSE')
  rejects(() => readRequisition({ ...records.requisitions[0], requisitionId: 12 }))
  rejects(() => readRequisition({ ...records.requisitions[0], status: 'APPROVED' }))
  rejects(() => readRequisition({ ...records.requisitions[0], neededDate: '01/12/2026' }))
  rejects(() => readRequisition({ ...records.requisitions[0], budgetedSalary: -1 }))
  rejects(() => readInterview({ ...records.interviews[0], personalSpecification: { ...records.interviews[0].personalSpecification, conf: { rating: 6, remark: '' } } }))
  rejects(() => readInterview({ ...records.interviews[0], interviewers: ['a'] }))
  rejects(() => readOffer({ ...records.offers[0], currency: 'riyal' }))
  rejects(() => readOffer({ ...records.offers[0], benefits: { basic: records.offers[0].benefits.basic } }))
  rejects(() => readLookups({ ...DEMO_LOOKUPS, offer: { ...DEMO_LOOKUPS.offer, signatories: [] } }))
  rejects(() => readPage({ data: [], pagination: null }, readRequisitionListItem))
  const unknown = readRequisition({ ...records.requisitions[0], secret: 'x' })
  assert.equal('secret' in unknown, false, 'unknown fields are dropped')
})

// ------------------------------------------------------------ services over the shared API client

const page = (items) => ({ page: 1, limit: 10, total: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false })
function setup(responder) {
  const { fetchImpl, calls } = recordingFetch(responder)
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore })
  return { services: createHrRecruitmentServices({ client }), calls }
}
const body = (call) => (call.init.body === undefined ? undefined : JSON.parse(call.init.body))
const csrf = (call) => call.init.headers.get('X-CSRF-Token')

test('services send the documented method, path, query and body, with CSRF on changes', async () => {
  const records = createDemoRecords()
  const requisition = records.requisitions[1]
  const { services, calls } = setup((url, init) => {
    if (url.endsWith('/lookups')) return success(DEMO_LOOKUPS)
    if (init.method === 'GET' && url.includes('/requisitions?')) return success([records.requisitions[0]].map((item) => item), 200, { pagination: page([1]) })
    if (url.includes('/submit')) return success({ ...requisition, status: 'SUBMITTED', requisitionNumber: 'PRQ-2026-0002' })
    return success(requisition, init.method === 'POST' ? 201 : 200)
  })
  await services.lookups.get()
  await services.requisitions.list({ page: 2, limit: 10 })
  await services.requisitions.findSubmitted(' PRQ-2026-0001 ')
  await services.requisitions.saveDraft(null, { jobTitle: 'X' })
  await services.requisitions.saveDraft('2', { jobTitle: 'Y' })
  const submitted = await services.requisitions.submit('2')
  assert.equal(submitted.status, 'SUBMITTED')
  assert.deepEqual(calls.map((call) => `${call.init.method} ${call.url}`), [
    'GET /api/v1/hr/recruitment/lookups',
    'GET /api/v1/hr/recruitment/requisitions?page=2&limit=10',
    'GET /api/v1/hr/recruitment/requisitions?number=PRQ-2026-0001&status=SUBMITTED&page=1&limit=1',
    'POST /api/v1/hr/recruitment/requisitions',
    'PUT /api/v1/hr/recruitment/requisitions/2',
    'POST /api/v1/hr/recruitment/requisitions/2/submit',
  ])
  assert.deepEqual(body(calls[3]), { jobTitle: 'X' })
  assert.deepEqual(body(calls[5]), {})
  assert.equal(csrf(calls[0]), null, 'no CSRF header on reads')
  assert.ok(calls.slice(3).every((call) => csrf(call) === SESSION_TOKEN), 'CSRF header on every change')
})

test('interview and offer services use their own paths; invalid ids never reach the network', async () => {
  const records = createDemoRecords()
  const { services, calls } = setup((url) => (url.includes('employment-offers') ? success({ ...records.offers[0], status: 'ISSUED', offerNumber: 'OFR-2026-0001' }) : success(records.interviews[0])))
  await services.interviews.getById('1')
  await services.interviews.save('1', {})
  await services.interviews.submit('1')
  const issued = await services.offers.issue('1')
  assert.equal(issued.offerNumber, 'OFR-2026-0001')
  assert.deepEqual(calls.map((call) => `${call.init.method} ${call.url}`), [
    'GET /api/v1/hr/recruitment/interview-assessments/1',
    'PUT /api/v1/hr/recruitment/interview-assessments/1',
    'POST /api/v1/hr/recruitment/interview-assessments/1/submit',
    'POST /api/v1/hr/recruitment/employment-offers/1/issue',
  ])
  for (const id of ['', '0', '1/2', '../x', 7]) {
    await assert.rejects(services.offers.getById(id), (error) => error.code === 'INVALID_ID')
  }
  assert.equal(calls.length, 4)
  assert.equal(await services.requisitions.findSubmitted('   '), null, 'no request for an empty number')
  assert.equal(calls.length, 4)
})

test('service failures surface as ApiError: 404, 409, 422 details, and malformed success bodies', async () => {
  const { services } = setup((url) => {
    if (url.endsWith('/1')) return failure(404, 'NOT_FOUND', 'The record was not found.')
    if (url.endsWith('/2')) return failure(409, 'CONFLICT', 'Read-only.')
    if (url.endsWith('/3/submit')) return failure(422, 'VALIDATION_ERROR', 'Incomplete.', { details: [{ field: 'skills', message: 'skills is required' }] })
    return success({ requisitionId: 'bad' })
  })
  await assert.rejects(services.requisitions.getById('1'), (error) => error.status === 404)
  await assert.rejects(services.requisitions.saveDraft('2', {}), (error) => error.status === 409 && error.code === 'CONFLICT')
  await assert.rejects(services.requisitions.submit('3'), (error) => error.status === 422 && error.details[0].field === 'skills')
  await assert.rejects(services.requisitions.getById('4'), (error) => error.code === 'INVALID_RESPONSE')
})

// ------------------------------------------------------------ data-source flag

test('the demo flag: explicit true/false wins; unset means demo only in development builds', () => {
  assert.equal(resolveDemoMode({ VITE_HR_RECRUITMENT_DEMO: 'true' }), true)
  assert.equal(resolveDemoMode({ VITE_HR_RECRUITMENT_DEMO: 'true', DEV: false }), true)
  assert.equal(resolveDemoMode({ VITE_HR_RECRUITMENT_DEMO: 'false', DEV: true }), false)
  assert.equal(resolveDemoMode({ DEV: true }), true)
  assert.equal(resolveDemoMode({ DEV: false }), false)
  assert.equal(resolveDemoMode({}), false, 'plain Node / unknown build: the real API')
  assert.equal(resolveDemoMode({ VITE_HR_RECRUITMENT_DEMO: 'yes', DEV: false }), false, 'only the exact value "true" enables demo data')
  const api = { name: 'api' }
  const demo = { name: 'demo' }
  assert.equal(selectClient({ demo: false, api, createDemo: () => demo }), api)
  assert.equal(selectClient({ demo: true, api, createDemo: () => demo }), demo)
})

// ------------------------------------------------------------ demo adapter

const demoServices = (options = {}) => createHrRecruitmentServices({ client: createDemoClient({ latencyMs: 0, now: () => new Date('2026-10-27T08:00:00Z'), ...options }) })

test('demo adapter: same contracts, server-assigned numbers, statuses, requester and admin manager', async () => {
  const restore = forbidBrowserStorage()
  try {
    const services = demoServices()
    const draft = await services.requisitions.saveDraft(null, requisitionPayload(completeRequisition({ budgeted: 'no', budgetedSalary: '' })))
    assert.deepEqual([draft.requisitionNumber, draft.status, draft.requesterName, draft.requestDate], [null, 'DRAFT', 'Demo Requester', TODAY])
    const submitted = await services.requisitions.submit(draft.requisitionId)
    assert.deepEqual([submitted.requisitionNumber, submitted.status], ['PRQ-2026-0002', 'SUBMITTED'], 'next number after the seeded PRQ-2026-0001')
    const assessment = await services.interviews.save(null, interviewPayload(completeInterview({ requisitionNumber: 'prq-2026-0002' })))
    assert.deepEqual([assessment.assessmentNumber, assessment.status, assessment.positionTitle, assessment.adminManagerName], ['IA-2026-0002', 'COMPLETE', 'Quality Inspector', 'Demo Admin Manager'])
    const offer = await services.offers.saveDraft(null, offerPayload(completeOffer()))
    assert.deepEqual([offer.offerNumber, offer.status, offer.currency], [null, 'DRAFT', 'SAR'])
    const issued = await services.offers.issue(offer.offerId)
    assert.deepEqual([issued.offerNumber, issued.status], ['OFR-2026-0001', 'ISSUED'])
  } finally {
    restore()
  }
})

test('demo adapter: error paths are real (404, 409 read-only, 422 incomplete, 405) and lists paginate', async () => {
  const services = demoServices()
  await assert.rejects(services.requisitions.getById('999'), (error) => error.status === 404 && error.code === 'NOT_FOUND')
  await assert.rejects(services.requisitions.saveDraft('1', {}), (error) => error.status === 409, 'PRQ-2026-0001 is submitted')
  await assert.rejects(services.requisitions.submit('2'), (error) => error.status === 422 && error.details.some((detail) => detail.field === 'workExperienceCode'))
  await assert.rejects(services.interviews.save(null, interviewPayload(completeInterview({ outcome: '' }))),
    (error) => error.status === 422 && error.message === INTERVIEW_TEXT.errors.incomplete)
  const issued = await services.offers.issue((await services.offers.saveDraft(null, offerPayload(completeOffer()))).offerId)
  await assert.rejects(services.offers.saveDraft(issued.offerId, offerPayload(completeOffer())), (error) => error.status === 409)
  await assert.rejects(services.offers.issue('1'), (error) => error.status === 422 && error.details.some((detail) => detail.field === 'benefits.start'))
  await assert.rejects(services.offers.issue('99'), (error) => error.status === 404)
  const client = createDemoClient({ latencyMs: 0 })
  await assert.rejects(client.put('/hr/recruitment/requisitions'), (error) => error.status === 405)
  await assert.rejects(client.get('/hr/recruitment/unknown'), (error) => error.status === 404)
  const firstPage = await services.requisitions.list({ page: 1, limit: 1 })
  assert.deepEqual(firstPage.pagination, { page: 1, limit: 1, total: 2, totalPages: 2, hasNextPage: true, hasPreviousPage: false })
  assert.equal(firstPage.items[0].requisitionId, '2', 'most recently updated first')
  assert.equal((await services.requisitions.findSubmitted('PRQ-2026-0002')), null, 'drafts are never linked')
})

test('demo adapter: an accepted offer when the applicant signed first; records stay isolated per adapter', async () => {
  const services = demoServices()
  const form = completeOffer()
  form.signatures = { hrManager: '2026-10-27T08:00:00Z', generalManager: '2026-10-27T08:00:00Z', applicant: '2026-10-27T08:00:00Z' }
  const offer = await services.offers.saveDraft(null, offerPayload(form))
  assert.equal((await services.offers.issue(offer.offerId)).status, 'ACCEPTED')
  const other = demoServices()
  assert.equal((await other.offers.list()).pagination.total, 1, 'a new adapter starts from the seed again')
  const record = await services.offers.getById(offer.offerId)
  assert.throws(() => { record.position = 'x' }, TypeError, 'records are frozen')
})

test('demo adapter: waits like a network call and honours cancellation', async () => {
  const client = createDemoClient({ latencyMs: 50 })
  const started = Date.now()
  await client.get('/hr/recruitment/lookups')
  assert.ok(Date.now() - started >= 40, 'responses arrive after the simulated delay')
  const controller = new AbortController()
  const pending = client.get('/hr/recruitment/lookups', { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, (error) => error.code === 'ABORTED')
})

test('the full flow on demo data: requisition → interview → offer', async () => {
  const services = demoServices()
  const requisition = await services.requisitions.submit((await services.requisitions.saveDraft(null, requisitionPayload(completeRequisition({ jobTitle: 'Store Keeper' })))).requisitionId)
  const linked = await services.requisitions.findSubmitted(requisition.requisitionNumber.toLowerCase())
  assert.equal(linkedPosition(requisition.requisitionNumber, linked), 'Store Keeper')
  const saved = await services.interviews.save(null, interviewPayload(completeInterview({ requisitionNumber: requisition.requisitionNumber })))
  const assessment = await services.interviews.submit(saved.assessmentId)
  assert.equal(assessment.status, 'SUBMITTED')
  assert.equal(isInterviewLocked(assessment.status), true)
  await assert.rejects(services.interviews.save(assessment.assessmentId, interviewPayload(completeInterview())), (error) => error.status === 409)
  const form = completeOffer()
  form.position = assessment.positionTitle
  const offer = await services.offers.issue((await services.offers.saveDraft(null, offerPayload(form))).offerId)
  assert.equal(offer.position, 'Store Keeper')
  assert.equal(isOfferLocked(offer.status), true)
})

// ------------------------------------------------------------ navigation

test('HR recruitment routes: session-only, record pages hidden, reachable by every signed-in user', () => {
  const module = registeredModules.find((item) => item.code === 'HR_RECRUITMENT')
  assert.equal(module.rbac, false)
  const hr = appRoutes.filter((route) => route.section === 'human-resources')
  assert.deepEqual(hr.map((route) => [route.id, route.path, route.nav !== false]), [
    ['hr-requisition', '/hr/recruitment/requisition', true],
    ['hr-requisition-record', '/hr/recruitment/requisition/:requisitionId', false],
    ['hr-interview', '/hr/recruitment/interview', true],
    ['hr-interview-record', '/hr/recruitment/interview/:assessmentId', false],
    ['hr-offer', '/hr/recruitment/offer', true],
    ['hr-offer-record', '/hr/recruitment/offer/:offerId', false],
  ])
  const employee = { status: 'ready', mfaVerified: false, has: () => false }
  for (const route of hr) {
    assert.equal(route.permission, undefined)
    assert.equal(canAccessRoute(route, employee), true, route.id)
    assert.equal(routeAccess(route, { status: 'loading' }), 'allowed', 'session-only pages do not wait for permissions')
  }
  assert.equal(findAppRoute('/hr/recruitment/interview/12')?.id, 'hr-interview-record')
  assert.equal(findAppRoute('/hr/recruitment/offer')?.id, 'hr-offer')
  const palette = paletteCommands(employee, 'authenticated').map((command) => command.id)
  assert.ok(['hr-requisition', 'hr-interview', 'hr-offer'].every((id) => palette.includes(id)))
  assert.ok(!palette.some((id) => id.endsWith('-record')), 'record pages are not searchable')
  assert.ok(Object.values(HR_RECRUITMENT_ACTIONS).every((key) => /^HR_RECRUITMENT\.(PERSONNEL_REQUISITIONS|INTERVIEW_ASSESSMENTS|EMPLOYMENT_OFFERS):(VIEW|CREATE|UPDATE|SUBMIT|ISSUE|PRINT)$/.test(key)))
})

// ------------------------------------------------------------ static checks (JSX and CSS)

async function featureFiles(dir = new URL(FEATURE, import.meta.url)) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
    if (entry.isDirectory()) files.push(...await featureFiles(url))
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(url)
  }
  return files
}

test('the feature uses no browser storage, console, client-made numbers or inner HTML; demo code stays in demo/', async () => {
  for (const file of await featureFiles()) {
    const source = await readFile(file, 'utf8')
    const name = file.pathname.split('/hr-recruitment/')[1]
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'dangerouslySetInnerHTML', 'makeNumber', 'Math.random']) {
      assert.equal(source.includes(forbidden), false, `${name} uses ${forbidden}`)
    }
    assert.equal(/(?<![\w.])console\s*\??\.\s*\w+/.test(source), false, `${name} logs to the console`)
    if (!name.startsWith('demo/') && name !== 'hrRecruitmentService.js') {
      assert.equal(/demo\/demo(Client|Data)/.test(source), false, `${name} imports demo code directly`)
    }
  }
  const service = await read(`${FEATURE}hrRecruitmentService.js`)
  assert.match(service, /selectClient\(\{ demo: hrRecruitmentConfig\.demo \}\)/, 'one switch selects the data source')
})

test('pages: demo indicator, FlowNav, toolbar actions and the shared building blocks', async () => {
  const shell = await read(`${FEATURE}shared/components/RecruitmentShell.jsx`)
  assert.match(shell, /\{hrRecruitmentDemo && <span title=\{COMMON_TEXT\.demoNote\}><Badge tone="warn">\{COMMON_TEXT\.demoBadge\}<\/Badge><\/span>\}/)
  assert.match(shell, /<Link key=\{item\.id\} to=\{item\.path\}[^>]*aria-current=\{on \? 'page' : undefined\}/)
  assert.match(shell, /aria-current=\{index === step \? 'step' : undefined\}/)
  assert.match(shell, /role="toolbar"/)
  assert.match(shell, /<fieldset disabled=\{locked\}/, 'submitted and issued records are read-only')
  assert.match(shell, /\[aria-invalid="true"\]/, 'failed validation focuses the first invalid field')
  const pages = { requisition: 'requisition/RequisitionPage.jsx', interview: 'interview/InterviewPage.jsx', offer: 'offer/OfferPage.jsx' }
  for (const [name, path] of Object.entries(pages)) {
    const source = await read(`${FEATURE}${path}`)
    for (const label of ['COMMON_TEXT.save', 'COMMON_TEXT.print', 'COMMON_TEXT.report', 'COMMON_TEXT.requestForm', 'COMMON_TEXT.home']) {
      assert.ok(source.includes(`label: ${label}`), `${name}: ${label}`)
    }
    assert.match(source, /navigate\('\/dashboard'\)/, `${name}: Home opens the dashboard`)
    assert.match(source, /window\.print\(\)/)
    assert.match(source, /<ReportDialog /)
    assert.match(source, /editor\.dirty \? setDialog\('new'\) : startNew\(\)/, `${name}: confirms before clearing unsaved answers`)
    assert.match(source, /useRecruitmentForm\(/)
    assert.match(source, /<ConfirmDialog /)
  }
  assert.match(await read(`${FEATURE}${pages.interview}`), /label: COMMON_TEXT\.submit, onClick: requestSubmit/)
  assert.match(await read(`${FEATURE}${pages.offer}`), /primary=\{\{ label: T\.primary, icon: 'send', onClick: requestIssue \}\}/)
  const form = await read(`${FEATURE}shared/useRecruitmentForm.js`)
  assert.match(form, /useAdminAction\(\)/, 'one change at a time, never auto-retried')
  assert.match(form, /state: \{ step, notice: outcomeFeedback\(outcome, message\) \}/, 'navigation state carries no record data')
})

test('requisition page: conditional fields and the lead-time chip', async () => {
  const source = await read(`${FEATURE}requisition/RequisitionPage.jsx`)
  assert.match(source, /\{form\.reason === 'REPLACEMENT' && \(\s*<div className="zrv-hr-reveal zrv-hr-mt">\s*<HrField id="rq-rep"/)
  assert.match(source, /\{form\.reason === 'ADDITION' && \(\s*<div className="zrv-hr-reveal zrv-hr-mt">\s*<HrField id="rq-add"/)
  assert.match(source, /\{form\.budgeted === 'yes' && \(\s*<div className="zrv-hr-reveal">\s*<HrField id="rq-bud"/)
  assert.match(source, /<input id="rq-basic" className="ux-input zrv-hr-input" readOnly/, 'basic salary is filled by HR')
  assert.match(source, /hint=\{lead && <Pill tone=\{lead\.tone \|\| 'ok'\}>\{lead\.text\}<\/Pill>\}/)
  assert.match(source, /\{attachmentsSupported && <><FileDrop /, 'attachments only where supported (demo)')
})

test('interview page: rating groups are keyboard radio groups; totals and bands follow the ratings', async () => {
  const scores = await read(`${FEATURE}interview/Scores.jsx`)
  assert.match(scores, /role="radiogroup" aria-labelledby=\{labelId\} aria-required="true" aria-invalid=\{bad \|\| undefined\}/)
  assert.match(scores, /<input type="radio" name=\{`ia-\$\{group\}-\$\{key\}`\}/)
  assert.match(scores, /aria-label=\{T\.rating\.remarkFor\(label\)\}/)
  assert.match(scores, /<b aria-live="polite">\{total\}<\/b>/)
  const page = await read(`${FEATURE}interview/InterviewPage.jsx`)
  assert.match(page, /editor\.reject\(result\.firstStep, T\.errors\.incomplete/)
  assert.match(page, /const position = linkedTitle \|\|/)
  assert.match(page, /<input \{\.\.\.fieldProps\('ia-pos', \{ hint: linkChip \}\)\} className="ux-input zrv-hr-input" readOnly value=\{position\}/)
  assert.match(page, /<input id="ia-adm" className="ux-input zrv-hr-input" readOnly value=\{record\?\.adminManagerName \?\? ''\}/)
})

test('offer page: Arabic renders right-to-left, AUTO/MANUAL toggle, print outputs the letter only', async () => {
  const page = await read(`${FEATURE}offer/OfferPage.jsx`)
  assert.match(page, /<div className="zrv-hr-pair__in" dir="rtl">/)
  assert.match(page, /<input id=\{`of-\$\{key\}-ar`\} className="ux-input zrv-hr-input" dir="rtl" lang="ar"/)
  assert.match(page, /aria-pressed=\{row\.linked\}/)
  assert.match(page, /onChange=\{\(event\) => setRow\(key, \{ ar: event\.target\.value, linked: false \}\)\}/, 'editing Arabic switches to MANUAL')
  assert.match(page, /setRow\(key, row\.linked \? \{ en: value, ar: auto\(key, value\) \} : \{ en: value \}\)/, 'AUTO fills Arabic from English')
  const arabicLines = page.split('\n').filter((line) => line.includes('data-l="ar"'))
  assert.ok(arabicLines.length >= 6 && arabicLines.every((line) => line.includes('dir="rtl"')), 'every Arabic letter line is RTL')
  const css = await read('../src/styles/hr-recruitment.css')
  assert.match(css, /\.zrv-hr--offer \.zrv-hr-paper, \.zrv-hr--offer \.zrv-hr-paper \* \{ visibility: visible; \}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('styles are scoped to the feature and use theme tokens', async () => {
  const css = await read('../src/styles/hr-recruitment.css')
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = [...withoutComments.matchAll(/(^|})\s*([^{}@]+)\{/g)].map((match) => match[2].trim())
    .filter((selector) => selector && !/^(from|to|\d+%)/.test(selector))
  assert.ok(selectors.length > 100)
  for (const selector of selectors) {
    // Split selector lists on top-level commas only (not inside :is()/:has()).
    for (const part of selector.split(/,(?![^(]*\))/).map((item) => item.trim())) {
      assert.match(part, /^(\.zrv-hr|body:has\(\.zrv-hr\))/, `unscoped selector: ${part}`)
    }
  }
  assert.equal(/(?<![\w-])\.is-[a-z]/.test(withoutComments), false, 'no global is-* modifiers (Orvexa defines some)')
  // Fixed colours only for the letter preview (printed paper) and the dark-ink mixes of the preview cards.
  const allowed = new Set(['#fffef9', '#1d2a24', '#0d4a38', '#56705f', '#e4ece6', '#03110c', '#020b08', '#f4fff9'])
  for (const colour of withoutComments.match(/#[0-9a-fA-F]{3,8}\b/g) || []) assert.ok(allowed.has(colour.toLowerCase()), `hard-coded colour ${colour}`)
})
