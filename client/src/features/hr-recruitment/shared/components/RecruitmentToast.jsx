import { useEffect, useEffectEvent } from 'react'
import { createPortal } from 'react-dom'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'

export function RecruitmentToast({ feedback, onDismiss }) {
  const dismiss = useEffectEvent(() => onDismiss?.())
  useEffect(() => {
    if (feedback?.kind !== 'success') return undefined
    const timer = window.setTimeout(() => dismiss(), 6000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  if (!feedback) return null
  const { kind, message, details = [] } = feedback
  const success = kind === 'success'
  const info = kind === 'info'
  return createPortal(
    <div className={`zrv-hr-toast zrv-hr-toast--${kind}`} role={success || info ? 'status' : 'alert'} aria-atomic="true">
      <span className="zrv-hr-toast__icon" aria-hidden="true"><OrvexaIcon name={success ? 'circle-check' : info ? 'info' : kind === 'unknown' ? 'circle-help' : 'circle-alert'} size={21} /></span>
      <div className="zrv-hr-toast__body">
        <strong>{success ? 'Action completed' : info ? 'Workflow pending' : kind === 'unknown' ? 'Confirmation needed' : 'Unable to complete action'}</strong>
        <p>{message}</p>
        {details.length > 0 && <ul>{details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification"><OrvexaIcon name="x" size={17} /></button>
    </div>, document.body,
  )
}
