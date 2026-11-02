import { COMMON_TEXT, INTERVIEW_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { enDate } from '../shared/hrFormat.js'
import { Pill } from '../shared/components/RecruitmentShell.jsx'
import { RecruitmentReport } from '../shared/components/RecruitmentReport.jsx'

const BASE = '/hr/recruitment/interview'
const R = T.report
const STATUS_TONE = Object.freeze({ INCOMPLETE: 'warn', INPROCESS: 'warn', APPROVED: 'ok', REJECTED: 'bad' })
const options = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }))
const CREATE = Object.freeze({ permission: ACTIONS.INTERVIEW_CREATE, path: BASE, tool: R.tool, label: R.newAssessment })
// Filter values are the backend's (Incomplete, Passed…); labels are the screen's.
const FILTERS = [
  { key: 'status', label: R.columns.status, type: 'status', options: ['Incomplete', 'Inprocess', 'Approved', 'Rejected'].map((value) => ({ value, label: T.status[value.toUpperCase()] })) },
  { key: 'search', label: R.filters.search, type: 'search' },
  { key: 'evaluationStatus', label: R.filters.outcome, type: 'select', options: ['Passed', 'Hold', 'Failed'].map((value) => ({ value, label: T.outcomes[value.toUpperCase()] })) },
  { key: 'interviewType', label: R.filters.type, type: 'select', options: options(R.types) },
  { key: 'division', label: R.filters.division, type: 'select', options: options(R.divisions) },
  { key: 'dateFrom', label: R.filters.from, type: 'date' },
  { key: 'dateTo', label: R.filters.to, type: 'date' },
]
const COLUMNS = [
  { key: 'number', label: R.columns.number, sort: 'HEADER_ID', render: (row) => row.assessmentNumber || row.assessmentId },
  { key: 'candidate', label: R.columns.candidate, sort: 'CANDIDATE_NAME', render: (row) => <b>{row.candidateName || COMMON_TEXT.dash}</b> },
  { key: 'position', label: R.columns.position, render: (row) => row.positionTitle || COMMON_TEXT.dash },
  { key: 'requisition', label: R.columns.requisition, render: (row) => row.requisitionNo || COMMON_TEXT.dash },
  { key: 'date', label: R.columns.date, sort: 'INTERVIEW_DATE', render: (row) => (row.interviewDate ? enDate(row.interviewDate) : COMMON_TEXT.dash) },
  { key: 'outcome', label: R.columns.outcome, render: (row) => T.outcomes[row.outcome] ?? COMMON_TEXT.dash },
  { key: 'status', label: R.columns.status, render: (row) => <Pill tone={STATUS_TONE[row.status]}>{T.status[row.status]}</Pill> },
]

// Interview assessment report: HR sees every assessment, others their own;
// filtered, sorted and paged by the server.
export default function InterviewReportPage() {
  return (
    <RecruitmentReport variant="interview-report" title={R.title} subtitle={R.subtitle} create={CREATE}
      list={hrRecruitmentServices.interviews.list} heading={R.heading} resourceKey="hr-interview-report" filters={FILTERS} columns={COLUMNS}
      defaultSort={{ key: 'HEADER_ID', order: 'desc' }} numberOf={(row) => row.assessmentNumber || row.assessmentId}
      pathOf={(row) => `${BASE}/${row.assessmentId}`} />
  )
}
