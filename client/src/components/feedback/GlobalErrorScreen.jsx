import PageState from './PageState.jsx'
import { getApiUnavailableError, notifyApiRetryCompleted } from '@/services/api/apiEvents.js'

export const GLOBAL_ERROR_TITLE = "We're having trouble connecting"
export const GLOBAL_ERROR_DESCRIPTION =
  "We're unable to establish a connection with our servers right now. Please check your internet connection or try again in a moment."

export default function GlobalErrorScreen({
  onRetry = () => {},
  inline = false,
  isRetrying = false,
  retryAll = true,
}) {
  const retry = () => {
    if (retryAll && getApiUnavailableError()?.placement === 'resource') {
      notifyApiRetryCompleted()
      return
    }
    return onRetry()
  }

  return (
    <PageState
      kind="error"
      title={GLOBAL_ERROR_TITLE}
      description={GLOBAL_ERROR_DESCRIPTION}
      actionLabel="Retry"
      onAction={retry}
      actionDisabled={isRetrying}
      actionLoading={isRetrying}
      className={inline ? 'zrv-page-state--inline' : undefined}
    >
      <p className="zrv-page-state__description">Please try again shortly.</p>
    </PageState>
  )
}
