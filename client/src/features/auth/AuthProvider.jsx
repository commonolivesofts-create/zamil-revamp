import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authConfig } from '@/config/authConfig.js'
import { AuthContext } from './AuthContext.js'
import { subscribeApiUnauthorized } from '@/services/api/apiEvents.js'
import { fetchSession, requestRecovery, requestSignIn, requestSignOut } from './authService.js'

const initialSession = authConfig.developmentPreview
  ? { status: 'preview', user: null }
  : { status: authConfig.configured ? 'loading' : 'guest', user: null }

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(initialSession)
  const sessionRevision = useRef(0)
  const activeCheck = useRef(null)

  // A late response must never restore a session after logout, an API 401,
  // or a newer check. Aborting also handles React Strict Mode effect cleanup.
  const invalidateCheck = useCallback(() => {
    sessionRevision.current += 1
    activeCheck.current?.abort()
    activeCheck.current = null
    return sessionRevision.current
  }, [])

  // Retry is an explicit user action, so it may show loading immediately.
  const retrySession = useCallback(async () => {
    if (!authConfig.configured) return
    const revision = invalidateCheck()
    const controller = new AbortController()
    activeCheck.current = controller
    setSession({ status: 'loading', user: null })
    try {
      const user = await fetchSession({ signal: controller.signal })
      if (revision === sessionRevision.current && !controller.signal.aborted) {
        setSession({ status: user ? 'authenticated' : 'guest', user })
      }
    } catch {
      if (revision === sessionRevision.current && !controller.signal.aborted) {
        setSession({ status: 'error', user: null })
      }
    } finally {
      if (activeCheck.current === controller) activeCheck.current = null
    }
  }, [invalidateCheck])

  // On mount, initial state is already 'loading'. Only the asynchronous
  // promise callbacks update state; no state-setting function is called
  // synchronously by this effect.
  useEffect(() => {
    if (!authConfig.configured) return undefined

    const revision = invalidateCheck()
    const controller = new AbortController()
    activeCheck.current = controller

    void fetchSession({ signal: controller.signal })
      .then((user) => {
        if (revision === sessionRevision.current && !controller.signal.aborted) {
          setSession({ status: user ? 'authenticated' : 'guest', user })
        }
      })
      .catch(() => {
        if (revision === sessionRevision.current && !controller.signal.aborted) {
          setSession({ status: 'error', user: null })
        }
      })
      .finally(() => {
        if (activeCheck.current === controller) activeCheck.current = null
      })

    return () => { invalidateCheck() }
  }, [invalidateCheck])

  // Only a real authenticated session is invalidated by an API 401.
  // Development preview cannot turn into an authenticated session.
  useEffect(() => subscribeApiUnauthorized(() => {
    invalidateCheck()
    setSession((current) => current.status === 'authenticated'
      ? { status: 'guest', user: null }
      : current)
  }), [invalidateCheck])

  const signIn = useCallback(async (input) => {
    const revision = invalidateCheck()
    const user = await requestSignIn(input)
    if (revision === sessionRevision.current) {
      setSession({ status: 'authenticated', user })
    }
    return user
  }, [invalidateCheck])

  const signOut = useCallback(async () => {
    const revision = invalidateCheck()
    await requestSignOut()
    if (revision === sessionRevision.current) {
      setSession({ status: 'guest', user: null })
    }
  }, [invalidateCheck])

  const recoverPassword = useCallback((email) => requestRecovery(email), [])

  const value = useMemo(() => ({
    ...session,
    configured: authConfig.configured,
    retrySession,
    signIn,
    signOut,
    recoverPassword,
  }), [session, retrySession, signIn, signOut, recoverPassword])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
