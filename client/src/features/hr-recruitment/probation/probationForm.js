import { enDate, isIsoDate } from '../shared/hrFormat.js'
import { reviewField } from '../shared/recruitmentSteps.js'
import { approvedBy, formTypeLabel, validateForCreate, validateForSubmit, totalRating, formResult, RESULT_TEXT } from './probationRules.js'

export const blankProbation = () => ({ employee: null, formType: '', formDate: '', fromDate: '', toDate: '', comment: '', comments: '', lines: [] })
export const probationFormFromRecord = (record) => ({
  employee: record.employee, formType: record.formType, formDate: record.formDate,
  fromDate: record.fromDate, toDate: record.toDate, comment: record.comment, comments: record.comments,
  lines: record.lines.map((line) => ({ ...line })),
})
export function probationValidationFields(lines) {
  const fields = Object.fromEntries([
    ['formType', 'Form type', 0], ['formDate', 'Joining date', 0], ['fromDate', 'Evaluation period From', 0],
    ['toDate', 'Evaluation period To', 0], ['comment', 'Comments', 2], ['comments', 'Suggestion', 2], ['lines', 'Criteria', 1],
  ].map(([key, label, step]) => [key, { key, label, step }]))
  fields.employeeNumber = { key: 'employee', step: 0, label: 'Employee', fields: ['employee.employeeNumber'] }
  lines.forEach((_, index) => {
    fields[`lines.${index}.rating`] = { key: `rating:${index}`, step: 1, label: `Points for criterion ${index + 1}`, fields: [`lines.${index}.rating`] }
    fields[`lines.${index}.lineId`] = { key: `rating:${index}`, step: 1, label: `Criterion ${index + 1}`, fields: [`lines.${index}.lineId`] }
  })
  return fields
}
export function probationStepErrors(form, { saved = false, employeeStatus = 'ready', criteriaStatus = 'ready' } = {}) {
  const { errors } = saved ? validateForSubmit(form) : validateForCreate(form, { employee: form.employee, criteria: form.lines })
  if (!saved) {
    if (employeeStatus === 'loading') errors.employee = 'Wait for the employee details to finish loading.'
    if (employeeStatus === 'error') errors.employee = 'Could not load the selected employee details. Select the employee again to retry.'
    if (criteriaStatus === 'loading') errors.formType = 'Wait for the criteria to finish loading.'
    if (criteriaStatus === 'error') errors.formType = 'Could not load the criteria. Select the form type again to retry.'
    for (const key of ['formDate', 'fromDate', 'toDate']) {
      if (form[key] && !isIsoDate(form[key])) errors[key] = 'Enter a valid date.'
    }
    // Blank ratings become 0 on the first save. Provided ratings still need to
    // satisfy the server's 1–5 scale.
    form.lines.forEach((line, index) => {
      if (line.rating !== '' && line.rating != null && (!Number.isInteger(Number(line.rating)) || Number(line.rating) < 1 || Number(line.rating) > 5)) errors[`rating:${index}`] = 'Rate this criterion from 1 to 5.'
    })
  } else {
    for (const key of ['comment', 'comments']) {
      if ((form[key]?.length || 0) > 500) errors[key] = 'Use 500 characters or fewer.'
    }
  }
  return [
    Object.fromEntries(Object.entries(errors).filter(([key]) => !key.startsWith('rating:') && !['lines', 'comment', 'comments'].includes(key))),
    Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith('rating:') || key === 'lines')),
    Object.fromEntries(Object.entries(errors).filter(([key]) => ['comment', 'comments'].includes(key))),
    {},
  ]
}
const date = (value) => isIsoDate(value) ? enDate(value) : value
export function probationReviewSections(form, record, requestor, errors = {}) {
  const saved = Boolean(record)
  const employee = form.employee
  const result = formResult(form.lines)
  return [
    { title: 'Employee and evaluation period', rows: [
      reviewField('Form type', formTypeLabel(form.formType), !saved, errors.formType),
      reviewField('Employee name', employee?.name, !saved, errors.employee),
      reviewField('Employee number', employee?.employeeNumber), reviewField('Joining date', date(form.formDate), false, errors.formDate),
      reviewField('Job title', employee?.position), reviewField('Job grade', employee?.grade),
      reviewField('Department', employee?.departmentName),
      reviewField('Evaluation period From', date(form.fromDate), !saved, errors.fromDate),
      reviewField('Evaluation period To', date(form.toDate), !saved, errors.toDate),
    ] },
    { title: 'Evaluation criteria', rows: form.lines.flatMap((line, index) => [
      reviewField(`${index + 1}. ${line.param} — points out of 5`, line.rating, saved, errors[`rating:${index}`]),
      ...(line.paramAr ? [{ ...reviewField(`${index + 1}. معايير التقييم`, line.paramAr), lang: 'ar', dir: 'rtl' }] : []),
    ]) },
    { title: 'Evaluation summary and comments', rows: [
      reviewField('Total points (out of 100)', totalRating(form.lines)),
      reviewField('Evaluation result', result ? RESULT_TEXT[result] : ''),
      reviewField('Comments', saved ? form.comment : '', saved, errors.comment),
      reviewField('Suggestion', saved ? form.comments : '', saved, errors.comments),
      reviewField('Prepared and agreed by', record?.preparedBy || requestor?.fullName),
      reviewField('Approved by', approvedBy(record?.status)),
    ] },
  ]
}
