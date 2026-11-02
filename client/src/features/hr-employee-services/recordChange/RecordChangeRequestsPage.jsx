import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C, RECORD_CHANGE_TEXT as T } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { RecordList } from '../shared/RecordList.jsx'
import { ReportPage } from '../shared/ReportPage.jsx'
import { useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import { RECORD_CHANGE_STATUSES } from './recordChangeModel.js'
import { ES_PATHS } from '../employeeServicesPaths.js'

const L = T.list
const RECORD_CHANGE_BASE = ES_PATHS.recordChange
const CREATE = Object.freeze({ permission: 'HR.PERSONNEL_RECORD_CHANGES:CREATE', path: RECORD_CHANGE_BASE, tool: T.tools.newRequest, label: L.newRequest })
const columns = [
  { key: 'requestNumber', label: L.columns.number, render: (row) => row.requestNumber },
  { key: 'employeeName', label: L.columns.employee, render: (row) => <>{row.employeeName}<small className="zrv-hr-es-subline">#{row.employeeNumber}</small></> },
  { key: 'effectiveDate', label: L.columns.effective, render: (row) => (row.effectiveDate ? enDate(row.effectiveDate) : '—') },
  { key: 'position', label: L.columns.changes, render: (row) => row.position || '—' },
  {
    key: 'totalChange', label: L.columns.delta, num: true,
    render: (row) => row.totalChange === null ? '—' : <span className={row.totalChange > 0 ? 'zrv-hr-es-up' : row.totalChange < 0 ? 'zrv-hr-es-down' : undefined}>{C.signed(row.totalChange)}</span>,
  },
  { key: 'status', label: L.columns.status, render: (row) => <Pill tone={row.status === 'DRAFT' ? 'warn' : 'ok'}>{C.status[row.status]}</Pill> },
  { key: 'requestDate', label: L.columns.created, render: (row) => enDate(row.requestDate) },
]

// Change requests: every personnel record change request with its status;
// search, status tabs and sortable columns; a request opens by its Ref #.
export default function RecordChangeRequestsPage() {
  useEmployeeServicesUser()
  const requests = useResource('hr-record-change-requests', (signal) => hrEmployeeServices.recordChanges.list({ signal }))
  return (
    <ReportPage variant="record-change-list" title={L.title} subtitle={L.subtitle} create={CREATE}>
      <ResourceState resource={requests} label={L.noun} empty={C.list.empty}>
        {(page) => (
          <RecordList heading={L.heading} searchLabel={L.search} searchPlaceholder={L.searchPlaceholder} statuses={RECORD_CHANGE_STATUSES} statusText={C.status}
            rows={page.items} columns={columns} defaultSort={{ key: 'requestDate', dir: -1 }}
            searchText={(row) => `${row.requestNumber} ${row.employeeName} ${row.employeeNumber} ${row.position}`}
            pathOf={(row) => `${RECORD_CHANGE_BASE}/${row.requestId}`} numberOf={(row) => row.requestNumber} />
        )}
      </ResourceState>
    </ReportPage>
  )
}
