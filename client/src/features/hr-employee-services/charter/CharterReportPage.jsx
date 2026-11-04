import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Delta, Foot, Hero } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { CHARTER_PATHS } from '../employeeServicesPaths.js'
import { charterService } from './charterService.js'

const MONTHS = 6
const CREATE = Object.freeze({ permission: 'HR.PROJECT_CHARTERS:CREATE', path: CHARTER_PATHS.form, label: 'New charter' })
const INITIAL = Object.freeze({ q: '', ideaNo: '', projectManager: '', processOwner: '', dateFrom: '', dateTo: '' })
const FIELDS = [
  { key: 'q', label: 'Search', type: 'search', placeholder: 'Project, manager or idea no.' },
  { key: 'ideaNo', label: 'Idea no.', type: 'search', placeholder: 'Exact idea no.' },
  { key: 'projectManager', label: 'Project manager', type: 'search', placeholder: 'Name' },
  { key: 'processOwner', label: 'Process owner', type: 'search', placeholder: 'Name' },
  { key: 'dateFrom', label: 'Created from', type: 'date' },
  { key: 'dateTo', label: 'Created to', type: 'date' },
]
const date = (value) => (value ? enDate(value) : '—')
const statusPill = (row) => <Pill tone="warn">{row.status || '—'}</Pill>
// The legacy report_charter.php columns (the reward form is not available yet).
const COLUMNS = [
  { key: 'ideaNum', label: 'Idea #', render: (row) => row.ideaNum || '—' },
  { key: 'project', label: 'Project details', render: (row) => <><b>{row.projectName || '—'}</b><small>{row.projectManager}</small></> },
  { key: 'expected', label: 'Expected', render: (row) => <><b>{date(row.expectedStartDate)}</b><small>to {date(row.expectedEndDate)}</small></> },
  { key: 'processOwner', label: 'Process owner', render: (row) => row.processOwner || '—' },
  { key: 'keyStakeholders', label: 'Key stakeholders', render: (row) => row.keyStakeholders || '—' },
  { key: 'finalCustomer', label: 'Final customer', render: (row) => row.finalCustomer || '—' },
  { key: 'preparedBy', label: 'Prepared by', render: (row) => <><b>{row.preparedBy || '—'}</b><small>{date(row.creationDate)}</small></> },
  { key: 'status', label: 'Status', render: statusPill },
]

// Server-filtered, newest first; the date filter is the creation date.
const list = ({ page, limit, q, ideaNo, projectManager, processOwner, dateFrom, dateTo }, options) =>
  charterService.list({ page, pageSize: limit, q, ideaNo, projectManager, processOwner, createdFrom: dateFrom, createdTo: dateTo }, options)

const CARDS = [
  {
    key: 'total',
    load: async ({ query, today, count, countIn }) => {
      const [all, month] = await Promise.all([count(query), countIn(query, monthRanges(today, 1)[0])])
      return { all, month }
    },
    render: (data) => (
      <Card index={0} icon="file-text" label="Charters" theme="mint">
        <Hero value={data?.all} unit="project charters" />
        <Foot>{data ? `${data.month} created this month` : ''}</Foot>
      </Card>
    ),
  },
  {
    key: 'months',
    load: async ({ query, today, countIn }) => {
      const months = monthRanges(today, MONTHS)
      const counts = await Promise.all(months.map((month) => countIn(query, month)))
      return months.map((month, index) => ({ key: month.key, label: month.label, count: counts[index] }))
    },
    render: (data) => (
      <Card index={1} icon="calendar-range" label="Charters by month" theme="amber"
        aside={data && <Delta value={data.at(-1).count - data.at(-2).count} label="last month" />}>
        <Columns items={data} count={MONTHS} />
        <Foot>Charters created each month</Foot>
      </Card>
    ),
  },
]

export default function CharterReportPage() {
  return (
    <InsightReport variant="charter-report" title="Project charter report" heading="Charters" breadcrumb={C.breadcrumb}
      resourceKey="hr-charter-report" list={list} create={CREATE} openLabel="Open charter" empty="No project charters match these filters."
      initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={CARDS} defaultSort={{ key: '', order: '' }}
      numberOf={(row) => row.ideaNum || row.charterId} rowKey={(row) => row.charterId} pathOf={(row) => `${CHARTER_PATHS.form}/${row.charterId}`}
      summary={(row) => ({
        heading: row.projectName || row.ideaNum,
        pill: statusPill(row),
        facts: [
          ['Idea #', row.ideaNum], ['Project manager', row.projectManager], ['Business unit', row.businessUnit],
          ['Expected', row.expectedStartDate ? `${date(row.expectedStartDate)} – ${date(row.expectedEndDate)}` : ''],
          ['Process owner', row.processOwner], ['Key stakeholders', row.keyStakeholders], ['Final customer', row.finalCustomer],
          ['Prepared by', row.preparedBy], ['Created', row.creationDate ? date(row.creationDate) : ''],
        ],
      })} />
  )
}
