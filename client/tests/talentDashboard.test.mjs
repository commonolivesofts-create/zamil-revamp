// Talent Management dashboard (features/hr-talent-management/dashboard): year
// windows, the TrainingHub summaries, the TrainingHub client's sign-in and
// errors, the read-only development proxy, and static checks of the page.
// Mocked data only; no backend, TrainingHub, Oracle or browser is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  GRADE_POLICY,
  overQuota,
  summarizeCatalog,
  summarizeMatrix,
  summarizeTeam,
  yearMonths,
  yearRange,
  yearsUpTo,
} from '../src/features/hr-talent-management/dashboard/talentDashboardModel.js'
import { createTrainingHubClient } from '../src/features/hr-talent-management/dashboard/trainingHubClient.js'
import { TRAINING_HUB_PROXY_PATH, trainingHubProxy } from '../vite.config.js'
import { findAppRoute } from '../src/config/appNavigation.js'

const TODAY = '2026-11-18'
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('years: five selectable years, the current one ending today', () => {
  assert.deepEqual(yearsUpTo(TODAY), [2026, 2025, 2024, 2023, 2022])
  assert.deepEqual(yearRange(2026, TODAY), { from: '2026-01-01', to: TODAY })
  assert.deepEqual(yearRange(2025, TODAY), { from: '2025-01-01', to: '2025-12-31' })
  const current = yearMonths(2026, TODAY)
  assert.equal(current.length, 11, 'January to November')
  assert.deepEqual([current[0].from, current.at(-1).to], ['2026-01-01', '2026-11-30'])
  const past = yearMonths(2025, TODAY)
  assert.equal(past.length, 12)
  assert.deepEqual([past[0].from, past.at(-1).to], ['2025-01-01', '2025-12-31'])
  assert.equal(
    Object.values(GRADE_POLICY).reduce((a, b) => a + b, 0),
    100,
    'the policy shares add up',
  )
})

test('appraisal calibration: grades given above their quota', () => {
  const target = { A: 1, B: 2, C: 3, D: 1, E: 1 }
  assert.deepEqual(overQuota({ target, allocated: { A: 2, B: 2, C: 1, D: 0, E: 2 } }), ['A', 'E'])
  assert.deepEqual(overQuota({ target, allocated: target }), [])
  assert.equal(overQuota(undefined), undefined, 'still loading')
})

test('Job Skills Matrix summary: profile status and depth', () => {
  const summary = summarizeMatrix({
    positions: [
      { id: 1, status: 'APPROVED' },
      { id: 2, status: 'PENDING' },
      { id: 3, status: 'DRAFT' },
      { id: 4, status: 'RETURNED' },
    ],
    cells: {
      1: { 10: { requirement: 'R', critical: true }, 11: { requirement: 'O', critical: false } },
      2: { 10: { requirement: 'R', critical: false } },
    },
  })
  assert.deepEqual(
    { ...summary },
    {
      positions: 4,
      approved: 1,
      pending: 1,
      draft: 1,
      returned: 1,
      profiled: 2,
      skills: 3,
      critical: 1,
      required: 2,
    },
  )
  assert.equal(summarizeMatrix(null).positions, 0, 'an empty or unexpected answer counts nothing')
})

test('catalog summary: upcoming scheduled sessions only, seats and mix', () => {
  const session = (overrides) => ({
    status: 'SCHEDULED',
    startDate: '2026-12-01',
    capacity: 10,
    seatsTaken: 4,
    seatsLeft: 6,
    waitlist: 0,
    hours: 8,
    sessionType: 'INTERNAL',
    deliveryMode: 'IN_PERSON',
    eligibility: { ok: true },
    ...overrides,
  })
  const summary = summarizeCatalog(
    [
      session(),
      session({
        startDate: '2027-02-01',
        seatsTaken: 10,
        seatsLeft: 0,
        waitlist: 3,
        sessionType: 'EXTERNAL',
        deliveryMode: 'ONLINE',
        eligibility: { ok: false },
      }),
      session({ status: 'CANCELLED' }),
      session({ startDate: '2026-11-01' }),
    ],
    TODAY,
  )
  assert.deepEqual(
    { ...summary },
    {
      sessions: 2,
      soon: 1,
      capacity: 20,
      taken: 14,
      left: 6,
      waitlist: 3,
      hours: 16,
      full: 1,
      internal: 1,
      external: 1,
      inPerson: 1,
      online: 1,
      blended: 0,
      eligible: 1,
    },
  )
})

test('team summary: readiness, ready share and critical gaps', () => {
  const summary = summarizeTeam([
    { readiness: 100, gaps: [], lastAssessed: '2026-01-01' },
    { readiness: 60, gaps: [{ critical: true }, { critical: false }], lastAssessed: null },
    { readiness: 80, gaps: [{ critical: false }], lastAssessed: '2026-03-01' },
  ])
  assert.deepEqual(
    { ...summary },
    {
      people: 3,
      readinessPoints: 240,
      readinessMax: 300,
      ready: 2,
      withGaps: 2,
      atRisk: 1,
      gaps: 3,
      criticalGaps: 1,
      neverAssessed: 1,
    },
  )
  assert.equal(summarizeTeam([]).people, 0)
})

