import { useEffect } from 'react'
import useAuth from '@/features/auth/useAuth.js'
import { identifyEmployeeServicesUser } from '../hrEmployeeServicesService.js'

// Demo only: tells the demo adapter who is signed in (requester, appraiser);
// a real backend takes them from the session. The recruitment loader's own
// demo identification is switched off for these screens (NO_IDENTIFY).
export function useEmployeeServicesUser() {
  const { user } = useAuth()
  useEffect(() => identifyEmployeeServicesUser(user), [user])
  return user
}
export const NO_IDENTIFY = () => {}
