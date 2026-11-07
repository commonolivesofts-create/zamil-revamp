import { useEffect, useMemo, useRef, useState } from 'react'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'

// A compact paper preview of the request, as Sick Leave's: the visitor, their
// passport, the company, the trip and the attached documents as the request
// will be read. The switch picks the language of the paper's labels: English,
// both (Arabic under English), or Arabic (the paper reads right to left).
// When image documents are attached, next/previous arrows (inside the card) and
// clicks on the left or right side of the card page through the form and each
// image in a loop with a slide animation.
const TEXT = Object.freeze({
  en: Object.freeze({
    eyebrow: 'Zamil Plastic', title: 'Business Visa Request', draft: 'Draft', notSaved: 'Not saved yet', status: 'Status',
    visitor: 'Visitor', nationality: 'Nationality', profession: 'Profession', passport: 'Passport no.',
    expiry: 'Passport expiry', arrival: 'Arrival', visa: 'Visa', company: 'Company', trip: 'Trip',
    expenses: 'Expenses', documents: 'Documents', requestedBy: 'Requested by',
    travel: 'Travel', hotel: 'Hotel', noDocuments: 'No documents attached yet.', embassyNotSet: 'Saudi embassy not set',
    visaSentTo: (city) => `Visa sent to ${city}`, via: (route) => `via ${route}`,
    single: 'Single', multiple: 'Multiple for 1 year', companyPaid: 'Company', personal: 'Personal', others: 'Others',
    prev: 'Previous page', next: 'Next page', page: 'Form', document: 'Attached document',
    imagePage: (index, total) => `Image ${index} of ${total}`, attached: 'Attached with this request',
    alt: (name) => `Attached document: ${name}`,
  }),
  ar: Object.freeze({
    eyebrow: 'زامل للبلاستيك', title: 'طلب تأشيرة زيارة عمل', draft: 'مسودة', notSaved: 'لم يُحفظ بعد', status: 'الحالة',
    visitor: 'الزائر', nationality: 'الجنسية', profession: 'المهنة', passport: 'رقم الجواز',
    expiry: 'انتهاء الجواز', arrival: 'تاريخ الوصول', visa: 'التأشيرة', company: 'الشركة', trip: 'الرحلة',
    expenses: 'المصاريف', documents: 'المستندات', requestedBy: 'مقدم الطلب',
    travel: 'السفر', hotel: 'الفندق', noDocuments: 'لا توجد مستندات مرفقة بعد.', embassyNotSet: 'لم تُحدَّد السفارة',
    visaSentTo: (city) => `تُرسل التأشيرة إلى ${city}`, via: (route) => `عبر ${route}`,
    single: 'زيارة واحدة', multiple: 'متعددة لمدة سنة', companyPaid: 'الشركة', personal: 'شخصي', others: 'أخرى',
    prev: 'الصفحة السابقة', next: 'الصفحة التالية', page: 'النموذج', document: 'المستند المرفق',
    imagePage: (index, total) => `صورة ${index} من ${total}`, attached: 'مرفقة مع هذا الطلب',
    alt: (name) => `المستند المرفق: ${name}`,
  }),
})
const EXPENSES = [['Company', 'companyPaid'], ['Personal', 'personal'], ['Other', 'others']]
const EMPTY_FILES = Object.freeze([])
const date = (value) => (value ? enDate(value) : '—')
const line = (...parts) => parts.filter(Boolean).join(' · ') || '—'
const isImageFile = (item) => Boolean(item?.file) && String(item.file.type ?? '').startsWith('image/')
const namesOf = (value) => (Array.isArray(value) ? value : []).map((item) => (typeof item === 'string' ? item : item?.fileName)).filter(Boolean)

