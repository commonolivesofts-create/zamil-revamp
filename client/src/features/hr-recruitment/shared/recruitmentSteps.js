// The first invalid step gates progress. Previously unlocked steps stay available.
export function recruitmentStepProgress(errorsByStep, furthest = 0, readOnly = false) {
  const firstInvalid = errorsByStep.findIndex((errors) => Object.keys(errors).length > 0)
  const last = errorsByStep.length - 1
  const doneSteps = errorsByStep.map((errors) => Object.keys(errors).length === 0)
  doneSteps[last] = firstInvalid < 0
  return {
    firstInvalid,
    unlocked: readOnly ? last : Math.max(furthest, firstInvalid < 0 ? last : firstInvalid),
    doneSteps,
  }
}

export function reviewField(label, value, required = false, error = '') {
  const hasValue = value !== null && value !== undefined && String(value).trim() !== ''
  return { label, value: hasValue ? value : '', hasValue, required, complete: hasValue && !error, error }
}

export function reviewCompletion(sections) {
  const required = sections.flatMap((section) => section.rows).filter((row) => row.required)
  return { complete: required.filter((row) => row.complete).length, total: required.length }
}
