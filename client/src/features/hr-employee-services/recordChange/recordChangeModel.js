// Personnel Record Change (form 1110) business rules. Pure functions, no I/O:
// the page, the demo adapter and the tests use the same rules.
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

// Monthly pay items in form order (all SR per month).
export const PAY_KEYS = Object.freeze(['basic', 'house', 'transport', 'other', 'communication', 'car'])
// Coded values of the record that are chosen from a lookup.
export const CODE_KEYS = Object.freeze(['positionCode', 'gradeCode', 'levelCode', 'familyStatusCode'])
export const RECORD_KEYS = Object.freeze(['positionCode', ...PAY_KEYS, 'gradeCode', 'levelCode', 'familyStatusCode'])
export const RECORD_CHANGE_STATUSES = Object.freeze(['DRAFT', 'INPROCESS', 'SUBMITTED', 'APPROVED', 'REJECTED'])
// Status values the legacy table holds (XX_REC_CHANGE.STATUS); the change requests tabs.
export const LEGACY_RECORD_CHANGE_STATUSES = Object.freeze(['DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED'])
export const CHANGE_TYPES = Object.freeze(['POSITION', 'SALARY_INCREASE', 'SALARY_DECREASE', 'ALLOWANCE', 'GRADE_LEVEL', 'FAMILY_STATUS'])
// Remarks and views & suggestions.
export const TEXT_MAX = 2000
// An amount: 0 or more with up to two decimals.
export const AMOUNT = /^\d+(\.\d{1,2})?$/
// Legacy maxlength="7" on every revised amount.
export const AMOUNT_MAX_LENGTH = 7
// Grade and level (new only, optional free text; NEW_GRADE / NEW_LEVEL are VARCHAR2(50)).
export const GRADE_LEVEL_MAX = 50
export const FREE_TEXT_KEYS = Object.freeze(['gradeCode', 'levelCode'])

// Only a draft can be changed; a saved request in any other status is read only.
export const isRecordChangeLocked = (status) => Boolean(status) && status !== 'DRAFT'

// Legacy family status values: the datalist offers S / M, but the input accepted free text, so
// stored rows also hold Married, single, m, ... Read them as S or M; anything else as ''.
export function familyStatusCode(value) {
  const text = String(value ?? '').trim().toUpperCase()
  if (text === 'M' || text === 'MARRIED') return 'M'
  if (text === 'S' || text === 'SINGLE' || text === 'UNMARRIED') return 'S'
  return ''
}

// The legacy input filter (validateNumericInput: digits and dots only) and maxlength.
export const amountInput = (value) => String(value ?? '').replace(/[^\d.]/g, '').slice(0, AMOUNT_MAX_LENGTH)

const toCents = (value) => Math.round(Number(value) * 100)
const filled = (value) => value !== '' && value !== null && value !== undefined

// Total SR = basic + house + transport + other + communication + car.
export function recordTotal(record) {
  if (!record) return 0
  return PAY_KEYS.reduce((sum, key) => sum + (filled(record[key]) && AMOUNT.test(String(record[key])) ? toCents(record[key]) : 0), 0) / 100
}

// Difference of one amount: { amount, percent } (percent to one decimal, null
// when the current value is 0, so no percentage can be computed).
export function amountDelta(current, revised) {
  const amount = (toCents(revised) - toCents(current)) / 100
  const percent = Number(current) ? Math.round((amount / Number(current)) * 1000) / 10 : null
  return { amount, percent }
}

// The items whose revised value differs from the current one, in form order.
export function changedKeys(current, revised) {
  if (!current || !revised) return []
  return RECORD_KEYS.filter((key) => {
    if (!PAY_KEYS.includes(key)) return Boolean(revised[key]) && revised[key] !== current[key]
    return filled(revised[key]) && AMOUNT.test(String(revised[key])) && toCents(revised[key]) !== toCents(current[key])
  })
}

// The change types detected automatically from the changed items.
export function changeTypes(current, revised) {
  const types = new Set()
  for (const key of changedKeys(current, revised)) {
    if (key === 'positionCode') types.add('POSITION')
    else if (key === 'gradeCode' || key === 'levelCode') types.add('GRADE_LEVEL')
    else if (key === 'familyStatusCode') types.add('FAMILY_STATUS')
    else if (key === 'basic') types.add(toCents(revised.basic) > toCents(current.basic) ? 'SALARY_INCREASE' : 'SALARY_DECREASE')
    else types.add('ALLOWANCE')
  }
  return CHANGE_TYPES.filter((type) => types.has(type))
}

// A lower total is allowed but must be explained in the remarks (a reminder, not a block).
export const totalGoesDown = (current, revised) => Boolean(current && revised) && recordTotal(revised) < recordTotal(current)

export const blankRecordChange = (today) => ({ requestDate: today, effectiveDate: '', revised: null, currentFamilyStatus: '', remarks: '', views: '', attachments: [] })

