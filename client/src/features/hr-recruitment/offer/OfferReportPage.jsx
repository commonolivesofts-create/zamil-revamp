import { COMMON_TEXT, OFFER_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { enDate } from '../shared/hrFormat.js'
import { Pill } from '../shared/components/RecruitmentShell.jsx'
import { RecruitmentReport } from '../shared/components/RecruitmentReport.jsx'

const BASE = '/hr/recruitment/offer'
const R = T.report
const CREATE = Object.freeze({ permission: ACTIONS.OFFER_CREATE, path: BASE, tool: R.tool, label: R.newOffer })
// The offer status is write-once (always Incomplete), so the report has no status tabs.
const FILTERS = [
  { key: 'search', label: R.filters.search, type: 'search' },
  { key: 'dateFrom', label: R.filters.from, type: 'date' },
  { key: 'dateTo', label: R.filters.to, type: 'date' },
]
const COLUMNS = [
  { key: 'number', label: R.columns.number, sort: 'HEADER_ID', render: (row) => row.offerNumber || row.offerId },
  { key: 'candidate', label: R.columns.candidate, sort: 'EMPLOYEE_NAME', render: (row) => <b>{row.candidateNameEn || COMMON_TEXT.dash}</b> },
  { key: 'position', label: R.columns.position, render: (row) => row.position || COMMON_TEXT.dash },
  { key: 'requisition', label: R.columns.requisition, render: (row) => row.requisitionNo || COMMON_TEXT.dash },
  { key: 'date', label: R.columns.date, sort: 'OFFER_DATE', render: (row) => (row.offerDate ? enDate(row.offerDate) : COMMON_TEXT.dash) },
  { key: 'status', label: R.columns.status, render: (row) => <Pill tone="warn">{T.status[row.status]}</Pill> },
]

// Employment offer report: HR sees every offer, others their own; filtered,
// sorted and paged by the server.
export default function OfferReportPage() {
  return (
    <RecruitmentReport variant="offer-report" title={R.title} subtitle={R.subtitle} create={CREATE}
      list={hrRecruitmentServices.offers.list} heading={R.heading} resourceKey="hr-offer-report" filters={FILTERS} columns={COLUMNS}
      defaultSort={{ key: 'HEADER_ID', order: 'desc' }} numberOf={(row) => row.offerNumber || row.offerId}
      pathOf={(row) => `${BASE}/${row.offerId}`} />
  )
}
