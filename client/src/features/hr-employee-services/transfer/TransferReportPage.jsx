import { useState } from 'react'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { addDays, monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Foot, Funnel, Hint, Rank, Ring } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { ES_COMMON_TEXT as C, TRANSFER_TEXT as T } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { inRange, localList } from '../shared/localList.js'
import { useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'

const R = T.report
const O = R.overview
const B = R.breakdown
const TOP = 4
const CREATE = Object.freeze({ permission: 'HR.TRANSFER_REQUESTS:CREATE', path: ES_PATHS.transfer, label: R.newTransfer })
const PIPELINE = Object.freeze([['DRAFT', 'draft'], ['INPROCESS', 'progress'], ['APPROVED', 'ok']])
const INITIAL = Object.freeze({ status: '', toDepartment: '', search: '', dateFrom: '', dateTo: '' })
const FIELDS = [
  { key: 'search', label: R.search, type: 'search', placeholder: R.filters.search },
  { key: 'dateFrom', label: R.filters.from, type: 'date' },
  { key: 'dateTo', label: R.filters.to, type: 'date' },
]
const date = (value) => (value ? enDate(value) : '—')
const statusPill = (row) => <Pill tone={row.status === 'DRAFT' ? 'warn' : row.status === 'REJECTED' ? 'bad' : 'ok'}>{C.status[row.status]}</Pill>
const movesDepartment = (row) => Boolean(row.toDepartmentName) && row.toDepartmentName !== row.fromDepartmentName
const COLUMNS = [
  { key: 'transferNumber', label: R.columns.number, sort: 'transferNumber', render: (row) => row.transferNumber },
  { key: 'employeeName', label: R.columns.employee, sort: 'employeeName', render: (row) => <><b>{row.employeeName}</b><small>#{row.employeeNumber}</small></> },
  { key: 'fromDepartmentName', label: R.columns.from, sort: 'fromDepartmentName', render: (row) => row.fromDepartmentName || '—' },
  { key: 'toDepartmentName', label: R.columns.to, sort: 'toDepartmentName', render: (row) => <><b>{row.toDepartmentName ?? '—'}</b>{row.toSectionName && <small>{row.toSectionName}</small>}</> },
  { key: 'effectiveDate', label: R.columns.effective, sort: 'effectiveDate', render: (row) => date(row.effectiveDate) },
  { key: 'salaryChange', label: R.columns.salary, render: (row) => R.salary(row.salaryChange, row.budgetedSalary) },
  { key: 'status', label: R.columns.status, render: statusPill },
]

// The transfer API returns every request at once; the report filters, sorts
// and counts them here. Dates filter the effective date.
const source = () => localList(hrEmployeeServices.transfers.list, {
  match: (row, query) => (!query.status || row.status === query.status) && (!query.toDepartment || row.toDepartmentName === query.toDepartment)
    && inRange(row.effectiveDate, query.dateFrom, query.dateTo),
  searchText: (row) => `${row.transferNumber} ${row.employeeName} ${row.employeeNumber} ${row.fromDepartmentName} ${row.toDepartmentName ?? ''} ${row.toSectionName ?? ''}`,
  valueFor: (row, key) => (key === 'transferNumber' && /^\d+$/.test(row.transferNumber) ? Number(row.transferNumber) : row[key]),
})

// Overview: where requests are in approval, the share that changes department
// and the departments employees move to most.
function insight(transfers) {
  const matching = async (query) => (await transfers.list({ ...query, limit: Number.MAX_SAFE_INTEGER })).items
  return [
    {
      key: 'pipeline',
      load: async ({ omit, count }) => {
        const base = omit(['status'])
        const [rejected, ...parts] = await Promise.all([count({ ...base, status: 'REJECTED' }), ...PIPELINE.map(([status]) => count({ ...base, status }))])
        return { rejected, parts }
      },
      render: (data, { pick }) => (
        <Card index={0} icon="arrow-right-left" label={O.pipeline} theme="mint" aside={<Hint>{data && O.rejected(data.rejected)}</Hint>}>
          <Funnel items={PIPELINE.map(([status, tone], index) => ({ key: status, label: C.status[status], tone, count: data?.parts[index], ...pick({ status }) }))} />
        </Card>
      ),
    },
    {
      key: 'moves',
      load: async ({ query }) => {
        const rows = await matching(query)
        return { moving: rows.filter(movesDepartment).length, all: rows.length }
      },
      render: (data) => (
        <Card index={1} icon="building-2" label={O.moves} theme="primary">
          <Ring value={data?.moving} of={data?.all} restTone="amber" />
          <Foot>{data && O.movesOf(data.moving, data.all)}</Foot>
        </Card>
      ),
    },
    {
      key: 'destinations',
      load: async ({ query, omit, count }) => {
        const names = [...new Set((await matching(omit(['toDepartment']))).map((row) => row.toDepartmentName).filter(Boolean))]
        const counts = await Promise.all(names.map((name) => count({ ...omit(['toDepartment']), toDepartment: name })))
        const top = names.map((name, index) => ({ name, count: counts[index] })).sort((a, b) => b.count - a.count).slice(0, TOP)
        // The picked destination stays listed even when it is not among the top ones.
        return query.toDepartment && !top.some((item) => item.name === query.toDepartment)
          ? [...top.slice(0, TOP - 1), { name: query.toDepartment, count: await count(query) }] : top
      },
      render: (data, { pick }) => (
        <Card index={2} icon="map-pin" label={O.destinations} theme="amber">
          <Rank items={(data ?? Array.from({ length: TOP }, (_, index) => ({ name: String(index) }))).map((item) => ({
            key: item.name, label: data ? item.name : '', count: item.count, ...(data && pick({ toDepartment: item.name })),
          }))} />
        </Card>
      ),
    },
  ]
}

// Quick effective-date windows around today.
function dateGroups(today) {
  const month = monthRanges(today, 1)[0]
  return [{
    key: 'effective', title: B.title, tone: 'mint', items: [
      { key: 'past', label: B.past, patch: { dateFrom: '', dateTo: addDays(today, -1) } },
      { key: 'month', label: B.month, patch: { dateFrom: month.from, dateTo: month.to } },
      { key: 'upcoming', label: B.upcoming, patch: { dateFrom: today, dateTo: '' } },
    ],
  }]
}

// Transfer report: every transfer request the user may see and where it is in
// approval; a transfer opens by its Ref #.
export default function TransferReportPage() {
  useEmployeeServicesUser()
  const [transfers] = useState(source)
  const [cards] = useState(() => insight(transfers))
  return (
    <InsightReport variant="transfer-report" title={R.title} heading={R.heading} breadcrumb={C.breadcrumb}
      resourceKey="hr-transfer-report" list={transfers.list} onRefresh={transfers.reset} create={CREATE} openLabel={R.open} empty={R.empty}
      initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={cards} groups={dateGroups} defaultSort={{ key: 'transferNumber', order: 'desc' }}
      numberOf={(row) => row.transferNumber} rowKey={(row) => row.transferId} pathOf={(row) => `${ES_PATHS.transfer}/${row.transferId}`}
      summary={(row) => ({
        heading: row.employeeName,
        pill: statusPill(row),
        facts: [
          [R.columns.employee, `#${row.employeeNumber}`], [R.columns.from, row.fromDepartmentName], [R.columns.to, row.toDepartmentName],
          [R.columns.effective, date(row.effectiveDate)],
        ],
      })} />
  )
}
