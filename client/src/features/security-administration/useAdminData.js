import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import usePermissions from '@/features/access/usePermissions.js'
import { createLatestRequest, createSubmissionGuard } from './adminRequests.js'
import { describeFailure } from './adminFeedback.js'

// Loads data for `key` (null = nothing to load). A new key or reload() aborts
// the previous request; a late response never replaces a newer one. While the
// same key reloads, the previous data stays visible (`refreshing`); data for a
// different key (another user, role or filter) is never shown.
// Returns { status: idle | loading | ready | error, data, error, refreshing, reload }.
export function useResource(key, load) {
  const [request] = useState(createLatestRequest)
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState({ base: null, requestKey: null, status: 'loading', data: null, error: null })
  const fetchData = useEffectEvent((signal) => load(signal))
  const requestKey = key === null ? null : `${key}#${version}`

  useEffect(() => {
    if (requestKey === null) return undefined
    const { signal, isCurrent } = request.start()
    Promise.resolve()
      .then(() => fetchData(signal))
      .then(
        (data) => { if (isCurrent()) setResult({ base: key, requestKey, status: 'ready', data, error: null }) },
        (error) => { if (isCurrent()) setResult({ base: key, requestKey, status: 'error', data: null, error }) },
      )
    return () => request.cancel()
  }, [key, requestKey, request])

  const reload = useCallback(() => setVersion((value) => value + 1), [])

  if (requestKey === null) return { status: 'idle', data: null, error: null, refreshing: false, reload }
  if (result.requestKey === requestKey) return { ...result, refreshing: false, reload }
  if (result.base === key && result.status === 'ready') return { ...result, refreshing: true, reload }
  return { status: 'loading', data: null, error: null, refreshing: false, reload }
}

// Runs one state-changing operation at a time and reports its outcome.
// `run(operation, { success })` resolves to the submission outcome; feedback
// is set for display. A refused action because permissions changed refreshes
// the effective permissions, so the page and navigation follow the backend.
export function useAdminAction() {
  const { reload: reloadPermissions } = usePermissions()
  const [guard] = useState(createSubmissionGuard)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const run = useCallback(async (operation, { success } = {}) => {
    if (guard.isPending()) return { status: 'ignored' }
    setPending(true)
    setFeedback(null)
    const outcome = await guard.run(operation)
    setPending(false)
    if (outcome.status === 'success') {
      const message = typeof success === 'function' ? success(outcome.value) : success
      if (message) setFeedback({ kind: 'success', message, details: [] })
    } else if (outcome.status !== 'ignored') {
      const failure = describeFailure(outcome.error)
      if (failure.permissionChanged) reloadPermissions()
      setFeedback(failure)
    }
    return outcome
  }, [guard, reloadPermissions])

  return { pending, feedback, setFeedback, run }
}
