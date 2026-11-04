import { COMMON_TEXT, INSIGHT_TEXT, OFFER_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { enDate } from '../shared/hrFormat.js'
import { addDays, dayWindows, monthRanges } from '../shared/insightDates.js'
import { Pill } from '../shared/components/RecruitmentShell.jsx'
import { InsightReport } from '../shared/components/InsightReport.jsx'
import { Card, Compare, Delta, Foot, HeatStrip, Hero, Hint, Sparkline } from '../shared/components/InsightCards.jsx'

const BASE = '/hr/recruitment/offer'
const R = T.report
const O = R.overview
const B = R.breakdown
const WEEKS = 8
const date = (value) => (value ? enDate(value) : COMMON_TEXT.dash)
// The offer status is write-once (always Incomplete), so the overview follows
// offer dates rather than an approval flow.
const INITIAL = Object.freeze({ search: '', dateFrom: '', dateTo: '' })
const FIELDS = [
  { key: 'search', label: INSIGHT_TEXT.search, type: 'search', placeholder: R.filters.search },
  { key: 'dateFrom', label: R.filters.from, type: 'date' },
  { key: 'dateTo', label: R.filters.to, type: 'date' },
]
const COLUMNS = [
  { key: 'number', label: R.columns.number, sort: 'HEADER_ID', render: (row) => row.offerNumber || row.offerId },
  { key: 'candidate', label: R.columns.candidate, sort: 'EMPLOYEE_NAME', render: (row) => <b>{row.candidateNameEn || COMMON_TEXT.dash}</b> },
  { key: 'position', label: R.columns.position, render: (row) => row.position || COMMON_TEXT.dash },
  { key: 'requisition', label: R.columns.requisition, render: (row) => row.requisitionNo || COMMON_TEXT.dash },
  { key: 'date', label: R.columns.date, sort: 'OFFER_DATE', render: (row) => date(row.offerDate) },
  { key: 'status', label: R.columns.status, render: (row) => <Pill tone="warn">{T.status[row.status]}</Pill> },
]

// Overview: offers per week (the last eight), this year against the same
// period last year, and each of the last twelve months.
const CARDS = [
  {
    key: 'momentum',
    load: async ({ query, today, countIn }) => {
      const weeks = dayWindows(today, 7, WEEKS)
      const counts = await Promise.all(weeks.map((week) => countIn(query, week)))
      return weeks.map((week, index) => ({ ...week, count: counts[index] }))
    },
    render: (data) => (
      <Card index={0} icon="activity" label={O.momentum} theme="mint"
        aside={data && <Delta value={data.at(-1).count - data.at(-2).count} label={O.previousWeek} />}>
        <Hero value={data?.at(-1).count} unit={O.lastWeek} />
        <Sparkline points={data} />
      </Card>
    ),
  },
  {
    key: 'year',
    load: async ({ query, today, countIn }) => {
      const year = Number(today.slice(0, 4))
      const [current, previous] = await Promise.all([
        countIn(query, { from: `${year}-01-01`, to: today }),
        // 29 February has no match a year earlier; the period then ends on the 28th.
        countIn(query, { from: `${year - 1}-01-01`, to: `${year - 1}${today.slice(4) === "-02-29" ? "-02-28" : today.slice(4)}` }),
      ])
      return { year, current, previous }
    },
    render: (data) => (
      <Card index={1} icon="calendar-check" label={O.year} theme="primary">
        <Hero value={data?.current} unit={data && O.thisYear(data.year)} />
        <Compare rows={[
          { key: 'current', label: data ? O.thisYear(data.year) : '', tone: 'mint', count: data?.current },
          { key: 'previous', label: data ? O.lastYear(data.year - 1) : '', tone: 'amber', count: data?.previous },
        ]} />
        <Foot>{data && O.yearNote(data.current - data.previous)}</Foot>
      </Card>
    ),
  },
  {
    key: 'calendar',
    load: async ({ query, today, countIn }) => {
      const months = monthRanges(today, 12)
      const counts = await Promise.all(months.map((month) => countIn(query, month)))
      return months.map((month, index) => ({ ...month, count: counts[index] }))
    },
    render: (data) => {
      const busiest = data?.reduce((best, month) => (month.count > best.count ? month : best), data[0])
      return (
        <Card index={2} icon="calendar-days" label={O.calendar} theme="amber" aside={<Hint>{busiest?.count ? O.busiest(busiest.label, busiest.count) : null}</Hint>}>
          <Hero value={data?.reduce((sum, month) => sum + month.count, 0)} />
          <HeatStrip items={data} slots={12} />
        </Card>
      )
    },
  },
]

// Quick offer-date windows ending today.
function dateGroups(today) {
  const since = (days) => ({ dateFrom: addDays(today, -(days - 1)), dateTo: today })
  return [{
    key: 'date', title: B.date, tone: 'mint', items: [
      { key: 'week', label: B.week, patch: since(7) },
      { key: 'month', label: B.month, patch: since(30) },
      { key: 'quarter', label: B.quarter, patch: since(90) },
      { key: 'year', label: B.year, patch: { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today } },
    ],
  }]
}

// Employment offer report: HR sees every offer, others their own; filtered,
// sorted and paged by the server.
export default function OfferReportPage() {
  return (
    <InsightReport variant="offer-report" title={R.title} subtitle={R.subtitle} heading={R.heading} resourceKey="hr-offer-report"
      list={hrRecruitmentServices.offers.list} create={{ permission: ACTIONS.OFFER_CREATE, path: BASE, label: R.newOffer }}
      openLabel={R.detail.open} empty={R.empty} initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={CARDS} groups={dateGroups}
      defaultSort={{ key: 'HEADER_ID', order: 'desc' }} numberOf={(row) => row.offerNumber || row.offerId}
      rowKey={(row) => row.offerId} pathOf={(row) => `${BASE}/${row.offerId}`}
      summary={(row) => ({
        heading: row.candidateNameEn,
        pill: <Pill tone="warn">{T.status[row.status]}</Pill>,
        facts: [[R.columns.position, row.position], [R.columns.requisition, row.requisitionNo], [R.columns.date, date(row.offerDate)]],
      })} />
  )
}
