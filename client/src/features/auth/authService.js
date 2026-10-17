import { authConfig } from '@/config/authConfig.js'

export class AuthServiceError extends Error {
  constructor(message, code = 'AUTH_ERROR') {
    super(message)
    this.name = 'AuthServiceError'
    this.code = code
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  if (!authConfig.configured) {
    throw new AuthServiceError('Authentication is not configured. Contact your application administrator.', 'NOT_CONFIGURED')
  }

  const timeout = new AbortController()
  const cancelFromCaller = () => timeout.abort()
  signal?.addEventListener('abort', cancelFromCaller, { once: true })
  const timer = window.setTimeout(() => timeout.abort(), 15000)

  try {
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    // CSRF must ultimately be enforced by the backend for cookie-authenticated writes.
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf

    const response = await fetch(`${authConfig.baseUrl}${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
    })
    const payload = response.status === 204 ? null : await response.json().catch(() => null)

    if (response.status === 401) throw new AuthServiceError('Invalid credentials or expired session.', 'UNAUTHORIZED')
    if (response.status === 403) throw new AuthServiceError('Access was denied by the server.', 'FORBIDDEN')
    if (!response.ok) {
      throw new AuthServiceError(
        response.status >= 500 ? 'The authentication service is temporarily unavailable.' : 'The request could not be completed.',
        'REQUEST_FAILED',
      )
    }
    if (payload?.success === false) throw new AuthServiceError('The authentication request was rejected.', 'REQUEST_FAILED')
    return payload
  } catch (error) {
    if (error instanceof AuthServiceError) throw error
    if (signal?.aborted) throw error
    throw new AuthServiceError(
      timeout.signal.aborted ? 'The authentication request timed out. Please retry.' : 'Cannot connect to the authentication service.',
      'NETWORK_ERROR',
    )
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', cancelFromCaller)
  }
}

// Expected session contract: 200 { authenticated: true, user: { id, name, email } }
// or 200 { authenticated: false }, or HTTP 401 for an anonymous session.
export async function fetchSession(options = {}) {
  try {
    const result = await request(authConfig.paths.session, options)
    if (result?.authenticated === false) return null
    if (result?.authenticated === true && result.user && typeof result.user === 'object' &&
      (result.user.id != null || typeof result.user.email === 'string')) return result.user
    throw new AuthServiceError('The session response does not match the configured authentication contract.', 'INVALID_RESPONSE')
  } catch (error) {
    if (error?.code === 'UNAUTHORIZED') return null
    throw error
  }
}

export async function requestSignIn({ email, password, trustBrowser }) {
  await request(authConfig.paths.login, {
    method: 'POST',
    body: { email, password, trustBrowser },
  })
  // Do not mark the client authenticated on login HTTP 200 alone.
  // Confirm the backend established a valid cookie-backed session.
  const user = await fetchSession()
  if (!user) throw new AuthServiceError('Sign-in was not completed. Check the server session configuration.', 'SESSION_MISSING')
  return user
}

export async function requestSignOut() {
  await request(authConfig.paths.logout, { method: 'POST' })
}

export async function requestRecovery(email) {
  await request(authConfig.paths.recovery, { method: 'POST', body: { email } })
}
