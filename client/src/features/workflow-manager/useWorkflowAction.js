import { useCallback, useState } from 'react'
import usePermissions from '@/features/access/usePermissions.js'
import { createSubmissionGuard } from '../security-administration/adminRequests.js'
import { describeWorkflowFailure, fieldErrorsFrom } from './workflowManagerModel.js'

// One state-changing Workflow Manager request at a time (a double click is
// ignored, never sent twice). Outcomes: success, failed (refused — nothing
// changed), unknown (no reliable answer: never retried and never reported as
// success or failure) and ignored. A 403 refreshes the user's permissions so
// navigation and buttons follow the backend. `fieldErrors` holds per-field
// messages from a 400 response.
export default function useWorkflowAction() {
  const { reload: reloadPermissions } = usePermissions()
  const [guard] = useState(createSubmissionGuard)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const run = useCallback(async (operation, { success } = {}) => {
    if (guard.isPending()) return { status: 'ignored' }
    setPending(true)
    setFeedback(null)
    setFieldErrors({})
    const outcome = await guard.run(operation)
    setPending(false)
    if (outcome.status === 'success') {
      const message = typeof success === 'function' ? success(outcome.value) : success
      if (message) setFeedback({ kind: 'success', message, details: [] })
    } else if (outcome.status !== 'ignored') {
      const failure = describeWorkflowFailure(outcome.error)
      if (failure.permissionChanged) reloadPermissions()
      setFieldErrors(fieldErrorsFrom(outcome.error))
      setFeedback(failure)
    }
    return outcome
  }, [guard, reloadPermissions])

  const reset = useCallback(() => {
    setFeedback(null)
    setFieldErrors({})
  }, [])

  return { pending, feedback, fieldErrors, setFeedback, run, reset }
}
