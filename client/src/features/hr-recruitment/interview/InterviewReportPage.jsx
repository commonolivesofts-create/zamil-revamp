import { COMMON_TEXT, INSIGHT_TEXT, INTERVIEW_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { enDate } from '../shared/hrFormat.js'
import { Pill } from '../shared/components/RecruitmentShell.jsx'
import { InsightReport } from '../shared/components/InsightReport.jsx'
import { CreateEmploymentOffer } from './CreateEmploymentOffer.jsx'
import { Card, Foot, Funnel, HalfGauge, Hero, Hint, Splits } from '../shared/components/InsightCards.jsx'

const BASE = '/hr/recruitment/interview'
const R = T.report
const O = R.overview
const STATUS_TONE = Object.freeze({ INCOMPLETE: 'warn', INPROCESS: 'warn', APPROVED: 'ok', REJECTED: 'bad' })
const OUTCOME_TONE = Object.freeze({ PASSED: 'ok', HOLD: 'amber', FAILED: 'bad' })
const options = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }))
const date = (value) => (value ? enDate(value) : COMMON_TEXT.dash)
// Filter values are the backend's (Incomplete, Passed…); labels are the screen's.
const STATUSES = ['Incomplete', 'Inprocess', 'Approved', 'Rejected']
const OUTCOMES = ['Passed', 'Hold', 'Failed']
const outcomeLabel = (value) => T.outcomes[value.toUpperCase()]

const INITIAL = Object.freeze({ status: '', search: '', evaluationStatus: '', interviewType: '', division: '', dateFrom: '', dateTo: '' })
const FIELDS = [
  { key: 'search', label: INSIGHT_TEXT.search, type: 'search', placeholder: R.filters.search },
  { key: 'evaluationStatus', label: R.filters.outcome, type: 'select', options: OUTCOMES.map((value) => ({ value, label: outcomeLabel(value) })) },
  { key: 'interviewType', label: R.filters.type, type: 'select', options: options(R.types) },
  { key: 'division', label: R.filters.division, type: 'select', options: options(R.divisions) },
  { key: 'dateFrom', label: R.filters.from, type: 'date' },
  { key: 'dateTo', label: R.filters.to, type: 'date' },
]
const COLUMNS = [
  { key: 'number', label: R.columns.number, sort: 'HEADER_ID', render: (row) => row.assessmentNumber || row.assessmentId },
  { key: 'candidate', label: R.columns.candidate, sort: 'CANDIDATE_NAME', render: (row) => <b>{row.candidateName || COMMON_TEXT.dash}</b> },
  { key: 'position', label: R.columns.position, render: (row) => row.positionTitle || COMMON_TEXT.dash },
  { key: 'requisition', label: R.columns.requisition, render: (row) => row.requisitionNo || COMMON_TEXT.dash },
  { key: 'date', label: R.columns.date, sort: 'INTERVIEW_DATE', render: (row) => date(row.interviewDate) },
  { key: 'outcome', label: R.columns.outcome, render: (row) => (row.outcome ? <Pill tone={OUTCOME_TONE[row.outcome] === 'amber' ? 'warn' : OUTCOME_TONE[row.outcome]}>{T.outcomes[row.outcome]}</Pill> : COMMON_TEXT.dash) },
  { key: 'status', label: R.columns.status, render: (row) => <Pill tone={STATUS_TONE[row.status]}>{T.status[row.status]}</Pill> },
  { key: 'offer', label: 'Actions', render: (row) => <CreateEmploymentOffer row={row} compact /> },
]

