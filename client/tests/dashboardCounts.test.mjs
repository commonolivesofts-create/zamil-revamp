// Dashboard counts on the client: the counter batches each source's figures
// into one counts request, keeps per-source fallbacks, retries transient
// failures and reuses a dashboard's figures for a minute; postCounts validates
// the backend's answer; every dashboard service posts to its module's counts
// route. Mocked clients only; no backend or browser is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COUNTS_MAX_AGE_MS,
  MAX_BATCH,
  createCounter,
  dashboardCounter,
} from '../src/features/hr-recruitment/dashboard/dashboardModel.js'
import { MAX_COUNT_QUERIES, postCounts } from '../src/services/api/listCounts.js'
import { createHrRecruitmentServices } from '../src/features/hr-recruitment/hrRecruitmentService.js'
import { createRewardService } from '../src/features/hr-employee-services/reward/rewardService.js'
import { createEmployeeServices } from '../src/features/hr-employee-services/hrEmployeeServicesService.js'

// A manual timer: the counter's batch is sent when the test flushes it.
const manualSchedule = () => {
  const queued = []
  return {
    schedule: (flush) => queued.push(flush),
    run: () => queued.splice(0).forEach((f) => f()),
  }
}

test('one counts request per source for the figures of one render', async () => {
  const calls = []
  const timer = manualSchedule()
  const count = createCounter(
    {
      things: {
        counts: async (queries, options) => {
          calls.push({ queries, options })
          return queries.map((query) => Number(query.n ?? 0))
        },
      },
      others: { total: async (query) => Number(query.n) * 10 },
    },
    { schedule: timer.schedule },
  )
  const figures = Promise.all([
    count('things', { n: '1' }),
    count('things', { n: '2', blank: '' }),
    count('things', { n: '1' }),
    count('others', { n: '3' }),
  ])
  timer.run()
  assert.deepEqual(await figures, [1, 2, 1, 30])
  assert.deepEqual(calls, [{ queries: [{ n: '1' }, { n: '2' }], options: { fresh: false } }])
  assert.equal(await count('things', { n: '2' }), 2, 'asked again later: answered from memory')
  assert.equal(calls.length, 1)
})

test('a large render is split at the backend limit; failures reject only their batch and are retried', async () => {
  const sizes = []
  const timer = manualSchedule()
  let failures = 1
  const count = createCounter(
    {
      many: {
        counts: async (queries) => {
          sizes.push(queries.length)
          if (failures-- > 0) throw Object.assign(new Error('busy'), { status: 503 })
          return queries.map(() => 1)
        },
      },
    },
    { schedule: timer.schedule },
  )
  const all = Promise.all(Array.from({ length: MAX_BATCH + 5 }, (_, n) => count('many', { n })))
  timer.run()
  assert.equal((await all).length, MAX_BATCH + 5)
  assert.deepEqual(
    sizes.sort((a, b) => a - b),
    [5, MAX_BATCH, MAX_BATCH],
    'a 503 is retried',
  )

  const refused = createCounter(
    {
      many: {
        counts: async () => {
          throw Object.assign(new Error('denied'), { status: 403 })
        },
      },
    },
    { schedule: (flush) => flush() },
  )
  await assert.rejects(refused('many', { n: 1 }), /denied/, 'authorization errors are not retried')
})

test('Refresh asks with fresh; a dashboard reuses its figures for a minute', () => {
  const sources = { things: { counts: async (queries) => queries.map(() => 0) } }
  let time = 1000
  const now = () => time
  const first = dashboardCounter('test-dashboard', sources, { now })
  assert.equal(dashboardCounter('test-dashboard', sources, { now }), first, 'reused')
  time += COUNTS_MAX_AGE_MS
  const later = dashboardCounter('test-dashboard', sources, { now })
  assert.notEqual(later, first, 'expired after a minute')
  const fresh = dashboardCounter('test-dashboard', sources, { now, fresh: true })
  assert.notEqual(fresh, later, 'Refresh always starts over')
  assert.equal(fresh.at, time)
  assert.equal(dashboardCounter('test-dashboard', sources, { now }), fresh, 'and is reused next')
})

test('postCounts: blank filters dropped, fresh only when asked, the answer checked', async () => {
  const posts = []
  const client = (counts) => ({
    post: async (path, body, options) => {
      posts.push({ path, body, options })
      return { data: { counts } }
    },
  })
  assert.deepEqual(await postCounts(client([3, 0]), '/hr/x', [{ a: '1', b: '' }, {}]), [3, 0])
  assert.deepEqual(posts[0], {
    path: '/hr/x/counts',
    body: { queries: [{ a: '1' }, {}] },
    options: { signal: undefined },
  })
  await postCounts(client([1]), '/hr/x', [{}], { fresh: true })
  assert.equal(posts[1].body.fresh, true)
  for (const bad of [[1], [-1, 2], ['3', 1], null]) {
    await assert.rejects(postCounts(client(bad), '/hr/x', [{}, {}]), { code: 'INVALID_RESPONSE' })
  }
  await assert.rejects(postCounts(client([]), '/hr/x', []), { code: 'INVALID_PARAMS' })
  await assert.rejects(postCounts(client([]), '/hr/x', Array(MAX_COUNT_QUERIES + 1).fill({})), {
    code: 'INVALID_PARAMS',
  })
})

test('each dashboard service posts to its own module’s counts route', async () => {
  const paths = []
  const client = {
    post: async (path, body) => {
      paths.push(path)
      return { data: { counts: body.queries.map(() => 0) } }
    },
  }
  const recruitment = createHrRecruitmentServices({ client })
  for (const service of ['requisitions', 'interviews', 'offers', 'orientations', 'probations'])
    await recruitment[service].counts([{}])
  await createRewardService({ client }).counts([{}])
  await createEmployeeServices({ client, appraisalClient: client }).appraisals.counts([{}])
  assert.deepEqual(paths, [
    '/hr/requisitions/counts',
    '/hr/interview-assessments/counts',
    '/hr/employment-offers/counts',
    '/hr/orientation-trainings/counts',
    '/hr/probation-evaluations/counts',
    '/hr/employee-of-the-month/counts',
    '/hr/performance-appraisals/counts',
  ])
})
