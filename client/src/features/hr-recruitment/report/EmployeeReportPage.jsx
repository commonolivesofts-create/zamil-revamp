import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT, REPORT_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, enDate } from '../shared/hrFormat.js'
import { addDays } from '../shared/insightDates.js'
import { percent } from '../shared/insightFormat.js'
import { Pill } from '../shared/components/RecruitmentShell.jsx'
import { InsightReport } from '../shared/components/InsightReport.jsx'
import { Card, Hero, Hint, Rank, Twin } from '../shared/components/InsightCards.jsx'

const service = hrRecruitmentServices.employeeReport
const I = T.insight
const O = I.overview
const C = I.columns
const F = I.facts
// The API needs both dates; blank ones mean the legacy "Since 2000" period up to today.
const SINCE = '2000-01-01'
const STATUSES = Object.freeze([['Active', 'mint', 'user-check'], ['Inactive', 'amber', 'user-x']])
const INITIAL = Object.freeze({ status: '', department: '', contractorNumber: '', dateFrom: '', dateTo: '' })
const TOP = 5
const realOptions = (list) => list.filter((item) => item.value !== 'ALL')
const date = (value) => (value ? enDate(value) : COMMON_TEXT.dash)
const yesNo = (value) => (value ? F.yes : F.no)
const rate = (value) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value)
const statusPill = (row) => (row.status ? <Pill tone={row.status === 'Active' ? 'ok' : 'warn'}>{row.status}</Pill> : COMMON_TEXT.dash)

const list = ({ page, limit, sortBy, sortDir, dateFrom, dateTo, ...filters }, options) =>
  service.list({ ...filters, dateFrom: dateFrom || SINCE, dateTo: dateTo || businessToday(), page, limit, sort: sortBy, order: sortDir }, options)
// Both dates are optional here, but in order when both are set (the API rejects the reverse).
const validate = ({ dateFrom, dateTo }) => ({ dateTo: dateFrom && dateTo && dateTo < dateFrom ? I.dateOrder : '' })

