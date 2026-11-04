import { INSIGHT_TEXT as T } from '../hrRecruitmentText.js'
import { daysBetween } from './hrFormat.js'

// Whole percent of `part` in `whole` (0 without a whole).
export const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)

// Days to a due date: overdue, today, soon (7 days) or later; null without a date.
export function dueSignal(today, iso) {
  const days = daysBetween(today, iso)
  if (days === null) return null
  if (days < 0) return { tone: 'bad', text: T.due.overdue(-days) }
  if (days === 0) return { tone: 'warn', text: T.due.today }
  return { tone: days <= 7 ? 'warn' : 'calm', text: T.due.inDays(days) }
}
