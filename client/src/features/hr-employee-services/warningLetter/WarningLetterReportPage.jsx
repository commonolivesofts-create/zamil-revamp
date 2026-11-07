import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Foot, Hero } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { LETTERS_BREADCRUMB, WARNING_LETTER_PATHS as PATHS } from '../employeeServicesPaths.js'
import { REASONS, RESOURCE, warningLetterService as service } from './warningLetterService.js'
import { WarningLetterReportPreview } from './WarningLetterReportPreview.jsx'

// The legacy warning/report.php columns: ref. no., warning no., employee,
// division, position and date.
const MONTHS = 6
const INITIAL = Object.freeze({ q: '', flag: '', division: '', dateFrom: '', dateTo: '' })
// The API's reason filter values.
const FLAG_OF = Object.freeze({ irregular: 'irregular', absent: 'absent', eating: 'eating', delaying: 'delaying', makeProblems: 'make_problems' })
const REASON_OPTIONS = [
  ...REASONS.map((item) => ({ value: FLAG_OF[item.key], label: item.en })),
  { value: 'warning_letter', label: 'Warning letter issued' }, { value: 'other_letter', label: 'Other letter issued' },
]
const FIELDS = [
  { key: 'q', label: 'Search', type: 'search', placeholder: 'Name, number, ref. or warning no.' },
  { key: 'flag', label: 'Reason', type: 'select', options: [{ value: '', label: 'All' }, ...REASON_OPTIONS] },
  { key: 'division', label: 'Division', type: 'search', placeholder: 'Exact division' },
  { key: 'dateFrom', label: 'Date from', type: 'date' },
  { key: 'dateTo', label: 'Date to', type: 'date' },
]
const date = (value) => (value ? enDate(value) : '—')
const reasonsOf = (row) => [...REASONS.filter((item) => row[item.key]).map((item) => item.en), (row.othersText || row.othersTextAr) && 'Others'].filter(Boolean)
const COLUMNS = [
  { key: 'referenceNo', label: 'Ref. no.', render: (row) => <><b>{row.referenceNo || '—'}</b><small>Warning no. {row.warningNo || '—'}</small></> },
  { key: 'employee', label: 'Employee', render: (row) => <><b>{row.employee.name}</b><small>#{row.employee.employeeNo}</small></> },
  { key: 'division', label: 'Division', render: (row) => <><span>{row.employee.division || '—'}</span><small>{row.employee.position}</small></> },
  { key: 'reasons', label: 'Reasons', render: (row) => reasonsOf(row).join(' · ') || '—' },
  { key: 'warDate', label: 'Date', render: (row) => date(row.warDate) },
]

const CARDS = [
  {
    key: 'total',
    load: async ({ query, today, count, countIn }) => {
      const [all, month] = await Promise.all([count(query), countIn(query, monthRanges(today, 1)[0])])
      return { all, month }
    },
    render: (data) => (
      <Card index={0} icon="triangle-alert" label="Warning letters" theme="mint">
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
        <Foot>By warning date</Foot>
      </Card>
    ),
  },
]

const groups = [{
  key: 'flag', title: 'Reason', tone: 'mint',
  items: REASONS.map((item) => ({ key: FLAG_OF[item.key], label: item.en, patch: { flag: FLAG_OF[item.key] } })),
}]

const list = ({ page, limit, ...filters }, options) => service.list({ page, pageSize: limit, ...filters }, options)

export default function WarningLetterReportPage() {
  return (
    <InsightReport variant="warning-letter-report" title="Warning letter report" heading="Warning letters" breadcrumb={LETTERS_BREADCRUMB}
      resourceKey="hr-warning-letter-report" list={list} create={{ permission: `${RESOURCE}:CREATE`, path: PATHS.form, label: 'New letter' }}
      empty="No warning letters match these filters." initial={INITIAL}
      fields={FIELDS} columns={COLUMNS} cards={CARDS} groups={groups} defaultSort={{ key: '', order: '' }}
      numberOf={(row) => row.referenceNo || row.letterId} rowKey={(row) => row.letterId} closeInDetail
      renderDetail={(row, { onClose }) => <WarningLetterReportPreview row={row} onClose={onClose} />} />
  )
}
