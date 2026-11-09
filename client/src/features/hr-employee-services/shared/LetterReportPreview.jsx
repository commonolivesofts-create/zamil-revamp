import { useCallback, useEffect, useRef, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import PreviewLanguageSwitch from './PreviewLanguageSwitch.jsx'
// The reports are lazily loaded routes and do not go through the form pages,
// so the paper styles must load with these previews too.
import '@/styles/hr-employee-services-forms.css'

// A report row opens this in the plain drawer: the saved letter filled exactly
// as the form's live paper preview shows it, with the same language switch
// (when the paper has one) and the module's permission-aware actions above it.
// The paper has its own scroll, so the toolbar with the close button stays in
// place.
export function LetterReportPreview({
  row,
  recordKey,
  onClose,
  label,
  loading,
  failed,
  retryText = 'Try again',
  closeLabel = 'Close preview',
  load,
  paper,
  actions,
  workflow,
  languageSwitch = true,
  initialLanguage = 'bi',
  moduleClass,
}) {
  const [language, setLanguage] = useState(initialLanguage)
  const [record, setRecord] = useState({ status: 'loading' })
  const inflight = useRef(null)
  // Module previews pass an inline loader; keep the newest one without making
  // it an effect dependency (which would refetch on every render).
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])
  const ready = record.status === 'ready'
  const isFailed = record.status === 'error'

  const loadInto = useCallback((controller) => {
    loadRef.current(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setRecord({ status: 'ready', data: loaded })
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecord({ status: 'error' })
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    inflight.current = controller
    loadInto(controller)
    return () => controller.abort()
  }, [recordKey, loadInto])

  // The retry button supersedes whatever is still in flight.
  const retry = () => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    setRecord({ status: 'loading' })
    loadInto(controller)
  }

  const saved = ready ? record.data : null
  return (
    <section className={`zrv-ir-letter-preview${moduleClass ? ` ${moduleClass}` : ''}`} aria-label={label}>
      <div className="zrv-ir-letter-preview__bar">
        {languageSwitch && <PreviewLanguageSwitch value={language} onChange={setLanguage} />}
        {actions?.({ row, record: saved, language })}
        <button type="button" className="zrv-hr-rp-drawer__x" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <OrvexaIcon name="x" size={18} />
        </button>
      </div>
      {ready ? paper(saved, language) : isFailed ? (
        <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>{failed}</p>
          <button type="button" className="btn-secondary" onClick={retry}>{retryText}</button>
        </div>
      ) : (
        <LetterReportSkeleton label={loading} />
      )}
      {workflow?.({ row, record: saved })}
    </section>
  )
}

// The saved letter is paper-shaped, so the placeholder is too: the same shimmer
// as the employment offer's letter skeleton over a page-shaped grid.
export function LetterReportSkeleton({ label }) {
  return (
    <div className="zrv-ir-letter-skeleton" role="status" aria-label={label} aria-busy="true">
      <div className="zrv-ir-letter-skeleton__header"><i /><i /></div>
      <div className="zrv-ir-letter-skeleton__grid" aria-hidden="true">
        <i className="zrv-ir-letter-skeleton__wide" />
        <i /><i />
        <i /><i />
        <i /><i />
        <i /><i />
      </div>
      <i className="zrv-ir-letter-skeleton__comments" />
      <div className="zrv-ir-letter-skeleton__files"><i /><i /></div>
      <i className="zrv-ir-letter-skeleton__footer" />
    </div>
  )
}
