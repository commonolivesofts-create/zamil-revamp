import { useEffect } from 'react'
import { useParams } from 'react-router'
import { usePrintOfferLetter } from './printOfferLetter.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { offerFormFromRecord } from './offerModel.js'
import { OfferLetter } from './OfferLetter.jsx'

const service = hrRecruitmentServices.offers

// A print-only entry point for the employment offer: it renders a hidden
// `@media print` target with the saved letter so `window.print()` in the form
// prints a clean, borderless page. The target must stay out of the flow and
// inert to screen users (aria-hidden, display:none).
export default function OfferPrintPage() {
  const { offerId } = useParams()
  const { printOffer, printRecord, setPrintRecord, printing, setPrinting, printError, setPrintError } = usePrintOfferLetter()

  useEffect(() => {
    let active = true
    setPrinting(true)
    setPrintError('')
    service.getById(offerId).then((record) => {
      if (!active) return
      setPrintRecord(record)
      return printOffer(record)
    }).catch(() => {
      if (!active) return
      setPrintError('Could not load this offer for printing. Try again.')
      setPrinting(false)
    })
    return () => { active = false }
  }, [offerId, printOffer, setPrintError, setPrintRecord, setPrinting])

  if (printing) {
    return (
      <div className="zrv-hr zrv-hr--offer zrv-hr--print-cover" aria-hidden="true">
        <div className="zrv-hr-body"><div className="zrv-hr-side">
          {printRecord ? (
            <OfferLetter form={offerFormFromRecord(printRecord)} language="bi" />
          ) : (
            <p className="zrv-admin-state">Preparing the print booklet…</p>
          )}
        </div></div>
      </div>
    )
  }

  return <p role="alert">{printError || 'Preparing offer letter…'}</p>
}
