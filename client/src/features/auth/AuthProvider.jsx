import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { authConfig } from '@/config/authConfig.js'
import { AuthContext } from './AuthContext.js'
import { subscribeApiUnauthorized } from '@/services/api/apiEvents.js'
import { csrfStore } from '@/services/api/csrfStore.js'
import { authService } from './authService.js'
import { createAuthSession } from './authSession.js'

export default function AuthProvider({ children }) {
  // Race handling (revisions, aborts, stale responses) lives in authSession.js.
  const [auth] = useState(() => createAuthSession({
    service: authService,
    csrfStore,
    subscribeUnauthorized: subscribeApiUnauthorized,
    preview: authConfig.developmentPreview,
  }))
  const session = useSyncExternalStore(auth.subscribe, auth.getSnapshot)

  // Restores the session on mount; cleanup cancels it (React Strict Mode safe).
  useEffect(() => auth.start(), [auth])

  const value = useMemo(() => ({
    ...session,
    configured: authConfig.configured,
    retrySession: auth.restore,
    signIn: auth.signIn,
    signOut: auth.signOut,
    cancelMfa: auth.cancelMfa,
    verifyMfa: auth.verifyMfa,
    startMfaEnrollment: auth.startMfaEnrollment,
    confirmMfaEnrollment: auth.confirmMfaEnrollment,
    startMfaReplacement: auth.startMfaReplacement,
    confirmMfaReplacement: auth.confirmMfaReplacement,
    changePassword: auth.changePassword,
    getPasswordPolicy: auth.getPasswordPolicy,
    requestRecovery: auth.requestRecovery,
    completePasswordSetup: auth.completePasswordSetup,
    completePasswordReset: auth.completePasswordReset,
    startMfaRecovery: auth.startMfaRecovery,
    confirmMfaRecovery: auth.confirmMfaRecovery,
  }), [session, auth])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
