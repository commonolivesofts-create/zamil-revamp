import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { STATUS_FILTER, STATUS_TEXT, STATUS_TONE } from '../shared/formRecords.js'
import { ReportPage } from '../shared/ReportPage.jsx'
import { ServerRecordList } from '../shared/ServerRecordList.jsx'
import { sickLeaveDemo, sickLeaveService } from './sickLeaveService.js'

const CREATE = Object.freeze({ permission: 'HR.SICK_LEAVE:CREATE', path: FORM_PATHS.sickLeave, tool: 'Form', label: 'New request' })
const FILTERS = [
  STATUS_FILTER,
  { key: 'empName', label: 'Employee name', type: 'search' },
  { key: 'empId', label: 'Employee number', type: 'search' },
  { key: 'from', label: 'Leave from', type: 'date' },
  { key: 'to', label: 'Leave to', type: 'date' },
  { key: 'mine', label: 'Show', type: 'select', options: [{ value: 'true', label: 'My requests only' }] },
]
const COLUMNS = [
  { key: 'leaveId', label: 'Request no.', render: (row) => row.leaveId },
  { key: 'employee', label: 'Employee', render: (row) => <>{row.employeeName}<small className="zrv-hr-es-subline">#{row.employeeNumber}</small></> },
  { key: 'fromDate', label: 'From', render: (row) => (row.fromDate ? enDate(row.fromDate) : '—') },
  { key: 'toDate', label: 'To', render: (row) => (row.toDate ? enDate(row.toDate) : '—') },
  { key: 'days', label: 'No. of days', num: true, render: (row) => row.days ?? '—' },
  { key: 'total', label: 'Total leave days', num: true, render: (row) => row.totalLeaveDays ?? '—' },
  { key: 'pendingAt', label: 'Pending at', render: (row) => row.pendingAt || '—' },
  { key: 'status', label: 'Status', render: (row) => <Pill tone={STATUS_TONE[row.status]}>{STATUS_TEXT[row.status]}</Pill> },
]

// Sick leave report: filtered and paged by the server. Everyone sees their own
// requests and those they filed; the HR permission adds every request and the
// employee's total leave days in the period. The API has no sort parameter.
export default function SickLeaveReportPage() {
  return (
    <ReportPage variant="sick-leave-report" title="Sick leave report" subtitle="Sick leave requests and their status." demo={sickLeaveDemo} create={CREATE}>
      <ServerRecordList heading="Requests" resourceKey="hr-sick-leave-report" load={({ mine, ...query }, options) => sickLeaveService.list({ ...query, mine: mine === 'true' }, options)}
        filters={FILTERS} columns={COLUMNS} numberOf={(row) => row.leaveId} pathOf={(row) => `${FORM_PATHS.sickLeave}/${row.leaveId}`} />
    </ReportPage>
  )
}
