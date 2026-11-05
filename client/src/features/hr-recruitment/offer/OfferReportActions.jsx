import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { isOfferLocked, offerFormFromRecord } from './offerModel.js'
import { OfferLetter } from './OfferLetter.jsx'
import { usePrintOfferLetter } from './printOfferLetter.js'

export function OfferReportActions({ row, language = 'bi', previewRecord = null }) {
  const permissions = usePermissions()
  const path = `/hr/recruitment/offer/${encodeURIComponent(row.offerId)}`
  const reference = row.offerNumber || row.offerId

  const printer = usePrintOfferLetter()
  const { printing, printError } = printer

  const printOffer = async (event) => {
    event.stopPropagation()
    if (printing) return
    // Update the action immediately; the saved offer fetch can take a moment.
    printer.setPrintError('')
    printer.setPrinting(true)
    try {
      const record = previewRecord ?? (await hrRecruitmentServices.offers.getById(row.offerId))
      printer.updateRecord(record)
      await printer.printOffer()
    } catch {
      printer.setPrinting(false)
      printer.setPrintError('Could not load this offer for printing. Try again.')
    }
  }

  return <div className="zrv-ir-offer-actions">
    {!isOfferLocked(row.status) && permissions.can(ACTIONS.OFFER_UPDATE) && (
      <Link className="zrv-ir-btn" to={path} onClick={(event) => event.stopPropagation()}
        aria-label={`Edit employment offer ${reference}`} title={`Edit employment offer ${reference}`}>
        <OrvexaIcon name="pencil" size={15} /><span>Edit</span>
      </Link>
    )}
    {permissions.can(ACTIONS.OFFER_VIEW) && (
      <button type="button" className="zrv-ir-btn zrv-ir-btn--primary zrv-ir-offer-print-btn" onClick={printOffer} disabled={printing}
        aria-label={`${printing ? 'Preparing' : 'Print'} employment offer ${reference}`} title={`Print employment offer ${reference}`}>
        <OrvexaIcon name="printer" size={15} /><span>{printing ? 'Preparing' : 'Print'}</span>
      </button>
    )}
    {printError && <span className="zrv-ir-offer-print-error" role="status">{printError}</span>}
    {printer.printRecord && (
      createPortal(<div className="zrv-hr zrv-hr--offer zrv-ir-offer-print" aria-hidden="true">
        <div className="zrv-hr-body"><div className="zrv-hr-side">
          <OfferLetter form={offerFormFromRecord(printer.printRecord)} language={language} />
        </div></div>
      </div>, document.body)
    )}
  </div>
}