const COLUMNS = [
  { key: 'number', label: C.number, sort: 'employee_number', render: (row) => row.employeeNumber || COMMON_TEXT.dash },
  { key: 'name', label: C.name, sort: 'employee_name', render: (row) => <b>{row.name || COMMON_TEXT.dash}</b> },
  { key: 'division', label: C.division, render: (row) => row.division || COMMON_TEXT.dash },
  { key: 'department', label: C.department, render: (row) => <>{row.department || COMMON_TEXT.dash}{row.productionSection && <small>{row.productionSection}</small>}</> },
  { key: 'contractor', label: C.contractor, sort: 'con_number', render: (row) => <>{row.contractorName || COMMON_TEXT.dash}{row.contractorNumber && <small>#{row.contractorNumber}</small>}</> },
  { key: 'start', label: C.start, sort: 'start_date', render: (row) => date(row.startDate) },
  { key: 'end', label: C.end, sort: 'end_date', render: (row) => date(row.endDate) },
  { key: 'status', label: C.status, sort: 'status', render: statusPill },
]

// The largest `TOP` options by count under the other filters; the picked one
// stays listed even when it is not among them. `more`: options with employees left out.
async function topOf(options, key, { query, omit, count }) {
  const base = omit([key])
  const counts = await Promise.all(options.map((item) => count({ ...base, [key]: item.value })))
  const ranked = options.map((item, index) => ({ ...item, count: counts[index] })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count)
  const top = ranked.slice(0, TOP)
  const picked = ranked.find((item) => item.value === query[key])
  const items = picked && !top.includes(picked) ? [...top.slice(0, TOP - 1), picked] : top
  return { items, more: ranked.length - items.length }
}

function TopRank({ data, filter, pick }) {
  const items = data ? data.items : Array.from({ length: TOP }, (_, index) => ({ value: String(index), label: '' }))
  return <Rank items={items.map((item) => ({ key: item.value, label: item.label, count: item.count, ...(data && pick({ [filter]: item.value })) }))} />
}

// Overview: active against inactive employees, and how they spread over the
// departments and contractors (the largest ones); the breakdown picks a start period.
function insight({ departments, contractors }) {
  const departmentList = realOptions(departments)
  const contractorList = realOptions(contractors)
  const cards = [
    {
      key: 'workforce',
      load: async ({ omit, count }) => {
        const base = omit(['status'])
        const [all, ...parts] = await Promise.all([count(base), ...STATUSES.map(([status]) => count({ ...base, status }))])
        return { all, parts }
      },
      render: (data, { pick }) => (
        <Card index={0} icon="hard-hat" label={O.workforce} theme="mint" aside={<Hint>{data && O.activeShare(percent(data.parts[0], data.all))}</Hint>}>
          <Hero value={data?.all} unit={O.employees} />
          <Twin items={STATUSES.map(([status, tone, icon], index) => ({ key: status, label: O[status.toLowerCase()], icon, tone, count: data?.parts[index], ...pick({ status }) }))} />
        </Card>
      ),
    },
    {
      key: 'departments',
      load: ({ query, omit, count }) => topOf(departmentList, 'department', { query, omit, count }),
      render: (data, { pick }) => (
        <Card index={1} icon="building-2" label={O.departments} theme="primary" aside={<Hint>{data?.more ? O.more(data.more) : null}</Hint>}>
          <TopRank data={data} filter="department" pick={pick} />
        </Card>
      ),
    },
    {
      key: 'contractors',
      load: ({ query, omit, count }) => topOf(contractorList, 'contractorNumber', { query, omit, count }),
      render: (data, { pick }) => (
        <Card index={2} icon="handshake" label={O.contractors} theme="amber" aside={<Hint>{data?.more ? O.more(data.more) : null}</Hint>}>
          <TopRank data={data} filter="contractorNumber" pick={pick} />
        </Card>
      ),
    },
  ]
  const fields = [
    { key: 'department', label: I.filters.department, type: 'select', options: departmentList },
    { key: 'contractorNumber', label: I.filters.contractor, type: 'select', options: contractorList },
    { key: 'dateFrom', label: I.filters.from, type: 'date' },
    { key: 'dateTo', label: I.filters.to, type: 'date' },
  ]
  return { cards, fields }
}

// Start periods; "Since 2000" is the default (both dates blank).
function startGroups(today) {
  return [{
    key: 'started', title: I.breakdown, tone: 'primary', items: [
      { key: 'year', label: T.ranges.THIS_YEAR, patch: { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: '' } },
      { key: 'twelve', label: T.ranges.LAST_12_MONTHS, patch: { dateFrom: addDays(today, -364), dateTo: '' } },
      { key: 'all', label: T.ranges.SINCE_2000, patch: { dateFrom: '', dateTo: '' } },
    ],
  }]
}

const summary = (row) => ({
  heading: row.name,
  pill: statusPill(row),
  facts: [
    [C.number, row.employeeNumber], [F.iqamah, Number.isFinite(row.iqamah) ? String(row.iqamah) : ''], [C.division, row.division], [C.department, row.department],
    [F.section, row.productionSection], [F.job, row.jobTitle], [F.boss, row.directBoss], [F.place, row.place], [F.replacement, row.replacement],
    [C.contractor, row.contractorName && `${row.contractorName} · ${row.contractorNumber}`], [F.rate, rate(row.rate)],
    [C.start, date(row.startDate)], [C.end, date(row.endDate)],
    [F.ajeer, yesNo(row.ajeer)], [F.sfda, yesNo(row.sfda)], [F.blacklist, yesNo(row.blacklist)], [F.remark, row.remark],
  ],
})

// Employee report (contractor employees): filtered, sorted and paged by the
// server; a row opens its details in the summary drawer.
export default function EmployeeReportPage() {
  const lookups = useResource('hr-contractor-employee-lookups', (signal) => service.getLookups({ signal }))
  return (
    <ResourceState resource={lookups} label={COMMON_TEXT.loadingLookups} empty="Employee report filters are unavailable." isEmpty={() => false}>
      {(options) => {
        const report = insight(options)
        return (
          <InsightReport variant="employee-report" title={T.title} heading={I.heading} breadcrumb={T.breadcrumb}
            resourceKey="hr-contractor-employees" list={list} validate={validate} empty={I.empty}
            initial={INITIAL} fields={report.fields} columns={COLUMNS} cards={report.cards} groups={startGroups} summary={summary}
            defaultSort={{ key: 'employee_number', order: 'asc' }} numberOf={(row) => row.employeeNumber || row.name || COMMON_TEXT.dash}
            rowKey={(row) => row.empId || `${row.employeeNumber}:${row.name}:${row.contractorNumber}:${row.startDate}`} />
        )
      }}
    </ResourceState>
  )
}
