import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { Pill, RecruitmentHeader } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { RECORD_STATUSES, STATUS_TEXT, STATUS_TONE } from '../shared/formRecords.js'
import { ServerRecordList } from '../shared/ServerRecordList.jsx'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import { formatSar } from './ideaModel.js'
import { ideaDemo, ideaService } from './ideaService.js'

const toOptions = (list) => list.map((item) => ({ value: item.value, label: item.label }))

// Idea report: filtered and paged by the server (HR sees every idea, others the
// ones they created). The API has no sort parameter: newest first.
export default function IdeaReportPage() {
  const navigate = useNavigate()
  const canCreate = usePermissions().can('HR.IDEAS:CREATE')
  const lookups = useResource('hr-idea-report-lookups', (signal) => ideaService.getLookups({ signal }))
  return (
    <div className="zrv-hr zrv-hr--idea-report zrv-hr--compact">
      <RecruitmentHeader title="Idea report" subtitle="Every idea, its expected saving and where it is in evaluation." breadcrumb={C.breadcrumb} demo={ideaDemo} />
      <div className="zrv-hr-toolbar" role="toolbar" aria-label="Idea report">
        <div className="zrv-hr-tools">
          {canCreate && <button type="button" onClick={() => navigate(FORM_PATHS.idea)}><OrvexaIcon name="file-plus" size={17} /><span>New idea</span></button>}
          <button type="button" onClick={() => window.print()}><OrvexaIcon name="printer" size={17} /><span>{C.print}</span></button>
        </div>
      </div>
      <ResourceState resource={lookups} label="report filters" empty="The report filters could not be loaded." isEmpty={() => false}>
        {(options) => {
          const nameOf = (list, value) => list.find((item) => item.value === value)?.label ?? value ?? '—'
          return (
            <ServerRecordList heading="Ideas" resourceKey="hr-idea-report" load={ideaService.list} numberOf={(row) => row.idNo}
              pathOf={(row) => `${FORM_PATHS.idea}/${row.ideaId}`}
              filters={[
                { key: 'q', label: 'Search title, idea or employee', type: 'search' },
                { key: 'status', label: 'Status', type: 'select', options: RECORD_STATUSES.map((value) => ({ value, label: STATUS_TEXT[value] })) },
                { key: 'division', label: 'Division', type: 'select', options: toOptions(options.divisions) },
                { key: 'category', label: 'Project type', type: 'select', options: toOptions(options.projectTypes) },
                { key: 'invCategory', label: 'Investment category', type: 'select', options: toOptions(options.investmentCategories) },
                { key: 'from', label: 'Created from', type: 'date' },
                { key: 'to', label: 'Created to', type: 'date' },
              ]}
              columns={[
                { key: 'idNo', label: 'Idea no.', render: (row) => row.idNo },
                { key: 'title', label: 'Idea', render: (row) => <b>{row.title}</b> },
                { key: 'employee', label: 'Employee', render: (row) => <>{row.employeeName}<small className="zrv-hr-es-subline">#{row.employeeNumber} · {row.divisionName || '—'}</small></> },
                { key: 'projectType', label: 'Project type', render: (row) => nameOf(options.projectTypes, row.projectType) },
                { key: 'saving', label: 'Saving / year', num: true, render: (row) => formatSar(row.saving) },
                { key: 'investment', label: 'Investment', num: true, render: (row) => (row.hasInvestment === 'yes' ? formatSar(row.investmentValue) : 'None') },
                { key: 'created', label: 'Created', render: (row) => (row.creationDate ? enDate(row.creationDate) : '—') },
                { key: 'pendingAt', label: 'Pending at', render: (row) => row.pendingAt || '—' },
                { key: 'status', label: 'Status', render: (row) => <Pill tone={STATUS_TONE[row.status]}>{STATUS_TEXT[row.status]}</Pill> },
              ]} />
          )
        }}
      </ResourceState>
    </div>
  )
}
