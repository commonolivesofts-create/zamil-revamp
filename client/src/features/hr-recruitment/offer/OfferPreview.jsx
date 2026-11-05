import { useCallback, useEffect, useState } from 'react'
import { OFFER_TEXT as T } from '../hrRecruitmentText.js'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { OfferLetter } from './OfferLetter.jsx'
import { OfferReportActions } from './OfferReportActions.jsx'
import { offerFormFromRecord } from './offerModel.js'

// A report row opens this in the summary drawer: the saved offer letter
// filled exactly as the form's live preview shows it, with the same language
// switch and the permission-aware Edit and Print actions above it. The letter
// has its own scroll, so the toolbar that holds the close button stays in
// place as the user scrolls through the letter.
export function OfferPreview({ row, onClose }) {
  const [language, setLanguage] = useState('bi')
  const [letter, setLetter] = useState({ status: 'loading' })
  const letterReady = letter?.status === 'ready'
  const letterError = letter?.status === 'error'

  const loadLetter = useCallback(async (signal) => {
    try {
      const record = await hrRecruitmentServices.offers.getById(row.offerId, { signal })
      if (!signal?.aborted) setLetter({ status: 'ready', data: record })
      return record
    } catch {
      if (!signal?.aborted) setLetter({ status: 'error' })
      return null
    }
  }, [row.offerId])

  useEffect(() => {
    const controller = new AbortController()
    hrRecruitmentServices.offers.getById(row.offerId, { signal: controller.signal })
      .then((record) => {
        if (!controller.signal.aborted) setLetter({ status: 'ready', data: record })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLetter({ status: 'error' })
      })
    return () => controller.abort()
  }, [row.offerId])

  // The toolbar is rendered above a scrollable letter so the close button,
  // language switch and Edit/Print actions stay visible while scrolling.
  return (
    <section className="zrv-ir-offer-preview" aria-label={T.report.preview.label}>
      <div className="zrv-ir-offer-preview__bar">
        <div className="zrv-hr-seg" role="group" aria-label={T.letter.languages} style={{ '--li': T.languages.findIndex(([value]) => value === language) }}>
          <span className="zrv-hr-seg__pill" aria-hidden="true" />
          {T.languages.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} lang={value === 'ar' ? 'ar' : undefined}>{label}</button>
          ))}
        </div>
        <OfferReportActions row={row} language={language} previewRecord={letterReady ? letter.data : null} />
        <button type="button" className="zrv-hr-rp-drawer__x" onClick={onClose} aria-label={T.close} title={T.close}>
          <OrvexaIcon name="x" size={18} />
        </button>
      </div>
      {letterReady ? (
        <OfferLetter form={offerFormFromRecord(letter.data)} language={language} />
      ) : letterError ? (
        <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>{T.report.preview.failed}</p>
          <button type="button" className="btn-secondary" onClick={() => { setLetter({ status: 'loading' }); void loadLetter() }}>{T.report.preview.retry}</button>
        </div>
      ) : (
        <OfferLetterSkeleton label={T.report.preview.loading} />
      )}
    </section>
  )
}

function OfferLetterSkeleton({ label }) {
  return (
    <div className="zrv-ir-offer-skeleton" role="status" aria-label={label} aria-busy="true">
      <div className="zrv-ir-offer-skeleton__header"><i /><i /><i /></div>
      <i className="zrv-ir-offer-skeleton__date" />
      <div className="zrv-ir-offer-skeleton__recipient"><i /><i /></div>
      <i className="zrv-ir-offer-skeleton__title" />
      <i className="zrv-ir-offer-skeleton__intro" />
      <div className="zrv-ir-offer-skeleton__table" aria-hidden="true">
        {Array.from({ length: 10 }, (_, row) => (
          <div className="zrv-ir-offer-skeleton__row" key={row}>
            {Array.from({ length: 6 }, (_, cell) => <i key={cell} />)}
          </div>
        ))}
      </div>
      <i className="zrv-ir-offer-skeleton__comments" />
      <div className="zrv-ir-offer-skeleton__signatures"><i /><i /><i /></div>
    </div>
  )
}
