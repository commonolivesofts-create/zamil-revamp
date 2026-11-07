import { useCallback, useEffect, useRef, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import PreviewLanguageSwitch from '../shared/PreviewLanguageSwitch.jsx'
import { sickLeaveFormFromRecord } from './sickLeaveModel.js'
import { sickLeaveService } from './sickLeaveService.js'
import SickLeavePreview from './SickLeavePreview.jsx'
import { SickLeaveReportActions, SickLeaveWorkflowActions } from './SickLeaveReportActions.jsx'
// The report is a lazily loaded route and does not go through the form page,
// so the paper styles must load with this preview too.
import '@/styles/hr-employee-services-forms.css'

const TEXT = Object.freeze({
  label: 'Sick leave request preview',
  loading: 'Loading the sick leave request…',
  failed: 'The sick leave request could not be loaded.',
  retry: 'Try again',
  close: 'Close preview',
})

// A report row opens this in the plain drawer: the saved request filled exactly
// as the form's live paper preview shows it, with the same language switch and
// the permission-aware Edit and Print actions above it. The approval decision
// sits below the paper. The paper has its own scroll, so the toolbar with the
// close button stays in place.
export function SickLeaveReportPreview({ row, onClose }) {
  const [language, setLanguage] = useState('bi')
  const [request, setRequest] = useState({ status: 'loading' })
  const inflight = useRef(null)
  const ready = request?.status === 'ready'
  const failed = request?.status === 'error'

  const loadInto = useCallback((controller) => {
    sickLeaveService.getById(row.leaveId, { signal: controller.signal })
      .then((record) => {
        if (!controller.signal.aborted) setRequest({ status: 'ready', data: record })
      })
      .catch(() => {
        if (!controller.signal.aborted) setRequest({ status: 'error' })
      })
  }, [row.leaveId])

  useEffect(() => {
    const controller = new AbortController()
    inflight.current = controller
    loadInto(controller)
    return () => controller.abort()
  }, [loadInto])

  // The retry button supersedes whatever is still in flight.
  const retry = () => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    setRequest({ status: 'loading' })
    loadInto(controller)
  }

  const form = ready ? sickLeaveFormFromRecord(request.data) : null
  return (
    <section className="zrv-ir-sick-leave-preview" aria-label={TEXT.label}>
      <div className="zrv-ir-sick-leave-preview__bar">
        <PreviewLanguageSwitch value={language} onChange={setLanguage} />
        <SickLeaveReportActions row={row} language={language} previewRecord={ready ? request.data : null} />
        <button type="button" className="zrv-hr-rp-drawer__x" onClick={onClose} aria-label={TEXT.close} title={TEXT.close}>
          <OrvexaIcon name="x" size={18} />
        </button>
      </div>
      {ready ? (
        <SickLeavePreview
          form={form}
          record={request.data}
          days={request.data.days}
          single={Boolean(form.fromDate && form.fromDate === form.toDate)}
          files={request.data.attachments}
          language={language}
        />
      ) : failed ? (
        <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>{TEXT.failed}</p>
          <button type="button" className="btn-secondary" onClick={retry}>{TEXT.retry}</button>
        </div>
      ) : (
        <SickLeaveSkeleton label={TEXT.loading} />
      )}
      <SickLeaveWorkflowActions row={row} previewRecord={ready ? request.data : null} />
    </section>
  )
}

// The saved request is paper-shaped, so the placeholder is too: the same
// shimmer as the employment offer's letter skeleton over the sick leave grid.
function SickLeaveSkeleton({ label }) {
  return (
    <div className="zrv-ir-sick-leave-skeleton" role="status" aria-label={label} aria-busy="true">
      <div className="zrv-ir-sick-leave-skeleton__header"><i /><i /></div>
      <div className="zrv-ir-sick-leave-skeleton__grid" aria-hidden="true">
        <i className="zrv-ir-sick-leave-skeleton__wide" />
        <i /><i />
        <i /><i />
        <i /><i />
        <i /><i />
      </div>
      <i className="zrv-ir-sick-leave-skeleton__comments" />
      <div className="zrv-ir-sick-leave-skeleton__files"><i /><i /></div>
      <i className="zrv-ir-sick-leave-skeleton__footer" />
    </div>
  )
}
