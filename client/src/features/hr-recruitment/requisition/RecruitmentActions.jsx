import { useState } from 'react'
import usePermissions from '@/features/access/usePermissions.js'
import { useAdminAction, useResource } from '@/features/security-administration/useAdminData.js'
import { Feedback } from '@/features/security-administration/components/AdminUi.jsx'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'

const service = hrRecruitmentServices.requisitions
const LABELS = { hold: 'Put on hold', cancel: 'Cancel recruitment', reopen: 'Resume recruitment', fill: 'Mark filled / closed' }

export function RecruitmentActions({ requisitionId, onChanged }) {
  const permissions = usePermissions()
  const canUpdate = permissions.can(ACTIONS.REQUISITION_UPDATE)
  const details = useResource(canUpdate ? `recruitment-actions:${requisitionId}` : null,
    (signal) => service.getById(requisitionId, { signal }))
  const action = useAdminAction()
  const [reason, setReason] = useState('')
  const record = details.data
  const available = record?.recruitmentActions ?? []
  const apply = async (name) => {
    const outcome = await action.run(
      () => service.changeRecruitmentStatus(requisitionId, name, record.ticketStatus || 'Open', reason),
      { success: 'Recruitment status updated and recorded in the audit log.' },
    )
    if (outcome.status !== 'ignored') details.reload()
    if (outcome.status === 'success') {
      setReason('')
      onChanged({ ticketStatus: outcome.value.ticketStatus, acceptedDate: outcome.value.acceptedDate, closedDate: outcome.value.closedDate })
    }
  }

  if (!canUpdate || record?.status !== 'Approved' || !available.length) return null
  return (
    <section className="zrv-hr-recruitment-actions" aria-label="Manage recruitment">
      <b>Manage recruitment</b>
      <p>Each action records who changed the status, when, and the previous and new values.</p>
      <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />
      <fieldset disabled={action.pending || details.refreshing}>
        <label htmlFor={`recruitment-reason-${requisitionId}`}>Reason <span>(optional)</span></label>
        <textarea id={`recruitment-reason-${requisitionId}`} className="ux-textarea" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={2} placeholder="Add context for this change" />
        <div className="zrv-hr-recruitment-actions__buttons">
          {available.map((name) => <button key={name} type="button" className={`zrv-ir-btn${name === 'fill' ? ' zrv-ir-btn--primary' : ''}`} onClick={() => apply(name)}>{LABELS[name]}</button>)}
        </div>
      </fieldset>
      {record.ticketStatus === 'Open' && <small>Offer Accepted is recorded from the employment offer using the candidate's actual acceptance date.</small>}
    </section>
  )
}
