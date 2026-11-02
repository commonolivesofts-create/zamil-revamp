import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { Pill, RecruitmentHeader } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { RECORD_STATUSES, STATUS_TEXT, STATUS_TONE } from '../shared/formRecords.js'
import { ServerRecordList } from '../shared/ServerRecordList.jsx'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import { sickLeaveDemo, sickLeaveService } from './sickLeaveService.js'

const FILTERS = [
  { key: 'empName', label: 'Employee name', type: 'search' },
  { key: 'empId', label: 'Employee number', type: 'search' },
  { key: 'status', label: 'Status', type: 'select', options: RECORD_STATUSES.map((value) => ({ value, label: STATUS_TEXT[value] })) },
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
  const navigate = useNavigate()
  const canCreate = usePermissions().can('HR.SICK_LEAVE:CREATE')
  return (
    <div className="zrv-hr zrv-hr--sick-leave-report zrv-hr--compact">
      <RecruitmentHeader title="Sick leave report" subtitle="Sick leave requests and their status." breadcrumb={C.breadcrumb} demo={sickLeaveDemo} />
      <div className="zrv-hr-toolbar" role="toolbar" aria-label="Sick leave report">
        <div className="zrv-hr-tools">
          {canCreate && <button type="button" onClick={() => navigate(FORM_PATHS.sickLeave)}><OrvexaIcon name="file-plus" size={17} /><span>New request</span></button>}
          <button type="button" onClick={() => window.print()}><OrvexaIcon name="printer" size={17} /><span>{C.print}</span></button>
        </div>
      </div>
      <ServerRecordList heading="Requests" resourceKey="hr-sick-leave-report" load={({ mine, ...query }, options) => sickLeaveService.list({ ...query, mine: mine === 'true' }, options)}
        filters={FILTERS} columns={COLUMNS} numberOf={(row) => row.leaveId} pathOf={(row) => `${FORM_PATHS.sickLeave}/${row.leaveId}`} />
    </div>
  )
}