// Overview: how interviews turned out, the share that passed, and how
// interviews split by channel and division.
const CARDS = [
  {
    key: 'outcomes',
    load: async ({ omit, count }) => {
      const base = omit(['evaluationStatus'])
      const [all, ...parts] = await Promise.all([count(base), ...OUTCOMES.map((value) => count({ ...base, evaluationStatus: value }))])
      return { all, parts }
    },
    render: (data, { pick }) => {
      const rated = data ? data.parts.reduce((sum, value) => sum + value, 0) : 0
      return (
        <Card index={0} icon="list-checks" label={O.outcomes} theme="mint" aside={<Hint>{data && O.unrated(Math.max(0, data.all - rated))}</Hint>}>
          <Hero value={data?.all} unit={O.total} />
          <Funnel items={OUTCOMES.map((value, index) => ({
            key: value, label: outcomeLabel(value), tone: OUTCOME_TONE[value.toUpperCase()], count: data?.parts[index], ...pick({ evaluationStatus: value }),
          }))} />
        </Card>
      )
    },
  },
  {
    key: 'pass',
    load: async ({ omit, count }) => {
      const base = omit(['evaluationStatus'])
      const parts = await Promise.all(OUTCOMES.map((value) => count({ ...base, evaluationStatus: value })))
      return { passed: parts[0], rated: parts.reduce((sum, value) => sum + value, 0) }
    },
    render: (data) => (
      <Card index={1} icon="badge-check" label={O.passRate} theme="primary">
        <HalfGauge value={data?.passed} of={data?.rated} />
        <Foot>{data && (data.rated ? O.passedOf(data.passed, data.rated) : O.unratedAll)}</Foot>
      </Card>
    ),
  },
  {
    key: 'mix',
    load: async ({ omit, count }) => {
      const channel = omit(['interviewType'])
      const division = omit(['division'])
      const [personal, online, food, nonFood] = await Promise.all([
        count({ ...channel, interviewType: 'Personal' }), count({ ...channel, interviewType: 'Online' }),
        count({ ...division, division: 'Food' }), count({ ...division, division: 'Non-Food' }),
      ])
      return { personal, online, food, nonFood }
    },
    render: (data, { pick }) => (
      <Card index={2} icon="shuffle" label={O.mix} theme="amber">
        <Splits rows={[
          { key: 'channel', title: O.channel, sides: [
            { key: 'Personal', label: R.types.Personal, icon: 'users', tone: 'mint', count: data?.personal, ...pick({ interviewType: 'Personal' }) },
            { key: 'Online', label: R.types.Online, icon: 'video', tone: 'amber', count: data?.online, ...pick({ interviewType: 'Online' }) },
          ] },
          { key: 'division', title: O.division, sides: [
            { key: 'Food', label: R.divisions.Food, icon: 'utensils', tone: 'primary', count: data?.food, ...pick({ division: 'Food' }) },
            { key: 'Non-Food', label: R.divisions['Non-Food'], icon: 'package', tone: 'amber', count: data?.nonFood, ...pick({ division: 'Non-Food' }) },
          ] },
        ]} />
      </Card>
    ),
  },
]
const GROUPS = [
  { key: 'approval', title: R.breakdown.approval, tone: 'primary', items: STATUSES.map((value) => ({ key: value, label: T.status[value.toUpperCase()], patch: { status: value } })) },
]

// Interview assessment report: HR sees every assessment, others their own;
// filtered, sorted and paged by the server.
export default function InterviewReportPage() {
  return (
    <InsightReport variant="interview-report" title={R.title} subtitle={R.subtitle} heading={R.heading} resourceKey="hr-interview-report"
      list={hrRecruitmentServices.interviews.list} create={{ permission: ACTIONS.INTERVIEW_CREATE, path: BASE, label: R.newAssessment }}
      openLabel={R.detail.open} empty={R.empty} initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={CARDS} groups={GROUPS}
      defaultSort={{ key: 'HEADER_ID', order: 'desc' }} numberOf={(row) => row.assessmentNumber || row.assessmentId}
      rowKey={(row) => row.assessmentId} pathOf={(row) => `${BASE}/${row.assessmentId}`}
      renderDetail={(row) => <CreateEmploymentOffer row={row} />}
      summary={(row) => ({
        heading: row.candidateName,
        pill: <Pill tone={STATUS_TONE[row.status]}>{T.status[row.status]}</Pill>,
        facts: [
          [R.columns.position, row.positionTitle], [R.columns.requisition, row.requisitionNo],
          [R.columns.date, date(row.interviewDate)], [R.columns.outcome, T.outcomes[row.outcome]],
        ],
      })} />
  )
}
