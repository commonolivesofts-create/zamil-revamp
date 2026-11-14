
import {
  createContext,
  useContext,
} from 'react'

// Shared context used by NavigationRevealProvider
// and all sidebar navigation consumers.
export const NavigationRevealContext = createContext(null)

/**
 * Access shared dashboard-to-sidebar navigation state.
 *
 * Must be used within NavigationRevealProvider.
 */
export default function useNavigationReveal() {
  const context = useContext(NavigationRevealContext)

  if (!context) {
    throw new Error(
      'useNavigationReveal must be used within NavigationRevealProvider',
    )
  }

  return context
}
