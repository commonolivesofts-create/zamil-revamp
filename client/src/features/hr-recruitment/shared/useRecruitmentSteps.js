import { useState } from 'react'
import { recruitmentStepProgress } from './recruitmentSteps.js'

export function useRecruitmentSteps({ step, setStep, errorsByStep, reject, readOnly = false }) {
  const [furthest, setFurthest] = useState(0)
  const [attemptedThrough, setAttemptedThrough] = useState(-1)
  const progress = recruitmentStepProgress(errorsByStep, furthest, readOnly)
  if (progress.unlocked > furthest) setFurthest(progress.unlocked)
  if (step > progress.unlocked) setStep(progress.unlocked)

  const validateStep = () => {
    setAttemptedThrough((current) => Math.max(current, step))
    if (!Object.keys(errorsByStep[step]).length) return true
    reject(step)
    return false
  }
  const validateAll = () => {
    setAttemptedThrough(errorsByStep.length - 1)
    if (progress.firstInvalid < 0) return true
    reject(progress.firstInvalid)
    return false
  }
  return {
    ...progress,
    errors: Object.assign({}, ...errorsByStep.slice(0, attemptedThrough + 1)),
    lockedSteps: errorsByStep.map((_, index) => index > progress.unlocked),
    validateStep,
    validateAll,
  }
}
