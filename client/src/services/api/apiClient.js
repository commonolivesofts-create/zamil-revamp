import { apiConfig } from '@/config/apiConfig.js'
import { emitApiUnauthorized } from './apiEvents.js'

export class ApiError extends Error {
  constructor(message, { code = 'API_ERROR', status = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
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

function csrfToken() {
  // The backend must issue and validate a CSRF token if it uses cookie sessions.
  return typeof document === 'undefined'
    ? null
    : document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
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

async function parseBody(response, responseType) {
  if (responseType === 'void' || response.status === 204 || response.status === 205) return null
  if (responseType === 'blob') return response.blob()
  if (responseType === 'text') return response.text()
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError('The server returned an invalid JSON response.', {
      code: 'INVALID_RESPONSE', status: response.status,
    })
  }
}

// This factory also supports isolated transport tests without any React provider.
export function createApiClient({ baseUrl, timeoutMs = 15000, onUnauthorized = () => {}, fetchImpl = fetch }) {
  async function request(path, {
    method = 'GET', params, body, headers: additionalHeaders,
    signal, responseType = 'json', timeout = timeoutMs,
  } = {}) {
    const url = buildUrl(baseUrl, path, params)
    const verb = String(method).toUpperCase()
    if (!['json', 'text', 'blob', 'void'].includes(responseType)) {
      throw new ApiError('Unsupported API response type.', { code: 'INVALID_RESPONSE_TYPE' })
    }
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new ApiError('The API timeout is invalid.', { code: 'INVALID_TIMEOUT' })
    }
    if (signal?.aborted) {
      throw new ApiError('The API request was cancelled.', { code: 'ABORTED' })
    }

    const requestHeaders = new Headers(additionalHeaders)
    if (!requestHeaders.has('Accept')) requestHeaders.set('Accept', 'application/json')
    if (verb !== 'GET' && verb !== 'HEAD') {
      const csrf = csrfToken()
      if (csrf && !requestHeaders.has('X-CSRF-Token')) requestHeaders.set('X-CSRF-Token', csrf)
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
      if (response.status === 401) {
        onUnauthorized()
        throw new ApiError('Your session has expired. Please sign in again.', { code: 'UNAUTHORIZED', status: 401 })
      }
      if (response.status === 403) {
        throw new ApiError('You do not have permission for this action.', { code: 'FORBIDDEN', status: 403 })
      }
      if (!response.ok) {
        throw new ApiError(
          response.status >= 500 ? 'The service is temporarily unavailable.' : 'The request could not be completed.',
          { code: 'HTTP_ERROR', status: response.status },
        )
      }
      return await parseBody(response, responseType)
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

// This is intentionally not used by the existing authService yet. Its endpoint
// contract was built in Phase 06 and should not change before backend agreement.
export const apiClient = createApiClient({
  baseUrl: apiConfig.configured ? apiConfig.baseUrl || '/' : '',
  timeoutMs: apiConfig.timeoutMs,
  onUnauthorized: emitApiUnauthorized,
})
