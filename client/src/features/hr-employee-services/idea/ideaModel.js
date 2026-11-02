// Business rules of Share an Idea (form 1097). Legacy fields and lists come
// from the backend (divisions, project types, investment categories, the
// yes/no investment). The prototype's description rule is kept as a new rule
// (at least 40 characters); its benefits, effort, area, co-contributors,
// problem and payback have no column or API yet and are not shown.
export const TITLE_MAX = 200
export const IDEA_MIN = 40
export const IDEA_MAX = 4000
const AMOUNT = /^\d+(\.\d{1,2})?$/

// Digits with at most two decimals ('' stays blank).
export const cleanAmount = (value) => String(value ?? '').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
export const isAmount = (value) => AMOUNT.test(String(value))

export function validateIdea(form) {
  const errors = {}
  if (!form.employee) errors.employee = 'Choose the employee.'
  if (!form.division) errors.division = 'Choose the division.'
  if (!form.investmentCategory) errors.investmentCategory = 'Choose the investment category.'
  if (!form.projectType) errors.projectType = 'Choose the project type.'
  if (!form.title.trim()) errors.title = 'Give the idea a title.'
  else if (form.title.trim().length > TITLE_MAX) errors.title = `Keep the title within ${TITLE_MAX} characters.`
  if (form.idea.trim().length < IDEA_MIN) errors.idea = `Describe the idea in at least ${IDEA_MIN} characters.`
  else if (form.idea.length > IDEA_MAX) errors.idea = `Keep the idea within ${IDEA_MAX} characters.`
  if (!form.hasInvestment) errors.hasInvestment = 'Answer whether it needs investment.'
  if (form.hasInvestment === 'yes' && !(isAmount(form.investmentValue) && Number(form.investmentValue) > 0)) {
    errors.investmentValue = 'Enter the estimated investment (more than 0, up to 2 decimals).'
  }
  if (form.saving !== '' && !isAmount(form.saving)) errors.saving = 'Enter the saving as a number (up to 2 decimals).'
  return errors
}

export const stepOfErrors = (errors) =>
  (['employee', 'division', 'investmentCategory', 'projectType', 'title', 'idea'].some((key) => errors[key]) ? 0 : 1)

// How much of the form is answered (the bulb lights up).
export function ideaProgress(form) {
  const done = [form.employee, form.division, form.investmentCategory, form.projectType, form.title.trim(),
    form.idea.trim().length >= IDEA_MIN, form.hasInvestment].filter(Boolean).length
  return { done, total: 7 }
}

export const formatSar = (value) => (value === null || value === undefined || value === ''
  ? '—'
  : `SAR ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`)
