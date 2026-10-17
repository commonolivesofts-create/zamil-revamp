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
    if (['/login', '/forgot-password', '/'].includes(url.pathname)) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
