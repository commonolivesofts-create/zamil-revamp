import { useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Compare, Distribution, Hero, Hint, Rank } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { toCsv, withBom } from '@/features/hr-recruitment/report/periodwiseModel.js'
import { EMPLOYEE_SERVICES_BREADCRUMB, ES_COMMON_TEXT as C, RECORD_CHANGE_TEXT as T } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { inRange, localList } from '../shared/localList.js'
import { useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import { LEGACY_RECORD_CHANGE_STATUSES } from './recordChangeModel.js'
import { ES_PATHS } from '../employeeServicesPaths.js'

const L = T.list
const O = L.overview
const B = L.breakdown
const TOP = 4
const RECORD_CHANGE_BASE = ES_PATHS.recordChange
const CREATE = Object.freeze({ permission: 'HR.PERSONNEL_RECORD_CHANGES:CREATE', path: RECORD_CHANGE_BASE, label: L.newRequest })
const DIST_TONE = Object.freeze({ DRAFT: 'draft', INPROCESS: 'progress', APPROVED: 'ok', REJECTED: 'bad' })
const INITIAL = Object.freeze({ status: '', department: '', search: '', dateFrom: '', dateTo: '' })
const FIELDS = [
  { key: 'search', label: L.search, type: 'search', placeholder: L.filters.search },
  { key: 'dateFrom', label: L.filters.from, type: 'date' },
  { key: 'dateTo', label: L.filters.to, type: 'date' },
]
const amount = (value) => (value === null || value === undefined ? '—' : C.money(value))
const statusTone = (status) => (status === 'REJECTED' ? 'bad' : status === 'DRAFT' ? 'warn' : 'ok')
const statusPill = (row) => <Pill tone={statusTone(row.status)}>{C.status[row.status] ?? row.status}</Pill>
// The legacy report (Rec_change/list) columns, after the Ref # that opens the request.
const COLUMNS = [
  { key: 'requestNumber', label: L.columns.number, sort: 'requestId', render: (row) => row.requestNumber },
  { key: 'employeeNumber', label: L.columns.empNo, sort: 'employeeNumber', render: (row) => row.employeeNumber },
  { key: 'employeeName', label: L.columns.employee, sort: 'employeeName', render: (row) => row.employeeName || '—' },
  { key: 'position', label: L.columns.position, render: (row) => row.position || '—' },
  { key: 'section', label: L.columns.section, render: (row) => row.section || '—' },
  { key: 'department', label: L.columns.department, sort: 'department', render: (row) => row.department || '—' },
  { key: 'oldTotal', label: L.columns.previous, sort: 'oldTotal', render: (row) => amount(row.oldTotal) },
  { key: 'newTotal', label: L.columns.revised, sort: 'newTotal', render: (row) => amount(row.newTotal) },
  { key: 'remarks', label: L.columns.remarks, render: (row) => row.remarks || '—' },
  { key: 'requestor', label: L.columns.requestor, render: (row) => row.requestor || '—' },
  { key: 'pendingAt', label: L.columns.pendingAt, render: (row) => row.pendingAt || '—' },
  { key: 'status', label: L.columns.status, render: statusPill },
]

// Legacy DataTables export (CSV for Excel): every request with the report columns and its SR NO.
function exportCsv(rows) {
  const csv = toCsv(rows, [
    { label: 'SR NO', value: (_row, index) => index + 1 },
    { label: L.columns.number, value: (row) => row.requestNumber },
    { label: L.columns.empNo, value: (row) => row.employeeNumber },
    { label: L.columns.employee, value: (row) => row.employeeName },
    { label: L.columns.position, value: (row) => row.position },
    { label: L.columns.section, value: (row) => row.section },
    { label: L.columns.department, value: (row) => row.department },
    { label: L.columns.previous, value: (row) => row.oldTotal },
    { label: L.columns.revised, value: (row) => row.newTotal },
    { label: L.columns.remarks, value: (row) => row.remarks },
    { label: L.columns.requestor, value: (row) => row.requestor },
    { label: L.columns.pendingAt, value: (row) => row.pendingAt },
    { label: L.columns.status, value: (row) => row.status },
  ])
  const url = URL.createObjectURL(new Blob([withBom(csv)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = L.csvFile
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The change request API returns every request at once; the report filters,
// sorts and counts them here. Dates filter the request date.
const source = () => localList(hrEmployeeServices.recordChanges.list, {
  match: (row, query) => (!query.status || row.status === query.status) && (!query.department || row.department === query.department)
    && inRange(row.requestDate, query.dateFrom, query.dateTo),
  searchText: (row) => `${row.requestNumber} ${row.employeeName} ${row.employeeNumber} ${row.position} ${row.section} ${row.department} ${row.requestor} ${row.pendingAt} ${row.remarks}`,
  valueFor: (row, key) => (key === 'requestId' ? row.requestId.padStart(19, '0') : row[key]),
})

// Overview: the monthly salary change the requests add up to, where they are
// in approval, and the departments with the most requests.
function insight(requests) {
  const matching = async (query) => (await requests.list({ ...query, limit: Number.MAX_SAFE_INTEGER })).items
  return [
    {
      key: 'impact',
      load: async ({ query }) => {
        const changes = (await matching(query)).map((row) => row.totalChange).filter((value) => value !== null)
        return {
          total: Math.round(changes.reduce((sum, value) => sum + value, 0)),
          raises: changes.filter((value) => value > 0).length, cuts: changes.filter((value) => value < 0).length, same: changes.filter((value) => value === 0).length,
        }
      },
      render: (data) => (
        <Card index={0} icon="wallet" label={O.impact} theme="mint">
          <Hero value={data?.total} unit={O.perMonth} />
          <Compare rows={[
            { key: 'raises', label: O.raises, tone: 'mint', count: data?.raises },
            { key: 'cuts', label: O.cuts, tone: 'amber', count: data?.cuts },
            { key: 'same', label: O.same, tone: 'primary', count: data?.same },
          ]} />
        </Card>
      ),
    },
    {
      key: 'status',
      load: async ({ omit, count }) => {
        const base = omit(['status'])
        const [all, ...parts] = await Promise.all([count(base), ...LEGACY_RECORD_CHANGE_STATUSES.map((status) => count({ ...base, status }))])
        return { all, parts }
      },
      render: (data, { pick }) => (
        <Card index={1} icon="list-checks" label={O.status} theme="primary" aside={<Hint>{data && O.requests(data.all)}</Hint>}>
          <Distribution total={data?.all} all={pick({ status: '' }).onPick}
            items={LEGACY_RECORD_CHANGE_STATUSES.map((status, index) => ({ key: status, label: C.status[status], tone: DIST_TONE[status], count: data?.parts[index], ...pick({ status }) }))} />
        </Card>
      ),
    },
    {
      key: 'departments',
      load: async ({ query, omit, count }) => {
        const base = omit(['department'])
        const names = [...new Set((await matching(base)).map((row) => row.department).filter(Boolean))]
        const counts = await Promise.all(names.map((department) => count({ ...base, department })))
        const top = names.map((name, index) => ({ name, count: counts[index] })).sort((a, b) => b.count - a.count).slice(0, TOP)
        // The picked department stays listed even when it is not among the top ones.
        return query.department && !top.some((item) => item.name === query.department)
          ? [...top.slice(0, TOP - 1), { name: query.department, count: await count(query) }] : top
      },
      render: (data, { pick }) => (
        <Card index={2} icon="building-2" label={O.departments} theme="amber">
          <Rank items={(data ?? Array.from({ length: TOP }, (_, index) => ({ name: String(index) }))).map((item) => ({
            key: item.name, label: data ? item.name : '', count: item.count, ...(data && pick({ department: item.name })),
          }))} />
        </Card>
      ),
    },
  ]
}

// Quick request-date windows.
function dateGroups(today) {
  const months = monthRanges(today, 3)
  return [{
    key: 'requested', title: B.title, tone: 'mint', items: [
      { key: 'month', label: B.month, patch: { dateFrom: months[2].from, dateTo: today } },
      { key: 'quarter', label: B.quarter, patch: { dateFrom: months[0].from, dateTo: today } },
      { key: 'year', label: B.year, patch: { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today } },
    ],
  }]
}

// Change requests: the legacy report with its status; a request opens by its Ref #.
export default function RecordChangeRequestsPage() {
  useEmployeeServicesUser()
  const [requests] = useState(source)
  const [cards] = useState(() => insight(requests))
  const exportAll = async () => exportCsv(await requests.rows())
  return (
    <InsightReport variant="record-change-list" title={L.title} heading={L.heading} breadcrumb={EMPLOYEE_SERVICES_BREADCRUMB}
      resourceKey="hr-record-change-requests" list={requests.list} onRefresh={requests.reset} create={CREATE} openLabel={L.open} empty={L.empty}
      tools={<button type="button" className="zrv-ir-btn" onClick={exportAll}><OrvexaIcon name="download" size={16} />{L.export}</button>}
      initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={cards} groups={dateGroups} defaultSort={{ key: 'requestId', order: 'desc' }}
      numberOf={(row) => row.requestNumber} rowKey={(row) => row.requestId} pathOf={(row) => `${RECORD_CHANGE_BASE}/${row.requestId}`}
      summary={(row) => ({
        heading: row.employeeName,
        pill: statusPill(row),
        facts: [
          [L.columns.empNo, row.employeeNumber], [L.columns.position, row.position], [L.columns.department, row.department], [L.columns.section, row.section],
          [L.columns.previous, amount(row.oldTotal)], [L.columns.revised, amount(row.newTotal)],
          [L.facts.change, row.totalChange === null ? '' : C.signed(row.totalChange)], [L.facts.requested, row.requestDate ? enDate(row.requestDate) : ''],
          [L.facts.effective, row.effectiveDate ? enDate(row.effectiveDate) : ''], [L.columns.pendingAt, row.pendingAt],
        ],
      })} />
  )
}
