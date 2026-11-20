// The recruitment dashboard's data rules. Every figure is a list total of an
// existing module for the signed-in user: asked in batches through the module's
// counts endpoint (one request and one backend statement per module), or as a
// one-row page where a source has no counts endpoint (demo adapters).
import { addDays, monthRanges } from '../shared/insightDates.js'
import { daysBetween } from '../shared/hrFormat.js'

export const PERIODS = Object.freeze(['30d', '90d', 'year', '12m', 'all'])
export const DEFAULT_PERIOD = '12m'
export const TREND_MONTHS = 12
// Count requests in flight at once, so a dashboard load never floods the API.
// The dashboard needs several independent counts. Keep the request fan-out
// bounded, but allow enough parallel work that the initial load does not turn
// into many slow waves of list requests.
export const MAX_IN_FLIGHT = 12
// The most filter sets one counts request carries (the backend's limit).
export const MAX_BATCH = 60
// How long a dashboard's figures are reused when the user returns to it (in memory only).
export const COUNTS_MAX_AGE_MS = 60_000

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
export const within = (query, range) =>
  range ? { ...query, dateFrom: range.from, dateTo: range.to } : query

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
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1
        next()
      })
  }
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject })
      next()
    })
}

// count(source, query) → the total of that source's list for the query. Equal
// queries share one request; a failed one is asked again next time.
// A source with `counts(queries, options)` is asked in batches: every query of
// that source asked before the next timer tick (the loaders of one render) goes
// in one request (MAX_BATCH sets at most). Other sources use `total(query)`.
// `fresh` asks the backend to skip its short counts cache (Refresh).
export function createCounter(
  sources,
  { limit = MAX_IN_FLIGHT, fresh = false, schedule = (flush) => setTimeout(flush, 0) } = {},
) {
  const run = createLimiter(limit)
  const memo = new Map()
  const pending = new Map()
  const flush = (source) => {
    const queue = pending.get(source)
    pending.delete(source)
    for (let start = 0; start < queue.length; start += MAX_BATCH) {
      const batch = queue.slice(start, start + MAX_BATCH)
      run(() =>
        retrying(() =>
          sources[source].counts(
            batch.map((entry) => entry.query),
            { fresh },
          ),
        ),
      ).then(
        (values) => batch.forEach((entry, index) => entry.resolve(values[index])),
        (error) => batch.forEach((entry) => entry.reject(error)),
      )
    }
  }
  const batched = (source, query) =>
    new Promise((resolve, reject) => {
      const entry = { query, resolve, reject }
      const queue = pending.get(source)
      if (queue) {
        queue.push(entry)
        return
      }
      // Queued before the flush is scheduled, so even an immediate flush sends it.
      pending.set(source, [entry])
      schedule(() => flush(source))
    })
  return function count(source, query = {}) {
    const clean = Object.entries(query)
      .filter(([, value]) => value !== '' && value !== null && value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    const key = `${source}:${JSON.stringify(clean)}`
    if (!memo.has(key)) {
      const promise = sources[source].counts
        ? batched(source, Object.fromEntries(clean))
        : run(() => sources[source].total(Object.fromEntries(clean)))
      promise.catch(() => memo.delete(key))
      memo.set(key, promise)
    }
    return memo.get(key)
  }
}

// A dashboard's counter, kept in memory for `maxAgeMs` so returning to the
// dashboard shows its figures at once instead of asking the server again.
// `fresh` (Refresh) always starts a new counter that skips the backend cache.
// Returns { count, at }: the counter and when its figures were first asked.
const keptCounters = new Map()
export function dashboardCounter(
  name,
  sources,
  { fresh = false, maxAgeMs = COUNTS_MAX_AGE_MS, now = () => Date.now() } = {},
) {
  const kept = keptCounters.get(name)
  if (!fresh && kept && kept.sources === sources && now() - kept.at < maxAgeMs) return kept
  const created = { sources, at: now(), count: createCounter(sources, { fresh }) }
  keptCounters.set(name, created)
  return created
}

// A rounded scale top for the y-axis: 1, 2, 2.5 or 5 × 10ⁿ, never below 4.
export function niceMax(value) {
  if (value <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((candidate) => value <= candidate * power)
  return Math.ceil(step * power)
}

const isTransientFailure = (error) =>
  ['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(error?.code) ||
  error?.status === 500 ||
  [502, 503, 504].includes(error?.status)

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

// Retry transient connection and server failures of a read; validation and
// authorization errors are returned immediately.
async function retrying(task, { attempts = 3, retryDelay = 250 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      if (!isTransientFailure(error) || attempt >= attempts) throw error
      await wait(retryDelay * attempt)
    }
  }
}

// A source's total: the pagination total of a one-row page, with retries.
// Sharing happens in createCounter, so concurrent panels still share the same
// retry sequence for an equal query.
export const totalOf = (list, options) => (query) =>
  retrying(async () => (await list({ ...query, page: 1, limit: 1 })).pagination.total, options)
