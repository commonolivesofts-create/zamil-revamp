// Step gating for the employee services forms: the first unfinished step stays
// open, every later step is locked until the steps before it are complete
// (mirrors the personnel requisition's locked step track).
export function lockedStepsOf(doneSteps) {
  const firstOpen = doneSteps.findIndex((done) => !done)
  const unlocked = firstOpen < 0 ? doneSteps.length - 1 : firstOpen
  return doneSteps.map((_, index) => index > unlocked)
}

// Shown when Continue is pressed on a step whose completion rules (ticked
// items, a saved record, a real change) are not met yet.
export const INCOMPLETE_STEP = 'Complete this step before moving on.'

// The problems of one step only, so pressing Continue shows the messages of the
// open step without painting errors on steps the user cannot reach yet.
export const problemsInStep = (problems, step) => problems.filter((problem) => problem.step === step)

export const errorsInStep = (errors, stepOf, step) =>
  // `stepOf` is either a field → step map or a (field) → step function.
  Object.fromEntries(Object.entries(errors).filter(([field]) => {
    const fieldStep = typeof stepOf === 'function' ? stepOf(field) : stepOf[field]
    return (fieldStep ?? 0) === step
  }))
