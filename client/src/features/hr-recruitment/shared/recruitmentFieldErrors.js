const valuesOf = (form, fields) => JSON.stringify(fields.map((field) => field.split('.').reduce((value, key) => value?.[key], form)))

export function recruitmentValidation(error, definitions, form) {
  const details = Array.isArray(error?.details) ? error.details : []
  if (error?.code !== 'VALIDATION_ERROR' && !details.some(({ field }) => definitions[String(field ?? '').replace(/^body\./, '')])) return null
  const issues = details.flatMap(({ field, message }) => {
    const apiField = String(field ?? '').replace(/^body\./, '')
    const target = definitions[apiField]
    if (!target) return []
    const fields = target.fields || [target.key]
    return [{ ...target, fields, value: valuesOf(form, fields),
      message: message.replaceAll(`"${apiField}"`, target.label) }]
  })
  if (!issues.length) return null
  return {
    step: Math.min(...issues.map(({ step }) => step)),
    errors: Object.fromEntries(issues.map(({ key, message, fields, value }) => [key, { message, fields, value }])),
  }
}

// An error applies only to the values the server rejected. Editing its field
// removes the old message; another submit validates the replacement value.
export function activeRecruitmentErrors(errors, form) {
  return Object.fromEntries(Object.entries(errors)
    .filter(([, issue]) => valuesOf(form, issue.fields) === issue.value)
    .map(([key, issue]) => [key, issue.message]))
}
