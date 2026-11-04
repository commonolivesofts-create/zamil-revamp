import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Delta, Distribution, Foot, Hero, Hint } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { CLEARANCE_PATHS } from '../employeeServicesPaths.js'
import { RECORD_STATUSES, STATUS_TEXT, STATUS_TONE } from '../shared/formRecords.js'
import { clearanceService } from './clearanceService.js'

const MONTHS = 6
const CREATE = Object.freeze({ permission: 'HR.EMPLOYEE_CLEARANCE:CREATE', path: CLEARANCE_PATHS.form, label: 'New clearance' })
const DIST_TONE = Object.freeze({ DRAFT: 'draft', INPROCESS: 'progress', APPROVED: 'ok', REJECTED: 'bad' })
const INITIAL = Object.freeze({ status: '', q: '', empNo: '', department: '', purpose: '', dateFrom: '', dateTo: '' })
const FIELDS = [
  { key: 'q', label: 'Search', type: 'search', placeholder: 'Name, number or reference' },
  { key: 'empNo', label: 'Employee number', type: 'search', placeholder: 'Number' },
  { key: 'department', label: 'Department', type: 'search', placeholder: 'Department' },
  { key: 'purpose', label: 'Purpose', type: 'search', placeholder: 'Purpose' },
  { key: 'dateFrom', label: 'Created from', type: 'date' },
  { key: 'dateTo', label: 'Created to', type: 'date' },
]
const date = (value) => (value ? enDate(value) : '—')
const vacation = (row) => (row.vacationFrom ? `${date(row.vacationFrom)} – ${date(row.vacationTo)}` : '—')
const statusPill = (row) => <Pill tone={STATUS_TONE[row.status]}>{STATUS_TEXT[row.status]}</Pill>
// The legacy report columns that read real data (its Vacation Start / End
// columns showed the division and the computer flag; workflow dates are not
// available without the workflow).
const COLUMNS = [
  { key: 'referenceNo', label: 'Reference No', render: (row) => row.referenceNo || row.clearanceId },
  { key: 'employee', label: 'Employee', render: (row) => <><b>{row.employeeName}</b><small>#{row.employeeNumber}</small></> },
  { key: 'jobTitle', label: 'Job title', render: (row) => <><b>{row.jobTitle || '—'}</b><small>{row.department}</small></> },
  { key: 'contact', label: 'Contact', render: (row) => row.contact || '—' },
  { key: 'vacation', label: 'Vacation', render: vacation },
  { key: 'purpose', label: 'Purpose', render: (row) => row.purpose || '—' },
  { key: 'createdAt', label: 'Created', render: (row) => date(row.createdAt) },
  { key: 'status', label: 'Status', render: statusPill },
]

// Server-filtered and newest first (the API has no sort parameter); the date filter is the creation date.
const list = ({ page, limit, status, q, empNo, department, purpose, dateFrom, dateTo }, options) =>
  clearanceService.list({ page, pageSize: limit, status, q, empNo: /^\d+$/.test(empNo ?? '') ? empNo : undefined, department, purpose, createdFrom: dateFrom, createdTo: dateTo }, options)

const CARDS = [
  {
    key: 'status',
    load: async ({ omit, count }) => {
      const base = omit(['status'])
      const [all, ...parts] = await Promise.all([count(base), ...RECORD_STATUSES.map((status) => count({ ...base, status }))])
      return { all, parts }
    },
    render: (data, { pick }) => (
      <Card index={0} icon="clipboard-check" label="Approval status" theme="mint" aside={<Hint>{data && `${data.all} requests`}</Hint>}>
        <Distribution total={data?.all} all={pick({ status: '' }).onPick}
          items={RECORD_STATUSES.map((status, index) => ({ key: status, label: STATUS_TEXT[status], tone: DIST_TONE[status], count: data?.parts[index], ...pick({ status }) }))} />
      </Card>
    ),
  },
  {
    key: 'open',
    load: async ({ omit, count }) => {
      const base = omit(['status'])
      const [drafts, rejected] = await Promise.all([count({ ...base, status: 'DRAFT' }), count({ ...base, status: 'REJECTED' })])
      return { drafts, rejected }
    },
    render: (data) => (
      <Card index={1} icon="file-pen" label="Still editable" theme="primary">
        <Hero value={data ? data.drafts + data.rejected : undefined} unit="drafts or rejected" />
        <Foot>{data ? `${data.drafts} draft · ${data.rejected} rejected` : ''}</Foot>
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
      <Card index={2} icon="calendar-range" label="Requests by month" theme="amber"
        aside={data && <Delta value={data.at(-1).count - data.at(-2).count} label="last month" />}>
        <Columns items={data} count={MONTHS} />
        <Foot>Requests created each month</Foot>
      </Card>
    ),
  },
]

// Employee clearance report (legacy empclearance_list.php): everyone sees the
// requests of themselves and their direct reports; VIEW_ALL adds every request.
export default function ClearanceReportPage() {
  return (
    <InsightReport variant="clearance-report" title="Employee clearance report" heading="Requests" breadcrumb={C.breadcrumb}
      resourceKey="hr-clearance-report" list={list} create={CREATE} openLabel="Open request" empty="No clearance requests match these filters."
      initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={CARDS} defaultSort={{ key: '', order: '' }}
      numberOf={(row) => row.referenceNo || row.clearanceId} rowKey={(row) => row.clearanceId} pathOf={(row) => `${CLEARANCE_PATHS.form}/${row.clearanceId}`}
      validate={(draft) => (draft.empNo && !/^\d+$/.test(draft.empNo) ? { empNo: 'Enter digits only.' } : {})}
      summary={(row) => ({
        heading: row.employeeName,
        pill: statusPill(row),
        facts: [
          ['Reference No', row.referenceNo], ['Employee number', row.employeeNumber], ['Job title', row.jobTitle], ['Department', row.department],
          ['Contact', row.contact], ['Vacation', row.vacationFrom ? vacation(row) : ''], ['Purpose', row.purpose], ['Created', row.createdAt ? date(row.createdAt) : ''],
        ],
      })} />
  )
}
