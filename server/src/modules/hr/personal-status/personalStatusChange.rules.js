// Personal Status Change (Personnel Record Change, form 1110) rules taken from the legacy CI3
// form (views/Rec_change/form.php, models/Rec_change_model.php, controllers/Rec_flow.php).
import { BUSINESS_TIME_ZONE } from '../../auth/auth.policy.js';

/** The six monthly pay items, in form order; Total SR is their sum. */
export const PAY_FIELDS = Object.freeze([
  'basicSal',
  'houseAll',
  'transAll',
  'otherAll',
  'communAll',
  'carAll',
]);

/** Family status options of the legacy datalist (Single / Married). */
export const MARITAL_STATUSES = Object.freeze(['S', 'M']);

/** Status values stored by legacy (upper case; Rec_flow writes INPROCESS/APPROVED/REJECTED). */
export const STATUSES = Object.freeze(['DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED']);

/** Legacy maxlength="7" on every revised amount. */
export const AMOUNT_MAX_LENGTH = 7;

/** Today's business date (Asia/Riyadh) as YYYY-MM-DD; legacy used the server's date('Y-m-d'). */
export const businessToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/**
 * ARB_DATE: the Hijri date shown beside the form date (التاريخ), in the legacy browser format
 * `Intl.DateTimeFormat('ar-TN-u-ca-islamic', { day, month, weekday: 'long', year })`.
 */
export const hijriDate = (isoDate) =>
  new Intl.DateTimeFormat('ar-TN-u-ca-islamic', {
    day: 'numeric',
    month: 'numeric',
    weekday: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T12:00:00Z`));

/** REF_NO: legacy sprintf("%04d", HEADER_ID) . '-' . SECTION. */
export const referenceNumber = (headerId, section) =>
  `${String(headerId).padStart(4, '0')}-${section ?? ''}`;

/** Total SR, summed in cents (legacy: sum of the six items, toFixed(2)). */
export const payTotal = (values) =>
  PAY_FIELDS.reduce((sum, field) => sum + Math.round(Number(values[field] ?? 0) * 100), 0) / 100;

const blank = (value) => value === null || value === undefined || String(value).trim() === '';

// Rec_flow::submit refuses these statuses ("Cannot Re-initialize Workflow"); DRAFT and REJECTED
// requests may be submitted (again).
const NOT_SUBMITTABLE = Object.freeze(['APPROVED', 'ACCEPTED', 'INPROCESS']);

/**
 * Problems that block submitting a saved request to the approval workflow. Not wired to a route:
 * the shared workflow is not built yet. Rules:
 * - the request must be saved (legacy shows Submit only for a stored record);
 * - its status must not be INPROCESS, APPROVED or ACCEPTED (any case);
 * - the fields the legacy form marks required on save must be present: employee, effective date,
 *   revised position, the six revised amounts and the revised family status.
 */
export function submitProblems(record) {
  const problems = [];
  const add = (field, message) => problems.push({ field, message });
  if (!record || blank(record.headerId)) {
    add('headerId', 'Save the request before submitting it');
    return problems;
  }
  const status = String(record.status ?? '').toUpperCase();
  if (NOT_SUBMITTABLE.includes(status)) {
    add('status', `Request is ${status}. Cannot re-initialize workflow`);
  }
  if (blank(record.empNo)) add('empNo', 'Employee is required');
  if (blank(record.effectiveDate)) add('effectiveDate', 'Effective date is required');
  const revised = record.new ?? {};
  if (blank(revised.position)) add('new.position', 'Revised position is required');
  for (const field of PAY_FIELDS) {
    if (blank(revised[field])) add(`new.${field}`, 'Revised amount is required');
  }
  if (!MARITAL_STATUSES.includes(revised.maritalStatus)) {
    add('new.maritalStatus', 'Revised family status is required');
  }
  return problems;
}
