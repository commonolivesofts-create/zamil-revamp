import { useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { Card, Foot, Hero, Hint } from '@/features/hr-recruitment/shared/components/InsightCards.jsx'
import { SURVEY_PATHS } from '../employeeServicesPaths.js'
import '@/styles/hr-recruitment.css'
import '@/styles/hr-insight-report.css'
import '@/styles/hr-survey-report.css'
import { ALL, ANSWERS, surveyService } from './surveyService.js'

// The legacy graphical report: pmform_codebase/views/survey/graph_report.php,
// laid out like the recruitment insight reports.
const TITLE = 'Survey report'
const BREADCRUMB = Object.freeze(['Human resources', 'Reports'])
const USE_TOP = '__USE_TOP__'
const TONES = Object.freeze(['zrv-hr-sv-sa', 'zrv-hr-sv-a', 'zrv-hr-sv-d', 'zrv-hr-sv-sd'])
const DIMENSIONS = Object.freeze([['age', 'Age', 'ages'], ['jobLevel', 'Job level', 'jobs'], ['department', 'Department', 'departments'], ['experience', 'Experience', 'experiences']])
const CHARTS = Object.freeze([['age', 'By age'], ['job', 'By job level'], ['department', 'By department'], ['experience', 'By experience']])
const BLANK = Object.freeze({ age: ALL, jobLevel: ALL, department: ALL, experience: ALL })
const pct = (value) => `${Number(value).toFixed(value % 1 ? 1 : 0)}%`

// Answers as 100 % stacked bars, one per group (each group's four answers sum to 100).
export function StackedBars({ chart, label }) {
  if (!chart.rows.length) return <p className="zrv-hr-sv-empty">No responses for this selection.</p>
  return (
    <ul className="zrv-hr-sv-bars" aria-label={label}>
      {chart.rows.map((row, index) => (
        <li key={row.label} style={{ '--i': index }}>
          <span className="zrv-hr-sv-bars__l" title={row.label}>{row.label}</span>
          <span className="zrv-hr-sv-bars__t" role="img" aria-label={`${row.label}: ${ANSWERS.map((name, at) => `${name} ${pct(row.values[at])}`).join(', ')}`}>
            {row.values.map((value, at) => value > 0 && (
              <i key={ANSWERS[at]} className={TONES[at]} style={{ flexGrow: value }} title={`${ANSWERS[at]}: ${pct(value)}`}>{value >= 9 ? pct(value) : ''}</i>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

const Legend = () => <div className="zrv-hr-rp-legend zrv-hr-sv-legend">{ANSWERS.map((name, at) => <span key={name}><i className={TONES[at]} />{name}</span>)}</div>

// One select of the filter row.
function Pick({ id, label, value, onChange, children }) {
  return (
    <label className="zrv-ir-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={onChange}>{children}</select>
    </label>
  )
}

export default function SurveyReportPage() {
  const questions = useResource('hr-survey-questions', (signal) => surveyService.questions({ signal }))
  const filters = useResource('hr-survey-filters', (signal) => surveyService.filters({ signal }))
  const ready = questions.status === 'ready' && filters.status === 'ready'
  return (
    <div className="zrv-hr zrv-hr--survey zrv-hr--compact zrv-ir">
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb"><ol className="zrv-ir-crumb">{BREADCRUMB.map((item) => <li key={item}>{item}</li>)}</ol></nav>
          <h1 className="zrv-hr-title">{TITLE}</h1>
        </div>
        <div className="zrv-ir-head__actions">
          <Link className="zrv-ir-btn" to={SURVEY_PATHS.responses}><OrvexaIcon name="table" size={16} />Responses</Link>
          <button type="button" className="zrv-ir-btn" onClick={() => window.print()}><OrvexaIcon name="printer" size={16} />Print</button>
        </div>
      </header>
      {ready
        ? <SurveyReport questions={questions.data} filters={filters.data} />
        : <section className="zrv-ir-card zrv-hr-sv-pad">
          <ResourceState resource={questions.status !== 'ready' ? questions : filters} label="survey report" empty="No survey questions.">{() => null}</ResourceState>
        </section>}
    </div>
  )
}

function SurveyReport({ questions, filters }) {
  const categories = [...new Map(questions.map((item) => [item.category, item])).values()]
  const [draft, setDraft] = useState({ question: questions[0]?.key ?? '', ...BLANK })
  const [applied, setApplied] = useState(draft)
  const [categoryDraft, setCategoryDraft] = useState({ category: categories[0]?.category ?? '', department: USE_TOP })
  const [categoryApplied, setCategoryApplied] = useState(categoryDraft)
  const [years, setYears] = useState(() => filters.years.slice(0, 2))
  const [yearsApplied, setYearsApplied] = useState(years)

  // Legacy: the demographic lists narrow to the answers of the chosen question.
  const options = useResource(draft.question ? `hr-survey-qf:${draft.question}` : null, (signal) => surveyService.questionFilters(draft.question, { signal }))
  const lists = options.status === 'ready' ? options.data : filters
  const distribution = useResource(applied.question ? `hr-survey-dist:${JSON.stringify(applied)}` : null,
    (signal) => surveyService.distribution(applied.question, applied, { signal }))
  const categoryFilter = { ...applied, department: categoryApplied.department === USE_TOP ? applied.department : categoryApplied.department }
  const category = useResource(categoryApplied.category ? `hr-survey-cat:${categoryApplied.category}:${JSON.stringify(categoryFilter)}` : null,
    (signal) => surveyService.categoryScore(categoryApplied.category, categoryFilter, { signal }))
  const yearwise = useResource(applied.question && yearsApplied.length ? `hr-survey-years:${applied.question}:${yearsApplied.join(',')}` : null,
    (signal) => surveyService.yearwise(applied.question, yearsApplied, { signal }))

  const question = questions.find((item) => item.key === applied.question)
  const draftQuestion = questions.find((item) => item.key === draft.question)
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied)
  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }))
  const toggleYear = (year) => setYears((current) => (current.includes(year) ? current.filter((item) => item !== year) : [...current, year].sort().reverse()))
  const result = distribution.status === 'ready' ? distribution.data : null
  const score = result?.hasData ? result.score : null
  const categoryScore = category.status === 'ready' && category.data.hasData ? category.data : null
  const activeFilters = DIMENSIONS.filter(([key]) => applied[key] !== ALL).length

  return <>
    <form className="zrv-ir-card zrv-hr-sv-filters" onSubmit={(event) => { event.preventDefault(); setApplied(draft) }} aria-label="Question and filters">
      <div className="zrv-hr-sv-filters__grid">
        <Pick id="sv-question" label="Question" value={draft.question} onChange={(event) => setDraft({ ...BLANK, question: event.target.value })}>
          {categories.map((group) => (
            <optgroup key={group.category} label={group.sectionEn}>
              {questions.filter((item) => item.category === group.category).map((item) => <option key={item.key} value={item.key}>{item.en || item.key}</option>)}
            </optgroup>
          ))}
        </Pick>
        {DIMENSIONS.map(([key, label, list]) => (
          <Pick key={key} id={`sv-${key}`} label={label} value={draft[key]} onChange={set(key)}>
            <option value={ALL}>All</option>
            {lists[list].map((value) => <option key={value} value={value}>{value}</option>)}
          </Pick>
        ))}
        <button type="submit" className="zrv-ir-btn zrv-ir-btn--primary zrv-hr-sv-apply" disabled={!draft.question}><OrvexaIcon name="check" size={15} />Apply</button>
      </div>
      {(draftQuestion?.ar || dirty) && <p className="zrv-hr-sv-sub">
        {draftQuestion?.ar && <span lang="ar" dir="rtl">{draftQuestion.ar}</span>}
        {dirty && <em role="status">Apply to update the report.</em>}
      </p>}
    </form>

    <section className="zrv-ir-overview" aria-label="Overview" aria-busy={distribution.status === 'loading' || undefined}>
      <div className="zrv-ir-overview__slot">
        <Card index={0} icon="gauge" label="Weighted score" theme="mint" aside={<Hint>{score?.reverse ? 'Reverse-scored' : question?.sectionEn}</Hint>}>
          <Hero value={score ? Math.round(score.weightedPercent ?? 0) : undefined} suffix="%" unit={score ? `${score.weightedScore} / 5` : ''} />
          {score && <span className="zrv-hr-sv-bars__t zrv-hr-sv-total" role="img" aria-label={ANSWERS.map((name, at) => `${name} ${pct([score.stronglyAgree, score.agree, score.disagree, score.stronglyDisagree][at])}`).join(', ')}>
            {[score.stronglyAgree, score.agree, score.disagree, score.stronglyDisagree].map((value, at) => value > 0 && <i key={ANSWERS[at]} className={TONES[at]} style={{ flexGrow: value }}>{value >= 9 ? pct(value) : ''}</i>)}
          </span>}
        </Card>
      </div>
      <div className="zrv-ir-overview__slot">
        <Card index={1} icon="users" label="Responses" theme="primary">
          <Hero value={score ? score.responses : undefined} unit="answers to this question" />
          <Foot>{activeFilters ? `${activeFilters} filter${activeFilters === 1 ? '' : 's'} applied` : 'All respondents'}</Foot>
        </Card>
      </div>
      <div className="zrv-ir-overview__slot">
        <Card index={2} icon="thumbs-up" label="Agreement" theme="amber">
          <Hero value={score ? Math.round(score.stronglyAgree + score.agree) : undefined} suffix="%" unit="agree or strongly agree" />
          <Foot>{score ? `${pct(score.disagree + score.stronglyDisagree)} disagree` : ''}</Foot>
        </Card>
      </div>
      <div className="zrv-ir-overview__slot">
        <Card index={3} icon="layers" label="Category" theme="mint" aside={<Hint>{categoryScore ? `${categoryScore.questionCount} questions` : ''}</Hint>}>
          <Hero value={categoryScore ? Math.round(categoryScore.score.weightedPercent ?? 0) : category.status === 'ready' ? 0 : undefined} suffix="%"
            unit={categoryScore ? `${categoryScore.score.weightedScore} / 5 · ${categoryScore.score.responses} answers` : category.status === 'ready' ? 'No answers' : ''} />
          <form className="zrv-hr-sv-cat" onSubmit={(event) => { event.preventDefault(); setCategoryApplied(categoryDraft) }}>
            <select aria-label="Question category" value={categoryDraft.category} onChange={(event) => setCategoryDraft((current) => ({ ...current, category: event.target.value }))}>
              {categories.map((group) => <option key={group.category} value={group.category}>{group.sectionEn}</option>)}
            </select>
            <select aria-label="Category department" value={categoryDraft.department} onChange={(event) => setCategoryDraft((current) => ({ ...current, department: event.target.value }))}>
              <option value={USE_TOP}>Department above</option>
              <option value={ALL}>All departments</option>
              {filters.departments.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <button type="submit" className="zrv-ir-btn" aria-label="Apply category"><OrvexaIcon name="check" size={15} /></button>
          </form>
        </Card>
      </div>
    </section>

    {distribution.status !== 'ready'
      ? <section className="zrv-ir-card zrv-hr-sv-pad"><ResourceState resource={distribution} label="survey results" empty="No results.">{() => null}</ResourceState></section>
      : !result.hasData
        ? <p className="zrv-hr-sv-nodata" role="status">No survey response found for the selected filter combination.</p>
        : <>
          <Legend />
          <section className="zrv-hr-sv-charts" aria-label="Answers by group">
          {CHARTS.map(([key, title]) => (
            <article key={key} className="zrv-ir-card">
              <header className="zrv-ir-card__head"><h2>{title}</h2></header>
              <div className="zrv-hr-sv-body"><StackedBars chart={result.charts[key].chart} label={title} /></div>
            </article>
          ))}
          </section>
        </>}

    <section className="zrv-ir-card" aria-labelledby="sv-years-title">
      <header className="zrv-ir-card__head zrv-hr-sv-years__head">
        <h2 id="sv-years-title">By survey year</h2>
        <form className="zrv-hr-sv-years__f" onSubmit={(event) => { event.preventDefault(); setYearsApplied(years) }}>
          <div className="zrv-hr-esf-chips" role="group" aria-label="Survey years">
            {filters.years.map((year) => (
              <label key={year} className={`zrv-hr-esf-chip zrv-hr-is-ok${years.includes(year) ? ' zrv-hr-is-on' : ''}`}>
                <input type="checkbox" checked={years.includes(year)} onChange={() => toggleYear(year)} /><span>{year}</span>
              </label>
            ))}
          </div>
          <button type="submit" className="zrv-ir-btn" disabled={!years.length}><OrvexaIcon name="check" size={15} />Compare</button>
        </form>
      </header>
      <div className="zrv-hr-sv-body">
        {!yearsApplied.length
          ? <p className="zrv-hr-sv-empty">Select at least one survey year.</p>
          : yearwise.status === 'ready'
            ? <StackedBars chart={yearwise.data.chart} label="Answers by survey year" />
            : <ResourceState resource={yearwise} label="year comparison" empty="—">{() => null}</ResourceState>}
      </div>
    </section>
  </>
}
