import { COMMON_TEXT, OFFER_TEXT as T } from '../hrRecruitmentText.js'
import { arDate, enDate } from '../shared/hrFormat.js'
import { BENEFIT_KEYS, englishDisplay } from './offerModel.js'

// Live offer preview layout carried over from feat/personnel-requisition-enhancement.
// The print-ready letter remains a separate component.
export function OfferLivePreview({ form, language = 'bi', focusRow, offerId }) {
  const currency = 'SAR'
  const placeholder = (value, fallback) => (value ? value : <span className="zrv-hr-paper__ph">{fallback}</span>)

  return (
    <article className="zrv-hr-paper zrv-offer-live" data-lang={language} aria-label={T.letter.label}>
      <div className="zrv-hr-paper__top">
        <div className="zrv-hr-paper__brand">
          {T.letter.brand}
          <small>
            {T.letter.kind}
            {offerId ? ` | ${offerId}` : ''}
          </small>
        </div>
        <h4>
          <span data-l="en">{T.letter.title}</span>
          <span data-l="ar" dir="rtl" lang="ar">
            {T.letterAr.title}
          </span>
        </h4>
      </div>
      <p data-l="en">
        {T.letter.date} {placeholder(enDate(form.offerDate), T.letter.placeholders.date)}
      </p>
      <p data-l="ar" dir="rtl" lang="ar">
        {T.letterAr.date} {placeholder(arDate(form.offerDate), T.letterAr.placeholders.date)}
      </p>
      <p data-l="en">
        {T.letter.to} {form.salutation} {placeholder(form.candidateNameEn.trim(), T.letter.placeholders.name)}
      </p>
      <p data-l="ar" dir="rtl" lang="ar">
        {T.letterAr.to} {form.salutationAr} {placeholder(form.candidateNameAr.trim(), T.letterAr.placeholders.name)}
      </p>
      <p data-l="en">
        {T.letter.offer} <b>{placeholder(form.position.trim(), T.letter.placeholders.position)}</b> {T.letter.terms}
      </p>
      <p data-l="ar" dir="rtl" lang="ar">
        {T.letterAr.offer} <b>{placeholder(form.position.trim(), T.letterAr.placeholders.position)}</b>{' '}
        {T.letterAr.terms}
      </p>
      <table className="zrv-hr-paper__tbl">
        <thead>
          <tr>
            <th scope="col" data-l="en">
              {T.letter.number}
            </th>
            <th scope="col" data-l="en">
              {T.letter.description}
            </th>
            <th scope="col" data-l="en">
              {T.letter.benefits}
            </th>
            <th scope="col" dir="rtl" lang="ar" data-l="ar">
              {T.letterAr.benefits}
            </th>
            <th scope="col" dir="rtl" lang="ar" data-l="ar">
              {T.letterAr.description}
            </th>
            <th scope="col" dir="rtl" lang="ar" data-l="ar">
              {T.letterAr.number}
            </th>
          </tr>
        </thead>
        <tbody>
          {BENEFIT_KEYS.map((key, index) => (
            <tr key={key} className={focusRow === key ? 'zrv-hr-is-hl' : undefined}>
              <td className="zrv-hr-is-n" data-l="en">
                {index + 1}
              </td>
              <td data-l="en">{T.benefits[key].en}</td>
              <td data-l="en">{placeholder(englishDisplay(key, form.benefits[key].en, currency), COMMON_TEXT.dash)}</td>
              <td dir="rtl" lang="ar" data-l="ar">
                {placeholder(form.benefits[key].ar, COMMON_TEXT.dash)}
              </td>
              <td dir="rtl" lang="ar" data-l="ar">
                {T.benefits[key].ar}
              </td>
              <td className="zrv-hr-is-n" dir="rtl" lang="ar" data-l="ar">
                {(index + 1).toLocaleString('ar-EG')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p data-l="en">{T.acceptEn}</p>
      <p data-l="ar" dir="rtl" lang="ar">
        {T.acceptAr}
      </p>
      {form.comments.trim() && (
        <p>
          <b>{T.letter.comments}</b> {form.comments}
        </p>
      )}
      <footer className="zrv-hr-paper__sigs" aria-label="Offer signatures">
        <div>
          <div className="zrv-hr-paper__line" aria-hidden="true" />
          <b>Saad Al Essa</b>
          <span>HR Manager</span>
        </div>
        <div>
          <div className="zrv-hr-paper__line" aria-hidden="true" />
          <b>Bader Alsulaim</b>
          <span>General Manager</span>
        </div>
        <div>
          <div className="zrv-hr-paper__line" aria-hidden="true" />
          <b>{form.applicant || '\u00a0'}</b>
          <span>{T.letter.applicant}</span>
        </div>
      </footer>
    </article>
  )
}
