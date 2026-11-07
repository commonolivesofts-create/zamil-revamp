import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Foot, Hero } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { BUSINESS_VISA_LETTER_PATHS as PATHS, LETTERS_BREADCRUMB } from '../employeeServicesPaths.js'
import { RESOURCE, STATUSES, businessVisaLetterService as service } from './businessVisaLetterService.js'
import { BusinessVisaLetterReportPreview } from './BusinessVisaLetterReportPreview.jsx'

const MONTHS = 6
const INITIAL = Object.freeze({ q: '', status: '', division: '', dateFrom: '', dateTo: '' })
const STATUS_TEXT = Object.freeze({ DRAFT: 'Draft', FINAL: 'Final' })
const date = (value) => (value ? enDate(value) : '—')
const COLUMNS = [
  { key: 'ref', label: 'Ref. no.', render: (row) => <><b>{row.form.ref_no || '—'}</b><small>{STATUS_TEXT[row.form.status] ?? row.form.status}</small></> },
  { key: 'employee', label: 'Employee', render: (row) => <><b>{row.form.employee_name}</b><small>{row.form.job_title}</small></> },
  { key: 'embassy', label: 'Embassy', render: (row) => <><span>{row.form.embassy || '—'}</span><small>{row.form.request_for}</small></> },
  { key: 'visit', label: 'Visit', render: (row) => <><span>{row.form.visit_place || '—'}</span><small>{row.form.visit_days ? `${row.form.visit_days} days` : ''}</small></> },
  { key: 'date', label: 'Date', render: (row) => date(row.form.letter_date) },
]

const CARDS = [
  {
    key: 'total',
    load: async ({ query, today, count, countIn }) => {
      const [all, month] = await Promise.all([count(query), countIn(query, monthRanges(today, 1)[0])])
      return { all, month }
    },
    render: (data) => (
      <Card index={0} icon="file-text" label="Business visa letters" theme="mint">
        <Hero value={data?.all} unit="letters" />
        <Foot>{data ? `${data.month} this month` : ''}</Foot>
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
      <Card index={1} icon="calendar-range" label="Letters by month" theme="amber">
        <Columns items={data} count={MONTHS} />
        <Foot>By letter date</Foot>
      </Card>
    ),
  },
]

const groups = [{
  key: 'status', title: 'Status', tone: 'mint',
  items: STATUSES.map((status) => ({ key: status, label: STATUS_TEXT[status], patch: { status } })),
}]

const list = ({ page, limit, ...filters }, options) => service.list({ page, pageSize: limit, ...filters }, options)

export default function BusinessVisaLetterReportPage() {
  const options = useResource('hr-business-visa-letter-options', (signal) => service.options({ signal }))
  const divisions = options.status === 'ready' ? options.data.divisions : []
  const lookups = options.status === 'ready' ? options.data : null
  const fields = [
    { key: 'q', label: 'Search', type: 'search', placeholder: 'Ref. no., employee or embassy' },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: '', label: 'All' }, ...STATUSES.map((value) => ({ value, label: STATUS_TEXT[value] }))] },
    { key: 'division', label: 'Division', type: 'select', options: [{ value: '', label: 'All' }, ...divisions] },
    { key: 'dateFrom', label: 'Date from', type: 'date' },
    { key: 'dateTo', label: 'Date to', type: 'date' },
  ]
  return (
    <InsightReport variant="business-visa-letter-report" title="Business visa letter report" heading="Letters" breadcrumb={LETTERS_BREADCRUMB}
      resourceKey="hr-business-visa-letter-report" list={list} create={{ permission: `${RESOURCE}:CREATE`, path: PATHS.form, label: 'New letter' }}
      empty="No business visa letters match these filters." initial={INITIAL}
      fields={fields} columns={COLUMNS} cards={CARDS} groups={groups} defaultSort={{ key: '', order: '' }}
      numberOf={(row) => row.form.ref_no || row.letterId} rowKey={(row) => row.letterId} closeInDetail
      renderDetail={(row, { onClose }) => <BusinessVisaLetterReportPreview row={row} onClose={onClose} lookups={lookups} />} />
  )
}
