// Pages of a pending MFA challenge: first-time enrollment or code verification.
export const mfaChallengePaths = Object.freeze(['/mfa/verify', '/mfa/enroll'])

export function mfaChallengePath(mfa) {
  return mfa?.enrollmentRequired ? '/mfa/enroll' : '/mfa/verify'
}

// Pages opened from e-mailed links carry a single-use token in the fragment.
export const linkTokenPaths = Object.freeze(['/password/setup', '/password/reset', '/mfa/recovery'])

// Never post-login destinations: guest and token pages, and the account pages
// whose completed action ends every session (authenticator replacement,
// password change), so returning there after signing in again is never useful.
const neverReturnTo = Object.freeze([
  '/login', '/forgot-password', '/', ...mfaChallengePaths, ...linkTokenPaths,
  '/account/authenticator', '/account/password',
])
// A fragment carrying a token is never kept in a return-to location.
const TOKEN_FRAGMENT = /token=/i

// Unconverted Orvexa template demos are not Zamil functionality: they are shown
// only in the DEV-only development preview, never to a real session.
export function templateDemosAvailable(status) {
  return status === 'preview'
}

// Validate untrusted post-login destinations independently from authentication.
// Only the backend can authorize access to the requested destination.
// Reject external URLs, protocol-relative locations, backslashes, control chars,
// and guest pages to prevent open redirects when restoring a login destination.
export function safeReturnTo(value, fallback = '/dashboard') {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint <= 0x1f || codePoint === 0x7f) return fallback
  }
  try {
    const url = new URL(value, 'https://local.invalid')
    if (url.origin !== 'https://local.invalid') return fallback
    if (neverReturnTo.includes(url.pathname)) return fallback
    const hash = TOKEN_FRAGMENT.test(url.hash) ? '' : url.hash
    return `${url.pathname}${url.search}${hash}`
  } catch {
    return fallback
  }
}
