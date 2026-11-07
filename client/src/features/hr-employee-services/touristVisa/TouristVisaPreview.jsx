import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { DATE_FIELDS, EMPLOYEE_FIELDS } from './touristVisaService.js'

// A compact paper preview of the letter, as Sick Leave's: the addressee, the
// employee and their contract, the trip and the approval as the letter will
// read. The Arabic values come from the saved letter (the server writes them),
// so they show until their English value is changed.
const money = (value) => {
  const number = Number(String(value ?? '').replace(/,/g, ''))
  return value === '' || !Number.isFinite(number) ? String(value ?? '') : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number)
}
const date = (value) => (value ? enDate(value) : '')
const arabicOf = (record, key, current, saved) => (record && current === saved ? record[key] || '' : '')
// A value in the language the preview shows: English, Arabic (falling back to
// English), or English with the Arabic under it.
const Val = ({ value, arabic, language = 'bi' }) => {
  const main = language === 'ar' ? arabic || value : value
  return <>{main || '—'}{language === 'bi' && arabic ? <><br /><small lang="ar" dir="rtl">{arabic}</small></> : null}</>
}

const closing = (language) => (language === 'ar'
  ? <span lang="ar" dir="rtl">وتفضلوا بقبول فائق الاحترام ،،،</span>
  : language === 'en' ? <span>Anticipating your assistance in this regard.</span>
    : <><span>Anticipating your assistance in this regard.</span><br /><small lang="ar" dir="rtl">وتفضلوا بقبول فائق الاحترام ،،،</small></>)

export default function TouristVisaPreview({ form, record, employee, approver, language = 'bi' }) {
  const countryAr = arabicOf(record, 'countryAr', form.country, record?.country)
  const fromAr = arabicOf(record, 'tourismFromAr', form.tourismFrom, record?.tourismFrom)
  const toAr = arabicOf(record, 'tourismToAr', form.tourismTo, record?.tourismTo)
  const hijri = arabicOf(record, 'curDateAr', form.curDate, record?.curDate)
  return (
    <article className="zrv-hr-esf-preview" aria-label="Tourist visa letter preview">
      <div className="zrv-hr-esf-paper">
        <header className="zrv-hr-esf-preview__head">
          <div>
            <span className="zrv-hr-esf-preview__eyebrow">Zamil Plastic</span>
            <h2>Tourist Visa Letter</h2>
          </div>
          <span className="zrv-hr-esf-preview__ref">{record?.refNo || 'Draft'}</span>
        </header>

        <dl className="zrv-hr-esf-preview__grid">
          <div className="zrv-hr-is-wide"><dt>Addressed to</dt><dd><Val language={language} value={form.country ? `The Consul General of ${form.country}` : ''} arabic={countryAr} /></dd></div>
          <div><dt>Date</dt><dd>{date(form.curDate) || '—'}</dd></div>
          <div><dt>Hijri date</dt><dd><Val value={hijri} /></dd></div>
        </dl>

        <section className="zrv-hr-esf-preview__comments">
          <span>Employee</span>
          <dl className="zrv-hr-esf-preview__grid">
            {EMPLOYEE_FIELDS.map((item) => (
              <div key={item.key}><dt>{item.en}</dt><dd><Val language={language} value={employee?.[item.key]} arabic={employee?.[`${item.key}_ar`]} /></dd></div>
            ))}
          </dl>
        </section>

        <section className="zrv-hr-esf-preview__comments">
          <span>Salary</span>
          <p>{employee ? `${money(employee.salary)} SAR` : '—'}</p>
          {record?.salaryWord && <p><Val language={language} value={record.salaryWord} arabic={record.salaryWordAr} /></p>}
        </section>

        <section className="zrv-hr-esf-preview__comments">
          <span>Tourism</span>
          <dl className="zrv-hr-esf-preview__grid">
            <div><dt>From</dt><dd><Val language={language} value={form.tourismFrom} arabic={fromAr} /></dd></div>
            <div><dt>To</dt><dd><Val language={language} value={form.tourismTo} arabic={toAr} /></dd></div>
            {DATE_FIELDS.map((item) => <div key={item.key}><dt>{item.en}</dt><dd>{date(form.dates[item.key]) || '—'}</dd></div>)}
          </dl>
        </section>

        <section className="zrv-hr-esf-preview__comments">
          <span>Closing and approval</span>
          <p>{closing(language)}</p>
          <p>{form.approvalName || '—'}{approver?.position ? ` · ${approver.position}` : ''}</p>
        </section>

        <footer>{record ? 'Saved' : 'Not saved yet'}</footer>
      </div>
    </article>
  )
}