// Legacy auto-fill on employee selection: the revised position and family status take the
// current ones; the revised amounts keep what the form holds (0 on a new form), grade and level
// too. Returns the new revised record.
export function revisedAfterPick(revised, current) {
  const kept = revised ?? {}
  return {
    ...Object.fromEntries(PAY_KEYS.map((key) => [key, filled(kept[key]) ? String(kept[key]) : '0'])),
    gradeCode: kept.gradeCode ?? '',
    levelCode: kept.levelCode ?? '',
    positionCode: current?.positionCode ?? '',
    positionName: current?.positionName ?? '',
    familyStatusCode: current?.familyStatusCode ?? '',
  }
}

// The effective date is before the employee's start date: a reminder only (legacy has no rule).
export const effectiveBeforeStart = (effectiveDate, employee) =>
  Boolean(effectiveDate && employee?.startDate && isIsoDate(effectiveDate) && effectiveDate < employee.startDate)

// Request body: only the requester's answers. The request number, status,
// requester, employee snapshot and current record are server values.
export function recordChangePayload(form, employee) {
  const revised = form.revised ?? {}
  return {
    employeeId: employee?.employeeId ?? null,
    effectiveDate: form.effectiveDate || null,
    revised: Object.fromEntries(RECORD_KEYS.map((key) => [key, PAY_KEYS.includes(key)
      ? (filled(revised[key]) && AMOUNT.test(String(revised[key])) ? toCents(revised[key]) / 100 : null)
      : (revised[key] || null)])),
    currentFamilyStatus: form.currentFamilyStatus ?? '',
    remarks: form.remarks,
    views: form.views,
    // File name and size only: the upload endpoint is stubbed (see the README).
    attachments: form.attachments.map(({ fileName, sizeBytes }) => ({ fileName, sizeBytes })),
  }
}

// Problems as { field, code } in step order: the legacy save rules (form.php `required`,
// maxlength and the numeric filter). Legacy has no "something must change" or start-date rule.
// Steps: 0 employee and effective date, 1 revised record, 2 remarks.
export function validateRecordChange(form, employee) {
  const problems = []
  const add = (field, code, step) => problems.push({ field, code, step })
  if (!employee) add('employee', 'required', 0)
  if (!form.effectiveDate) add('effectiveDate', 'required', 0)
  else if (!isIsoDate(form.effectiveDate)) add('effectiveDate', 'invalid', 0)
  if (form.currentFamilyStatus && !['S', 'M'].includes(form.currentFamilyStatus)) add('currentFamilyStatus', 'invalid', 0)
  const revised = form.revised
  if (employee && revised) {
    if (!revised.positionCode) add('positionCode', 'required', 1)
    if (!revised.familyStatusCode) add('familyStatusCode', 'required', 1)
    for (const key of PAY_KEYS) {
      if (!filled(revised[key])) add(key, 'required', 1)
      else if (String(revised[key]).length > AMOUNT_MAX_LENGTH || !AMOUNT.test(String(revised[key]))) add(key, 'amount', 1)
    }
    for (const key of FREE_TEXT_KEYS) {
      if (String(revised[key] ?? '').length > GRADE_LEVEL_MAX) add(key, 'tooLong', 1)
    }
  }
  if (form.remarks.length > TEXT_MAX) add('remarks', 'tooLong', 2)
  if (form.views.length > TEXT_MAX) add('views', 'tooLong', 2)
  return problems
}

// Counter state of a limited text: '', 'near' (over 90 %) or 'over'.
export const counterState = (length, max = TEXT_MAX) => (length > max ? 'over' : length > max * 0.9 ? 'near' : '')

// Approval route after submission: noted by the HR & Admin. Manager, then
// approved by the President (states: shared/approvals.js).
export const RECORD_CHANGE_ROUTE = Object.freeze(['NOTED_BY', 'APPROVED_BY'])

// Statuses legacy Rec_flow::submit refuses ("Cannot Re-initialize Workflow"); DRAFT and REJECTED
// may be submitted (again).
const NOT_SUBMITTABLE = Object.freeze(['APPROVED', 'ACCEPTED', 'INPROCESS'])

// Problems that block submitting a saved request, as { field, code } (same rules as the server's
// submitProblems). Not wired to a button: the shared approval workflow is not built yet.
export function validateRecordChangeForSubmit(record) {
  if (!record?.requestId) return [{ field: 'requestId', code: 'notSaved' }]
  const problems = []
  const add = (field, code) => problems.push({ field, code })
  if (NOT_SUBMITTABLE.includes(String(record.status ?? '').toUpperCase())) add('status', 'notSubmittable')
  if (!record.employee) add('employee', 'required')
  if (!record.effectiveDate) add('effectiveDate', 'required')
  const revised = record.revised ?? {}
  if (!revised.positionCode) add('positionCode', 'required')
  for (const key of PAY_KEYS) if (!filled(revised[key])) add(key, 'required')
  if (!['S', 'M'].includes(revised.familyStatusCode)) add('familyStatusCode', 'required')
  return problems
}
