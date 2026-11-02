import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { Pill, RecruitmentHeader } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { toCsv, withBom } from '@/features/hr-recruitment/report/periodwiseModel.js'
import { ES_COMMON_TEXT as C, RECORD_CHANGE_TEXT as T } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { RecordList } from '../shared/RecordList.jsx'
import { useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import { LEGACY_RECORD_CHANGE_STATUSES } from './recordChangeModel.js'
import { ES_PATHS } from '../employeeServicesPaths.js'

const L = T.list
const RECORD_CHANGE_BASE = ES_PATHS.recordChange
const amount = (value) => (value === null || value === undefined ? '—' : C.money(value))
const statusTone = (status) => (status === 'REJECTED' ? 'bad' : status === 'DRAFT' ? 'warn' : 'ok')
// The legacy report (Rec_change/list) columns, after the Ref # that opens the request.
const columns = [
  { key: 'requestNumber', label: L.columns.number, render: (row) => row.requestNumber },
  { key: 'employeeNumber', label: L.columns.empNo, render: (row) => row.employeeNumber },
  { key: 'employeeName', label: L.columns.employee, render: (row) => row.employeeName || '—' },
  { key: 'position', label: L.columns.position, render: (row) => row.position || '—' },
  { key: 'section', label: L.columns.section, render: (row) => row.section || '—' },
  { key: 'department', label: L.columns.department, render: (row) => row.department || '—' },
  { key: 'oldTotal', label: L.columns.previous, num: true, render: (row) => amount(row.oldTotal) },
  { key: 'newTotal', label: L.columns.revised, num: true, render: (row) => amount(row.newTotal) },
  { key: 'remarks', label: L.columns.remarks, sortable: false, render: (row) => row.remarks || '—' },
  { key: 'requestor', label: L.columns.requestor, render: (row) => row.requestor || '—' },
  { key: 'pendingAt', label: L.columns.pendingAt, render: (row) => row.pendingAt || '—' },
  { key: 'status', label: L.columns.status, render: (row) => <Pill tone={statusTone(row.status)}>{C.status[row.status] ?? row.status}</Pill> },
]

// Legacy DataTables export (CSV for Excel): every request with the report columns and its SR NO.
function exportCsv(rows) {
  const csv = toCsv(rows, [
    { label: 'SR NO', value: (_row, index) => index + 1 },
    { label: L.columns.number, value: (row) => row.requestNumber },
    { label: L.columns.empNo, value: (row) => row.employeeNumber },
    { label: L.columns.employee, value: (row) => row.employeeName },
    { label: L.columns.position, value: (row) => row.position },
    { label: L.columns.section, value: (row) => row.section },
    { label: L.columns.department, value: (row) => row.department },
    { label: L.columns.previous, value: (row) => row.oldTotal },
    { label: L.columns.revised, value: (row) => row.newTotal },
    { label: L.columns.remarks, value: (row) => row.remarks },
    { label: L.columns.requestor, value: (row) => row.requestor },
    { label: L.columns.pendingAt, value: (row) => row.pendingAt },
    { label: L.columns.status, value: (row) => row.status },
  ])
  const url = URL.createObjectURL(new Blob([withBom(csv)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = L.csvFile
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Change requests: the legacy report with its status; search, status tabs and sortable columns;
// a request opens by its Ref #.
export default function RecordChangeRequestsPage() {
  useEmployeeServicesUser()
  const canCreate = usePermissions().can('HR.PERSONNEL_RECORD_CHANGES:CREATE')
  const navigate = useNavigate()
  const requests = useResource('hr-record-change-requests', (signal) => hrEmployeeServices.recordChanges.list({ signal }))
  const rows = requests.data?.items ?? []
  return (
    <div className="zrv-hr zrv-hr--record-change-list zrv-hr--compact">
      <RecruitmentHeader title={L.title} subtitle={L.subtitle} breadcrumb={C.breadcrumb} />
      <div className="zrv-hr-toolbar" role="toolbar" aria-label={L.title}>
        <div className="zrv-hr-tools">
          <button type="button" onClick={() => navigate('/dashboard')}><OrvexaIcon name="house" size={17} /><span>{C.home}</span></button>
          <button type="button" onClick={() => navigate(RECORD_CHANGE_BASE)} disabled={!canCreate}><OrvexaIcon name="file-plus" size={17} /><span>{T.tools.newRequest}</span></button>
          <button type="button" onClick={() => exportCsv(rows)} disabled={!rows.length}><OrvexaIcon name="download" size={17} /><span>{L.export}</span></button>
          <button type="button" onClick={() => window.print()}><OrvexaIcon name="printer" size={17} /><span>{C.print}</span></button>
        </div>
        <button type="button" className="btn-primary zrv-hr-btn" onClick={() => navigate(RECORD_CHANGE_BASE)} disabled={!canCreate}><OrvexaIcon name="plus" size={16} /> {L.newRequest}</button>
      </div>
      <ResourceState resource={requests} label={L.noun} empty={C.list.empty}>
        {(page) => (
          <RecordList heading={L.heading} searchLabel={L.search} searchPlaceholder={L.searchPlaceholder} statuses={LEGACY_RECORD_CHANGE_STATUSES} statusText={C.status}
            rows={page.items} columns={columns} defaultSort={{ key: 'requestId', dir: -1 }}
            searchText={(row) => `${row.requestNumber} ${row.employeeName} ${row.employeeNumber} ${row.position} ${row.section} ${row.department} ${row.requestor} ${row.pendingAt} ${row.remarks}`}
            valueFor={(row, key) => (key === 'requestId' ? row.requestId.padStart(19, '0') : row[key])}
            pathOf={(row) => `${RECORD_CHANGE_BASE}/${row.requestId}`} numberOf={(row) => row.requestNumber} />
        )}
      </ResourceState>
    </div>
  )
}
