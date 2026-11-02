// Probation Evaluation (1064) business rules taken from the legacy CI3 form.

/** Legacy result band of TOTAL_RATING: 71–100 Acceptable, 0–70 Not acceptable. */
export const PASS_MARK = 71;

export const evaluationResult = (totalRating) =>
  Number(totalRating) >= PASS_MARK ? 'ACCEPTABLE' : 'NOT_ACCEPTABLE';

/**
 * Legacy stored '01-JAN-00' (2000-01-01) for a blank date. FORM_DATE holds the joining date and is
 * optional, so a blank one is written as this value and read back as null.
 */
export const BLANK_DATE = '2000-01-01';
export const toStoredDate = (value) => value || BLANK_DATE;
export const fromStoredDate = (value) => (!value || value === BLANK_DATE ? null : value);

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
