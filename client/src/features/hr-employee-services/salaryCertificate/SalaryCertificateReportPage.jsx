import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Foot, Hero } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { LETTERS_BREADCRUMB, SALARY_CERTIFICATE_PATHS as PATHS } from '../employeeServicesPaths.js'
import { LANGUAGES, salaryCertificateService as service } from './salaryCertificateService.js'

// The legacy salary_certificate_report.php (English) and its Arabic twin as one
// report; each language is its own table and API, so one is always selected.
const MONTHS = 6
const INITIAL = Object.freeze({ language: 'en', q: '', employeeNo: '', division: '', dateFrom: '', dateTo: '' })
const FIELDS = [
  { key: 'language', label: 'Language', type: 'select', options: Object.values(LANGUAGES).map((item) => ({ value: item.code, label: `${item.label} · ${item.native}` })) },
  { key: 'q', label: 'Search', type: 'search', placeholder: 'Name, number or ref. no.' },
  { key: 'employeeNo', label: 'Employee no.', type: 'search', placeholder: 'Number' },
  { key: 'division', label: 'Division', type: 'search', placeholder: 'Division' },
  { key: 'dateFrom', label: 'Created from', type: 'date' },
  { key: 'dateTo', label: 'Created to', type: 'date' },
]
const date = (value) => (value ? enDate(value) : '—')
const money = (value) => (value == null ? '—' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} SAR`)
const dirOf = (row) => LANGUAGES[row.language].dir
// The legacy report columns, plus the reference and the certificate date.
const COLUMNS = [
  { key: 'refNo', label: 'Ref. no.', render: (row) => row.refNo || '—' },
  { key: 'employee', label: 'Employee', render: (row) => <><b dir={dirOf(row)}>{row.employeeName}</b><small>#{row.employeeNo}</small></> },
  { key: 'nationality', label: 'Nationality', render: (row) => <><span dir={dirOf(row)}>{row.nationality || '—'}</span><small>{row.nationalIdentifier}</small></> },
  { key: 'joiningDate', label: 'Joined', render: (row) => date(row.joiningDate) },
  { key: 'division', label: 'Division', render: (row) => row.division || '—' },
  { key: 'totalSalary', label: 'Total salary', render: (row) => money(row.totalSalary) },
  { key: 'to', label: 'To', render: (row) => <><span dir="auto">{row.toEmpName || '—'}</span><small>{date(row.certDate)}</small></> },
]

const list = ({ page, limit, language, q, employeeNo, division, dateFrom, dateTo }, options) =>
  service.list(language || 'en', { page, pageSize: limit, q, employeeNo, division, createdFrom: dateFrom, createdTo: dateTo }, options)

const CARDS = [
  {
    key: 'total',
    load: async ({ query, today, count, countIn }) => {
      const [all, month] = await Promise.all([count(query), countIn(query, monthRanges(today, 1)[0])])
      return { all, month }
    },
    render: (data, { query }) => (
      <Card index={0} icon="file-badge" label="Certificates" theme="mint">
        <Hero value={data?.all} unit={`${LANGUAGES[query.language || 'en'].label} certificates`} />
        <Foot>{data ? `${data.month} created this month` : ''}</Foot>
      </Card>
    ),
  },
  {
    key: 'months',
    load: async ({ query, today, countIn }) => {
      const months = monthRanges(today, MONTHS)
      const counts = await Promise.all(months.map((month) => countIn(query, month)))
      return months.map((month, index) => ({ key: month.key, label: month.label, count: counts[index] }))
    },
    render: (data) => (
      <Card index={1} icon="calendar-range" label="Certificates by month" theme="amber">
        <Columns items={data} count={MONTHS} />
        <Foot>Certificates created each month</Foot>
      </Card>
    ),
  },
]

// Quick switch between the two languages.
const groups = [{
  key: 'language', title: 'Language', tone: 'mint',
  items: Object.values(LANGUAGES).map((item) => ({ key: item.code, label: item.native, patch: { language: item.code } })),
}]

export default function SalaryCertificateReportPage() {
  return (
    <InsightReport variant="salary-certificate-report" title="Salary certificate report" heading="Certificates" breadcrumb={LETTERS_BREADCRUMB}
      resourceKey="hr-salary-certificate-report" list={list} create={{ permission: 'HR.SALARY_CERTIFICATES:CREATE', path: PATHS.form, label: 'New certificate' }}
      openLabel="Open certificate" empty="No salary certificates match these filters." initial={INITIAL} required={['language']}
      fields={FIELDS} columns={COLUMNS} cards={CARDS} groups={groups} defaultSort={{ key: '', order: '' }}
      numberOf={(row) => row.refNo || row.certificateId} rowKey={(row) => row.certificateId} pathOf={(row) => `${PATHS.form}/${row.certificateId}`}
      validate={(draft) => (draft.language ? {} : { language: 'Choose a language.' })}
      summary={(row) => ({
        heading: row.employeeName,
        facts: [
          ['Language', LANGUAGES[row.language].native], ['Ref. no.', row.refNo], ['Employee no.', row.employeeNo], ['Nationality', row.nationality],
          ['ID / passport no.', row.nationalIdentifier], ['Joined', row.joiningDate ? date(row.joiningDate) : ''], ['Division', row.division],
          ['Total salary', row.totalSalary == null ? '' : money(row.totalSalary)], ['To', row.toEmpName], ['Certificate date', row.certDate ? date(row.certDate) : ''],
        ],
      })} />
  )
}
