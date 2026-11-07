import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { RecruitmentToast } from '@/features/hr-recruitment/shared/components/RecruitmentToast.jsx'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { isEditable } from '../shared/formRecords.js'
import { sickLeaveFormFromRecord } from './sickLeaveModel.js'
import { sickLeaveService } from './sickLeaveService.js'
import SickLeavePreview from './SickLeavePreview.jsx'
import { usePrintSickLeave } from './printSickLeave.js'

const RESOURCE = 'HR.SICK_LEAVE'
const singleOf = (form) => Boolean(form.fromDate && form.fromDate === form.toDate)

// Toolbar above the paper: the permission-aware Edit and Print actions, the
// print feedback and the hidden print target. The approval decision lives at
// the bottom of the drawer (SickLeaveWorkflowActions).
export function SickLeaveReportActions({ row, language = 'bi', previewRecord = null }) {
  const permissions = usePermissions()
  const path = `${FORM_PATHS.sickLeave}/${encodeURIComponent(row.leaveId)}`
  const reference = row.leaveId
  const status = previewRecord?.status ?? row.status
  const canWrite = permissions.can(`${RESOURCE}:UPDATE`)

  const printer = usePrintSickLeave()
  const { printing, printError } = printer

  const printRequest = async (event) => {
    event.stopPropagation()
    if (printing) return
    // Update the action immediately; the saved request fetch can take a moment.
    printer.setPrintError('')
    printer.setPrinting(true)
    try {
      const record = previewRecord ?? (await sickLeaveService.getById(row.leaveId))
      printer.updateRecord(record)
      const printed = await printer.printRequest()
      if (!printed) printer.setPrintError('The print dialog could not be opened. Try again.')
    } catch {
      printer.setPrinting(false)
      printer.setPrintError('Could not load this request for printing. Try again.')
    }
  }

  return <div className="zrv-ir-sick-leave-actions">
    {canWrite && isEditable(status) && (
      <Link className="zrv-ir-btn" to={path} onClick={(event) => event.stopPropagation()}
        aria-label={`Edit sick leave request ${reference}`} title={`Edit sick leave request ${reference}`}>
        <OrvexaIcon name="pencil" size={15} /><span>Edit</span>
      </Link>
    )}
    {permissions.can(`${RESOURCE}:VIEW`) && (
      <button type="button" className="zrv-ir-btn zrv-ir-btn--primary zrv-ir-sick-leave-print-btn" onClick={printRequest} disabled={printing}
        aria-label={`${printing ? 'Preparing' : 'Print'} sick leave request ${reference}`} title={`Print sick leave request ${reference}`}>
        <OrvexaIcon name="printer" size={15} /><span>{printing ? 'Preparing' : 'Print'}</span>
      </button>
    )}
    {printError && <span className="zrv-ir-sick-leave-print-error" role="status">{printError}</span>}
    {printer.printRecord && createPortal(<div className="zrv-hr zrv-hr--sick-leave zrv-ir-sick-leave-print" aria-hidden="true">
      <div className="zrv-hr-body"><div className="zrv-hr-side">
        <SickLeavePreview
          form={sickLeaveFormFromRecord(printer.printRecord)}
          record={printer.printRecord}
          days={printer.printRecord.days}
          single={singleOf(sickLeaveFormFromRecord(printer.printRecord))}
          files={printer.printRecord.attachments}
          language={language}
        />
      </div></div>
    </div>, document.body)}
  </div>
}

// The approval decision belongs below the saved request, never in the toolbar
// beside Print. The workflow is not connected yet: the buttons report that
// instead of changing the request (the recruitment forms' pending notice).
export function SickLeaveWorkflowActions({ row, previewRecord = null }) {
  const permissions = usePermissions()
  const reference = row.leaveId
  const status = previewRecord?.status ?? row.status
  const canWrite = permissions.can(`${RESOURCE}:UPDATE`)
  const canDecide = canWrite && status === 'INPROCESS'
  const [notice, setNotice] = useState(null)

  const pendingWorkflow = (decision) => setNotice({
    kind: 'info',
    message: `The approval workflow is pending setup. This sick leave request has not been ${decision}.`,
  })

  if (!canDecide) return null

  return <div className="zrv-ir-sick-leave-workflow">
    <span className="zrv-ir-sick-leave-workflow__label">Approval decision</span>
    <div className="zrv-ir-sick-leave-workflow__actions">
      <button type="button" className="zrv-ir-btn zrv-ir-sick-leave-approve" onClick={() => pendingWorkflow('approved')}
        aria-label={`Approve sick leave request ${reference}`} title={`Approve sick leave request ${reference}`}>
        <OrvexaIcon name="check" size={15} /><span>Approve</span>
      </button>
      <button type="button" className="zrv-ir-btn zrv-ir-sick-leave-reject" onClick={() => pendingWorkflow('rejected')}
        aria-label={`Reject sick leave request ${reference}`} title={`Reject sick leave request ${reference}`}>
        <OrvexaIcon name="x" size={15} /><span>Reject</span>
      </button>
    </div>
    <RecruitmentToast feedback={notice} onDismiss={() => setNotice(null)} />
  </div>
}
