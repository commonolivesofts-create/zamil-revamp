// Local QR encoding for authenticator setup. The otpauth URI contains the TOTP
// secret, so it is encoded in the browser (uqr: zero dependencies, no network)
// and never sent to a third-party QR service.
import { encode } from 'uqr'

// Returns { size, path } for an SVG <path> of dark modules, or null when the
// value is not an otpauth TOTP URI.
export function authenticatorQr(otpauthUri) {
  if (typeof otpauthUri !== 'string' || !otpauthUri.startsWith('otpauth://totp/')) return null
  const { size, data } = encode(otpauthUri, { ecc: 'M', border: 0 })
  let path = ''
  data.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) path += `M${x} ${y}h1v1h-1z`
  }))
  return Object.freeze({ size, path })
}

// Groups a Base32 key in fours for manual entry; authenticator apps ignore spaces.
export const formatSetupKey = (secret) => secret.replace(/(.{4})(?=.)/g, '$1 ')

// Local clock time for challenge and setup expiry hints.
export const formatClockTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
