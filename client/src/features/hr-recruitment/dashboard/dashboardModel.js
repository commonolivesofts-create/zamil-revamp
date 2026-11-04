// The recruitment dashboard's data rules. Pure functions: every figure is a
// count of an existing list API (page size 1, the total only), so the
// dashboard shows only what the server returns for the signed-in user.
import { addDays, monthRanges } from '../shared/insightDates.js'
import { daysBetween } from '../shared/hrFormat.js'

export const PERIODS = Object.freeze(['30d', '90d', 'year', '12m', 'all'])
export const DEFAULT_PERIOD = '12m'
export const TREND_MONTHS = 12
// Count requests in flight at once, so a dashboard load never floods the API.
export const MAX_IN_FLIGHT = 6

// The inclusive date window of a period ending today; null for all time.
export function periodRange(period, today) {
  if (period === '30d') return { from: addDays(today, -29), to: today }
  if (period === '90d') return { from: addDays(today, -89), to: today }
  if (period === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today }
  if (period === '12m') return { from: addDays(today, -364), to: today }
  return null
}

// The window of the same length just before `range`; null for all time.
export function previousRange(range) {
  if (!range) return null
  const to = addDays(range.from, -1)
  return { from: addDays(to, -daysBetween(range.from, range.to)), to }
}

export const trendMonths = (today) => monthRanges(today, TREND_MONTHS)

// A query limited to a date window (unchanged for all time).
export const within = (query, range) => (range ? { ...query, dateFrom: range.from, dateTo: range.to } : query)

// Whole-percent change from `previous` to `current`; null when there is nothing to compare.
export function change(current, previous) {
  if (current === undefined || previous === undefined || previous === null) return null
  if (!previous) return current ? Infinity : 0
  return Math.round(((current - previous) / previous) * 100)
}

// Whole percent of `part` in `whole`; null without a whole.
export const ratio = (part, whole) => (whole ? Math.round((part / whole) * 100) : null)

// Runs at most `max` tasks at a time, in the order they were queued.
export function createLimiter(max) {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= max || !queue.length) return
    active += 1
    const { task, resolve, reject } = queue.shift()
    Promise.resolve().then(task).then(resolve, reject).finally(() => {
      active -= 1
      next()
    })
  }
  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject })
    next()
  })
}

// count(source, query) → the total of that source's list for the query. Equal
// queries share one request; a failed one is asked again next time.
export function createCounter(sources, { limit = MAX_IN_FLIGHT } = {}) {
  const run = createLimiter(limit)
  const memo = new Map()
  return function count(source, query = {}) {
    const clean = Object.entries(query)
      .filter(([, value]) => value !== '' && value !== null && value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    const key = `${source}:${JSON.stringify(clean)}`
    if (!memo.has(key)) {
      const promise = run(() => sources[source].total(Object.fromEntries(clean)))
      promise.catch(() => memo.delete(key))
      memo.set(key, promise)
    }
    return memo.get(key)
  }
}

// A rounded scale top for the y-axis: 1, 2, 2.5 or 5 × 10ⁿ, never below 4.
export function niceMax(value) {
  if (value <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((candidate) => value <= candidate * power)
  return Math.ceil(step * power)
}

// A source's total: the pagination total of a one-row page.
export const totalOf = (list) => async (query) => (await list({ ...query, page: 1, limit: 1 })).pagination.total
