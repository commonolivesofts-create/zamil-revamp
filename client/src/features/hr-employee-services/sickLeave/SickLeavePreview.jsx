import { useEffect, useMemo, useRef, useState } from 'react'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'

// A compact paper preview of the request, like the employment offer's letter
// preview. It mirrors the legacy CI3 form and is also what gets printed. The
// switch picks the language of the paper's labels: English, both (Arabic under
// English), or Arabic (the paper reads right to left). When image certificates
// are attached, next/previous arrows (inside the card) and clicks on the left
// or right side of the card page through the form and each image in a loop
// with a slide animation.
const TEXT = Object.freeze({
  en: Object.freeze({
    eyebrow: 'Zamil Plastic', title: 'Sick Leave Request', draft: 'Draft', notSaved: 'Not saved yet', status: 'Status',
    employee: 'Employee name', employeeNo: 'Employee #', department: 'Department', leaveType: 'Leave type',
    from: 'From date', to: 'To date', dayType: 'Day type', days: 'No. of days', attachments: 'Attachments',
    comments: 'Comments', noComments: 'No comments yet.', leave: 'Sick leave', full: 'Full day', half: 'Half day',
    prev: 'Previous page', next: 'Next page', page: 'Form',
    certificate: 'Attached certificate', imagePage: (index, total) => `Image ${index} of ${total}`,
    attached: 'Attached with this request', docs: 'Attached documents',
    alt: (name) => `Attached certificate: ${name}`, ref: (id) => `SL · ${id}`,
  }),
  ar: Object.freeze({
    eyebrow: 'زامل للبلاستيك', title: 'طلب إجازة مرضية', draft: 'مسودة', notSaved: 'لم يُحفظ بعد', status: 'الحالة',
    employee: 'اسم الموظف', employeeNo: 'رقم الموظف', department: 'القسم', leaveType: 'نوع الإجازة',
    from: 'من تاريخ', to: 'إلى تاريخ', dayType: 'نوع اليوم', days: 'عدد الأيام', attachments: 'المرفقات',
    comments: 'الملاحظات', noComments: 'لا توجد ملاحظات.', leave: 'إجازة مرضية', full: 'يوم كامل', half: 'نصف يوم',
    prev: 'الصفحة السابقة', next: 'الصفحة التالية', page: 'النموذج',
    certificate: 'الشهادة المرفقة', imagePage: (index, total) => `صورة ${index} من ${total}`,
    attached: 'مرفقة مع هذا الطلب', docs: 'المستندات المرفقة',
    alt: (name) => `الشهادة المرفقة: ${name}`, ref: (id) => `إجازة مرضية · ${id}`,
  }),
})
const isImageFile = (item) => Boolean(item.file) && String(item.file.type ?? '').startsWith('image/')
const renderArrow = (dir, text, go) => (
  <button type="button" className={`zrv-hr-esf-pagearrow zrv-hr-esf-pagearrow--${dir}`} aria-label={dir === 'next' ? text.next : text.prev}
    onClick={(event) => { event.stopPropagation(); go(dir === 'next' ? 1 : -1) }}>
    <Chevron dir={dir} />
  </button>
)

