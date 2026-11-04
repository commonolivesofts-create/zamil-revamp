// Recruitment dashboard (features/hr-recruitment/dashboard): period windows,
// change rules, the request limiter and counter, the y-axis
// scale, and static checks of the page (route-gated panels, list APIs only).
// Mocked lists only; no backend, Oracle or browser is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  change, createCounter, createLimiter, niceMax, periodRange, previousRange, ratio, totalOf, trendMonths, within,
} from '../src/features/hr-recruitment/dashboard/dashboardModel.js'

const TODAY = '2026-11-04'
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('dashboard periods: inclusive windows ending today, all time unbounded', () => {
  assert.deepEqual(periodRange('30d', TODAY), { from: '2026-10-06', to: TODAY })
  assert.deepEqual(periodRange('90d', TODAY), { from: '2026-08-07', to: TODAY })
  assert.deepEqual(periodRange('year', TODAY), { from: '2026-01-01', to: TODAY })
  assert.deepEqual(periodRange('12m', TODAY), { from: '2025-11-05', to: TODAY })
  assert.equal(periodRange('all', TODAY), null)
  assert.deepEqual(previousRange({ from: '2026-10-06', to: TODAY }), { from: '2026-09-06', to: '2026-10-05' })
  assert.equal(previousRange(null), null)
  assert.deepEqual(within({ status: 'A' }, { from: '2026-01-01', to: TODAY }), { status: 'A', dateFrom: '2026-01-01', dateTo: TODAY })
  assert.deepEqual(within({ status: 'A' }, null), { status: 'A' })
  const months = trendMonths(TODAY)
  assert.equal(months.length, 12)
  assert.deepEqual([months[0].from, months.at(-1).to], ['2025-12-01', '2026-11-30'])
})

test('dashboard figures: change, ratio and the axis scale', () => {
  assert.equal(change(12, 10), 20)
  assert.equal(change(5, 10), -50)
  assert.equal(change(0, 0), 0)
  assert.equal(change(3, 0), Infinity)
  assert.equal(change(3, null), null, 'no previous period (all time)')
  assert.equal(change(undefined, 4), null, 'still loading')
  assert.equal(ratio(1, 3), 33)
  assert.equal(ratio(1, 0), null)
  assert.deepEqual([0, 3, 5, 11, 21, 26, 49, 51, 101, 260].map(niceMax), [4, 4, 5, 20, 25, 50, 50, 100, 200, 500])
})

test('dashboard requests: at most N in flight, equal queries share one request', async () => {
  let active = 0
  let peak = 0
  const limit = createLimiter(2)
  await Promise.all(Array.from({ length: 6 }, () => limit(async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active -= 1
  })))
  assert.equal(peak, 2)

  const calls = []
  const list = async (query) => {
    calls.push(query)
    if (query.status === 'BAD') throw new Error('offline')
    return { items: [], pagination: { total: 7 } }
  }
  const count = createCounter({ things: { total: totalOf(list) } }, { limit: 3 })
  assert.deepEqual(await Promise.all([count('things', { b: '1', a: '' }), count('things', { b: '1' })]), [7, 7])
  assert.deepEqual(calls, [{ b: '1', page: 1, limit: 1 }], 'blank values dropped; one request for equal queries')
  await assert.rejects(count('things', { status: 'BAD' }))
  await assert.rejects(count('things', { status: 'BAD' }))
  assert.equal(calls.length, 3, 'a failed count is asked again')
})

test('dashboard page: registered, route-gated panels, counts from the list APIs only', async () => {
  const page = await read('features/hr-recruitment/dashboard/RecruitmentDashboardPage.jsx')
  assert.match(page, /const opens = \(path\) => canAccessRoute\(findAppRoute\(path\), permissions\)/)
  assert.match(page, /const allowed = MODULES\.filter\(\(module\) => opens\(module\.report\)\)/)
  assert.ok(page.includes('const canCreate = permissions.can(ACTIONS.REQUISITION_CREATE) && opens(REQUISITION_FORM)'), 'create needs the form and CREATE')
  assert.ok(page.includes("ratioTile('perRequisition', 'requisitions', 'layers', P.perRequisition, m.interviews, m.raised"), 'interviews per requisition')
  assert.ok(page.includes("shareTile('rejection', 'interviews', 'circle-x', P.rejection, m.rejected, sumOf(m.approved, m.rejected)"), 'requisition rejection')
  assert.doesNotMatch(page, /recent/i, 'no recent-records panel')
  for (const service of ['requisitions', 'interviews', 'offers', 'orientations', 'probations']) {
    assert.match(page, new RegExp(`services\\.${service}\\.list`), service)
  }
  assert.doesNotMatch(page, /demoData|Math\.random/, 'no invented figures')
  // KPI definitions: open positions, technical hires and the rates.
  assert.ok(page.includes("count('requisitions', { requisitionStatus: 'Approved', ticketStatus: 'Open' })"), 'open positions')
  assert.ok(page.includes("const TECHNICAL_FORMS = Object.freeze(['Workers_Technicians', 'Engineers_Staff'])"), 'technical hires')
  for (const [rule, name] of [
    ['rate(J.approval, m.approved, sumOf(m.approved, m.rejected)', 'approval = approved / decided'],
    ['rate(J.fill, m.filled, m.approved', 'fill = tickets closed / approved'],
    ['rate(J.pass, m.passed, sumOf(m.passed, m.hold, m.failed)', 'pass = passed / rated'],
    ['rate(J.offerRate, m.offers, m.passed', 'offer rate = offers / passed'],
    ['rate(J.acceptance, m.orientations, m.offers', 'acceptance = orientations / offers'],
    ['rate(J.onboarded, m.onboarded, m.orientations', 'onboarding = approved / scheduled'],
    ['rate(J.success, m.confirmed, sumOf(m.confirmed, m.notConfirmed)', 'probation success'],
  ]) assert.ok(page.includes(rule), name)
  const registry = await read('config/registry/modules/requisitions.module.js')
  assert.match(registry, /id: 'hr-recruitment-dashboard', path: '\/hr\/recruitment\/dashboard'.*enabledBy: \{ env: 'VITE_FEATURE_HR_RECRUITMENT' \}/)
  const router = await read('app/router.jsx')
  assert.match(router, /path: 'hr\/recruitment\/dashboard', handle: \{ routeId: 'hr-recruitment-dashboard' \}, element: <RecruitmentDashboardPage \/>/)
})
