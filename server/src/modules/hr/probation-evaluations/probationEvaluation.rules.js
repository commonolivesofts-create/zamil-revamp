// Probation Evaluation (1064) business rules taken from the legacy CI3 form.

/** Legacy result band of TOTAL_RATING: 71–100 Acceptable, 0–70 Not acceptable. */
export const PASS_MARK = 71;

export const evaluationResult = (totalRating) =>
  Number(totalRating) >= PASS_MARK ? 'ACCEPTABLE' : 'NOT_ACCEPTABLE';

/** TOTAL_RATING is always the sum of the line ratings (0 = not rated); a client total is ignored. */
export const ratingTotal = (lines) =>
  lines.reduce((sum, line) => sum + (Number(line.rating) || 0), 0);

/**
 * FORM_DATE holds the joining date and is optional. The column is nullable (verified in the TEST
 * dictionary), so a blank date is stored as NULL. Legacy wrote '01-JAN-00' (2000-01-01) instead;
 * both read back as null.
 */
export const LEGACY_BLANK_DATE = '2000-01-01';
export const toStoredDate = (value) => value || null;
export const fromStoredDate = (value) => (!value || value === LEGACY_BLANK_DATE ? null : value);

const blank = (value) =>
  value === undefined || value === null || String(value).trim() === '' || value === '-';

/**
 * Problems that block submitting an evaluation (draft saves stay lenient). The legacy edit form
 * required Comments (PREPARED_BY_CMNT), Suggestion (APPROVED_BY_CMNT) and a 1–5 rating on every
 * criterion. Not wired to a route yet: the submit workflow does not exist.
 */
export function submitProblems({ comment, comments, lines = [] }) {
  const problems = [];
  if (blank(comment)) {
    problems.push({ field: 'comment', message: 'Comments are required to submit' });
  }
  if (blank(comments)) {
    problems.push({ field: 'comments', message: 'Suggestion is required to submit' });
  }
  if (!lines.length) {
    problems.push({ field: 'lines', message: 'At least one criterion is required' });
  }
  lines.forEach((line, index) => {
    const rating = Number(line.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      problems.push({
        field: `lines.${index}.rating`,
        message: 'Every criterion needs a 1–5 rating',
      });
    }
  });
  return problems;
}
