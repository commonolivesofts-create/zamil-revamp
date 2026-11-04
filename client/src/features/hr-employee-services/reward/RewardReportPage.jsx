import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Donut, HeatStrip, Hero, Hint, Twin } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { RECORD_STATUSES, STATUS_TEXT, STATUS_TONE } from '../shared/formRecords.js'
import { DEPARTMENT_TEXT } from './rewardModel.js'
import { rewardDemo, rewardService } from './rewardService.js'

const RATING_TEXT = Object.freeze({ A: 'At Standard', AS: 'Above Standard', BS: 'Below Standard', CS: 'Close to Standard' })
const DONUT_TONE = Object.freeze({ DRAFT: 'draft', INPROCESS: 'progress', APPROVED: 'ok', REJECTED: 'bad' })
const SECTIONS = Object.keys(DEPARTMENT_TEXT)
const SECTION_TONE = Object.freeze({ production: 'amber', 'shared-services': 'mint' })
const CREATE = Object.freeze({ permission: 'HR.EMPLOYEE_OF_THE_MONTH:CREATE', path: FORM_PATHS.reward, label: 'New nomination' })
const INITIAL = Object.freeze({ status: '', search: '', department: '', dateFrom: '', dateTo: '' })
const FIELDS = [
  { key: 'search', label: 'Search', type: 'search', placeholder: 'Request, employee or requester' },
  { key: 'department', label: 'Section', type: 'select', options: SECTIONS.map((value) => ({ value, label: DEPARTMENT_TEXT[value].name })) },
  { key: 'dateFrom', label: 'Effective from', type: 'date' },
  { key: 'dateTo', label: 'Effective to', type: 'date' },
]
const date = (value) => (value ? enDate(value) : '—')
const statusPill = (row) => <Pill tone={STATUS_TONE[row.status]}>{STATUS_TEXT[row.status]}</Pill>
const COLUMNS = [
  { key: 'requestNo', label: 'Request no.', sort: 'requestNo', render: (row) => row.requestNo },
  { key: 'employee', label: 'Employee', sort: 'employeeName', render: (row) => <><b>{row.employeeName}</b><small>#{row.employeeNumber} · {row.employeePosition || '—'}</small></> },
  { key: 'department', label: 'Section', render: (row) => DEPARTMENT_TEXT[row.department]?.name ?? '—' },
  { key: 'activityDate', label: 'Effective date', sort: 'activityDate', render: (row) => date(row.activityDate) },
  { key: 'ratings', label: 'Ratings (AS · A · CS · BS)', render: (row) => ['AS', 'A', 'CS', 'BS'].map((code) => row.ratings[code]).join(' · ') },
  { key: 'overall', label: 'Overall feedback', render: (row) => RATING_TEXT[row.overallRating] ?? '—' },
  { key: 'requestor', label: 'Requested by', render: (row) => row.requestor || '—' },
  { key: 'status', label: 'Status', sort: 'status', render: statusPill },
]

// The API names its effective-date filter date_from / date_to.
const list = ({ page, limit, status, search, department, dateFrom, dateTo, sortBy, sortDir }, options) =>
  rewardService.list({ page, pageSize: limit, status, search, department, date_from: dateFrom, date_to: dateTo, sort: sortBy, order: sortDir }, options)

// Overview: nominations per section, where they are in approval, and each of
// the last twelve months by effective date.
const CARDS = [
  {
    key: 'sections',
    load: async ({ omit, count }) => {
      const base = omit(['department'])
      return Promise.all(SECTIONS.map((department) => count({ ...base, department })))
    },
    render: (data, { pick }) => (
      <Card index={0} icon="award" label="Nominations by section" theme="mint">
        <Twin items={SECTIONS.map((department, index) => ({
          key: department, label: DEPARTMENT_TEXT[department].name, icon: DEPARTMENT_TEXT[department].icon, tone: SECTION_TONE[department], count: data?.[index], ...pick({ department }),
        }))} />
      </Card>
    ),
  },
  {
    key: 'status',
    load: async ({ omit, count }) => {
      const base = omit(['status'])
      const [all, ...parts] = await Promise.all([count(base), ...RECORD_STATUSES.map((status) => count({ ...base, status }))])
      return { all, parts }
    },
    render: (data, { pick }) => (
      <Card index={1} icon="chart-pie" label="Approval status" theme="primary">
        <Donut total={data?.all} unit="nominations"
          items={RECORD_STATUSES.map((status, index) => ({ key: status, label: STATUS_TEXT[status], tone: DONUT_TONE[status], count: data?.parts[index], ...pick({ status }) }))} />
      </Card>
    ),
  },
  {
    key: 'months',
    load: async ({ query, today, countIn }) => {
      const months = monthRanges(today, 12)
      const counts = await Promise.all(months.map((month) => countIn(query, month)))
      return months.map((month, index) => ({ ...month, count: counts[index] }))
    },
    render: (data) => {
      const busiest = data?.reduce((best, month) => (month.count > best.count ? month : best), data[0])
      return (
        <Card index={2} icon="trophy" label="Nominations by month" theme="amber" aside={<Hint>{busiest?.count ? `Busiest: ${busiest.label} (${busiest.count})` : null}</Hint>}>
          <Hero value={data?.at(-1).count} unit="this month" />
          <HeatStrip items={data} slots={12} />
        </Card>
      )
    },
  },
]

// Quick effective-month windows.
function dateGroups(today) {
  const [last, current] = monthRanges(today, 2)
  return [{
    key: 'effective', title: 'Effective', tone: 'amber', items: [
      { key: 'month', label: 'This month', patch: { dateFrom: current.from, dateTo: current.to } },
      { key: 'last', label: 'Last month', patch: { dateFrom: last.from, dateTo: last.to } },
      { key: 'year', label: 'This year', patch: { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today } },
    ],
  }]
}

// Reward nominations report: filtered, sorted and paged by the server (HR sees
// every nomination, others the ones they created).
export default function RewardReportPage() {
  return (
    <InsightReport variant="reward-report" title="Reward nominations" heading="Nominations" breadcrumb={C.breadcrumb} demo={rewardDemo}
      resourceKey="hr-reward-report" list={list} create={CREATE} openLabel="Open nomination" empty="No nominations match these filters."
      initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={CARDS} groups={dateGroups} defaultSort={{ key: 'createdAt', order: 'desc' }}
      numberOf={(row) => row.requestNo} rowKey={(row) => row.nominationId} pathOf={(row) => `${FORM_PATHS.reward}/${row.nominationId}`}
      summary={(row) => ({
        heading: row.employeeName,
        pill: statusPill(row),
        facts: [
          ['Employee number', row.employeeNumber], ['Position', row.employeePosition], ['Section', DEPARTMENT_TEXT[row.department]?.name],
          ['Effective date', date(row.activityDate)], ['Overall feedback', RATING_TEXT[row.overallRating]], ['Requested by', row.requestor],
        ],
      })} />
  )
}
