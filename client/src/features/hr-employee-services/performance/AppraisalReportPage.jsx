import { useState } from 'react'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { Pill } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Distribution, Foot, HalfGauge, Hero, Hint } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { APPRAISAL_TEXT as T, ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { inRange, localList } from '../shared/localList.js'
import { useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'

const R = T.report
const O = R.overview
const MONTHS = 6
const GRADES = Object.freeze(['A', 'B', 'C', 'D', 'E'])
const STATUSES = Object.freeze([['DRAFT', 'draft'], ['INPROCESS', 'progress'], ['APPROVED', 'ok'], ['REJECTED', 'bad']])
// The appraisal form is session-only (no RBAC resource), so anyone signed in may start one.
const CREATE = Object.freeze({ permission: null, path: ES_PATHS.appraisal, label: R.newAppraisal })
const INITIAL = Object.freeze({ status: '', grade: '', search: '', dateFrom: '', dateTo: '' })
const FIELDS = [
  { key: 'search', label: R.search, type: 'search', placeholder: R.filters.search },
  { key: 'grade', label: R.columns.grade, type: 'select', options: GRADES.map((value) => ({ value, label: value })) },
  { key: 'dateFrom', label: R.filters.from, type: 'date' },
  { key: 'dateTo', label: R.filters.to, type: 'date' },
]
const statusPill = (row) => <Pill tone={row.status === 'DRAFT' ? 'warn' : row.status === 'REJECTED' ? 'bad' : 'ok'}>{C.status[row.status] ?? row.status}</Pill>
const rating = (row) => (row.rating === null ? '—' : row.rating.toFixed(2))
const COLUMNS = [
  { key: 'appraisalNumber', label: R.columns.number, sort: 'appraisalNumber', render: (row) => row.appraisalNumber },
  { key: 'employeeName', label: R.columns.employee, sort: 'employeeName', render: (row) => <b>{row.employeeName}</b> },
  { key: 'periodCode', label: R.columns.period, render: (row) => row.periodCode },
  { key: 'rating', label: R.columns.rating, sort: 'rating', render: rating },
  { key: 'grade', label: R.columns.grade, sort: 'grade', render: (row) => row.grade ?? '—' },
  { key: 'status', label: R.columns.status, render: statusPill },
]

// The appraisal API returns this year's appraisals at once; the report
// filters, sorts and counts them here. Dates filter the creation date.
const source = () => localList(hrEmployeeServices.appraisals.list, {
  match: (row, query) => (!query.status || row.status === query.status) && (!query.grade || row.grade === query.grade)
    && inRange(row.updatedAt, query.dateFrom, query.dateTo),
  searchText: (row) => `${row.appraisalNumber} ${row.employeeName}`,
  valueFor: (row, key) => (key === 'appraisalNumber' && /^\d+$/.test(row.appraisalNumber) ? Number(row.appraisalNumber) : row[key]),
})

// Overview: appraisals created per month, the average rating, and where they
// are in approval; the breakdown counts each grade.
function insight(appraisals) {
  return [
    {
      key: 'months',
      load: async ({ query, today, count, countIn }) => {
        const months = monthRanges(today, MONTHS)
        const [all, ...counts] = await Promise.all([count(query), ...months.map((month) => countIn(query, month))])
        return { all, months: months.map((month, index) => ({ key: month.key, label: month.label, count: counts[index] })) }
      },
      render: (data) => (
        <Card index={0} icon="calendar-check" label={O.months} theme="mint" aside={<Hint>{data && `${data.months.at(-1).count} ${O.thisMonth}`}</Hint>}>
          <Hero value={data?.all} unit={R.noun} />
          <Columns items={data?.months} count={MONTHS} />
        </Card>
      ),
    },
    {
      key: 'average',
      load: async ({ query }) => {
        const rated = (await appraisals.list({ ...query, limit: Number.MAX_SAFE_INTEGER })).items.filter((row) => row.rating !== null)
        return { rated: rated.length, average: rated.length ? rated.reduce((sum, row) => sum + row.rating, 0) / rated.length : 0 }
      },
      render: (data) => (
        <Card index={1} icon="gauge" label={O.average} theme="primary">
          <HalfGauge value={data && Math.round(data.average * 100)} of={data?.rated ? 500 : 0} />
          <Foot>{data && (data.rated ? O.averageOf(data.average.toFixed(2), data.rated) : O.unrated)}</Foot>
        </Card>
      ),
    },
    {
      key: 'status',
      load: async ({ omit, count }) => {
        const base = omit(['status'])
        const [all, ...parts] = await Promise.all([count(base), ...STATUSES.map(([status]) => count({ ...base, status }))])
        return { all, parts }
      },
      render: (data, { pick }) => (
        <Card index={2} icon="list-checks" label={O.status} theme="amber" aside={<Hint>{data && O.appraisals(data.all)}</Hint>}>
          <Distribution total={data?.all} all={pick({ status: '' }).onPick}
            items={STATUSES.map(([status, tone], index) => ({ key: status, label: C.status[status], tone, count: data?.parts[index], ...pick({ status }) }))} />
        </Card>
      ),
    },
  ]
}
const GROUPS = [{ key: 'grade', title: R.breakdown.title, tone: 'primary', items: GRADES.map((grade) => ({ key: grade, label: grade, patch: { grade } })) }]

// Appraisal report: this year's appraisals the user may see; one opens by its number.
export default function AppraisalReportPage() {
  useEmployeeServicesUser()
  const [appraisals] = useState(source)
  const [cards] = useState(() => insight(appraisals))
  return (
    <InsightReport variant="appraisal-report" title={R.title} heading={R.heading} breadcrumb={C.performanceBreadcrumb}
      resourceKey="hr-appraisal-report" list={appraisals.list} onRefresh={appraisals.reset} create={CREATE} openLabel={R.open} empty={R.empty}
      initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={cards} groups={GROUPS} defaultSort={{ key: 'appraisalNumber', order: 'desc' }}
      numberOf={(row) => row.appraisalNumber} rowKey={(row) => row.appraisalId} pathOf={(row) => `${ES_PATHS.appraisal}/${row.appraisalId}`}
      summary={(row) => ({
        heading: row.employeeName,
        pill: statusPill(row),
        facts: [[R.columns.period, row.periodCode], [R.columns.rating, rating(row)], [R.columns.grade, row.grade]],
      })} />
  )
}
