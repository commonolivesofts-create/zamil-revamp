import { createPortal } from 'react-dom'

export function RecruitmentPending({ message }) {
  return createPortal(
    <div className="zrv-hr-submitting">
      <div className="zrv-hr-submitting__card" role="status" aria-live="polite" aria-atomic="true">
        <span className="zrv-hr-submitting__spinner" aria-hidden="true" />
        <strong>{message}</strong>
        <p>Please wait while we process your request.</p>
        <span className="zrv-hr-submitting__note">This may take a moment.</span>
      </div>
    </div>, document.body,
  )
}
