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

/** Legacy saves every evaluation with the 20 criteria of its form type (prf-new.js). */
export const CRITERIA_COUNT = 20;

/**
 * The legacy criteria were rendered by assets/prf-new.js, which is not in the legacy repository.
 * When no saved evaluation of a form type holds the full named set, fall back to the standard PAF
 * criteria (shared with the annual appraisal form) so a new evaluation still lists its criteria
 * instead of showing an empty Evaluation step.
 */
export const FALLBACK_CRITERIA = Object.freeze(
  [
    ['Quality / Accuracy of Work', 'جودة / دقة العمل'],
    ['Quantity of Work', 'كمية العمل'],
    ['Dependability', 'الإعتمادية'],
    ['Attendance / Punctuality', 'الحضور / الالتزام بالمواعيد'],
    [
      'Professional Communication Skills with co-workers/Supervisors',
      'مهارات الاتصال المهني مع زملاء العمل / المشرفين',
    ],
    ['Customer-focused Communication Skills', 'مهارات الاتصال التي تركز على العملاء'],
    [
      'Ability to work as a member of a team; teamwork',
      'القدرة على العمل كعضو في الفريق. العمل بروح الفريق الواحد',
    ],
    ['Demonstrates Positive Attitude', 'يوضح الموقف الإيجابي'],
    ['Ability to work independently', 'القدرة على العمل بشكل مستقل'],
    ['Open to feedback', 'يتقبل الملاحظات'],
    ['Willingness to take on additional responsibilities', 'الإستعداد لتحمل مسؤوليات إضافية'],
    ['Complies with company policies and procedures', 'يتوافق مع سياسات وإجراءات الشركة'],
    ['Exhibits effective problem solving skills', 'يظهر مهارات فعالة في حل المشاكل'],
    [
      'Eagerness to learn new-job related skills',
      'الرغبة في تعلم المهارات المتعلقة بالوظيفة الجديدة',
    ],
    ['Ask questions and seek guidance as needed', 'طرح الأسئلة وطلب التوجيه حسب الحاجة'],
    [
      'Makes progress towards professional development goals',
      'يحرز التقدم نحو أهداف التطوير المهني',
    ],
    ['Demonstrates Zamil Group Core Values', 'يظهر اهتمامه بالقيم الأساسية لمجموعة الزامل'],
    ['Initiative', 'مبادرة'],
    ['Developing Others', 'تطوير الآخرين'],
    ['Health, Safety & Environment (HSE)', 'بيئة صحية آمنة'],
  ].map(([param, paramAr]) => Object.freeze({ param, paramAr })),
);

/**
 * Statuses the legacy form lets the preparer change. Its workflow cannot be re-initialised while
 * INPROCESS or APPROVED (ProbationFlow::submit), so those records are read only here; a REJECTED
 * request is corrected and submitted again. The status itself is not changed by a save.
 */
export const EDITABLE_STATUSES = Object.freeze(['DRAFT', 'REJECTED']);
export const isEditable = (status) =>
  EDITABLE_STATUSES.includes(String(status ?? '').toUpperCase());

const blank = (value) =>
  value === undefined || value === null || String(value).trim() === '' || value === '-';

/**
 * Problems that block saving a saved evaluation again, and submitting it. The legacy edit form
 * (prf_uplines.php) required Comments (PREPARED_BY_CMNT), Suggestion (APPROVED_BY_CMNT) and a 1–5
 * rating on every criterion. The submit workflow itself is not built.
 */
export function submitProblems({ comment, comments, lines = [] }) {
  const problems = [];
  if (blank(comment)) {
    problems.push({ field: 'comment', message: 'Comments are required to submit' });
  }
  if (blank(comments)) {
    problems.push({ field: 'comments', message: 'Suggestion is required to submit' });
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
