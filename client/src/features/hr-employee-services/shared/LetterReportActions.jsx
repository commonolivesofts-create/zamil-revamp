import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { RecruitmentToast } from '@/features/hr-recruitment/shared/components/RecruitmentToast.jsx'
import { usePrintLetter } from './printLetter.js'

// Toolbar above a saved letter in a report drawer: the permission-aware Edit
// and Print actions, the print feedback and the hidden print target. The
// approval decision, when a module has one, lives below the paper
// (LetterWorkflowActions), never here beside Print.
export function LetterReportActions({
  row,
  reference,
  editPath,
  editPermission,
  viewPermission,
  canEdit = () => true,
  loadRecord,
  paper,
  moduleClass,
  printNoun,
  language = 'bi',
  previewRecord = null,
}) {
  const permissions = usePermissions()
  const printer = usePrintLetter()
  const { printing, printError } = printer
  const record = previewRecord ?? row
  const editable = canEdit(record)

  const printLetter = async (event) => {
    event.stopPropagation()
    if (printing) return
    // Update the action immediately; the saved letter fetch can take a moment.
    printer.setPrintError('')
    printer.setPrinting(true)
    try {
      const loaded = previewRecord ?? (await loadRecord())
      printer.updateRecord(loaded)
      const printed = await printer.printLetter()
      if (!printed) printer.setPrintError('The print dialog could not be opened. Try again.')
    } catch {
      printer.setPrinting(false)
      printer.setPrintError(`Could not load this ${printNoun} for printing. Try again.`)
    }
  }

  return <div className="zrv-ir-letter-actions">
    {editable && permissions.can(editPermission) && (
      <Link className="zrv-ir-btn" to={editPath} onClick={(event) => event.stopPropagation()}
        aria-label={`Edit ${printNoun} ${reference}`} title={`Edit ${printNoun} ${reference}`}>
        <OrvexaIcon name="pencil" size={15} /><span>Edit</span>
      </Link>
    )}
    {permissions.can(viewPermission) && (
      <button type="button" className="zrv-ir-btn zrv-ir-btn--primary zrv-ir-letter-print-btn" onClick={printLetter} disabled={printing}
        aria-label={`${printing ? 'Preparing' : 'Print'} ${printNoun} ${reference}`} title={`Print ${printNoun} ${reference}`}>
        <OrvexaIcon name="printer" size={15} /><span>{printing ? 'Preparing' : 'Print'}</span>
      </button>
    )}
    {printError && <span className="zrv-ir-letter-print-error" role="status">{printError}</span>}
    {printer.printRecord && createPortal(<div className={`zrv-hr ${moduleClass} zrv-ir-letter-print`} aria-hidden="true">
      <div className="zrv-hr-body"><div className="zrv-hr-side">
        {paper(printer.printRecord, language)}
      </div></div>
    </div>, document.body)}
  </div>
}

// The approval decision belongs below the saved letter. Only the modules whose
// legacy workflows actually approve or reject a record use this. The workflow
// is not connected yet: the buttons report that instead of changing the record
// (the recruitment forms' pending notice).
export function LetterWorkflowActions({ reference, status, resource, noun, previewRecord = null }) {
  const permissions = usePermissions()
  const current = previewRecord?.status ?? status
  const canDecide = permissions.can(`${resource}:UPDATE`) && current === 'INPROCESS'
  const [notice, setNotice] = useState(null)

  const pendingWorkflow = (decision) => setNotice({
    kind: 'info',
    message: `The approval workflow is pending setup. This ${noun} has not been ${decision}.`,
  })

  if (!canDecide) return null

  return <div className="zrv-ir-letter-workflow">
    <span className="zrv-ir-letter-workflow__label">Approval decision</span>
    <div className="zrv-ir-letter-workflow__actions">
      <button type="button" className="zrv-ir-btn zrv-ir-letter-approve" onClick={() => pendingWorkflow('approved')}
        aria-label={`Approve ${noun} ${reference}`} title={`Approve ${noun} ${reference}`}>
        <OrvexaIcon name="check" size={15} /><span>Approve</span>
      </button>
      <button type="button" className="zrv-ir-btn zrv-ir-letter-reject" onClick={() => pendingWorkflow('rejected')}
        aria-label={`Reject ${noun} ${reference}`} title={`Reject ${noun} ${reference}`}>
        <OrvexaIcon name="x" size={15} /><span>Reject</span>
      </button>
    </div>
    <RecruitmentToast feedback={notice} onDismiss={() => setNotice(null)} />
  </div>
}
