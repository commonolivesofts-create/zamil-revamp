// Employee survey reports over /api/v1/survey (the shared apiClient; the
// backend exists, so there is no demo adapter). Readers reject unexpected data.
// The report POSTs only read (legacy AJAX shape); every route needs
// HR.SURVEY_REPORTS:VIEW.
import { apiClient } from '../../../services/api/apiClient.js'
import { invalidResponse, isoDate, optionalNumber, pageOf, params, text } from '../shared/formRecords.js'

export const SURVEY_BASE = '/survey'
// "All" in every legacy report filter: no restriction (and, on a chart, every group).
export const ALL = '__ALL__'
// The answer buckets in the order the server returns its chart series.
export const ANSWERS = Object.freeze(['Strongly Agree', 'Agree', 'Disagree', 'Strongly Disagree'])
// The fixed demographic values the API accepts (surveyReport.validation.js DEMOGRAPHICS).
export const DEMOGRAPHICS = Object.freeze({
  age: Object.freeze(['20-29', '30-39', '40-49', '50-59', '60 or More']),
  jobLevel: Object.freeze(['Manager', 'Supervisor', 'Office Staff', 'Engineer', 'Workers']),
  department: Object.freeze([
    'Administration & HR', 'Purchasing', 'Finance', 'Production Food', 'Production Non- food', 'Warehouse', 'Quality', 'IT',
    'Technical And Development Moulding', 'Sales Marketing food', 'Sales Marketing Non- food', 'Planning Section', 'Maintenance Section',
  ]),
  experience: Object.freeze(['Less than One Year', '1-2 Years', '3-5 Years', '6-9 Years', '10 Years or More']),
})

const strings = (value) => (Array.isArray(value) ? Object.freeze(value.map(text).filter(Boolean)) : Object.freeze([]))

export function readQuestions(data) {
  if (!Array.isArray(data)) throw invalidResponse('question list')
  return Object.freeze(data.map((item) => {
    if (!item || !text(item.question_key)) throw invalidResponse('question')
    return Object.freeze({
      key: text(item.question_key), category: text(item.question_key).replace(/_\d+$/, ''),
      sectionEn: text(item.section_en), sectionAr: text(item.section_ar), en: text(item.question_en), ar: text(item.question_ar),
    })
  }))
}

export function readFilters(data) {
  if (!data || typeof data !== 'object') throw invalidResponse('report filters')
  return Object.freeze({
    ages: strings(data.ages), jobs: strings(data.jobs), departments: strings(data.departments), experiences: strings(data.experiences),
    years: Object.freeze(strings(data.years)),
  })
}

export function readScore(score) {
  const number = (value) => optionalNumber(value) ?? 0
  return Object.freeze({
    stronglyAgree: number(score?.stronglyAgree), agree: number(score?.agree), disagree: number(score?.disagree), stronglyDisagree: number(score?.stronglyDisagree),
    responses: number(score?.totalCount), weightedScore: optionalNumber(score?.weightedScore), weightedPercent: optionalNumber(score?.weightedPercent),
    reverse: score?.scoringDirection === 'reverse',
  })
}

// A chart as { categories, rows: [{ label, values: [SA, A, D, SD] }] } (percentages per category).
export function readChart(data) {
  const categories = Array.isArray(data?.categories) ? data.categories.map(text) : []
  const series = Array.isArray(data?.series) ? data.series : []
  const of = (name) => series.find((item) => item?.name === name)?.data ?? []
  return Object.freeze({
    rows: Object.freeze(categories.map((label, index) => Object.freeze({ label, values: Object.freeze(ANSWERS.map((name) => optionalNumber(of(name)[index]) ?? 0)) }))),
  })
}

export function readDistribution(data) {
  if (!data || typeof data.has_data !== 'boolean') throw invalidResponse('survey distribution')
  return Object.freeze({
    hasData: data.has_data,
    score: readScore(data.scoreSummary),
    charts: Object.freeze(Object.fromEntries(['age', 'job', 'department', 'experience'].map((key) => [key, Object.freeze({
      title: text(data.charts?.[key]?.title), selected: data.charts?.[key]?.selected === true, chart: readChart(data.charts?.[key]?.data),
    })]))),
  })
}

export function readResponse(item) {
  if (!item || !Number.isInteger(Number(item.headerId)) || Number(item.headerId) < 1) throw invalidResponse('survey response')
  return Object.freeze({
    responseId: String(item.headerId), ageBand: text(item.ageBand), jobLevel: text(item.jobLevel), department: text(item.department),
    experience: text(item.experience), year: text(item.year), submittedAt: isoDate(item.submittedAt), lineCount: optionalNumber(item.lineCount),
  })
}

export function readResponsePage(data) {
  if (!data || !Array.isArray(data.items)) throw invalidResponse('survey response list')
  return Object.freeze({ items: Object.freeze(data.items.map(readResponse)), pagination: pageOf(data) })
}

// Blank and "All" are sent as "All" (no restriction).
const dimension = (value) => value || ALL

export function createSurveyService({ client }) {
  return Object.freeze({
    async questions({ signal } = {}) {
      return readQuestions((await client.get(`${SURVEY_BASE}/reports/questions`, { signal })).data)
    },
    async filters({ signal } = {}) {
      return readFilters((await client.get(`${SURVEY_BASE}/reports/filters`, { signal })).data)
    },
    // Legacy: changing the question narrows the demographic lists to its answers.
    async questionFilters(questionKey, { signal } = {}) {
      return readFilters((await client.post(`${SURVEY_BASE}/reports/question-filters`, { question_key: questionKey }, { signal })).data)
    },
    async distribution(questionKey, filter, { signal } = {}) {
      const { data } = await client.post(`${SURVEY_BASE}/reports/distribution`, {
        question_key: questionKey, age: dimension(filter.age), job_level: dimension(filter.jobLevel),
        department: dimension(filter.department), experience: dimension(filter.experience),
      }, { signal })
      return readDistribution(data)
    },
    async categoryScore(categoryKey, filter, { signal } = {}) {
      const { data } = await client.post(`${SURVEY_BASE}/reports/category-score`, {
        category_key: categoryKey, age: dimension(filter.age), job_level: dimension(filter.jobLevel),
        department: dimension(filter.department), experience: dimension(filter.experience),
      }, { signal })
      if (!data || typeof data.has_data !== 'boolean') throw invalidResponse('category score')
      return Object.freeze({ hasData: data.has_data, questionCount: optionalNumber(data.questionCount), score: readScore(data.scoreSummary) })
    },
    async yearwise(questionKey, years, { signal } = {}) {
      const { data } = await client.post(`${SURVEY_BASE}/reports/yearwise`, { question_key: questionKey, years }, { signal })
      if (!data || typeof data.has_data !== 'boolean') throw invalidResponse('year comparison')
      return Object.freeze({ hasData: data.has_data, chart: readChart(data.chart) })
    },
    async list({ page = 1, pageSize = 50, year, age, jobLevel, department, experience, from, to } = {}, { signal } = {}) {
      const { data } = await client.get(`${SURVEY_BASE}/responses`, {
        params: params({ page, pageSize, year, age, jobLevel, department, experience, from, to }), signal,
      })
      return readResponsePage(data)
    },
  })
}

export const surveyService = createSurveyService({ client: apiClient })
