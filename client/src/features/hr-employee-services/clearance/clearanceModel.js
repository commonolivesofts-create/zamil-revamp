// Employee Clearance (form 1063, legacy "Emp Clearance") business rules. Pure
// functions, no I/O: the page and the tests use the same rules. The legacy
// screens are views/ZPIL/empclearance.php (create) and
// views/update/empClearance.php (edit); the server rules are
// employee_clearance_validation.js and employee_clearance_service.js.
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

export const CONTACT_MAX = 100
export const PURPOSE_MAX = 1000
export const NAME_MAX = 500
export const COMMENTS_MAX = 2000

// The five IT access rows, in legacy order (the server stores the subject text).
export const IT_SUBJECTS = Object.freeze(['Email:', 'Oracle Access:', 'Tel. Extension:', 'Computer Data:', 'Domain User:'])

// The seven actions of each IT row, as the server stores them ('disabled untill' sic).
export const DISABLED_UNTIL = 'disabled untill'
export const IT_ACTIONS = Object.freeze([
  { value: 'delete', label: 'Delete', tone: 'bad' },
  { value: 'no action', label: 'No Action', tone: 'ok' },
  { value: 'remote access', label: 'Remote Access', tone: 'warn' },
  { value: 'copy give to', label: 'Copy Give to', tone: 'warn' },
  { value: 'forward copy to', label: 'Forward copy to', tone: 'warn' },
  { value: 'cisco jaber', label: 'CISCO JABER', tone: 'warn' },
  { value: DISABLED_UNTIL, label: 'Disabled Untill', tone: 'warn' },
])

// The signature choices of every legacy signature select ('' = not signed).
export const SIGNATURES = Object.freeze(['', 'Approved', 'Rejected', 'Hold'])

// The five clearance tabs: the items to return (server codes, legacy labels)
// and the extra fields of each tab. Admin has no cost; it has the visa expiry
// and the approval date instead.
export const SECTIONS = Object.freeze([
  {
    key: 'employeeDept', label: 'Emp Department', lookup: 'department', items: [
      ['files', 'Files'], ['tools', 'Tools'], ['instruments', 'Instruments'], ['book_manuals', 'Book Manuals'], ['manuals', 'Manuals'],
      ['office_keys', 'Office Keys'], ['documents', 'Documents'], ['locker_keys', 'Locker keys'], ['safety_items', 'Safety Items'],
      ['vehicle', 'Vehicle'], ['office_stationary', 'Office Stationary'], ['others', 'Others'],
    ],
  },
  { key: 'quality', label: 'Quality', lookup: 'quality', items: [['uniform', 'Uniform'], ['knife', 'Knife'], ['documents', 'Documents'], ['others', 'Others']] },
  { key: 'warehouse', label: 'Warehouse', lookup: 'warehouse', items: [['tools', 'Tools'], ['others', 'Others']] },
  { key: 'accounts', label: 'Accounts', lookup: 'accounts', items: [['loans', 'Loans'], ['others', 'Others']] },
  {
    key: 'admin', label: 'Admin', lookup: 'admin', items: [
      ['iqama', 'Iqama'], ['id_cards', 'Id Cards'], ['bank_loan', 'Bank Loan'], ['driving_license', 'Driving License'], ['gurantor', 'Gurantor'],
      ['mobile_chip', 'Mobile Chip'], ['medical_cards', 'Medical Cards'], ['door_attendance', 'Door Attendance'], ['others', 'Others'],
    ],
  },
].map((section) => Object.freeze({ ...section, items: Object.freeze(section.items.map(([code, label]) => Object.freeze({ code, label }))) })))
export const SECTION_KEYS = Object.freeze(SECTIONS.map((section) => section.key))
export const hasCost = (key) => key !== 'admin'

export const blankSection = (key, approver = '') => ({
  items: [], comments: '', ...(hasCost(key) ? { cost: '' } : {}), approver, signature: '',
  ...(key === 'admin' ? { appDate: '', visaExpiry: '' } : {}),
})

export const blankClearance = () => ({
  employee: null, contact: '', purpose: '', vacationFrom: '', vacationTo: '',
  departmentManager: { name: '', date: '', signature: '' },
  itManager: { name: '', date: '', signature: '' },
  computerReceivedBy: '', computerSignature: '',
  itMatrix: IT_SUBJECTS.map(() => ({ action: '', accessTo: '' })),
  sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, blankSection(key)])),
})

// Legacy: the access-to input is a date for "Disabled Untill" and a person's
// name for any other action, so changing between the two kinds clears it.
export function withItAction(row, action) {
  const kind = (value) => (value === DISABLED_UNTIL ? 'date' : 'name')
  return { action, accessTo: row.action && kind(row.action) !== kind(action) ? '' : row.accessTo }
}