function Chevron({ dir = 'next' }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="zrv-hr-esf-pagearrow__icon">
      <path d={dir === 'next' ? 'M7 4l6 6-6 6' : 'M13 4l-6 6 6 6'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SickLeavePreview({ form, record, days, single, files, language = 'bi' }) {
  const text = TEXT[language === 'ar' ? 'ar' : 'en']
  const other = TEXT[language === 'ar' ? 'en' : 'ar']
  // A label in the chosen language; in both, the Arabic sits under the English.
  const label = (key) => (language === 'bi'
    ? <>{text[key]}<span className="zrv-hr-esf-preview__ar" lang="ar" dir="rtl">{other[key]}</span></>
    : text[key])
  const rtl = language === 'ar' ? { dir: 'rtl' } : null
  const lang = language === 'ar' ? { lang: 'ar' } : null
  const employee = form.employee
  const dayType = (value) => (value === 'HALF' ? text.half : text.full)
  const dayTypes = single ? dayType(form.fromDayType) : `${dayType(form.fromDayType)} → ${dayType(form.toDayType)}`
  // Attached images (the not-yet-uploaded ones carry their File) become pages.
  const imageFiles = useMemo(() => files.filter(isImageFile), [files])
  const imageUrls = useMemo(
    () => imageFiles.map((item) => ({ name: item.fileName, url: URL.createObjectURL(item.file) })),
    [imageFiles],
  )
  useEffect(() => () => imageUrls.forEach(({ url }) => URL.revokeObjectURL(url)), [imageUrls])
  // Pages: the form, then each image. Next/previous loop around.
  const pageCount = 1 + imageUrls.length
  const [page, setPage] = useState(0)
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
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (moved >= 6) return
    const { left, width } = event.currentTarget.getBoundingClientRect()
    go(event.clientX < left + width / 2 ? -1 : 1)
  }
  const pageLabel = safePage === 0 ? text.page : text.imagePage(safePage, imageUrls.length)
  return (
    <article className={`zrv-hr-esf-preview${hasImages ? ' zrv-hr-esf-can-page' : ''}`} aria-label="Sick leave request preview">
      <div className="zrv-hr-esf-pages" onClick={onSideClick}
        onPointerDown={(event) => { pointerDown.current = { x: event.clientX, y: event.clientY } }}>
        {hasImages && renderArrow('prev', text, go)}
        {hasImages && renderArrow('next', text, go)}
        <div className="zrv-hr-esf-pageviewport">
          <div className="zrv-hr-esf-pagetrack" style={{ transform: `translateX(-${safePage * 100}%)` }}>
          <div className="zrv-hr-esf-page" aria-hidden={safePage !== 0}>
            <div className="zrv-hr-esf-paper" {...rtl} {...lang}>
              <header className="zrv-hr-esf-preview__head">
                <div>
                  <span className="zrv-hr-esf-preview__eyebrow">{text.eyebrow}</span>
                  <h2>{text.title}</h2>
                </div>
                <span className="zrv-hr-esf-preview__ref">{record?.leaveId ? text.ref(record.leaveId) : text.draft}</span>
              </header>
              <dl className="zrv-hr-esf-preview__grid">
                <div className="zrv-hr-is-wide"><dt>{label('employee')}</dt><dd>{employee?.name || '—'}</dd></div>
                <div><dt>{label('employeeNo')}</dt><dd>{employee?.employeeNumber || '—'}</dd></div>
                <div><dt>{label('department')}</dt><dd>{employee?.departmentName || '—'}</dd></div>
                <div><dt>{label('leaveType')}</dt><dd>{text.leave}</dd></div>
                <div><dt>{label('from')}</dt><dd>{form.fromDate ? enDate(form.fromDate) : '—'}</dd></div>
                <div><dt>{label('to')}</dt><dd>{form.toDate ? enDate(form.toDate) : '—'}</dd></div>
                <div><dt>{label('dayType')}</dt><dd>{dayTypes}</dd></div>
                <div><dt>{label('days')}</dt><dd>{days || '—'}</dd></div>
                <div><dt>{label('attachments')}</dt><dd>{files.length}</dd></div>
              </dl>
              <section className="zrv-hr-esf-preview__comments">
                <span>{label('comments')}</span>
                <p>{form.comments.trim() || text.noComments}</p>
              </section>
              {files.length > 0 && (
                <ul className="zrv-hr-esf-preview__files" aria-label={text.docs}>
                  {files.map((file, index) => <li key={`${file.fileName}-${index}`}>{file.fileName}</li>)}
                </ul>
              )}
              <footer>{text.status}: {record?.status || text.notSaved} · <span className="zrv-hr-esf-pageindicator" aria-live="polite">{pageLabel}</span></footer>
            </div>
          </div>
          {imageUrls.map(({ name, url }, index) => (
            <div className="zrv-hr-esf-page" key={url} aria-hidden={safePage !== index + 1}>
              <div className="zrv-hr-esf-paper" {...rtl} {...lang}>
                <header className="zrv-hr-esf-preview__head">
                  <div>
                    <span className="zrv-hr-esf-preview__eyebrow">{text.eyebrow}</span>
                    <h2>{text.certificate}</h2>
                  </div>
                  <span className="zrv-hr-esf-preview__ref">{text.imagePage(index + 1, imageUrls.length)}</span>
                </header>
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
