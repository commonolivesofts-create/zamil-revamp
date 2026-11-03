// DEMO ADAPTER ONLY. Shared plumbing of the Reward Nomination, Share an Idea
// and Sick Leave demo clients: the shared apiClient's interface (get/post/put/
// delete resolving to { status, data, pagination, requestId }, failures as
// ApiError) over in-memory records. Never browser storage; lost on reload.
import { ApiError } from '../../../services/api/apiClient.js'

export const clone = (value) => structuredClone(value)

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new ApiError('The API request was cancelled.', { code: 'ABORTED' }))
    if (signal?.aborted) return aborted()
    const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve() }, ms)
    function onAbort() { clearTimeout(timer); aborted() }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

export function createDemoTransport({ latencyMs, routes }) {
  let requests = 0
  const context = {
    fail(status, code, message, details = []) {
      throw new ApiError(message, { code, status, details, requestId: `demo-${requests}` })
    },
    respond(data, { status = 200, pagination = null } = {}) {
      return Object.freeze({ status, data: clone(data), pagination: pagination && Object.freeze(pagination), requestId: `demo-${requests}` })
    },
    // The standard pagination object for a page of `items`.
    paginate(items, page = 1, limit = 25) {
      const total = items.length
      const totalPages = Math.ceil(total / limit)
      return {
        items: items.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
      }
    },
  }
  async function request(method, path, { params = {}, body, signal } = {}) {
    requests += 1
    await wait(latencyMs, signal)
    for (const [pattern, handlers] of routes) {
      const match = pattern.exec(path)
      if (match && handlers[method]) return handlers[method]({ match, params, body, ...context })
    }
    return context.fail(404, 'NOT_FOUND', 'The requested resource was not found.')
  }
  return Object.freeze({
    get: (path, options) => request('get', path, options),
    post: (path, body, options) => request('post', path, { ...options, body }),
    put: (path, body, options) => request('put', path, { ...options, body }),
    delete: (path, options) => request('delete', path, options),
  })
}

export const containsText = (value, term) => String(value ?? '').toLowerCase().includes(String(term ?? '').toLowerCase())
