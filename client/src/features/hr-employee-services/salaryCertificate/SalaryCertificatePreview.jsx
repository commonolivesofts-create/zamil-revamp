import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { SALARY_ROWS } from './salaryCertificateRows.js'

// The paper reads in the language of the certificate (the Arabic API stores
// Arabic names, nationality and titles), so the preview does too.
const TEXT = Object.freeze({
  en: Object.freeze({
    eyebrow: 'Zamil Plastic', title: 'Salary Certificate', draft: 'Draft', currency: 'SAR',
    employee: 'Employee name', no: 'Employee no.', nationality: 'Nationality', id: 'ID / passport no.',
    jobTitle: 'Job title', joined: 'Joining date', division: 'Division', salary: 'Salary details', total: 'Total salary',
    to: 'To', date: 'Date', ref: 'Ref. no.', approver: 'Approved by', position: 'Position',
    notes: Object.freeze([
      'This certificate is issued at the employee’s request, without any legal liability on the company or its affiliates.',
      'Valid for one month from the issue date; any alteration cancels it.',
    ]),
    status: (value) => `Status: ${value}`, notSaved: 'Not saved yet',
  }),
  ar: Object.freeze({
    eyebrow: 'زامل للبلاستيك', title: 'شهادة راتب', draft: 'مسودة', currency: 'ريال',
    employee: 'اسم الموظف', no: 'رقم الموظف', nationality: 'الجنسية', id: 'رقم الهوية',
    jobTitle: 'المسمى الوظيفي', joined: 'تاريخ التعيين', division: 'القسم', salary: 'تفاصيل الراتب', total: 'إجمالي الراتب',
    to: 'إلى', date: 'التاريخ', ref: 'الرقم', approver: 'اسم الموافق', position: 'المسمى الوظيفي',
    notes: Object.freeze([
      'تم إصدار هذه الشهادة بناءً على طلبه، دون أي مسؤولية قانونية على الشركة أو الشركات التابعة لها.',
      'هذه الشهادة صالحة لمدة شهر واحد من تاريخ الإصدار، وأي تعديل يلغيها.',
    ]),
    status: (value) => `الحالة: ${value}`, notSaved: 'لم يُحفظ بعد',
  }),
})

const money = (value) => (value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value))

// A compact paper preview of the certificate, as Sick Leave's: it shows the
// employee, the salary and the addressee as the certificate will read.
export default function SalaryCertificatePreview({ form, record, lang, employee, approver }) {
  const text = TEXT[form.language]
  const arabic = form.language === 'ar'
  const position = approver?.position || (form.approvalName === record?.approvalName ? record?.approvalPosition : '')
  return (
    <article className="zrv-hr-esf-preview" aria-label="Salary certificate preview">
      <div className="zrv-hr-esf-paper zrv-hr-sc-paper" dir={lang.dir} lang={form.language}>
        <header className="zrv-hr-esf-preview__head">
          <div>
            <span className="zrv-hr-esf-preview__eyebrow">{text.eyebrow}</span>
            <h2>{text.title}</h2>
          </div>
          <span className="zrv-hr-esf-preview__ref">{record?.refNo || text.draft}</span>
        </header>

        <dl className="zrv-hr-esf-preview__grid">
          <div className="zrv-hr-is-wide"><dt>{text.employee}</dt><dd>{employee?.name || '—'}</dd></div>
          <div><dt>{text.no}</dt><dd>{employee?.employeeNo || '—'}</dd></div>
          <div><dt>{text.nationality}</dt><dd>{employee?.nationality || '—'}</dd></div>
          <div><dt>{text.id}</dt><dd dir="ltr">{employee?.nationalIdentifier || '—'}</dd></div>
          <div><dt>{text.jobTitle}</dt><dd>{employee?.jobTitle || '—'}</dd></div>
          <div><dt>{text.joined}</dt><dd dir="ltr">{employee?.joiningDate ? enDate(employee.joiningDate) : '—'}</dd></div>
          <div><dt>{text.division}</dt><dd>{employee?.division || '—'}</dd></div>
        </dl>

        <section className="zrv-hr-sc-preview__salary">
          <span>{text.salary}</span>
          <dl>
            {SALARY_ROWS.map(([key, en, ar]) => (
              <div key={key}><dt>{arabic ? ar : en}</dt><dd>{employee ? money(employee[key]) : '—'}</dd></div>
            ))}
            <div className="zrv-hr-sc-preview__total">
              <dt>{text.total}</dt>
              <dd>{employee ? `${money(employee.totalSalary)} ${text.currency}` : '—'}</dd>
            </div>
          </dl>
        </section>

        <dl className="zrv-hr-esf-preview__grid zrv-hr-sc-preview__foot">
          <div className="zrv-hr-is-wide"><dt>{text.to}</dt><dd>{form.toEmpName.trim() || '—'}</dd></div>
          <div><dt>{text.date}</dt><dd dir="ltr">{form.certDate ? enDate(form.certDate) : '—'}</dd></div>
          <div><dt>{text.ref}</dt><dd>{record?.refNo || '—'}</dd></div>
          <div className="zrv-hr-is-wide"><dt>{text.approver}</dt><dd>{form.approvalName || '—'}{position ? ` · ${position}` : ''}</dd></div>
        </dl>

        <ul className="zrv-hr-sc-preview__notes">
          {text.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>

        <footer>{record?.status ? text.status(record.status) : text.notSaved}</footer>
      </div>
    </article>
  )
}
