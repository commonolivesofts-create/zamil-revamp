import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { APPRAISAL_TEXT as T, ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { RecordList } from '../shared/RecordList.jsx'
import { ReportPage } from '../shared/ReportPage.jsx'
import { useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import { APPRAISAL_STATUSES } from './appraisalModel.js'

const R = T.report
// The appraisal form is session-only (no RBAC resource), so anyone signed in may start one.
const CREATE = Object.freeze({ permission: null, path: ES_PATHS.appraisal, tool: R.tool, label: R.newAppraisal })
const columns = [
  { key: 'appraisalNumber', label: R.columns.number, render: (row) => row.appraisalNumber },
  { key: 'employeeName', label: R.columns.employee, render: (row) => row.employeeName },
  { key: 'periodCode', label: R.columns.period, render: (row) => row.periodCode },
  { key: 'rating', label: R.columns.rating, num: true, render: (row) => (row.rating === null ? '—' : row.rating.toFixed(2)) },
  { key: 'grade', label: R.columns.grade, render: (row) => row.grade ?? '—' },
  { key: 'status', label: R.columns.status, render: (row) => <Pill tone={row.status === 'DRAFT' ? 'warn' : 'ok'}>{C.status[row.status]}</Pill> },
]

// Appraisal report: this year's appraisals the user may see; search, status
// tabs and sortable columns, as the transfer report; one opens by its number.
export default function AppraisalReportPage() {
  useEmployeeServicesUser()
  const appraisals = useResource('hr-appraisal-report', (signal) => hrEmployeeServices.appraisals.list({ signal }))
  return (
    <ReportPage variant="appraisal-report" title={R.title} subtitle={R.subtitle} breadcrumb={C.performanceBreadcrumb} create={CREATE}>
      <ResourceState resource={appraisals} label={R.noun} empty={C.list.empty}>
        {(page) => (
          <RecordList heading={R.heading} searchLabel={R.search} searchPlaceholder={R.searchPlaceholder} statuses={APPRAISAL_STATUSES} statusText={C.status}
            rows={page.items} columns={columns} defaultSort={{ key: 'appraisalNumber', dir: -1 }}
            valueFor={(row, key) => (key === 'appraisalNumber' && /^\d+$/.test(row.appraisalNumber) ? Number(row.appraisalNumber) : row[key])}
            searchText={(row) => `${row.appraisalNumber} ${row.employeeName}`}
            pathOf={(row) => `${ES_PATHS.appraisal}/${row.appraisalId}`} numberOf={(row) => row.appraisalNumber} />
        )}
      </ResourceState>
    </ReportPage>
  )
}
