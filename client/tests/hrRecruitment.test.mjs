// HR forms use the existing authenticated backend contracts. These tests cover
// frontend field mapping and permissions without Oracle, browser storage or demo records.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { apiClient } from '../src/services/api/apiClient.js'
import { registeredModules, registry } from '../src/config/registry/index.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../src/features/hr-recruitment/hrRecruitmentActions.js'
import { hrRecruitmentServices, createHrRecruitmentServices, segment } from '../src/features/hr-recruitment/hrRecruitmentService.js'
import { blankRequisition, requisitionPayload, requisitionProgress } from '../src/features/hr-recruitment/requisition/requisitionModel.js'
import { blankInterview, interviewPayload, validateInterview, SPEC_KEYS, COMP_KEYS } from '../src/features/hr-recruitment/interview/interviewModel.js'
import { blankOffer, offerPayload, validateOffer, BENEFIT_KEYS } from '../src/features/hr-recruitment/offer/offerModel.js'

const TODAY = '2026-10-28'
const rated = (keys) => Object.fromEntries(keys.map((key) => [key, { rating: 4, remark: '' }]))

test('the active registry grants HR routes only through the backend form resources', () => {
  assert.deepEqual(registeredModules.map((module) => module.code), [
    'COMMON', 'SECURITY_ADMINISTRATION', 'REQUISITIONS', 'INTERVIEW_ASSESSMENTS', 'EMPLOYMENT_OFFERS',
    // Backend-owned probation, orientation and employee report permissions.
    'HR',
    // Session-only employee services behind VITE_FEATURE_HR_EMPLOYEE_SERVICES (hrEmployeeServices.test.mjs).
    'HR_EMPLOYEE_SERVICES',
  ])
  for (const key of Object.values(ACTIONS)) assert.ok(registry.permissions.some((permission) => permission.key === key), key)
  assert.equal(hrRecruitmentServices.client, apiClient)
  assert.equal(hrRecruitmentServices.requisitions.client, undefined)
})

test('requisition starts blank with today as needed date and maps answers to backend names', () => {
  const blank = blankRequisition(TODAY)
  assert.equal(blank.requestDate, TODAY)
  assert.equal(blank.neededDate, TODAY)
  assert.equal(blank.requesterName, '')
  assert.equal(requisitionProgress(blank).missing.length > 0, true)
  const payload = requisitionPayload({
    ...blank, jobId: '12', jobTitle: ' Inspector ', departmentId: '4', departmentName: ' Quality ',
    reason: 'REPLACEMENT', replacementFor: 'Employee A', additionReason: 'ignored', budgeted: 'no',
    budgetedSalary: '9000', skills: ' SPC ', otherRequirements: '', remark: '', totalPackage: '',
    highSchool: 'no', diploma: 'yes', higherDiploma: 'no', degree: 'no', masterDegree: 'no',
    gccExp: '2 - 5', workExp: '5 - 10', ticketStatusChanged: false,
  })
  assert.deepEqual(payload, {
    jobId: '12', jobName: 'Inspector', deptId: '4', deptName: 'Quality', dateNeeded: TODAY,
    reasonOfReq: 'Replacement', replacementFor: 'Employee A', reason: '', budgeted: 'N', budgetedSal: '',
    highSchool: 'N', diploma: 'Y', higherDiploma: 'N', degree: 'N', masterDegree: 'N',
    gccExp: '2 - 5', workExp: '5 - 10', skills: 'SPC', other: '', remark: '', totalPackage: '',
  })
})

test('interview payload keeps API field names, scores and required assessment answers', () => {
  const form = {
    ...blankInterview(TODAY), requisitionNumber: 'PR-100', preScreeningDate: TODAY,
    divisionCode: 'Food', interviewTypeCode: 'Personal', candidateName: 'Candidate',
    payroll: '300000003618177', spec: rated(SPEC_KEYS), comp: rated(COMP_KEYS), outcome: 'PASSED',
  }
  assert.equal(validateInterview(form).valid, true)
  const payload = interviewPayload(form)
  assert.equal(payload.requisitionNumber, 'PR-100')
  assert.equal(payload.preScreeningDate, TODAY)
  assert.equal(payload.personalSpecification.conf.rating, 4)
  assert.equal(payload.competency.jrk.rating, 4)
  assert.equal(payload.outcome, 'PASSED')
  assert.equal('assessmentNumber' in payload, false)
  assert.equal(validateInterview(blankInterview(TODAY)).valid, false)
})

