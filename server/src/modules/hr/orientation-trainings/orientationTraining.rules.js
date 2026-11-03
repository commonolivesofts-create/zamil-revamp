// Orientation Training (New Hire Training, NHTF) rules taken from the legacy CI3 form
// (views/ZPIL/nht-new.php, models/Newhiretrain_model.php, controllers/Newhiretrain.php).

/** Legacy EMPLOYEE_TYPE: WORKER_CATEGORY Supervisor → Supervisor; Management/GM/VP → Manager. */
export const EMPLOYEE_TYPES = Object.freeze(['Supervisor', 'Manager', 'Employee']);
export const employeeType = (value) => (EMPLOYEE_TYPES.includes(value) ? value : 'Employee');

/** XX_DIGI_EMP_MASTER.DIVISION value the legacy list shows as "IPP BU"; any other is "FPP BU". */
export const IPP_DIVISION_ID = '300000003618177';
export const divisionName = (value) =>
  value === null || value === undefined || value === ''
    ? null
    : String(value) === IPP_DIVISION_ID
      ? 'IPP BU'
      : 'FPP BU';

/**
 * Legacy status values are stored in mixed case (Draft, INPROCESS, Approved, REJECTED, Rejected).
 * They read as the legacy list labels: Inprocess, Approved, Rejected, anything else Draft.
 */
export const STATUS_LABELS = Object.freeze(['Draft', 'Inprocess', 'Approved', 'Rejected']);
export function statusLabel(value) {
  const status = String(value ?? '')
    .trim()
    .toUpperCase();
  if (status === 'INPROCESS') return 'Inprocess';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return 'Rejected';
  return 'Draft';
}

/**
 * Legacy saves every request as Draft again (a rejected request is corrected and re-submitted).
 * A request in the workflow or approved is read only here: legacy reset those to Draft too, which
 * broke their workflow.
 */
export const isEditable = (value) => ['Draft', 'Rejected'].includes(statusLabel(value));

/** Orientation Days: legacy Math.ceil((to - from) / 1 day), so the same day is 0. */
export function orientationDays(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const days = Math.round(
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 864e5,
  );
  return days >= 0 ? days : null;
}

/** Time inputs use step="1": the stored value is HH:MM:SS. */
export const legacyTime = (value) => (value ? (value.length === 5 ? `${value}:00` : value) : null);

/** Orientation Time: legacy `${hours}.${minutes padded} Hrs` (1 h 30 min → "1.30 Hrs"). */
export function orientationPeriod(timeFrom, timeTo) {
  if (!timeFrom || !timeTo) return null;
  const minutes = (time) => {
    const [hours, mins] = time.split(':').map(Number);
    return hours * 60 + mins;
  };
  const total = minutes(timeTo) - minutes(timeFrom);
  if (total < 0) return null;
  return `${Math.floor(total / 60)}.${String(total % 60).padStart(2, '0')} Hrs`;
}

/** Legacy blank dates were stored as 01-JAN-70 (or the new app's 2000-01-01); both read as null. */
export const fromStoredDate = (value) =>
  !value || value === '1970-01-01' || value === '2000-01-01' ? null : value;

// NHT_Flow submit refuses these statuses ("Request is X. Cannot Re-initialize Workflow"); Draft and
// Rejected requests may be submitted (again).
const NOT_SUBMITTABLE = Object.freeze(['APPROVED', 'ACCEPTED', 'INPROCESS']);

/**
 * Problems that block submitting a saved orientation to the workflow (legacy submitWorkflow). Not
 * wired to a route: the shared workflow is not built yet. Legacy checks the status only; the saved
 * record already has its employee and From date (required on save).
 */
export function submitProblems(header) {
  if (!header?.headerId) {
    return [{ field: 'headerId', message: 'Save the orientation before submitting it' }];
  }
  const status = String(header.rawStatus ?? header.status ?? '').toUpperCase();
  return NOT_SUBMITTABLE.includes(status)
    ? [
        {
          field: 'status',
          message: `Request is ${header.rawStatus ?? header.status}. Cannot Re-initialize Workflow`,
        },
      ]
    : [];
}
