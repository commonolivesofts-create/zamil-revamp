import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { STATUS_FILTER, STATUS_TEXT, STATUS_TONE } from '../shared/formRecords.js'
import { ReportPage } from '../shared/ReportPage.jsx'
import { ServerRecordList } from '../shared/ServerRecordList.jsx'
import { formatSar } from './ideaModel.js'
import { ideaDemo, ideaService } from './ideaService.js'

const CREATE = Object.freeze({ permission: 'HR.IDEAS:CREATE', path: FORM_PATHS.idea, tool: 'Form', label: 'New idea' })
const toOptions = (list) => list.map((item) => ({ value: item.value, label: item.label }))

// Idea report: filtered and paged by the server (HR sees every idea, others the
// ones they created). The API has no sort parameter: newest first.
export default function IdeaReportPage() {
  const lookups = useResource('hr-idea-report-lookups', (signal) => ideaService.getLookups({ signal }))
  return (
    <ReportPage variant="idea-report" title="Idea report" subtitle="Every idea, its expected saving and where it is in evaluation." demo={ideaDemo} create={CREATE}>
      <ResourceState resource={lookups} label="report filters" empty="The report filters could not be loaded." isEmpty={() => false}>
        {(options) => {
          const nameOf = (list, value) => list.find((item) => item.value === value)?.label ?? value ?? '—'
          return (
            <ServerRecordList heading="Ideas" resourceKey="hr-idea-report" load={ideaService.list} numberOf={(row) => row.idNo}
              pathOf={(row) => `${FORM_PATHS.idea}/${row.ideaId}`}
              filters={[
                STATUS_FILTER,
                { key: 'q', label: 'Search title, idea or employee', type: 'search' },
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
    </ReportPage>
  )
}
