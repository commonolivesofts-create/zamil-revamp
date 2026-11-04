import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Foot, Hero } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { BUSINESS_VISA_PATHS as PATHS, LETTERS_BREADCRUMB } from '../employeeServicesPaths.js'
import { RECORD_STATUSES, STATUS_TEXT } from '../shared/formRecords.js'
import { NATIONALITIES } from './nationalities.js'
import { RESOURCE, businessVisaService as service } from './businessVisaService.js'

// The legacy visa_report.php: every request, newest first.
const MONTHS = 6
const INITIAL = Object.freeze({ q: '', status: '', division: '', dept: '', dateFrom: '', dateTo: '' })
const date = (value) => (value ? enDate(value) : '—')
const nationality = (value) => NATIONALITIES.find((item) => item.value === value)?.label ?? value
const visaType = (row) => [row.visaSingle && 'Single', row.visaMultiple && 'Multiple'].filter(Boolean).join(' · ') || '—'
const COLUMNS = [
  { key: 'requestNo', label: 'Request no.', render: (row) => <><b>{row.requestNo || '—'}</b><small>{row.divisionName}</small></> },
  { key: 'visitor', label: 'Visitor', render: (row) => <><b>{row.visitorName}</b><small>{nationality(row.nationality)}</small></> },
  { key: 'company', label: 'Company', render: (row) => <><span>{row.companyName || '—'}</span><small>{row.profession}</small></> },
  { key: 'visa', label: 'Visa', render: (row) => <><span>{visaType(row)}</span><small>{row.passportNo}</small></> },
  { key: 'arrival', label: 'Arrival', render: (row) => <><span>{date(row.arrivalDate)}</span><small>{row.comingFrom}</small></> },
  { key: 'requestedBy', label: 'Requested by', render: (row) => <><span>{row.requestedBy || '—'}</span><small>{row.dept}</small></> },
]

const CARDS = [
  {
    key: 'total',
    load: async ({ query, today, count, countIn }) => {
      const [all, month] = await Promise.all([count(query), countIn(query, monthRanges(today, 1)[0])])
      return { all, month }
    },
    render: (data) => (
      <Card index={0} icon="plane" label="Requests" theme="mint">
        <Hero value={data?.all} unit="visa requests" />
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
      <Card index={1} icon="calendar-range" label="Requests by month" theme="amber">
        <Columns items={data} count={MONTHS} />
        <Foot>By request date</Foot>
      </Card>
    ),
  },
]

const groups = [{
  key: 'status', title: 'Status', tone: 'mint',
  items: RECORD_STATUSES.map((status) => ({ key: status, label: STATUS_TEXT[status], patch: { status } })),
}]

const list = ({ page, limit, ...filters }, options) => service.list({ page, pageSize: limit, ...filters }, options)

export default function BusinessVisaReportPage() {
  const options = useResource('hr-business-visa-options', (signal) => service.options({ signal }))
  const lookups = options.status === 'ready' ? options.data : { divisions: [], departments: [] }
  const fields = [
    { key: 'q', label: 'Search', type: 'search', placeholder: 'Visitor, request, passport or company' },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: '', label: 'All' }, ...RECORD_STATUSES.map((status) => ({ value: status, label: STATUS_TEXT[status] }))] },
    { key: 'division', label: 'Division', type: 'select', options: [{ value: '', label: 'All' }, ...lookups.divisions.map((item) => ({ value: item.code, label: item.name }))] },
    { key: 'dept', label: 'Department', type: 'select', options: [{ value: '', label: 'All' }, ...lookups.departments.map((name) => ({ value: name, label: name }))] },
    { key: 'dateFrom', label: 'Date from', type: 'date' },
    { key: 'dateTo', label: 'Date to', type: 'date' },
  ]
  return (
    <InsightReport variant="business-visa-report" title="Business visa report" heading="Requests" breadcrumb={LETTERS_BREADCRUMB}
      resourceKey="hr-business-visa-report" list={list} create={{ permission: `${RESOURCE}:CREATE`, path: PATHS.form, label: 'New request' }}
      openLabel="Open request" empty="No business visa requests match these filters." initial={INITIAL}
      fields={fields} columns={COLUMNS} cards={CARDS} groups={groups} defaultSort={{ key: '', order: '' }}
      numberOf={(row) => row.requestNo || row.requestId} rowKey={(row) => row.requestId} pathOf={(row) => `${PATHS.form}/${row.requestId}`}
      summary={(row) => ({
        heading: row.visitorName,
        facts: [
          ['Request no.', row.requestNo], ['Status', STATUS_TEXT[row.status]], ['Date', row.requestDate ? date(row.requestDate) : ''],
          ['Nationality', nationality(row.nationality)], ['Passport no.', row.passportNo], ['Company', row.companyName],
          ['Purpose', row.visitPurpose], ['Arrival', row.arrivalDate ? date(row.arrivalDate) : ''], ['Visa', visaType(row)],
          ['Requested by', row.requestedBy], ['Noted by', row.notedBy], ['Approved by', row.approvedBy],
        ],
      })} />
  )
}
