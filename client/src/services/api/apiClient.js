// Relative imports keep this module loadable by the Node-native tests.
import { apiConfig } from '../../config/apiConfig.js'
import { emitApiUnauthorized } from './apiEvents.js'
import { csrfStore as defaultCsrfStore } from './csrfStore.js'

export const CSRF_HEADER = 'X-CSRF-Token'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const CSRF_MODES = new Set(['session', 'challenge', 'none'])
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const MAX_MESSAGE_LENGTH = 500
const MAX_DETAILS = 50

// `message` is only taken from the backend's error envelope, whose messages are
// documented as safe to display; anything else gets a generic message.
export class ApiError extends Error {
  constructor(message, {
    code = 'API_ERROR', status = null, details = [], requestId = null, retryAfterSeconds = null,
  } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
    this.requestId = requestId
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// True when a state-changing request may or may not have been applied: the
// response was lost (network, timeout), unreadable, or an internal error. UIs
// must then neither claim success nor treat the change as rejected.
export function isOutcomeUnknown(error) {
  return ['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(error?.code) || error?.status === 500
}

function containsControlCharacters(value) {
  for (const character of value) {
    const point = character.codePointAt(0)
    if (point < 32 || point === 127) return true
  }
  return false
}

function assertBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new ApiError('The application API is not configured.', { code: 'NOT_CONFIGURED' })
  }
  if (containsControlCharacters(baseUrl) || baseUrl.includes('\\')) {
    throw new ApiError('The API base URL is invalid.', { code: 'INVALID_CONFIG' })
  }
  if (baseUrl.startsWith('/') && !baseUrl.startsWith('//')) {
    if (baseUrl.includes('?') || baseUrl.includes('#')) {
      throw new ApiError('The API base URL is invalid.', { code: 'INVALID_CONFIG' })
    }
    return false // Same-origin relative URL.
  }
  try {
    const url = new URL(baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Unsupported API URL')
    }
    return true // Explicit API origin.
  } catch {
    throw new ApiError('The API base URL is invalid.', { code: 'INVALID_CONFIG' })
  }
}

function assertResourcePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') ||
    path.includes('\\') || path.includes('?') || path.includes('#') || containsControlCharacters(path)) {
    throw new ApiError('API requests require a local path beginning with /.', { code: 'INVALID_PATH' })
  }
  try {
    for (const segment of path.split('/')) {
      const decoded = decodeURIComponent(segment)
      if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
        throw new Error('Unsafe path segment')
      }
    }
  } catch {
    throw new ApiError('The API request path is invalid.', { code: 'INVALID_PATH' })
  }
}

function buildUrl(baseUrl, path, params) {
  const absoluteBase = assertBaseUrl(baseUrl)
  assertResourcePath(path)
  const base = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '')
  const url = new URL(`${base}${path}`, 'https://frontend.invalid')
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue
      const items = Array.isArray(value) ? value : [value]
      for (const item of items) {
        if (item == null) continue
        if (typeof item === 'object' && !(item instanceof Date)) {
          throw new ApiError('Query parameters must be primitive values or dates.', { code: 'INVALID_PARAMS' })
        }
        url.searchParams.append(key, item instanceof Date ? item.toISOString() : String(item))
      }
    }
  }
  return absoluteBase ? url.href : `${url.pathname}${url.search}`
}

function prepareBody(body, headers) {
  if (body === undefined) return undefined
  if (typeof FormData !== 'undefined' && body instanceof FormData) return body
  if (typeof Blob !== 'undefined' && body instanceof Blob) return body
  headers.set('Content-Type', 'application/json')
  try {
    return JSON.stringify(body)
  } catch {
    throw new ApiError('The API request body is invalid.', { code: 'INVALID_BODY' })
  }
}

function headerRequestId(response) {
  const value = response.headers?.get?.('X-Request-Id')
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value) ? value : null
}

function readRequestId(response, body) {
  const value = body?.meta?.requestId
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value) ? value : headerRequestId(response)
}

function invalidResponse(response, requestId = headerRequestId(response)) {
  return new ApiError('The server returned an invalid response.', {
    code: 'INVALID_RESPONSE', status: response.status, requestId,
  })
}

async function readJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const isCount = (value) => Number.isInteger(value) && value >= 0

function readPagination(response, body, requestId) {
  if (!('pagination' in body)) return null
  const p = body.pagination
  if (!p || typeof p !== 'object' || ![p.page, p.limit, p.total, p.totalPages].every(isCount) ||
    typeof p.hasNextPage !== 'boolean' || typeof p.hasPreviousPage !== 'boolean') {
    throw invalidResponse(response, requestId)
  }
  return Object.freeze({
    page: p.page, limit: p.limit, total: p.total, totalPages: p.totalPages,
    hasNextPage: p.hasNextPage, hasPreviousPage: p.hasPreviousPage,
  })
}

// Successful responses resolve to { status, data, pagination, requestId }.
// JSON must be the backend's { success: true, data, meta } envelope.
async function parseSuccess(response, responseType) {
  const result = (data, pagination = null, requestId = headerRequestId(response)) =>
    Object.freeze({ status: response.status, data, pagination, requestId })
  if (responseType === 'void' || response.status === 204 || response.status === 205) return result(null)
  if (responseType === 'blob') return result(await response.blob())
  if (responseType === 'text') return result(await response.text())
  const body = await readJson(response)
  if (!body || typeof body !== 'object' || body.success !== true || !('data' in body)) {
    throw invalidResponse(response)
  }
  const requestId = readRequestId(response, body)
  return result(body.data, readPagination(response, body, requestId), requestId)
}

