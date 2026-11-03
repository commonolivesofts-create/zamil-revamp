import { COMMON_TEXT } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { enDate } from '../shared/hrFormat.js'
import { Pill } from '../shared/components/RecruitmentShell.jsx'
import { RecruitmentReport } from '../shared/components/RecruitmentReport.jsx'
import { FORM_TYPE_LABELS, RESULT_TEXT, RESULT_TONE } from './probationRules.js'

const BASE = '/hr/recruitment/probation-evaluation'
const STATUS_TEXT = Object.freeze({ DRAFT: 'Draft', INPROCESS: 'In process', APPROVED: 'Approved', REJECTED: 'Rejected' })
const STATUS_TONE = Object.freeze({ DRAFT: 'warn', INPROCESS: 'warn', APPROVED: 'ok', REJECTED: 'bad' })
const CREATE = Object.freeze({ permission: 'HR.PROBATION_EVALUATIONS:CREATE', path: BASE, tool: 'Request Form', label: 'New evaluation' })
const FILTERS = [
  { key: 'requestStatus', label: 'Status', type: 'status', options: Object.entries(STATUS_TEXT).map(([value, label]) => ({ value, label })) },
  { key: 'search', label: 'Search employee or number', type: 'search' },
  { key: 'empNumber', label: 'Employee number', type: 'search' },
  { key: 'formType', label: 'Form type', type: 'select', options: Object.entries(FORM_TYPE_LABELS).map(([value, label]) => ({ value, label })) },
  { key: 'dateFrom', label: 'Created from', type: 'date' },
  { key: 'dateTo', label: 'Created to', type: 'date' },
]
// The legacy report (prob_report.php) columns, after the evaluation number that opens the record.
const COLUMNS = [
  { key: 'number', label: '#', sort: 'HEADER_ID', render: (row) => row.evaluationNumber },
  { key: 'employeeNumber', label: 'Emp. #', render: (row) => row.employeeNumber || COMMON_TEXT.dash },
  { key: 'employeeName', label: 'Name', sort: 'EMP_NAME', render: (row) => row.employeeName || COMMON_TEXT.dash },
  { key: 'jobTitle', label: 'Job Title', render: (row) => row.jobTitle || COMMON_TEXT.dash },
  { key: 'department', label: 'Department', render: (row) => row.department || COMMON_TEXT.dash },
  { key: 'rating', label: 'Total Rating', num: true, sort: 'TOTAL_RATING', render: (row) => row.totalRating },
  { key: 'result', label: 'Evaluation', render: (row) => (row.evaluationResult ? <Pill tone={RESULT_TONE[row.evaluationResult]}>{RESULT_TEXT[row.evaluationResult]}</Pill> : COMMON_TEXT.dash) },
  { key: 'status', label: 'Status', render: (row) => <Pill tone={STATUS_TONE[row.status] ?? 'warn'}>{STATUS_TEXT[row.status] ?? row.status}</Pill> },
  { key: 'created', label: 'Date', sort: 'CREATED_AT', render: (row) => (row.createdAt ? enDate(row.createdAt) : COMMON_TEXT.dash) },
  { key: 'pendingAt', label: 'Pending At', render: (row) => row.pendingAt || COMMON_TEXT.dash },
]

// Probation evaluation report: filtered, sorted and paged by the server.
export default function ProbationReportPage() {
  return (
    <RecruitmentReport variant="probation-report" title="Probation Report" subtitle="Probation evaluations you can access, their rating and status." create={CREATE}
      list={hrRecruitmentServices.probations.list} heading="Evaluations" resourceKey="hr-probation-report" filters={FILTERS} columns={COLUMNS}
      defaultSort={{ key: 'HEADER_ID', order: 'desc' }} numberOf={(row) => row.evaluationNumber} pathOf={(row) => `${BASE}/${row.evaluationId}`} />
  )
}
