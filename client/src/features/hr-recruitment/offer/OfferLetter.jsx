import { COMMON_TEXT, OFFER_TEXT as T } from '../hrRecruitmentText.js'
import { isIsoDate, toAmount } from '../shared/hrFormat.js'
import { BENEFIT_KEYS } from './offerModel.js'
import '@/styles/hr-offer-letter.css'

function letterDate(value) {
  if (!isIsoDate(value)) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`)).replaceAll(' ', '-').toUpperCase()
}

function benefitValue(key, value) {
  if (key === 'start') return letterDate(value)
  const amount = key === 'basic' ? toAmount(value) : null
  return amount === null ? value : amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// The form preview, report preview, and every print action render this same letter.
// The selected language is also used in the printed document.
export function OfferLetter({ form, language = 'bi', focusRow }) {
  const placeholder = (value, fallback = COMMON_TEXT.dash) => value?.trim()
    ? value : <span className="zrv-hr-paper__ph">{fallback}</span>
  return (
    <article className="zrv-hr-paper zrv-offer-letter" data-lang={language} aria-label={T.letter.label}>
      <header className="zrv-offer-letter__header">
        <span className="zrv-offer-letter__company">Zamil Plastic Industries Co.</span>
        <img src="/zamil-logo.png" width="398" height="157" alt="Zamil Plastics" loading="eager" />
        <span className="zrv-offer-letter__company" dir="rtl" lang="ar">شركة الزامل للصناعات البلاستيكية</span>
      </header>
      <p className="zrv-offer-letter__date">Date : {placeholder(letterDate(form.offerDate), T.letter.placeholders.date)}</p>
      <div className="zrv-offer-letter__recipient">
        <p data-l="en">To : {form.salutation} {placeholder(form.candidateNameEn, T.letter.placeholders.name)}</p>
        <p data-l="ar" dir="rtl" lang="ar">إلى {form.salutationAr} {placeholder(form.candidateNameAr, T.letterAr.placeholders.name)}/</p>
      </div>
      <h2 className="zrv-offer-letter__title"><span data-l="en">Employment Offer</span>{' '}<span data-l="ar" dir="rtl" lang="ar">عرض وظيفي</span></h2>
      <p className="zrv-offer-letter__intro" data-l="en">We are pleased to offer you the Position of ({placeholder(form.position, T.letter.placeholders.position)}) with the following terms &amp; conditions:</p>
      <p className="zrv-offer-letter__intro zrv-offer-letter__arabic-intro" data-l="ar" dir="rtl" lang="ar">{T.letterAr.offer} ({placeholder(form.position)}) {T.letterAr.terms}</p>
      <table className="zrv-offer-letter__table">
        <colgroup>
          <col className="zrv-offer-letter__number" data-l="en" /><col className="zrv-offer-letter__description" data-l="en" /><col className="zrv-offer-letter__benefit" data-l="en" />
          <col className="zrv-offer-letter__benefit-ar" data-l="ar" /><col className="zrv-offer-letter__description-ar" data-l="ar" /><col className="zrv-offer-letter__number-ar" data-l="ar" />
        </colgroup>
        <thead><tr>
          <th scope="col" data-l="en">Sr.</th><th scope="col" data-l="en">Description</th><th scope="col" data-l="en">Benefits</th>
          <th scope="col" data-l="ar" dir="rtl" lang="ar">المزايـــــا</th><th scope="col" data-l="ar" dir="rtl" lang="ar">الوصف</th><th scope="col" data-l="ar" lang="ar">م</th>
        </tr></thead>
        <tbody>{BENEFIT_KEYS.map((key, index) => (
          <tr key={key} className={focusRow === key ? 'zrv-hr-is-hl' : undefined}>
            <td data-l="en">{index + 1}.</td><td data-l="en">{T.benefits[key].en}</td>
            <td data-l="en">{placeholder(benefitValue(key, form.benefits[key].en))}</td>
            <td data-l="ar" dir="rtl" lang="ar">{placeholder(form.benefits[key].ar)}</td>
            <td data-l="ar" dir="rtl" lang="ar">{T.benefits[key].ar}</td><td data-l="ar">{index + 1}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="zrv-offer-letter__acceptance">
        <p data-l="en">Please signify your acceptance by signing this offer and return copy to our Administration Department to finalize required procedures.</p>
        <p data-l="ar" dir="rtl" lang="ar">الرجاء من المتقدم على الوظيفة توقيع هذا العرض الوظيفي وإرسالها إلى إدارة الشؤون الإدارية لإنهاء الإجراءات الأخرى</p>
      </div>
      <div className="zrv-offer-letter__comments"><span>Comments:-</span><p dir="auto">{form.comments}</p></div>
      <footer className="zrv-offer-letter__signatures">
        <div><b>Saad Al Essa</b><span>HR Manager</span></div>
        <div><b>Bader Alsulaim</b><span>General Manager</span></div>
        <div><b dir="auto">{form.applicant || '\u00a0'}</b><span>Applicant</span></div>
      </footer>
    </article>
  )
}
