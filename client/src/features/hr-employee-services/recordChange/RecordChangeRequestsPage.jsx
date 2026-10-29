import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { Pill, RecruitmentHeader } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C, RECORD_CHANGE_TEXT as T } from '../hrEmployeeServicesText.js'
import { employeeServicesDemo, hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { RecordList } from '../shared/RecordList.jsx'
import { useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import { RECORD_CHANGE_STATUSES } from './recordChangeModel.js'
import { ES_PATHS } from '../employeeServicesPaths.js'

const L = T.list
const RECORD_CHANGE_BASE = ES_PATHS.recordChange
const columns = [
  { key: 'requestNumber', label: L.columns.number, render: (row) => row.requestNumber },
  { key: 'employeeName', label: L.columns.employee, render: (row) => <>{row.employeeName}<small className="zrv-hr-es-subline">#{row.employeeNumber}</small></> },
  { key: 'effectiveDate', label: L.columns.effective, render: (row) => (row.effectiveDate ? enDate(row.effectiveDate) : '—') },
  { key: 'changeTypes', label: L.columns.changes, sortable: false, render: (row) => <span className="zrv-hr-es-kinds">{row.changeTypes.map((type) => T.changeTypes[type]).join(', ') || '—'}</span> },
  {
    key: 'totalChange', label: L.columns.delta, num: true,
    render: (row) => <span className={row.totalChange > 0 ? 'zrv-hr-es-up' : row.totalChange < 0 ? 'zrv-hr-es-down' : undefined}>{C.signed(row.totalChange)}</span>,
  },
  { key: 'status', label: L.columns.status, render: (row) => <Pill tone={row.status === 'DRAFT' ? 'warn' : 'ok'}>{C.status[row.status]}</Pill> },
  { key: 'requestDate', label: L.columns.created, render: (row) => enDate(row.requestDate) },
]

// Change requests: every personnel record change request with its status;
// search, status tabs and sortable columns; a request opens by its Ref #.
export default function RecordChangeRequestsPage() {
  useEmployeeServicesUser()
  const navigate = useNavigate()
  const requests = useResource('hr-record-change-requests', (signal) => hrEmployeeServices.recordChanges.list({ signal }))
  return (
    <div className="zrv-hr zrv-hr--record-change-list zrv-hr--compact">
      <RecruitmentHeader title={L.title} subtitle={L.subtitle} breadcrumb={C.breadcrumb} demo={employeeServicesDemo} />
      <div className="zrv-hr-toolbar" role="toolbar" aria-label={L.title}>
        <div className="zrv-hr-tools">
          <button type="button" onClick={() => navigate('/dashboard')}><OrvexaIcon name="house" size={17} /><span>{C.home}</span></button>
          <button type="button" onClick={() => navigate(RECORD_CHANGE_BASE)}><OrvexaIcon name="file-plus" size={17} /><span>{T.tools.newRequest}</span></button>
          <button type="button" onClick={() => window.print()}><OrvexaIcon name="printer" size={17} /><span>{C.print}</span></button>
        </div>
        <button type="button" className="btn-primary zrv-hr-btn" onClick={() => navigate(RECORD_CHANGE_BASE)}><OrvexaIcon name="plus" size={16} /> {L.newRequest}</button>
      </div>
      <ResourceState resource={requests} label={L.noun} empty={C.list.empty}>
        {(page) => (
          <RecordList heading={L.heading} searchLabel={L.search} searchPlaceholder={L.searchPlaceholder} statuses={RECORD_CHANGE_STATUSES} statusText={C.status}
            rows={page.items} columns={columns} defaultSort={{ key: 'requestDate', dir: -1 }}
            searchText={(row) => `${row.requestNumber} ${row.employeeName} ${row.employeeNumber} ${row.changeTypes.map((type) => T.changeTypes[type]).join(' ')}`}
            pathOf={(row) => `${RECORD_CHANGE_BASE}/${row.requestId}`} numberOf={(row) => row.requestNumber} />
        )}
      </ResourceState>
    </div>
  )
}
