import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAdminAction } from '@/features/security-administration/useAdminData.js'
import { describeFailure } from '@/features/security-administration/adminFeedback.js'

// Navigation state carries only the step to reopen and a plain message (never
// record data): a new record moves to its own URL after its first save.
const readStep = (state) => (Number.isInteger(state?.step) && state.step >= 0 && state.step <= 3 ? state.step : 0)
const readNotice = (state) => (
  state?.notice && typeof state.notice.message === 'string' && ['success', 'error', 'unknown'].includes(state.notice.kind)
    ? { kind: state.notice.kind, message: state.notice.message, details: [] }
    : null
)

const outcomeFeedback = (outcome, success) => {
  if (outcome.status === 'success') return success ? { kind: 'success', message: success } : null
  if (outcome.status === 'ignored') return null
  const failure = describeFailure(outcome.error)
  return { kind: failure.kind, message: failure.message }
}

// Form state of one recruitment record: answers, step, the last saved record,
// unsaved-change tracking and one change at a time through useAdminAction
// (never auto-retried; unknown outcomes are explained, not reported as
// success).
export function useRecruitmentForm({ basePath, idKey, record: initialRecord, initialForm }) {
  const navigate = useNavigate()
  const location = useLocation()
  const action = useAdminAction()
  const [record, setRecord] = useState(initialRecord)
  const [form, setForm] = useState(initialForm)
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialForm))
  const [step, setStep] = useState(() => readStep(location.state))
  const [notice, setNotice] = useState(() => readNotice(location.state))
  const [focusError, setFocusError] = useState(0)

  const dirty = JSON.stringify(form) !== baseline
  const set = (key) => (eventOrValue) => {
    const value = eventOrValue?.target ? eventOrValue.target.value : eventOrValue
    setForm((current) => ({ ...current, [key]: value }))
  }
  const patch = (changes) => setForm((current) => ({ ...current, ...(typeof changes === 'function' ? changes(current) : changes) }))

  const showProblem = (message, details = []) => {
    setNotice(null)
    action.setFeedback({ kind: 'error', message, details })
  }
  // A failed validation opens the step with the first problem and focuses it.
  const reject = (targetStep, message, details = []) => {
    setStep(targetStep)
    setFocusError((value) => value + 1)
    showProblem(message, details)
  }
  const dismiss = () => {
    setNotice(null)
    action.setFeedback(null)
  }

  // Runs a change. `operation({ saved })` reports each record the server
  // returns, so a new record keeps its id even if a later call fails.
  async function perform(operation, { success } = {}) {
    setNotice(null)
    const snapshot = JSON.stringify(form)
    let created = null
    const keep = (saved) => {
      if (!record && !created) created = saved
      setRecord(saved)
    }
    const outcome = await action.run(() => operation({ saved: keep }), { success })
    if (outcome.status === 'success') setBaseline(snapshot)
    if (created) {
      const message = typeof success === 'function' && outcome.status === 'success' ? success(outcome.value) : success
      navigate(`${basePath}/${created[idKey]}`, { replace: true, state: { step, notice: outcomeFeedback(outcome, message) } })
    }
    return outcome
  }

  return {
    record, form, setForm, set, patch, step, setStep, dirty, pending: action.pending,
    feedback: action.feedback ?? notice, dismiss, reject, showProblem, perform, focusError,
    recordId: record?.[idKey] ?? null,
  }
}