const json = (status, body) =>
  new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

test('TrainingHub client: signs in from the Zamil session when needed, read-only otherwise', async () => {
  const calls = []
  const answers = [json(401, { error: { code: 'UNAUTHENTICATED' } }), json(200, { personId: 7 })]
  const hub = createTrainingHubClient({
    base: '/hub',
    fetch: async (url, init) => {
      calls.push([init.method, url, init.credentials, init.headers['X-Requested-With']])
      return answers.shift()
    },
  })
  assert.deepEqual(await hub.connect(), { personId: 7 })
  assert.deepEqual(calls, [
    ['GET', '/hub/me', 'same-origin', 'TrainingHub'],
    ['POST', '/hub/auth/sso', 'same-origin', 'TrainingHub'],
  ])

  const signedIn = createTrainingHubClient({ fetch: async () => json(200, { personId: 1 }) })
  assert.deepEqual(await signedIn.connect(), { personId: 1 }, 'an existing session is reused')
})

test('TrainingHub client: unavailable, signed out and refused areas', async () => {
  const down = createTrainingHubClient({
    fetch: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  await assert.rejects(down.connect(), { code: 'UNAVAILABLE' })

  const gateway = createTrainingHubClient({ fetch: async () => new Response('', { status: 502 }) })
  await assert.rejects(gateway.matrix(), { code: 'UNAVAILABLE', status: 502 })

  const signedOut = createTrainingHubClient({ fetch: async () => json(401, {}) })
  await assert.rejects(signedOut.connect(), { code: 'SIGNED_OUT' }, 'SSO refused too')
  // TrainingHub answers 403 when no Zamil session cookie reached it.
  const noCookie = createTrainingHubClient({
    fetch: async (url) => (url.endsWith('/me') ? json(401, {}) : json(403, {})),
  })
  await assert.rejects(noCookie.connect(), { code: 'SIGNED_OUT', status: 403 })

  const refused = createTrainingHubClient({ fetch: async () => json(403, {}) })
  assert.equal(await refused.team(), null, 'an area the person may not open is left out')

  const urls = []
  const hub = createTrainingHubClient({
    fetch: async (url) => {
      urls.push(url)
      return json(200, [])
    },
  })
  await hub.catalog(TODAY)
  assert.deepEqual(urls, [`/training-hub-api/catalog?from=${TODAY}`])
})

test('the development proxy forwards reads and the SSO sign-in only', () => {
  const proxy = trainingHubProxy('http://127.0.0.1:7383')[TRAINING_HUB_PROXY_PATH]
  assert.equal(TRAINING_HUB_PROXY_PATH, '/training-hub-api')
  assert.equal(proxy.target, 'http://127.0.0.1:7383')
  assert.equal(proxy.changeOrigin, false)
  assert.equal(proxy.rewrite('/training-hub-api/catalog?from=x'), '/api/v1/catalog?from=x')
  const allowed = (method, url) => proxy.bypass({ method, url }) === undefined
  assert.ok(allowed('GET', '/training-hub-api/matrix'))
  assert.ok(allowed('POST', '/training-hub-api/auth/sso'))
  for (const [method, url] of [
    ['POST', '/training-hub-api/requests'],
    ['POST', '/training-hub-api/auth/logout'],
    ['PUT', '/training-hub-api/positions/1'],
    ['DELETE', '/training-hub-api/positions/1'],
  ]) {
    assert.equal(allowed(method, url), false, `${method} ${url}`)
  }
})

test('page: routed and switched with appraisals, every area gated by its own page, TrainingHub failure isolated', async () => {
  const route = findAppRoute('/hr/talent-management/dashboard')
  assert.equal(route.id, 'hr-talent-dashboard')
  assert.equal(route.subgroup, 'hr-talent-management')
  assert.deepEqual(route.enabledBy, { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' })
  const router = await read('app/router.jsx')
  assert.match(router, /path: 'hr\/talent-management\/dashboard'/)
  assert.match(router, /routeId: 'hr-talent-dashboard'/)

  const page = await read('features/hr-talent-management/dashboard/TalentDashboardPage.jsx')
  for (const path of [
    "'/hr/performance/appraisal/report'",
    "'/hr/talent-management/reward-nomination/report'",
  ]) {
    assert.ok(page.includes(path), path)
  }
  for (const id of [
    'training-hub-job-skill-matrix',
    'training-hub-catalog',
    'training-hub-team-skills',
  ]) {
    assert.ok(page.includes(`'${id}'`), id)
  }
  assert.match(page, /canAccessRoute\(findAppRoute\(path\), permissions\)/)
  assert.match(page, /useResource\(key\('hub', usesHub\)/, 'one TrainingHub load, only when used')
  assert.match(page, /hubFailed/, 'a TrainingHub failure leaves the Zamil figures')
  assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB/)
  const client = await read('features/hr-talent-management/dashboard/trainingHubClient.js')
  assert.doesNotMatch(client, /document\.cookie|localStorage|sessionStorage/)
})

// ---------- KPI scorecard (talentKpis.js)

import {
  TARGETS,
  bestMonth,
  buildScorecard,
  calibration,
  momentum,
  statusOf,
  talentIndex,
} from '../src/features/hr-talent-management/dashboard/talentKpis.js'

test('KPI status against target: good, watch within 10 points, act beyond', () => {
  assert.equal(statusOf(92, 90), 'good')
  assert.equal(statusOf(84, 90), 'watch')
  assert.equal(statusOf(70, 90), 'act')
  assert.equal(statusOf(15, 20, 'down'), 'good', 'lower is better')
  assert.equal(statusOf(35, 20, 'down'), 'act')
  assert.equal(statusOf(undefined, 90), undefined, 'loading')
  assert.equal(statusOf(null, 90), undefined, 'nothing to measure')
})

test('calibration accuracy, best month and momentum', () => {
  assert.equal(calibration({ A: 15, B: 30, C: 40, D: 10, E: 5 }), 100, 'exactly the policy')
  assert.equal(calibration({ A: 100, B: 0, C: 0, D: 0, E: 0 }), 15, 'all A overlaps only A')
  assert.equal(calibration({ A: 0, B: 0, C: 0, D: 0, E: 0 }), null)
  assert.equal(calibration({ A: 1 }), undefined, 'loading')
  const months = [
    { label: 'Jan', year: 2026 },
    { label: 'Feb', year: 2026 },
    { label: 'Mar', year: 2026 },
  ]
  assert.deepEqual(bestMonth(months, [2, 7, 3]), { label: 'Feb 2026', value: 7 })
  assert.equal(bestMonth(months, [0, 0, 0]), null)
  assert.equal(momentum([2, 4, 6]), 50)
  assert.equal(momentum([2, 0]), -100)
  assert.equal(momentum([0, 3]), null, 'no base month')
  assert.equal(momentum([5]), null)
})

test('the scorecard lists only permitted areas, with targets, and feeds the Talent Index', () => {
  const none = { appraisals: false, rewards: false, matrix: false, catalog: false, team: false }
  assert.deepEqual(buildScorecard(none, {}), [])
  const all = { appraisals: true, rewards: true, matrix: true, catalog: true, team: true }
  const loading = buildScorecard(all, { isCurrent: true })
  assert.ok(loading.length >= 30, `${loading.length} KPIs`)
  assert.ok(loading.every((item) => item.value === undefined || item.value === null))
  assert.equal(new Set(loading.map((item) => item.key)).size, loading.length, 'unique keys')
  assert.equal(talentIndex(loading).value, undefined, 'loading')

  const ready = buildScorecard(all, {
    isCurrent: false,
    appraisals: {
      total: 10,
      before: 8,
      inApproval: 1,
      approved: 9,
      rejected: 0,
      grades: { A: 2, B: 3, C: 4, D: 1, E: 0 },
    },
    rewards: {
      total: 6,
      before: 4,
      production: 3,
      status: { APPROVED: 3, INPROCESS: 1, DRAFT: 1, REJECTED: 1 },
    },
    rewardMonths: [1, 2, 3],
    months: [
      { label: 'Jan', year: 2026 },
      { label: 'Feb', year: 2026 },
      { label: 'Mar', year: 2026 },
    ],
    matrix: {
      positions: 4,
      approved: 3,
      pending: 1,
      draft: 0,
      returned: 0,
      profiled: 4,
      skills: 20,
      critical: 5,
    },
    catalog: {
      sessions: 5,
      soon: 2,
      capacity: 50,
      taken: 40,
      left: 10,
      waitlist: 2,
      hours: 30,
      full: 1,
      internal: 3,
      external: 2,
      inPerson: 3,
      online: 1,
      blended: 1,
      eligible: 4,
    },
    team: {
      people: 4,
      readinessPoints: 320,
      readinessMax: 400,
      ready: 3,
      withGaps: 2,
      atRisk: 1,
      gaps: 5,
      criticalGaps: 1,
      neverAssessed: 0,
    },
  })
  const get = (key) => ready.find((item) => item.key === key)
  assert.equal(get('appraisalApproval').value, 100)
  assert.equal(get('appraisalApproval').status, 'good')
  assert.equal(get('seatFill').value, 80)
  assert.equal(get('seatFill').target, TARGETS.seatFill)
  assert.equal(get('bestMonth').value, 'Mar 2026')
  assert.equal(get('skillsPerProfile').value, 5)
  assert.equal(get('readiness').value, 80)
  assert.equal(get('momentum'), undefined, 'momentum only for the current year')
  assert.equal(get('teamCoverage'), undefined, 'team coverage only for the current year')
  const index = talentIndex(ready)
  const parts = index.parts.map((item) => item.value)
  assert.equal(index.value, Math.round(parts.reduce((x, y) => x + y, 0) / parts.length))
})