test('employment offer starts empty, validates API-required values and serializes bilingual benefits', () => {
  const blank = blankOffer(TODAY)
  assert.equal(blank.offerDate, TODAY)
  assert.deepEqual(Object.keys(blank.benefits).sort(), [...BENEFIT_KEYS].sort())
  assert.equal(validateOffer(blank).valid, false)
  const payload = offerPayload({
    ...blank, position: ' Inspector ', candidateNameEn: ' Candidate ', division: '300000003618177', intNo: 'INT-1',
    benefits: { ...blank.benefits, basic: { en: '6000', ar: 'ستة آلاف', linked: true }, start: { en: TODAY, ar: '١٤٤٨', linked: true } },
  })
  assert.equal(payload.position, 'Inspector')
  assert.equal(payload.candidateNameEn, 'Candidate')
  assert.deepEqual(payload.benefits.basic, { en: '6000', ar: 'ستة آلاف', autoArabic: true })
  assert.deepEqual(payload.benefits.start, { en: TODAY, ar: '١٤٤٨', autoArabic: true })
  assert.equal(validateOffer({ ...blank, ...payload }).valid, true)
})

test('all recruitment services use the supplied API client and validate path IDs', async () => {
  const calls = []
  const client = {
    get: async (path, options) => {
      calls.push(['GET', path, options])
      if (path.endsWith('/job-titles')) return { data: [{ jobId: '1', name: 'Inspector' }] }
      if (path.endsWith('/departments')) return { data: [{ deptId: '2', name: 'Quality' }] }
      if (path.endsWith('/requestor')) return { data: { fullName: 'User' } }
      return { data: ['Employee A'] }
    },
  }
  const services = createHrRecruitmentServices({ client })
  assert.equal(services.client, client)
  const lookups = await services.requisitions.getLookups()
  assert.equal(lookups.requester, 'User')
  assert.deepEqual(lookups.jobs, [{ id: '1', name: 'Inspector' }])
  assert.deepEqual(calls.map((call) => call[1]), [
    '/hr/requisitions/lookups/job-titles', '/hr/requisitions/lookups/departments',
    '/hr/requisitions/lookups/requestor', '/hr/requisitions/lookups/replacement-for',
  ])
  assert.throws(() => segment('../1'), (error) => error.code === 'INVALID_ID')
  assert.throws(() => segment('0'), (error) => error.code === 'INVALID_ID')
  assert.equal(segment('1'), '1')
})

test('the three forms show no demo text and keep live API wiring', async () => {
  const shell = await readFile(new URL('../src/features/hr-recruitment/shared/components/RecruitmentShell.jsx', import.meta.url), 'utf8')
  const pages = await Promise.all(['requisition/RequisitionPage.jsx', 'interview/InterviewPage.jsx', 'offer/OfferPage.jsx']
    .map((page) => readFile(new URL(`../src/features/hr-recruitment/${page}`, import.meta.url), 'utf8')))
  const service = await readFile(new URL('../src/features/hr-recruitment/hrRecruitmentService.js', import.meta.url), 'utf8')
  // The header badge is opt-in (onboarding screens on demo data only).
  assert.doesNotMatch(shell, /hrRecruitmentDemo/)
  assert.match(shell, /export function RecruitmentHeader\(\{ title, subtitle, breadcrumb = COMMON_TEXT\.breadcrumb, demo = false \}\)/)
  for (const page of pages) assert.doesNotMatch(page, /hrRecruitmentDemo|demo=/)
  assert.match(service, /client: apiClient, requisitionClient: apiClient, interviewClient: apiClient, offerClient: apiClient/)
  assert.match(service, /const REQUISITIONS_BASE = '\/hr\/requisitions'/)
  assert.match(service, /const INTERVIEWS_BASE = '\/hr\/interview-assessments'/)
  assert.match(service, /const OFFERS_BASE = '\/hr\/employment-offers'/)
})
