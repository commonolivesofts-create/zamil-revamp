import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'

// The letter as it will read: an English sheet and an Arabic sheet, filled from
// the form with a highlighted gap where a value is still missing. It is also
// what gets printed.
const date = (value) => (value ? enDate(value) : '')
const AR_MONTHS = Object.freeze([
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
])
const arDate = (value) => {
  const [year, month, day] = String(value ?? '').split('-')
  const name = AR_MONTHS[Number(month) - 1]
  return year && name && day ? `${Number(day)} ${name} ${year}` : ''
}
const money = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return ''
  const amount = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(amount)
    ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value)
}
// A filled value, or a highlighted gap.
const V = ({ value, empty = '…' }) => <mark className={String(value ?? '').trim() ? undefined : 'zrv-hr-is-empty'}>{String(value ?? '').trim() || empty}</mark>

function Head({ form: f, lookups, ar = false }) {
  const division = lookups?.divisions?.find((item) => item.value === f.division_id)?.label ?? ''
  const requestFor = lookups?.requestFor?.find((item) => item.value === f.request_for)
  return (
    <header className="zrv-hr-bvl-meta" lang={ar ? 'ar' : 'en'} dir={ar ? 'rtl' : undefined}>
      <span><b>{ar ? 'الرقم' : 'Ref.'}</b> <V value={f.ref_no} /></span>
      <span><b>{ar ? 'التاريخ' : 'Date'}</b> <V value={ar ? arDate(f.letter_date) : date(f.letter_date)} /></span>
      <span><b>{ar ? 'القسم' : 'Division'}</b> <V value={division} /></span>
      {!ar && <span><b>Status</b> <V value={f.status} empty="DRAFT" /></span>}
      {ar && <span className="zrv-hr-bvl-doc">{requestFor?.ar ?? 'خطاب تأشيرة زيارة عمل'}</span>}
    </header>
  )
}

const Signatures = ({ ar = false }) => (
  <div className="zrv-hr-bvl-signatures">
    <span>{ar ? 'التوقيع المعتمد' : 'Authorized Signatory'}</span>
    <span>{ar ? 'ختم الشركة' : 'Company Stamp'}</span>
  </div>
)

export default function BusinessVisaLetterPreview({ form: f, language = 'bi', lookups }) {
  const name = f.employee_name
  const requestFor = lookups?.requestFor?.find((item) => item.value === f.request_for)
  return (
    <article className="zrv-hr-bvl-preview" aria-label="Business visa letter preview">
      {language !== 'ar' && <div className="zrv-hr-bvl-page" lang="en">
        <Head form={f} lookups={lookups} />
        <p>To,</p>
        <p><b>His Excellency Consul General,</b><br /><V value={f.embassy ? `${f.embassy} Embassy` : ''} empty="Embassy" /><br /><b>Riyadh - Kingdom of Saudi Arabia</b><br />With Compliments,</p>
        <p className="zrv-hr-bvl-subject">SUB: REQUEST FOR <V value={f.request_for} empty="…" /> VISIT VISA</p>
        <p>We hereby certify that Mr. <V value={name} /> (<V value={f.nationality} /> National), holder of Passport No. <V value={f.passport_no} /> dated <V value={date(f.passport_date)} /> and ID No. <V value={f.id_no} />, Expiration Date <V value={date(f.id_expiration_date)} />, is employed by our company as a <V value={f.job_title} /> since <V value={date(f.employed_since)} /> until present.</p>
        <p>His contract will expire on <V value={date(f.contract_expiry)} />, the nature of the contract is <V value={f.contract_nature} />, and he is drawing a monthly salary of <V value={money(f.monthly_salary) ? `SR ${money(f.monthly_salary)}` : ''} /> only.</p>
        <p>Mr. <V value={name} /> will visit <V value={f.visit_place} /> for <V value={f.visit_days} /> days for <V value={f.visit_purpose} />.</p>
        <p>In view of the above, we kindly request your esteemed office to facilitate and grant Mr. <V value={name} /> the visa to enable our employee to visit <V value={f.visit_place} />. We hereby affirm that all expenses called for in relation with Mr. <V value={f.expense_employee_name || name} /> shall be borne by the <V value={f.expense_borne_by} />.</p>
        <p>We hereby certify that Mr. <V value={f.return_employee_name || name} /> <V value={f.return_statement} /></p>
        <p className="zrv-hr-bvl-close">{f.closing_text || 'Anticipating your assistance in this regard.'}</p>
        <Signatures />
      </div>}

      {language !== 'en' && <div className="zrv-hr-bvl-page" lang="ar" dir="rtl">
        <Head form={f} lookups={lookups} ar />
        <p>إلى</p>
        <p><b>سعادة القنصل العام،</b><br /><V value={f.embassy_ar} empty="السفارة" />، المحترم،،<br /><b>الرياض - المملكة العربية السعودية</b><br />بعد التحية،،</p>
        <p className="zrv-hr-bvl-subject">الموضوع: طلب تأشيرة زيارة عمل <V value={requestFor?.ar} empty="…" /></p>
        <p>بهذا نفيدكم بأن السيد / <V value={name} /> (<V value={f.nationality_ar} /> الجنسية) بموجب جواز سفر رقم <V value={f.passport_no} /> والصادر بتاريخ <V value={arDate(f.passport_date)} /> وحامل بطاقة هوية رقم <V value={f.id_no} /> وتنتهي بتاريخ <V value={arDate(f.id_expiration_date)} />.</p>
        <p>يعمل لدينا بوظيفة <V value={f.job_title_ar} /> منذ <V value={arDate(f.employed_since)} /> وحتى تاريخه، وتاريخ انتهاء العقد <V value={arDate(f.contract_expiry)} />، ونوع العقد <V value={f.contract_nature_ar} /> ويتقاضى راتباً شهرياً قدره <V value={money(f.monthly_salary) ? `${money(f.monthly_salary)} ريال` : ''} /> فقط.</p>
        <p>كما أن السيد / <V value={name} /> سوف يقوم بزيارة <V value={f.visit_place} /> لمدة <V value={f.visit_days} /> أيام لغرض <V value={f.visit_purpose_ar} />.</p>
        <p>وبناءً على ما ذكر أعلاه، نرجو من سعادتكم التكرم بمنح السيد / <V value={name} /> تأشيرة الزيارة المطلوبة، كما نفيدكم بأن الشركة تتعهد بتحمل جميع المصاريف المتعلقة بالسيد / <V value={f.expense_employee_name || name} />.</p>
        <p>كما تتعهد الشركة بعودة السيد / <V value={f.return_employee_name || name} /> إلى المملكة العربية السعودية لمزاولة عمله مرة أخرى.</p>
        <p className="zrv-hr-bvl-close">شاكرين ومقدرين تعاونكم معنا في هذا الشأن.</p>
        <Signatures ar />
      </div>}
    </article>
  )
}
