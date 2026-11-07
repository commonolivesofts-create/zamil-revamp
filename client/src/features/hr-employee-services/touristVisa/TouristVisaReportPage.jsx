import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Foot, Hero } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { LETTERS_BREADCRUMB, TOURIST_VISA_PATHS as PATHS } from '../employeeServicesPaths.js'
import { DIVISIONS, RESOURCE, touristVisaService as service } from './touristVisaService.js'
import { TouristVisaReportPreview } from './TouristVisaReportPreview.jsx'

// The legacy tourist visa report.
const MONTHS = 6
const INITIAL = Object.freeze({ q: '', division: '', country: '', dateFrom: '', dateTo: '' })
const date = (value) => (value ? enDate(value) : '—')
const COLUMNS = [
  { key: 'refNo', label: 'Ref. no.', render: (row) => <><b>{row.refNo || '—'}</b><small>{row.division}</small></> },
  { key: 'employee', label: 'Employee', render: (row) => <><b>{row.employeeName}</b><small>#{row.employeeNo}</small></> },
  { key: 'nationality', label: 'Nationality', render: (row) => <><span>{row.nationality || '—'}</span><small>{row.nationalId}</small></> },
  { key: 'country', label: 'To', render: (row) => row.country || '—' },
  { key: 'approver', label: 'Approved by', render: (row) => <><span>{row.approvalName || '—'}</span><small>{row.positionName}</small></> },
  { key: 'curDate', label: 'Date', render: (row) => date(row.curDate) },
]

const CARDS = [
  {
    key: 'total',
    load: async ({ query, today, count, countIn }) => {
      const [all, month] = await Promise.all([count(query), countIn(query, monthRanges(today, 1)[0])])
      return { all, month }
    },
    render: (data) => (
      <Card index={0} icon="luggage" label="Tourist visa letters" theme="mint">
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
  key: 'division', title: 'Division', tone: 'mint',
  items: DIVISIONS.map((division) => ({ key: division, label: division, patch: { division } })),
}]

const list = ({ page, limit, ...filters }, options) => service.list({ page, pageSize: limit, ...filters }, options)

export default function TouristVisaReportPage() {
  const lookups = useResource('hr-tourist-visa-lookups', (signal) => service.lookups({ signal }))
  const countries = lookups.status === 'ready' ? lookups.data.countries : []
  const fields = [
    { key: 'q', label: 'Search', type: 'search', placeholder: 'Name, number, ref. no. or country' },
    { key: 'division', label: 'Division', type: 'select', options: [{ value: '', label: 'All' }, ...DIVISIONS.map((value) => ({ value, label: value }))] },
    { key: 'country', label: 'To', type: 'select', options: [{ value: '', label: 'All' }, ...countries.map((value) => ({ value, label: value }))] },
    { key: 'dateFrom', label: 'Date from', type: 'date' },
    { key: 'dateTo', label: 'Date to', type: 'date' },
  ]
  return (
    <InsightReport variant="tourist-visa-report" title="Tourist visa report" heading="Letters" breadcrumb={LETTERS_BREADCRUMB}
      resourceKey="hr-tourist-visa-report" list={list} create={{ permission: `${RESOURCE}:CREATE`, path: PATHS.form, label: 'New letter' }}
      empty="No tourist visa letters match these filters." initial={INITIAL}
      fields={fields} columns={COLUMNS} cards={CARDS} groups={groups} defaultSort={{ key: '', order: '' }}
      numberOf={(row) => row.refNo || row.employeeNo} rowKey={(row) => row.letterId} closeInDetail
      renderDetail={(row, { onClose }) => <TouristVisaReportPreview row={row} onClose={onClose} />} />
  )
}