function Chevron({ dir = 'next' }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="zrv-hr-esf-pagearrow__icon">
      <path d={dir === 'next' ? 'M7 4l6 6-6 6' : 'M13 4l-6 6 6 6'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function BusinessVisaRequestPreview({ form, record, divisionName, nationality, attachments = [], files, language = 'bi' }) {
  const text = TEXT[language === 'ar' ? 'ar' : 'en']
  const other = TEXT[language === 'ar' ? 'en' : 'ar']
  // A label in the chosen language; in both, the Arabic sits under the English.
  const label = (key) => (language === 'bi'
    ? <>{text[key]}<span className="zrv-hr-esf-preview__ar" lang="ar" dir="rtl">{other[key]}</span></>
    : text[key])
  const rtl = language === 'ar' ? { dir: 'rtl' } : null
  const lang = language === 'ar' ? { lang: 'ar' } : null
  const paidBy = (prefix) => EXPENSES.filter(([suffix]) => form[`${prefix}${suffix}`]).map(([, key]) => text[key]).join(', ') || '—'
  const visa = [form.visaSingle && text.single, form.visaMultiple && text.multiple].filter(Boolean).join(' · ')
  const otherDetails = form.travelOther || form.hotelOther ? form.otherDetails.trim() : ''
  const embassy = form.saudiEmbassy.trim()
  const status = record ? (record.status === 'DRAFT' ? text.draft : record.status) : text.notSaved
  // Accept either file items (saved + new, for image paging) or legacy name strings.
  const fileItems = Array.isArray(files) ? files : EMPTY_FILES
  const attachmentNames = namesOf(attachments.length ? attachments : fileItems)
  const imageFiles = useMemo(() => fileItems.filter(isImageFile), [fileItems])
  const imageUrls = useMemo(
    () => imageFiles.map((item) => ({ name: item.fileName, url: URL.createObjectURL(item.file) })),
    [imageFiles],
  )
  useEffect(() => () => imageUrls.forEach(({ url }) => URL.revokeObjectURL(url)), [imageUrls])
  const [page, setPage] = useState(0)
  const pageCount = 1 + imageUrls.length
  const safePage = pageCount > 0 ? Math.min(page, pageCount - 1) : 0
  const hasImages = imageUrls.length > 0
  const go = (step) => setPage((current) => {
    const count = 1 + imageUrls.length
    return count ? (current + step + count) % count : 0
  })
  // A click on the left/right side of the card turns the page; dragging to select text does not.
  const pointerDown = useRef(null)
  const onSideClick = (event) => {
    if (!hasImages) return
    const start = pointerDown.current
    if (!start) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6) return
    const { left, width } = event.currentTarget.getBoundingClientRect()
    go(event.clientX < left + width / 2 ? -1 : 1)
  }
  const pageLabel = safePage === 0 ? text.page : text.imagePage(safePage, imageUrls.length)
  const Arrow = ({ dir }) => (
    <button type="button" className={`zrv-hr-esf-pagearrow zrv-hr-esf-pagearrow--${dir}`} aria-label={dir === 'next' ? text.next : text.prev}
      onClick={(event) => { event.stopPropagation(); go(dir === 'next' ? 1 : -1) }}>
      <Chevron dir={dir} />
    </button>
  )
  const header = (eyebrow, title, ref) => (
    <header className="zrv-hr-esf-preview__head">
      <div>
        <span className="zrv-hr-esf-preview__eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <span className="zrv-hr-esf-preview__ref">{ref}</span>
    </header>
  )

  return (
    <article className={`zrv-hr-esf-preview${hasImages ? ' zrv-hr-esf-can-page' : ''}`} aria-label="Business visa request preview">
      <div className="zrv-hr-esf-pages" onClick={onSideClick}
        onPointerDown={(event) => { pointerDown.current = { x: event.clientX, y: event.clientY } }}>
        {hasImages && <Arrow dir="prev" />}
        {hasImages && <Arrow dir="next" />}
        <div className="zrv-hr-esf-pageviewport">
          <div className="zrv-hr-esf-pagetrack" style={{ transform: `translateX(-${safePage * 100}%)` }}>
          <div className="zrv-hr-esf-page" aria-hidden={safePage !== 0}>
            <div className="zrv-hr-esf-paper" {...rtl} {...lang}>
              {header(text.eyebrow, text.title, record?.requestNo || text.draft)}
              <dl className="zrv-hr-esf-preview__grid">
                <div className="zrv-hr-is-wide"><dt>{label('visitor')}</dt><dd>{form.visitorName.trim() || '—'}</dd></div>
                <div><dt>{label('nationality')}</dt><dd>{nationality || '—'}</dd></div>
                <div><dt>{label('profession')}</dt><dd>{form.profession.trim() || '—'}</dd></div>
                <div><dt>{label('passport')}</dt><dd dir="ltr">{form.passportNo.trim() || '—'}</dd></div>
                <div><dt>{label('expiry')}</dt><dd>{date(form.expiryDate)}</dd></div>
                <div><dt>{label('arrival')}</dt><dd>{date(form.arrivalDate)}</dd></div>
                <div><dt>{label('visa')}</dt><dd>{visa || '—'}</dd></div>
              </dl>
              <section className="zrv-hr-esf-preview__comments">
                <span>{label('company')}</span>
                <p>{form.companyName.trim() || '—'}</p>
                <p>{line(form.address.trim(), form.tel && `Tel ${form.tel}`, form.fax && `Fax ${form.fax}`)}</p>
              </section>
              <section className="zrv-hr-esf-preview__comments">
                <span>{label('trip')}</span>
                <p>{line(form.comingFrom.trim(), form.travelRoute.trim() && text.via(form.travelRoute.trim()), form.visitPurpose.trim())}</p>
                <p>{embassy ? text.visaSentTo(embassy) : text.embassyNotSet}</p>
              </section>
              <section className="zrv-hr-esf-preview__comments">
                <span>{label('expenses')}</span>
                <p>{text.travel}: {paidBy('travel')} · {text.hotel}: {paidBy('hotel')}</p>
                {otherDetails && <p>{otherDetails}</p>}
              </section>
              <section className="zrv-hr-esf-preview__comments">
                <span>{label('documents')}</span>
                {attachmentNames.length > 0
                  ? <ul className="zrv-hr-esf-preview__files">{attachmentNames.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul>
                  : <p>{text.noDocuments}</p>}
              </section>
              <section className="zrv-hr-esf-preview__comments">
                <span>{label('requestedBy')}</span>
                <p>{line(record?.requestedBy, divisionName, form.dept.trim(), form.requestDate && date(form.requestDate))}</p>
              </section>
              <footer>{text.status}: {status} · <span className="zrv-hr-esf-pageindicator" aria-live="polite">{pageLabel}</span></footer>
            </div>
          </div>
          {imageUrls.map(({ name, url }, index) => (
            <div className="zrv-hr-esf-page" key={url} aria-hidden={safePage !== index + 1}>
              <div className="zrv-hr-esf-paper" {...rtl} {...lang}>
                {header(text.eyebrow, text.document, text.imagePage(index + 1, imageUrls.length))}
                <div className="zrv-hr-esf-imgpanel">
                  <figure>
                    <img src={url} alt={text.alt(name)} />
                    <figcaption>{name}</figcaption>
                  </figure>
                </div>
                <footer>{text.attached} · <span className="zrv-hr-esf-pageindicator" aria-live="polite">{pageLabel}</span></footer>
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>
    </article>
  )
}
