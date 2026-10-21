// Framework-free request primitives for security administration, kept outside
// React so their race and duplicate handling is testable with the Node runner.
import { isOutcomeUnknown } from '../../services/api/apiClient.js'

// Latest request wins: starting a request aborts the previous one, and only the
// newest may apply its response (no stale list, record or filter result).
export function createLatestRequest() {
  let current = null
  return Object.freeze({
    start() {
      current?.abort()
      const controller = new AbortController()
      current = controller
      return { signal: controller.signal, isCurrent: () => current === controller && !controller.signal.aborted }
    },
    cancel() {
      current?.abort()
      current = null
    },
  })
}

// One state-changing submission at a time. A second submission while one is
// pending is ignored (never sent), so a double click cannot grant, revoke or
// issue twice. Outcomes:
//   success  — the backend confirmed the change;
//   failed   — the backend refused it (nothing changed);
//   unknown  — no reliable answer (network, timeout, unreadable or 500): the
//              change may or may not have been applied, so it is never retried
//              automatically and never reported as either.
//   ignored  — a submission was already pending.
export function createSubmissionGuard() {
  let pending = false
  return Object.freeze({
    isPending: () => pending,
    async run(operation) {
      if (pending) return Object.freeze({ status: 'ignored' })
      pending = true
      try {
        return Object.freeze({ status: 'success', value: await operation() })
      } catch (error) {
        return Object.freeze({ status: isOutcomeUnknown(error) ? 'unknown' : 'failed', error })
      } finally {
        pending = false
      }
    },
  })
}
