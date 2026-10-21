// Single-use tokens from backend e-mail links. The backend sends them only in
// the URL fragment (`<page>#token=<token>`), which browsers never send to any
// server. A token is read from that exact format only, kept in memory and
// submitted only in a JSON request body. Matching the format does not make a
// token valid; only the backend decides.
import { LINK_TOKEN_PATTERN } from './authContract.js'

const FRAGMENT_PATTERN = /^#token=([^&#]*)$/

// Returns { token, hadFragment }. `token` is null unless the fragment is exactly
// `#token=<43 URL-safe characters>`; `hadFragment` reports any fragment, which
// the caller removes from the visible URL either way.
export function readLinkToken(hash) {
  if (typeof hash !== 'string' || hash === '' || hash === '#') return { token: null, hadFragment: false }
  const match = FRAGMENT_PATTERN.exec(hash)
  const token = match && LINK_TOKEN_PATTERN.test(match[1]) ? match[1] : null
  return { token, hadFragment: true }
}

// A capture is identified by the router location it was read from: its key
// and its fragment. The key alone is not enough: a fragment-only navigation
// (a second e-mail link opened in a tab already on this page) has no history
// state, so the router gives it the same "default" key as the initial load.
// The id stays in memory only, like the token itself.
const linkId = (location) => `${location.key}|${location.hash}`

export function captureLink(location) {
  return Object.freeze({ ...readLinkToken(location.hash), id: linkId(location) })
}

// True when a fragment arrived that differs from the current capture. The
// fragment removal itself is a navigation without a fragment, so it never
// recaptures, and re-reading the same location changes nothing.
export function isNewLink(captured, location) {
  return Boolean(location.hash) && linkId(location) !== captured.id
}

// Clears the token only if it is still the one the caller used, so a late
// response for an earlier link cannot discard a newer link's token.
export function forgetToken(captured, token) {
  return captured.token !== null && captured.token === token ? Object.freeze({ ...captured, token: null }) : captured
}
