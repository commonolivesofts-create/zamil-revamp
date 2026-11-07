// Each form loads the employee picker's list with the form itself, so opening Emp# shows
// employees at once instead of waiting for a request. Typing keeps using the module's own
// lookup, which keeps its server-side scope, filters and result cap.
import { invalidResponse } from './formRecords.js'

// `load(options)` returns the endpoint's rows; the list is fetched once and reused (a failed
// load is forgotten so the next open retries).
export function createEmployeeList({ load, shape = (item) => item }) {
  let pending = null
  const list = (options = {}) => {
    if (!pending) {
      pending = Promise.resolve()
        .then(() => load(options))
        .then((rows) => {
          if (!Array.isArray(rows)) throw invalidResponse('employee list')
          return Object.freeze(rows.map(shape).filter(Boolean))
        })
        .catch((error) => {
          pending = null
          throw error
        })
    }
    return pending
  }
  return Object.freeze({ list })
}

export const employeePage = (list) => {
  const items = Object.freeze(list)
  return Object.freeze({
    items,
    pagination: Object.freeze({ page: 1, limit: items.length, total: items.length, totalPages: items.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false }),
  })
}

// Warm the list on page load. A failed warm-up is not fatal: the field reports the failure
// when it is opened, and opening retries.
export function warmEmployeeList(service, options) {
  const warm = service?.preloadEmployees?.(options)
  if (warm && typeof warm.catch === 'function') warm.catch(() => undefined)
}
