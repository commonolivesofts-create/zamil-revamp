
import {
  useCallback,
  useMemo,
  useState,
} from 'react'

import {
  NavigationRevealContext,
} from './useNavigationReveal.js'

/**
 * Shared navigation reveal provider.
 *
 * Connects dashboard shortcuts to the existing sidebar
 * without navigating away from the current page.
 *
 * Existing RBAC and navigation permissions remain unchanged.
 */
export function NavigationRevealProvider({
  children,
  onReveal,
}) {
  const [revealRequest, setRevealRequest] = useState(null)

  // Request a registered navigation item to be revealed.
  const revealNavigationItem = useCallback(
    (routeId) => {
      if (
        typeof routeId !== 'string' ||
        !routeId.trim()
      ) {
        return
      }

      setRevealRequest((previous) => ({
        routeId: routeId.trim(),
        serial: (previous?.serial ?? 0) + 1,
      }))

      // Expand existing sidebar / open mobile navigation.
      onReveal?.()
    },
    [onReveal],
  )

  // Clear temporary navigation reveal state.
  const clearNavigationReveal = useCallback(() => {
    setRevealRequest(null)
  }, [])

  const contextValue = useMemo(
    () => ({
      revealRequest,
      revealNavigationItem,
      clearNavigationReveal,
    }),
    [
      revealRequest,
      revealNavigationItem,
      clearNavigationReveal,
    ],
  )

  return (
    <NavigationRevealContext.Provider value={contextValue}>
      {children}
    </NavigationRevealContext.Provider>
  )
}
