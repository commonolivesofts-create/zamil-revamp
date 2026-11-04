import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { monthRanges } from '@/features/hr-recruitment/shared/insightDates.js'
import { InsightReport } from '@/features/hr-recruitment/shared/components/InsightReport.jsx'
import { Card, Columns, Distribution, Foot, Hint } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { SURVEY_PATHS } from '../employeeServicesPaths.js'
import { DEMOGRAPHICS, surveyService } from './surveyService.js'

// The legacy textual report: pmform_codebase/views/survey_report.php (anonymous responses).
const BREADCRUMB = Object.freeze(['Human resources', 'Reports'])
const MONTHS = 6
const TONES = Object.freeze(['ok', 'progress', 'draft', 'bad', 'ok'])
const INITIAL = Object.freeze({ year: '', age: '', jobLevel: '', department: '', experience: '', dateFrom: '', dateTo: '' })
const options = (values) => values.map((value) => ({ value, label: value }))
const FIELDS = [
  { key: 'year', label: 'Survey year', type: 'search', placeholder: 'YYYY' },
  { key: 'age', label: 'Age', type: 'select', options: options(DEMOGRAPHICS.age) },
  { key: 'jobLevel', label: 'Job level', type: 'select', options: options(DEMOGRAPHICS.jobLevel) },
  { key: 'department', label: 'Department', type: 'select', options: options(DEMOGRAPHICS.department) },
  { key: 'experience', label: 'Experience', type: 'select', options: options(DEMOGRAPHICS.experience) },
  { key: 'dateFrom', label: 'Submitted from', type: 'date' },
  { key: 'dateTo', label: 'Submitted to', type: 'date' },
]
const date = (value) => (value ? enDate(value) : '—')
const COLUMNS = [
  { key: 'responseId', label: 'Header ID', render: (row) => row.responseId },
  { key: 'ageBand', label: 'Age', render: (row) => row.ageBand || '—' },
  { key: 'jobLevel', label: 'Job level', render: (row) => row.jobLevel || '—' },
  { key: 'department', label: 'Department', render: (row) => row.department || '—' },
  { key: 'experience', label: 'Experience', render: (row) => row.experience || '—' },
  { key: 'submittedAt', label: 'Survey date', render: (row) => date(row.submittedAt) },
]

const list = ({ page, limit, year, age, jobLevel, department, experience, dateFrom, dateTo }, signal) =>
  surveyService.list({ page, pageSize: limit, year, age, jobLevel, department, experience, from: dateFrom, to: dateTo }, signal)

const CARDS = [
  {
    key: 'jobs',
    load: async ({ omit, count }) => {
      const base = omit(['jobLevel'])
      const [all, ...parts] = await Promise.all([count(base), ...DEMOGRAPHICS.jobLevel.map((jobLevel) => count({ ...base, jobLevel }))])
      return { all, parts }
    },
    render: (data, { pick }) => (
      <Card index={0} icon="users" label="Responses by job level" theme="mint" aside={<Hint>{data && `${data.all} responses`}</Hint>}>
        <Distribution total={data?.all} all={pick({ jobLevel: '' }).onPick}
          items={DEMOGRAPHICS.jobLevel.map((jobLevel, index) => ({ key: jobLevel, label: jobLevel, tone: TONES[index], count: data?.parts[index], ...pick({ jobLevel }) }))} />
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
      <Card index={1} icon="calendar-range" label="Responses by month" theme="amber">
        <Columns items={data} count={MONTHS} />
        <Foot>Responses submitted each month</Foot>
      </Card>
    ),
  },
]

// Textual survey report: anonymous responses (demographics and date only), filtered and paged by the server.
export default function SurveyResponsesPage() {
  return (
    <InsightReport variant="survey-responses" title="Survey responses" heading="Responses" breadcrumb={BREADCRUMB}
      resourceKey="hr-survey-responses" list={list} openLabel="Open" empty="No survey responses match these filters."
      initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={CARDS} defaultSort={{ key: '', order: '' }}
      numberOf={(row) => row.responseId} rowKey={(row) => row.responseId}
      tools={<Link className="zrv-ir-btn" to={SURVEY_PATHS.report}><OrvexaIcon name="chart-column" size={16} />Graphical report</Link>}
      validate={(draft) => (draft.year && !/^\d{4}$/.test(draft.year) ? { year: 'Enter a four-digit year.' } : {})}
      summary={(row) => ({
        heading: `Response ${row.responseId}`,
        facts: [['Age', row.ageBand], ['Job level', row.jobLevel], ['Department', row.department], ['Experience', row.experience],
          ['Survey year', row.year], ['Survey date', row.submittedAt ? date(row.submittedAt) : '']],
      })} />
  )
}
