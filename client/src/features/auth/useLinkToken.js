import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { captureLink, forgetToken, isNewLink } from './linkToken.js'

// Captures an e-mailed link token, then removes the fragment from the address
// bar and the current history entry (replace, so Back cannot show it). A new
// link opened in the same tab is captured before its fragment is removed.
// The token lives only in this component's state and disappears on unmount.
// `linkKey` changes with every captured link: pages key their form on it so a
// new link starts a fresh form that no earlier response can update.
// `clearToken(token)` discards that token (after success or a terminal error).
export default function useLinkToken() {
  const location = useLocation()
  const navigate = useNavigate()
  const [captured, setCaptured] = useState(() => captureLink(location))

  // Adjusting state during render (React's pattern for derived state): the new
  // fragment is read before the effect below removes it.
  if (isNewLink(captured, location)) setCaptured(captureLink(location))

  useEffect(() => {
    if (location.hash) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
  }, [location.hash, location.pathname, location.search, navigate])

  const clearToken = useCallback((token) => setCaptured((current) => forgetToken(current, token)), [])
  return { token: captured.token, hadFragment: captured.hadFragment, linkKey: captured.id, clearToken }
}
