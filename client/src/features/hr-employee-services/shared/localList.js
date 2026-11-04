// A list function over rows the API returns all at once (transfers,
// appraisals, change requests), shaped like a server list so InsightReport can
// page, sort and count it. The rows load once and are shared by every count;
// `reset()` makes the next call load them again (Refresh).
//   fetchAll({ signal }) → { items };
//   match(row, query) → whether the row passes the report filters;
//   searchText(row) → the text the `search` filter looks in;
//   valueFor(row, key) → the value a column sorts by.
import { filterAndSort } from './esFormat.js'

export function localList(fetchAll, { match = () => true, searchText, valueFor }) {
  let rows = null
  const load = () => {
    // Not tied to one caller's signal: every count and page waits on these rows.
    rows ??= fetchAll({}).then((page) => page.items, (error) => {
      rows = null
      throw error
    })
    return rows
  }
  const list = async ({ page = 1, limit = 20, sortBy, sortDir, search = '', ...query } = {}, { signal } = {}) => {
    const all = await load()
    signal?.throwIfAborted()
    const sort = sortBy ? { key: sortBy, dir: sortDir === 'asc' ? 1 : -1 } : null
    const kept = filterAndSort(all.filter((row) => match(row, query)), { search, searchText, sort, valueFor })
    const totalPages = Math.ceil(kept.length / limit)
    return Object.freeze({
      items: Object.freeze(kept.slice((page - 1) * limit, page * limit)),
      pagination: Object.freeze({ page, limit, total: kept.length, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 }),
    })
  }
  return Object.freeze({ list, rows: load, reset: () => { rows = null } })
}

// A date filter over one row field: YYYY-MM-DD strings compare as text.
export const inRange = (iso, from, to) => (!from && !to) || (Boolean(iso) && (!from || iso.slice(0, 10) >= from) && (!to || iso.slice(0, 10) <= to))
