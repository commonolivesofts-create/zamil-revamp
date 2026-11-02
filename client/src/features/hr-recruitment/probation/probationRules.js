// Rules of the live Probation Evaluation form (1064), taken from the legacy CI3 form:
// the result band of the total rating and the fields required to submit.
import { resultFor } from './probationModel.js'

export const RESULT_TEXT = Object.freeze({ ACCEPTABLE: 'Acceptable', NOT_ACCEPTABLE: 'Not acceptable' })
export const RESULT_TONE = Object.freeze({ ACCEPTABLE: 'ok', NOT_ACCEPTABLE: 'warn' })

// Legacy band of the total rating: 71–100 Acceptable, 0–70 Not acceptable.
export const evaluationResult = (total) => resultFor(Number(total) || 0)

export const totalRating = (lines) => lines.reduce((sum, line) => sum + (Number(line.rating) || 0), 0)

// The result shows once a criterion is rated (an unrated form has no result yet).
export function formResult(lines) {
  if (!lines.some((line) => line.rating !== '' && line.rating != null)) return null
  return evaluationResult(totalRating(lines))
}

const blank = (value) => !String(value ?? '').trim()

// Errors that block submitting (draft saves stay lenient): Comments, Suggestion and a 1–5 rating
// on every criterion, as the legacy edit form required. Ready for the workflow; no Submit yet.
export function validateForSubmit(form) {
  const errors = {}
  if (blank(form.comment)) errors.comment = 'Comments are required to submit.'
  if (blank(form.comments)) errors.comments = 'Suggestion is required to submit.'
  if (!form.lines.length) errors.lines = 'Add at least one criterion.'
  form.lines.forEach((line, index) => {
    const rating = Number(line.rating)
    if (line.rating === '' || !Number.isInteger(rating) || rating < 1 || rating > 5) errors[`rating:${index}`] = 'Rate this criterion from 1 to 5.'
  })
  return { errors, valid: Object.keys(errors).length === 0 }
}
