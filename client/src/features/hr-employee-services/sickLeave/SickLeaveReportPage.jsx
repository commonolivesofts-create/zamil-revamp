import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { addDays, dayWindows, monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Delta, Distribution, Foot, Hero, Hint, Lanes } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { RECORD_STATUSES, STATUS_TEXT, STATUS_TONE } from '../shared/formRecords.js'
import { sickLeaveDemo, sickLeaveService } from './sickLeaveService.js'
import { SickLeaveReportPreview } from './SickLeaveReportPreview.jsx'

const MONTHS = 6
const CREATE = Object.freeze({ permission: 'HR.SICK_LEAVE:CREATE', path: FORM_PATHS.sickLeave, label: 'New request' })
const DIST_TONE = Object.freeze({ DRAFT: 'draft', INPROCESS: 'progress', APPROVED: 'ok', REJECTED: 'bad' })
const INITIAL = Object.freeze({ status: '', empName: '', empId: '', dateFrom: '', dateTo: '', mine: '' })
const FIELDS = [
  { key: 'empName', label: 'Employee name', type: 'search', placeholder: 'Name' },
  { key: 'empId', label: 'Employee number', type: 'search', placeholder: 'Number' },
  { key: 'dateFrom', label: 'On leave from', type: 'date' },
  { key: 'dateTo', label: 'On leave to', type: 'date' },
  { key: 'mine', label: 'Show', type: 'select', options: [{ value: 'true', label: 'My requests only' }] },
]
const date = (value) => (value ? enDate(value) : '—')
const statusPill = (row) => <Pill tone={STATUS_TONE[row.status]}>{STATUS_TEXT[row.status]}</Pill>
const COLUMNS = [
  { key: 'leaveId', label: 'Request no.', render: (row) => row.leaveId },
  { key: 'employee', label: 'Employee', render: (row) => <><b>{row.employeeName}</b><small>#{row.employeeNumber}</small></> },
  { key: 'fromDate', label: 'From', render: (row) => date(row.fromDate) },
  { key: 'toDate', label: 'To', render: (row) => date(row.toDate) },
  { key: 'days', label: 'No. of days', render: (row) => row.days ?? '—' },
  { key: 'total', label: 'Total leave days', render: (row) => row.totalLeaveDays ?? '—' },
  { key: 'pendingAt', label: 'Pending at', render: (row) => row.pendingAt || '—' },
  { key: 'status', label: 'Status', render: statusPill },
]

// The API filters by leave period (a request counts when it overlaps the
// dates) and has no sort parameter: newest first.
const list = ({ page, limit, status, empName, empId, dateFrom, dateTo, mine }, options) =>
  sickLeaveService.list({ page, pageSize: limit, status, empName, empId, from: dateFrom, to: dateTo, mine: mine === 'true' }, options)

// Overview: where requests are in approval, who is off now and in the coming
// weeks, and requests per month.
const CARDS = [
  {
    key: 'status',
    load: async ({ omit, count }) => {
      const base = omit(['status'])
      const [all, ...parts] = await Promise.all([count(base), ...RECORD_STATUSES.map((status) => count({ ...base, status }))])
      return { all, parts }
    },
    render: (data, { pick }) => (
      <Card index={0} icon="stethoscope" label="Approval status" theme="mint" aside={<Hint>{data && `${data.all} requests`}</Hint>}>
        <Distribution total={data?.all} all={pick({ status: '' }).onPick}
          items={RECORD_STATUSES.map((status, index) => ({ key: status, label: STATUS_TEXT[status], tone: DIST_TONE[status], count: data?.parts[index], ...pick({ status }) }))} />
      </Card>
    ),
  },
  {
    key: 'away',
    load: async ({ query, today, countIn }) => {
      const weeks = dayWindows(today, 7, 3, { forward: true })
      const [now, ...ahead] = await Promise.all([countIn(query, { from: today, to: today }), ...weeks.map((week) => countIn(query, week))])
      return { now, weeks: weeks.map((week, index) => ({ key: week.key, label: index ? `From ${week.label}` : 'This week', count: ahead[index] })) }
    },
    render: (data) => (
      <Card index={1} icon="bed" label="Away on sick leave" theme="primary">
        <Hero value={data?.now} unit="off today" />
        <Lanes items={data?.weeks} slots={3} />
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
      <Card index={2} icon="calendar-range" label="Leave by month" theme="amber"
        aside={data && <Delta value={data.at(-1).count - data.at(-2).count} label="last month" />}>
        <Columns items={data} count={MONTHS} />
        <Foot>Requests overlapping each month</Foot>
      </Card>
    ),
  },
]

// Quick leave-period windows.
function dateGroups(today) {
  const month = monthRanges(today, 1)[0]
  return [{
    key: 'period', title: 'On leave', tone: 'mint', items: [
      { key: 'today', label: 'Today', patch: { dateFrom: today, dateTo: today } },
      { key: 'week', label: 'Next 7 days', patch: { dateFrom: today, dateTo: addDays(today, 6) } },
      { key: 'month', label: 'This month', patch: { dateFrom: month.from, dateTo: month.to } },
    ],
  }]
}

// Sick leave report: filtered and paged by the server. Everyone sees their own
// requests and those they filed; the HR permission adds every request and the
// employee's total leave days in the period.
export default function SickLeaveReportPage() {
  return (
    <InsightReport variant="sick-leave-report" title="Sick leave report" heading="Requests" breadcrumb={C.breadcrumb} demo={sickLeaveDemo}
      resourceKey="hr-sick-leave-report" list={list} create={CREATE} empty="No requests match these filters."
      initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={CARDS} groups={dateGroups} defaultSort={{ key: '', order: '' }}
      numberOf={(row) => row.leaveId} rowKey={(row) => row.leaveId} closeInDetail
      renderDetail={(row, { onClose }) => <SickLeaveReportPreview row={row} onClose={onClose} />} />
  )
}
