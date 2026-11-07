import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { REASONS } from './warningLetterService.js'

// The warning letter as it prints: bilingual title, the reference/date/warning
// number, the employee snapshot, the policy paragraph, the ticked reasons with
// their Arabic labels, the action/others and the letter boxes, then the
// signature and acknowledgement blocks.
const date = (value) => (value ? enDate(value) : '—')
const Line = ({ en, ar, language = 'bi' }) => {
  const main = language === 'ar' ? ar || en : en
  return <>{main || '—'}{language === 'bi' && ar ? <><br /><small lang="ar" dir="rtl">{ar}</small></> : null}</>
}
const arabic = (language) => (language === 'ar' ? { lang: 'ar', dir: 'rtl' } : null)
const POLICY_EN = 'Due to not following company rules and regulations, this warning letter is issued as per the policy for the reason(s) ticked below:'
const POLICY_AR = 'نظراً لعدم الالتزام بقوانين وأنظمة الشركة، تم إصدار هذا الإنذار حسب السياسة للأسباب الموضحة أدناه:'

export default function WarningLetterPreview({ form, record, employee, warningNo, language = 'bi' }) {
  const reasons = REASONS.filter((item) => form[item.key])
  const others = form.othersText.trim()
  const othersAr = form.othersTextAr.trim()
  const letters = [
    [form.warningLetter, 'Warning letter', 'إنذار كتابي', form.warningComment],
    [form.otherLetter, 'Other letter', 'أخرى', form.otherComment],
  ].filter(([on]) => on)
  return (
    <article className="zrv-hr-esf-preview" aria-label="Warning letter preview">
      <div className="zrv-hr-esf-paper">
        <header className="zrv-hr-esf-preview__head">
          <div>
            <span className="zrv-hr-esf-preview__eyebrow">Zamil Plastic</span>
            <h2>Warning Letter</h2>
            <p className="zrv-hr-wl-preview__ar-title" lang="ar" dir="rtl">إنذار خطي</p>
          </div>
          <span className="zrv-hr-esf-preview__ref">{record?.referenceNo || 'Draft'}</span>
        </header>

        <dl className="zrv-hr-esf-preview__grid">
          <div><dt>Ref. no.</dt><dd>{record?.referenceNo || '—'}</dd></div>
          <div><dt>Date</dt><dd>{date(form.warDate)}</dd></div>
          <div><dt>Warning no.</dt><dd>{warningNo || '—'}</dd></div>
          <div className="zrv-hr-wl-preview__written"><dt>Written</dt><dd>{form.warningLetter ? '✔' : ''} <span lang="ar" dir="rtl">إنذار كتابي</span></dd></div>
          <div className="zrv-hr-is-wide"><dt>Employee</dt><dd>{employee?.name || '—'}</dd></div>
          <div><dt>Employee no.</dt><dd>{employee?.employeeNo || '—'}</dd></div>
          <div><dt>Position</dt><dd>{employee?.position || '—'}</dd></div>
          <div><dt>Division</dt><dd>{employee?.division || '—'}</dd></div>
        </dl>

        <p className="zrv-hr-wl-preview__policy"><Line en={POLICY_EN} ar={POLICY_AR} language={language} /></p>

        <section className="zrv-hr-esf-preview__comments">
          <span>Reasons</span>
          {reasons.length > 0 ? (
            <ul className="zrv-hr-wl-preview__reasons">
              {reasons.map((item) => (
                <li key={item.key}>
                  <span {...arabic(language)}>{language === 'ar' ? item.ar || item.en : item.en}</span>
                  {language === 'bi' && <small lang="ar" dir="rtl">{item.ar}</small>}
                </li>
              ))}
            </ul>
          ) : <p>No reason ticked yet.</p>}
          {(others || othersAr) && <p className="zrv-hr-wl-preview__other"><Line en={others} ar={othersAr} language={language} /></p>}
        </section>

        <div className="zrv-hr-wl-preview__two">
          <section className="zrv-hr-esf-preview__comments">
            <span>Action</span>
            <p><Line en={form.actionText.trim()} ar={form.actionTextAr.trim()} language={language} /></p>
          </section>
          <section className="zrv-hr-esf-preview__comments">
            <span>Others</span>
            <p><Line en={others} ar={othersAr} language={language} /></p>
          </section>
        </div>

        <section className="zrv-hr-esf-preview__comments">
          <span>Letters</span>
          {letters.length > 0
            ? <ul className="zrv-hr-wl-preview__reasons">{letters.map(([, label, labelAr, comment]) => <li key={label}><span>{label} <small lang="ar" dir="rtl">{labelAr}</small></span><small>{comment}</small></li>)}</ul>
            : <p>No letter selected.</p>}
        </section>

        <div className="zrv-hr-wl-preview__signs">
          <span>Noted By: / ملاحظة</span>
          <span>Prepared By: / إعداد</span>
        </div>
        <div className="zrv-hr-wl-preview__signs">
          <span>Approved By (Admin Manager): / اعتماد</span>
        </div>
        <div className="zrv-hr-wl-preview__ack">
          <span>Acknowledgement / لتوقيع بالاستلام:</span>
          <span>Name: / الاسم:</span>
          <span>Received On: / تاريخ الاستلام:</span>
          <span>Signature: / التوقيع:</span>
        </div>

        <footer>{record?.status ? `Status: ${record.status}` : 'Not saved yet'}</footer>
      </div>
    </article>
  )
}
