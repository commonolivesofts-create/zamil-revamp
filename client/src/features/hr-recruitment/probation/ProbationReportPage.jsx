import { COMMON_TEXT } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { enDate } from '../shared/hrFormat.js'
import { Pill } from '../shared/components/RecruitmentShell.jsx'
import { RecruitmentReport } from '../shared/components/RecruitmentReport.jsx'
import { RESULT_TEXT, RESULT_TONE } from './probationRules.js'

const BASE = '/hr/recruitment/probation-evaluation'
const STATUS_TEXT = Object.freeze({ DRAFT: 'Draft', INPROCESS: 'In process', APPROVED: 'Approved', REJECTED: 'Rejected' })
const STATUS_TONE = Object.freeze({ DRAFT: 'warn', INPROCESS: 'warn', APPROVED: 'ok', REJECTED: 'bad' })
// The backend's FORM_TYPE values.
const FORM_TYPES = Object.freeze(['Workers_Technicians', 'Trainee', 'Engineers_Staff', 'Department_Managers', 'Supervisors_and_Foremens'])
const CREATE = Object.freeze({ permission: 'HR.PROBATION_EVALUATIONS:CREATE', path: BASE, tool: 'Form', label: 'New evaluation' })
const FILTERS = [
  { key: 'requestStatus', label: 'Status', type: 'status', options: Object.entries(STATUS_TEXT).map(([value, label]) => ({ value, label })) },
  { key: 'search', label: 'Search employee or number', type: 'search' },
  { key: 'empNumber', label: 'Employee number', type: 'search' },
  { key: 'formType', label: 'Form type', type: 'select', options: FORM_TYPES.map((value) => ({ value, label: value.replaceAll('_', ' ') })) },
  { key: 'dateFrom', label: 'Created from', type: 'date' },
  { key: 'dateTo', label: 'Created to', type: 'date' },
]
const COLUMNS = [
  { key: 'number', label: 'Evaluation no.', sort: 'HEADER_ID', render: (row) => row.evaluationNumber },
  { key: 'employee', label: 'Employee', sort: 'EMP_NAME', render: (row) => <>{row.employeeName || COMMON_TEXT.dash}<small className="zrv-hr-es-subline">#{row.employeeNumber || COMMON_TEXT.dash} · {row.jobTitle || COMMON_TEXT.dash}</small></> },
  { key: 'department', label: 'Department', render: (row) => row.department || COMMON_TEXT.dash },
  { key: 'formType', label: 'Form type', render: (row) => (row.formType ? row.formType.replaceAll('_', ' ') : COMMON_TEXT.dash) },
  { key: 'rating', label: 'Total rating', num: true, sort: 'TOTAL_RATING', render: (row) => row.totalRating },
  { key: 'result', label: 'Evaluation', render: (row) => (row.evaluationResult ? <Pill tone={RESULT_TONE[row.evaluationResult]}>{RESULT_TEXT[row.evaluationResult]}</Pill> : COMMON_TEXT.dash) },
  { key: 'pendingAt', label: 'Pending at', render: (row) => row.pendingAt || COMMON_TEXT.dash },
  { key: 'created', label: 'Created', sort: 'CREATED_AT', render: (row) => (row.createdAt ? enDate(row.createdAt) : COMMON_TEXT.dash) },
  { key: 'status', label: 'Status', render: (row) => <Pill tone={STATUS_TONE[row.status] ?? 'warn'}>{STATUS_TEXT[row.status] ?? row.status}</Pill> },
]

// Probation evaluation report: filtered, sorted and paged by the server.
export default function ProbationReportPage() {
  return (
    <RecruitmentReport variant="probation-report" title="Probation evaluation report" subtitle="Probation evaluations you can access, their rating and status." create={CREATE}
      list={hrRecruitmentServices.probations.list} heading="Evaluations" resourceKey="hr-probation-report" filters={FILTERS} columns={COLUMNS}
      defaultSort={{ key: 'HEADER_ID', order: 'desc' }} numberOf={(row) => row.evaluationNumber} pathOf={(row) => `${BASE}/${row.evaluationId}`} />
  )
}
