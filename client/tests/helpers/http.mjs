// Shared fixtures for the Node-native tests. No network access: every test
// injects a recording fetch implementation.

export const REQUEST_ID = '3f8b2c1e-6a4d-4e2b-9b7a-1c2d3e4f5a6b'

export function jsonResponse(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': REQUEST_ID, ...headers },
  })
}

export const success = (data, status = 200, extra = {}) =>
  jsonResponse(status, { success: true, data, meta: { requestId: REQUEST_ID }, ...extra })

export const failure = (status, code, message, extra = {}, headers = {}) =>
  jsonResponse(status, { success: false, error: { code, message, ...extra }, meta: { requestId: REQUEST_ID } }, headers)

export const noContent = () => new Response(null, { status: 204, headers: { 'X-Request-Id': REQUEST_ID } })

// `responder` receives (url, init, callNumber) and returns a Response or throws.
export function recordingFetch(responder) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return responder(url, init, calls.length)
  }
  return { fetchImpl, calls }
}

export function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Fixtures matching server/docs/openapi/openapi.yaml.
export const authUser = Object.freeze({
  id: '105',
  username: 'TEST.USER',
  employeeNumber: '2502',
  fullName: 'Test User',
  email: 'test.user@example.invalid',
  jobTitle: 'Engineer',
  department: 'IT',
})

export const sessionInfo = Object.freeze({ expiresAt: '2026-10-21T16:00:00.000Z', idleTimeoutSeconds: 1800, mfaVerified: false })
export const passwordState = Object.freeze({ expired: false, expiresAt: '2027-01-01T00:00:00.000Z' })
export const SESSION_TOKEN = 'session-csrf-token-AAAA'
export const CHALLENGE_TOKEN = 'challenge-csrf-token-BBBB'
export const RESTORED_TOKEN = 'restored-csrf-token-CCCC'

export const loginResult = (overrides = {}) => ({
  authenticated: true,
  user: authUser,
  session: sessionInfo,
  password: passwordState,
  csrf: { token: SESSION_TOKEN, headerName: 'X-CSRF-Token' },
  ...overrides,
})

export const mfaChallenge = (overrides = {}) => ({
  authenticated: false,
  mfa: { required: true, enrollmentRequired: false, expiresAt: '2026-10-21T08:10:00.000Z' },
  csrf: { token: CHALLENGE_TOKEN, headerName: 'X-CSRF-Token' },
  ...overrides,
})

export const currentUser = () => ({ user: authUser, session: sessionInfo, password: passwordState })

// Test-only Base32 secret (RFC 6238 example key), never a real enrolment.
export const SETUP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
export const enrollmentMaterial = (overrides = {}) => ({
  secret: SETUP_SECRET,
  otpauthUri: `otpauth://totp/Zamil%20Revamp:TEST.USER?secret=${SETUP_SECRET}&issuer=Zamil%20Revamp&algorithm=SHA1&digits=6&period=30`,
  issuer: 'Zamil Revamp',
  accountName: 'TEST.USER',
  algorithm: 'SHA1',
  digits: 6,
  periodSeconds: 30,
  expiresAt: '2026-10-21T08:10:00.000Z',
  ...overrides,
})

// Any browser-storage access during a test is a failure.
export function forbidBrowserStorage() {
  const names = ['localStorage', 'sessionStorage']
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name))
  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() { throw new Error(`${name} must not be used for authentication state`) },
    })
  }
  return () => names.forEach((name, index) => {
    if (previous[index]) Object.defineProperty(globalThis, name, previous[index])
    else delete globalThis[name]
  })
}