function readDetails(details) {
  if (!Array.isArray(details)) return []
  return details
    .filter((item) => item && typeof item.field === 'string' && typeof item.message === 'string')
    .slice(0, MAX_DETAILS)
    .map(({ field, message }) => Object.freeze({ field, message }))
}

function readRetryAfter(response) {
  const seconds = Number.parseInt(response.headers?.get?.('Retry-After') ?? '', 10)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

function fallbackError(status) {
  if (status === 401) return ['UNAUTHENTICATED', 'Your session has expired. Please sign in again.']
  if (status === 403) return ['FORBIDDEN', 'You do not have permission for this action.']
  if (status === 429) return ['RATE_LIMITED', 'Too many attempts. Please wait and try again.']
  return ['HTTP_ERROR', status >= 500 ? 'The service is temporarily unavailable.' : 'The request could not be completed.']
}

// Errors keep the backend's stable code, safe message, validation details and
// request ID. Non-envelope bodies (for example a proxy error page) are ignored.
async function parseError(response) {
  const body = await readJson(response)
  const error = body?.success === false && body.error && typeof body.error === 'object' ? body.error : null
  const [fallbackCode, fallbackMessage] = fallbackError(response.status)
  const code = typeof error?.code === 'string' && ERROR_CODE_PATTERN.test(error.code) ? error.code : fallbackCode
  const message = typeof error?.message === 'string' && error.message.trim() &&
    error.message.length <= MAX_MESSAGE_LENGTH && !containsControlCharacters(error.message)
    ? error.message
    : fallbackMessage
  return new ApiError(message, {
    code,
    status: response.status,
    details: readDetails(error?.details),
    requestId: readRequestId(response, body),
    retryAfterSeconds: readRetryAfter(response),
  })
}

// This factory also supports isolated transport tests without any React provider.
// `notifyUnauthorized: false` marks requests whose 401 does not describe the
// current session (public login/MFA endpoints, session restoration); only other
// 401 responses invalidate the signed-in session through `onUnauthorized`.
// `csrf` selects the memory-held token for unsafe methods: the authenticated
// session token (default), the MFA challenge token, or none (login).
export function createApiClient({
  baseUrl, timeoutMs = 15000, onUnauthorized = () => {}, fetchImpl = fetch, csrfStore = null,
}) {
  async function request(path, {
    method = 'GET', params, body, headers: additionalHeaders,
    signal, responseType = 'json', timeout = timeoutMs,
    csrf = 'session', notifyUnauthorized = true,
  } = {}) {
    const url = buildUrl(baseUrl, path, params)
    const verb = String(method).toUpperCase()
    if (!['json', 'text', 'blob', 'void'].includes(responseType)) {
      throw new ApiError('Unsupported API response type.', { code: 'INVALID_RESPONSE_TYPE' })
    }
    if (!CSRF_MODES.has(csrf)) {
      throw new ApiError('Unsupported CSRF mode.', { code: 'INVALID_CSRF_MODE' })
    }
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new ApiError('The API timeout is invalid.', { code: 'INVALID_TIMEOUT' })
    }
    if (signal?.aborted) {
      throw new ApiError('The API request was cancelled.', { code: 'ABORTED' })
    }

    const requestHeaders = new Headers(additionalHeaders)
    if (!requestHeaders.has('Accept')) requestHeaders.set('Accept', 'application/json')
    // The client alone sets the CSRF header, from memory and only for unsafe methods.
    requestHeaders.delete(CSRF_HEADER)
    if (!SAFE_METHODS.has(verb) && csrf !== 'none') {
      const token = csrf === 'challenge' ? csrfStore?.getChallengeToken() : csrfStore?.getSessionToken()
      if (token) requestHeaders.set(CSRF_HEADER, token)
    }
    const payload = prepareBody(body, requestHeaders)
    const controller = new AbortController()
    let abortCause = null
    const cancel = () => {
      abortCause = 'caller'
      controller.abort()
    }
    signal?.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        abortCause = 'timeout'
        controller.abort()
      }
    }, timeout)

    try {
      const response = await fetchImpl(url, {
        method: verb,
        headers: requestHeaders,
        body: payload,
        signal: controller.signal,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
      })
      if (!response.ok) {
        const error = await parseError(response)
        // CSRF rejections are never replayed automatically; callers decide.
        if (response.status === 401 && notifyUnauthorized) onUnauthorized()
        throw error
      }
      return await parseSuccess(response, responseType)
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (controller.signal.aborted) {
        throw new ApiError(
          abortCause === 'timeout' ? 'The request timed out.' : 'The request was cancelled.',
          { code: abortCause === 'timeout' ? 'TIMEOUT' : 'ABORTED' },
        )
      }
      throw new ApiError('Unable to connect to the server.', { code: 'NETWORK_ERROR' })
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
    }
  }

  return Object.freeze({
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  })
}

// The single application API client.
export const apiClient = createApiClient({
  baseUrl: apiConfig.baseUrl,
  timeoutMs: apiConfig.timeoutMs,
  onUnauthorized: emitApiUnauthorized,
  csrfStore: defaultCsrfStore,
})
