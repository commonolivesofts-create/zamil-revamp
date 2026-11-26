import { useEffect } from 'react'
import useAuth from './useAuth.js'
import { startActivitySessionTracker } from './activityTracker.js'

export default function ActivitySessionProvider({ children }) {
  const { status } = useAuth()

  useEffect(() => {
    if (status !== 'authenticated') return
    return startActivitySessionTracker()
  }, [status])

  return children
}
