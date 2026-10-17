import { useContext } from 'react'
import { AuthContext } from './AuthContext.js'

export default function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth requires an AuthProvider.')
  return context
}
