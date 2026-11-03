import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { STATUS_FILTER, STATUS_TEXT, STATUS_TONE } from '../shared/formRecords.js'
import { ReportPage } from '../shared/ReportPage.jsx'
import { ServerRecordList } from '../shared/ServerRecordList.jsx'
import { DEPARTMENT_TEXT } from './rewardModel.js'
import { rewardDemo, rewardService } from './rewardService.js'

const RATING_TEXT = Object.freeze({ A: 'At Standard', AS: 'Above Standard', BS: 'Below Standard', CS: 'Close to Standard' })
const CREATE = Object.freeze({ permission: 'HR.EMPLOYEE_OF_THE_MONTH:CREATE', path: FORM_PATHS.reward, tool: 'Form', label: 'New nomination' })
const FILTERS = [
  STATUS_FILTER,
  { key: 'search', label: 'Search', type: 'search' },
  { key: 'department', label: 'Section', type: 'select', options: Object.entries(DEPARTMENT_TEXT).map(([value, item]) => ({ value, label: item.name })) },
  { key: 'date_from', label: 'Effective from', type: 'date' },
  { key: 'date_to', label: 'Effective to', type: 'date' },
]
const COLUMNS = [
  { key: 'requestNo', label: 'Request no.', sort: 'requestNo', render: (row) => row.requestNo },
  { key: 'employee', label: 'Employee', sort: 'employeeName', render: (row) => <>{row.employeeName}<small className="zrv-hr-es-subline">#{row.employeeNumber} · {row.employeePosition || '—'}</small></> },
  { key: 'department', label: 'Section', render: (row) => DEPARTMENT_TEXT[row.department].name },
  { key: 'activityDate', label: 'Effective date', sort: 'activityDate', render: (row) => (row.activityDate ? enDate(row.activityDate) : '—') },
  { key: 'ratings', label: 'Ratings (AS · A · CS · BS)', render: (row) => ['AS', 'A', 'CS', 'BS'].map((code) => row.ratings[code]).join(' · ') },
  { key: 'overall', label: 'Overall feedback', render: (row) => RATING_TEXT[row.overallRating] ?? '—' },
  { key: 'requestor', label: 'Requested by', render: (row) => row.requestor || '—' },
  { key: 'status', label: 'Status', sort: 'status', render: (row) => <Pill tone={STATUS_TONE[row.status]}>{STATUS_TEXT[row.status]}</Pill> },
]

// Reward nominations report: filtered, sorted and paged by the server (HR sees
// every nomination, others the ones they created).
export default function RewardReportPage() {
  return (
    <ReportPage variant="reward-report" title="Reward nominations" subtitle="All nominations by section and month." demo={rewardDemo} create={CREATE}>
      <ServerRecordList heading="Nominations" resourceKey="hr-reward-report" load={rewardService.list} filters={FILTERS} columns={COLUMNS}
        defaultSort={{ key: 'createdAt', order: 'desc' }} numberOf={(row) => row.requestNo} pathOf={(row) => `${FORM_PATHS.reward}/${row.nominationId}`} />
    </ReportPage>
  )
}
