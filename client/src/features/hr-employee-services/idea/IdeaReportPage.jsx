import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { addDays, dayWindows } from '@/features/hr-recruitment/shared/insightDates.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Delta, Hero, Hint, Rank, Sparkline, Steps } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { EMPLOYEE_SERVICES_BREADCRUMB } from '../hrEmployeeServicesText.js'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { STATUS_TEXT, STATUS_TONE } from '../shared/formRecords.js'
import { formatSar } from './ideaModel.js'
import { ideaDemo, ideaService } from './ideaService.js'

const WEEKS = 8
const CREATE = Object.freeze({ permission: 'HR.IDEAS:CREATE', path: FORM_PATHS.idea, label: 'New idea' })
const STEP = Object.freeze({ DRAFT: ['file-pen-line', 'draft'], INPROCESS: ['hourglass', 'progress'], APPROVED: ['circle-check', 'ok'], REJECTED: ['circle-x', 'bad'] })
const INITIAL = Object.freeze({ status: '', q: '', division: '', category: '', invCategory: '', dateFrom: '', dateTo: '' })
const toOptions = (list) => list.map((item) => ({ value: item.value, label: item.label }))
const nameOf = (list, value) => list.find((item) => item.value === value)?.label ?? value ?? '—'
const statusPill = (row) => <Pill tone={STATUS_TONE[row.status]}>{STATUS_TEXT[row.status]}</Pill>
const investment = (row) => (row.hasInvestment === 'yes' ? formatSar(row.investmentValue) : 'None')

// The API filters by creation date (from / to) and has no sort parameter:
// newest first.
const list = ({ page, limit, status, q, division, category, invCategory, dateFrom, dateTo }, options) =>
  ideaService.list({ page, pageSize: limit, status, q, division, category, invCategory, from: dateFrom, to: dateTo }, options)

const step = (status, count, pick) => ({ key: status, label: STATUS_TEXT[status], icon: STEP[status][0], tone: STEP[status][1], count, ...pick({ status }) })

// Overview: where ideas are in evaluation, the project types proposed most,
// and new ideas per week; the breakdown splits them by division and creation
// date. Built from the report lookups.
function insight(options) {
  const types = options.projectTypes
  const cards = [
    {
      key: 'workflow',
      load: async ({ omit, count }) => {
        const base = omit(['status'])
        const statuses = Object.keys(STEP)
        const [all, ...parts] = await Promise.all([count(base), ...statuses.map((status) => count({ ...base, status }))])
        return { all, ...Object.fromEntries(statuses.map((status, index) => [status, parts[index]])) }
      },
      render: (data, { pick }) => (
        <Card index={0} icon="lightbulb" label="Evaluation" theme="mint" aside={<Hint>{data && `${data.all} ideas`}</Hint>}>
          <Steps items={['DRAFT', 'INPROCESS', 'APPROVED'].map((status) => step(status, data?.[status], pick))} branch={step('REJECTED', data?.REJECTED, pick)} />
        </Card>
      ),
    },
    {
      key: 'types',
      load: async ({ omit, count }) => {
        const base = omit(['category'])
        return Promise.all(types.map((type) => count({ ...base, category: type.value })))
      },
      render: (data, { pick }) => (
        <Card index={1} icon="layers" label="Project types" theme="primary">
          <Rank items={types.map((type, index) => ({ key: type.value, label: type.label, count: data?.[index], ...pick({ category: type.value }) }))} />
        </Card>
      ),
    },
    {
      key: 'momentum',
      load: async ({ query, today, countIn }) => {
        const weeks = dayWindows(today, 7, WEEKS)
        const counts = await Promise.all(weeks.map((week) => countIn(query, week)))
        return weeks.map((week, index) => ({ ...week, count: counts[index] }))
      },
      render: (data) => (
        <Card index={2} icon="sparkles" label="New ideas" theme="amber"
          aside={data && <Delta value={data.at(-1).count - data.at(-2).count} label="previous week" />}>
          <Hero value={data?.at(-1).count} unit="in the last 7 days" />
          <Sparkline points={data} />
        </Card>
      ),
    },
  ]
  const groups = (today) => [
    { key: 'division', title: 'Division', tone: 'mint', items: options.divisions.map((item) => ({ key: item.value, label: item.label, patch: { division: item.value } })) },
    {
      key: 'created', title: 'Created', tone: 'amber', items: [
        { key: 'month', label: 'Last 30 days', patch: { dateFrom: addDays(today, -29), dateTo: today } },
        { key: 'year', label: 'This year', patch: { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today } },
      ],
    },
  ]
  const fields = [
    { key: 'q', label: 'Search', type: 'search', placeholder: 'Title, idea or employee' },
    { key: 'division', label: 'Division', type: 'select', options: toOptions(options.divisions) },
    { key: 'category', label: 'Project type', type: 'select', options: toOptions(types) },
    { key: 'invCategory', label: 'Investment category', type: 'select', options: toOptions(options.investmentCategories) },
    { key: 'dateFrom', label: 'Created from', type: 'date' },
    { key: 'dateTo', label: 'Created to', type: 'date' },
  ]
  const columns = [
    { key: 'idNo', label: 'Idea no.', render: (row) => row.idNo },
    { key: 'title', label: 'Idea', render: (row) => <b>{row.title}</b> },
    { key: 'employee', label: 'Employee', render: (row) => <><b>{row.employeeName}</b><small>#{row.employeeNumber} · {row.divisionName || '—'}</small></> },
    { key: 'projectType', label: 'Project type', render: (row) => nameOf(types, row.projectType) },
    { key: 'saving', label: 'Saving / year', render: (row) => formatSar(row.saving) },
    { key: 'investment', label: 'Investment', render: investment },
    { key: 'created', label: 'Created', render: (row) => (row.creationDate ? enDate(row.creationDate) : '—') },
    { key: 'pendingAt', label: 'Pending at', render: (row) => row.pendingAt || '—' },
    { key: 'status', label: 'Status', render: statusPill },
  ]
  const summary = (row) => ({
    heading: row.title,
    pill: statusPill(row),
    facts: [
      ['Employee', `${row.employeeName} · #${row.employeeNumber}`], ['Division', row.divisionName], ['Project type', nameOf(types, row.projectType)],
      ['Saving / year', formatSar(row.saving)], ['Investment', investment(row)], ['Created', row.creationDate ? enDate(row.creationDate) : ''], ['Pending at', row.pendingAt],
    ],
  })
  return { cards, groups, fields, columns, summary }
}

// Idea report: filtered and paged by the server (HR sees every idea, others the
// ones they created).
export default function IdeaReportPage() {
  const lookups = useResource('hr-idea-report-lookups', (signal) => ideaService.getLookups({ signal }))
  return (
    <ResourceState resource={lookups} label="report filters" empty="The report filters could not be loaded." isEmpty={() => false}>
      {(options) => {
        const report = insight(options)
        return (
          <InsightReport variant="idea-report" title="Idea report" heading="Ideas" breadcrumb={EMPLOYEE_SERVICES_BREADCRUMB} demo={ideaDemo}
            resourceKey="hr-idea-report" list={list} create={CREATE} openLabel="Open idea" empty="No ideas match these filters."
            initial={INITIAL} fields={report.fields} columns={report.columns} cards={report.cards} groups={report.groups} summary={report.summary}
            defaultSort={{ key: '', order: '' }} numberOf={(row) => row.idNo} rowKey={(row) => row.ideaId} pathOf={(row) => `${FORM_PATHS.idea}/${row.ideaId}`} />
        )
      }}
    </ResourceState>
  )
}
