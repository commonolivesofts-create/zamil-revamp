import { COMMON_TEXT, INSIGHT_TEXT } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { enDate } from '../shared/hrFormat.js'
import { monthRanges } from '../shared/insightDates.js'
import { Pill } from '../shared/components/RecruitmentShell.jsx'
import { InsightReport } from '../shared/components/InsightReport.jsx'
import { Card, Donut, Foot, Hint, Rank, Ticks } from '../shared/components/InsightCards.jsx'
import { FORM_TYPE_LABELS, RESULT_TEXT, RESULT_TONE } from './probationRules.js'

const BASE = '/hr/recruitment/probation-evaluation'
const STATUS_TEXT = Object.freeze({ DRAFT: 'Draft', INPROCESS: 'In process', APPROVED: 'Approved', REJECTED: 'Rejected' })
const STATUS_TONE = Object.freeze({ DRAFT: 'warn', INPROCESS: 'warn', APPROVED: 'ok', REJECTED: 'bad' })
const DONUT_TONE = Object.freeze({ DRAFT: 'draft', INPROCESS: 'progress', APPROVED: 'ok', REJECTED: 'bad' })
const STATUSES = Object.keys(STATUS_TEXT)
const FORM_TYPES = Object.keys(FORM_TYPE_LABELS)
const CREATE = Object.freeze({ permission: 'HR.PROBATION_EVALUATIONS:CREATE', path: BASE, label: 'New evaluation' })
const INITIAL = Object.freeze({ requestStatus: '', search: '', empNumber: '', formType: '', dateFrom: '', dateTo: '' })
const FILTERS = [
  { key: 'search', label: INSIGHT_TEXT.search, type: 'search', placeholder: 'Employee or number' },
  { key: 'empNumber', label: 'Employee number', type: 'search' },
  { key: 'formType', label: 'Form type', type: 'select', options: FORM_TYPES.map((value) => ({ value, label: FORM_TYPE_LABELS[value] })) },
  { key: 'dateFrom', label: 'Created from', type: 'date' },
  { key: 'dateTo', label: 'Created to', type: 'date' },
]
const date = (value) => (value ? enDate(value) : COMMON_TEXT.dash)
const statusPill = (row) => <Pill tone={STATUS_TONE[row.status] ?? 'warn'}>{STATUS_TEXT[row.status] ?? row.status}</Pill>

// Overview: where evaluations are in approval, the approved share, and which
// form types are used most.
const statusCounts = async ({ omit, count }) => {
  const base = omit(['requestStatus'])
  const [all, ...parts] = await Promise.all([count(base), ...STATUSES.map((status) => count({ ...base, requestStatus: status }))])
  return { all, parts: Object.fromEntries(STATUSES.map((status, index) => [status, parts[index]])) }
}
const CARDS = [
  {
    key: 'status',
    load: statusCounts,
    render: (data, { pick }) => (
      <Card index={0} icon="chart-pie" label="Evaluation status" theme="mint" aside={<Hint>{data && `${(data.parts.DRAFT ?? 0) + (data.parts.INPROCESS ?? 0)} still open`}</Hint>}>
        <Donut total={data?.all} unit="evaluations"
          items={STATUSES.map((status) => ({ key: status, label: STATUS_TEXT[status], tone: DONUT_TONE[status], count: data?.parts[status], ...pick({ requestStatus: status }) }))} />
      </Card>
    ),
  },
  {
    key: 'completion',
    load: statusCounts,
    render: (data) => (
      <Card index={1} icon="battery-charging" label="Approved" theme="primary">
        <Ticks value={data?.parts.APPROVED} of={data?.all} />
        <Foot>{data && `${data.parts.APPROVED} of ${data.all} evaluations approved`}</Foot>
      </Card>
    ),
  },
  {
    key: 'forms',
    load: async ({ omit, count }) => {
      const base = omit(['formType'])
      const counts = await Promise.all(FORM_TYPES.map((formType) => count({ ...base, formType })))
      return Object.fromEntries(FORM_TYPES.map((formType, index) => [formType, counts[index]]))
    },
    render: (data, { pick }) => (
      <Card index={2} icon="layers" label="Form types" theme="amber">
        <Rank items={FORM_TYPES.map((formType) => ({ key: formType, label: FORM_TYPE_LABELS[formType], count: data?.[formType], ...pick({ formType }) }))} />
      </Card>
    ),
  },
]

// Quick creation-date windows.
function dateGroups(today) {
  const months = monthRanges(today, 3)
  return [{
    key: 'created', title: 'Created', tone: 'primary', items: [
      ['month', 'This month', { dateFrom: months[2].from, dateTo: today }],
      ['quarter', 'Last 3 months', { dateFrom: months[0].from, dateTo: today }],
      ['year', 'This year', { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today }],
    ].map(([key, label, patch]) => ({ key, label, patch })),
  }]
}

const summary = (row) => ({
  heading: row.employeeName,
  pill: statusPill(row),
  facts: [
    ['Employee number', row.employeeNumber], ['Job title', row.jobTitle], ['Department', row.department],
    ['Form type', FORM_TYPE_LABELS[row.formType] ?? row.formType], ['Total rating', String(row.totalRating)],
    ['Evaluation', RESULT_TEXT[row.evaluationResult]], ['Pending at', row.pendingAt], ['Created', date(row.createdAt)],
  ],
})

// The legacy report (prob_report.php) columns, after the evaluation number that opens the record.
const COLUMNS = [
  { key: 'number', label: '#', sort: 'HEADER_ID', render: (row) => row.evaluationNumber },
  { key: 'employeeNumber', label: 'Emp. #', render: (row) => row.employeeNumber || COMMON_TEXT.dash },
  { key: 'employeeName', label: 'Name', sort: 'EMP_NAME', render: (row) => row.employeeName || COMMON_TEXT.dash },
  { key: 'jobTitle', label: 'Job Title', render: (row) => row.jobTitle || COMMON_TEXT.dash },
  { key: 'department', label: 'Department', render: (row) => row.department || COMMON_TEXT.dash },
  { key: 'rating', label: 'Total Rating', num: true, sort: 'TOTAL_RATING', render: (row) => row.totalRating },
  { key: 'result', label: 'Evaluation', render: (row) => (row.evaluationResult ? <Pill tone={RESULT_TONE[row.evaluationResult]}>{RESULT_TEXT[row.evaluationResult]}</Pill> : COMMON_TEXT.dash) },
  { key: 'status', label: 'Status', render: statusPill },
  { key: 'created', label: 'Date', sort: 'CREATED_AT', render: (row) => (row.createdAt ? enDate(row.createdAt) : COMMON_TEXT.dash) },
  { key: 'pendingAt', label: 'Pending At', render: (row) => row.pendingAt || COMMON_TEXT.dash },
]

// Probation evaluation report: filtered, sorted and paged by the server.
export default function ProbationReportPage() {
  return (
    <InsightReport variant="probation-report" title="Probation Report" subtitle="Probation evaluations, their rating and where they are in approval." heading="Evaluations"
      resourceKey="hr-probation-report" list={hrRecruitmentServices.probations.list} create={CREATE} openLabel="Open evaluation" empty="No evaluations match these filters."
      initial={INITIAL} fields={FILTERS} columns={COLUMNS} cards={CARDS} groups={dateGroups} summary={summary}
      defaultSort={{ key: 'HEADER_ID', order: 'desc' }} numberOf={(row) => row.evaluationNumber} rowKey={(row) => row.evaluationId}
      pathOf={(row) => `${BASE}/${row.evaluationId}`} />
  )
}