// The approver shown on each tab: the employee's direct manager on Emp
// Department, the first name of the section's approver lookup on the others
// (the legacy getQltyManager / getWahoManager / getAccManager / getAdminManager
// return a single row).
export function sectionApprovers(employee, approvers) {
  return Object.fromEntries(SECTIONS.map((section) => [
    section.key,
    section.key === 'employeeDept' ? employee?.directManager ?? '' : approvers[section.lookup]?.[0]?.name ?? '',
  ]))
}

// A department manager the server can resolve: the name must match exactly one lookup row.
export function managerMatches(managers, name) {
  return managers.filter((item) => item.name === name)
}

const tooLong = (value, max) => String(value ?? '').trim().length > max

// Problems as { field, message, step } in step order (0 employee, 1 IT
// access, 2 sign-off, 3 clearance tabs). Mirrors the server's write schema.
export function validateClearance(form, { managers = [], destinations = [] } = {}) {
  const problems = []
  const add = (field, message, step) => problems.push({ field, message, step })

  if (!form.employee) add('employee', 'Choose the employee.', 0)
  if (form.vacationFrom && !isIsoDate(form.vacationFrom)) add('vacationFrom', 'Enter a valid date.', 0)
  if (form.vacationTo && !isIsoDate(form.vacationTo)) add('vacationTo', 'Enter a valid date.', 0)
  else if (form.vacationFrom && form.vacationTo && form.vacationTo < form.vacationFrom) add('vacationTo', 'Vacation end cannot be before vacation start.', 0)
  if (!form.contact.trim()) add('contact', 'Contact # is required.', 0)
  else if (tooLong(form.contact, CONTACT_MAX)) add('contact', `Keep the contact within ${CONTACT_MAX} characters.`, 0)
  if (!form.purpose.trim()) add('purpose', 'Purpose of clearance is required.', 0)
  else if (tooLong(form.purpose, PURPOSE_MAX)) add('purpose', `Keep the purpose within ${PURPOSE_MAX} characters.`, 0)

  form.itMatrix.forEach((row, index) => {
    const field = `it:${index}`
    if (!row.action) add(field, `Choose an action for ${IT_SUBJECTS[index].replace(':', '')}.`, 1)
    else if (row.action === DISABLED_UNTIL && !isIsoDate(row.accessTo)) add(field, 'Disabled Untill needs a date.', 1)
    else if (row.action !== DISABLED_UNTIL && /^\d{4}-\d{2}-\d{2}$/.test(row.accessTo.trim())) add(field, 'Enter a name, not a date, for this action.', 1)
    else if (tooLong(row.accessTo, NAME_MAX)) add(field, `Keep this within ${NAME_MAX} characters.`, 1)
  })

  const manager = form.departmentManager.name
  if (!manager.trim()) add('departmentManager', 'Choose the department manager.', 2)
  else if (managerMatches(managers, manager).length === 0) add('departmentManager', 'Choose the department manager from the list.', 2)
  else if (managerMatches(managers, manager).length > 1) add('departmentManager', 'Two managers share this name; the server cannot tell them apart. Contact HR.', 2)
  for (const key of ['departmentManager', 'itManager']) {
    const date = form[key].date
    if (date && !isIsoDate(date)) add(`${key}Date`, 'Enter a valid date.', 2)
  }
  if (tooLong(form.itManager.name, NAME_MAX)) add('itManager', `Keep the name within ${NAME_MAX} characters.`, 2)
  if (!form.computerReceivedBy) add('computerReceivedBy', 'Choose who receives the computer / laptop.', 2)
  else if (destinations.length && !destinations.some((item) => item.value === form.computerReceivedBy)) {
    add('computerReceivedBy', 'Choose the receiver from the list.', 2)
  }

  for (const section of SECTIONS) {
    const value = form.sections[section.key]
    if (tooLong(value.comments, COMMENTS_MAX)) add(`${section.key}:comments`, `Keep the comments within ${COMMENTS_MAX} characters.`, 3)
    if (hasCost(section.key) && value.cost !== '' && !(Number(value.cost) >= 0)) add(`${section.key}:cost`, 'Enter a cost of 0 or more.', 3)
    if (section.key === 'admin') {
      if (value.appDate && !isIsoDate(value.appDate)) add('admin:appDate', 'Enter a valid date.', 3)
      if (value.visaExpiry && !isIsoDate(value.visaExpiry)) add('admin:visaExpiry', 'Enter a valid date.', 3)
    }
  }
  return problems
}

// Items ticked per tab and in total (side card and step hint).
export function returnedCount(sections) {
  return SECTION_KEYS.reduce((total, key) => total + (sections[key]?.items.length ?? 0), 0)
}
