import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { Pill, RecruitmentHeader } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C, TRANSFER_TEXT as T } from '../hrEmployeeServicesText.js'
import { employeeServicesDemo, hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { RecordList } from '../shared/RecordList.jsx'
import { useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import { TRANSFER_STATUSES } from './transferModel.js'

const R = T.report
const columns = [
  { key: 'transferNumber', label: R.columns.number, render: (row) => row.transferNumber },
  { key: 'employeeName', label: R.columns.employee, render: (row) => <>{row.employeeName}<small className="zrv-hr-es-subline">#{row.employeeNumber}</small></> },
  { key: 'fromDepartmentName', label: R.columns.from, render: (row) => row.fromDepartmentName },
  { key: 'toDepartmentName', label: R.columns.to, render: (row) => <><b>{row.toDepartmentName ?? '—'}</b>{row.toSectionName && <small className="zrv-hr-es-subline">{row.toSectionName}</small>}</> },
  { key: 'effectiveDate', label: R.columns.effective, render: (row) => (row.effectiveDate ? enDate(row.effectiveDate) : '—') },
  { key: 'salaryChange', label: R.columns.salary, render: (row) => R.salary(row.salaryChange, row.budgetedSalary) },
  { key: 'status', label: R.columns.status, render: (row) => <Pill tone={row.status === 'DRAFT' ? 'warn' : 'ok'}>{C.status[row.status]}</Pill> },
]

// Transfer report: every transfer request and where it is in approval;
// search, status tabs and sortable columns; a transfer opens by its Ref #.
export default function TransferReportPage() {
  useEmployeeServicesUser()
  const navigate = useNavigate()
  const transfers = useResource('hr-transfer-report', (signal) => hrEmployeeServices.transfers.list({ signal }))
  return (
    <div className="zrv-hr zrv-hr--transfer-report zrv-hr--compact">
      <RecruitmentHeader title={R.title} subtitle={R.subtitle} breadcrumb={C.breadcrumb} demo={employeeServicesDemo} />
      <div className="zrv-hr-toolbar" role="toolbar" aria-label={R.title}>
        <div className="zrv-hr-tools">
          <button type="button" onClick={() => navigate(ES_PATHS.transfer)}><OrvexaIcon name="file-plus" size={17} /><span>{T.tools.newTransfer}</span></button>
          <button type="button" onClick={() => window.print()}><OrvexaIcon name="printer" size={17} /><span>{C.print}</span></button>
          <button type="button" onClick={() => navigate('/dashboard')}><OrvexaIcon name="house" size={17} /><span>{C.home}</span></button>
        </div>
        <button type="button" className="btn-primary zrv-hr-btn" onClick={() => navigate(ES_PATHS.transfer)}><OrvexaIcon name="plus" size={16} /> {R.newTransfer}</button>
      </div>
      <ResourceState resource={transfers} label={R.noun} empty={C.list.empty}>
        {(page) => (
          <RecordList heading={R.heading} searchLabel={R.search} searchPlaceholder={R.searchPlaceholder} statuses={TRANSFER_STATUSES} statusText={C.status}
            rows={page.items} columns={columns} defaultSort={{ key: 'transferNumber', dir: -1 }}
            searchText={(row) => `${row.transferNumber} ${row.employeeName} ${row.employeeNumber} ${row.fromDepartmentName} ${row.toDepartmentName ?? ''} ${row.toSectionName ?? ''}`}
            pathOf={(row) => `${ES_PATHS.transfer}/${row.transferId}`} numberOf={(row) => row.transferNumber} />
        )}
      </ResourceState>
    </div>
  )
}
