import { enDate, isIsoDate } from '../shared/hrFormat.js'
import { reviewField } from '../shared/recruitmentSteps.js'
import { orientationDays, orientationPeriod } from './orientationLegacy.js'

export const blankOrientation = () => ({ employee: null, flag: '', fromOrient: '', lines: [] })
// Copy the orientation date into new/untouched department dates, while leaving
// dates that were deliberately changed on an individual session alone.
export function inheritOrientationDates(lines, fromOrient, previousFromOrient = '') {
  return lines.map((line) => ({
    ...line,
    fromDate: !line.fromDate || line.fromDate === previousFromOrient ? fromOrient : line.fromDate,
    toDate: !line.toDate || line.toDate === previousFromOrient ? fromOrient : line.toDate,
  }))
}
export const orientationFormFromRecord = (record) => ({
  employee: record.employee, flag: record.flag, fromOrient: record.fromDate,
  lines: record.lines.map((line) => ({ ...line, remarks: line.remarks ?? '' })),
})
const labels = { department: 'Training', departmentHead: 'Department head', fromDate: 'From date', toDate: 'To date', timeFrom: 'Time from', timeTo: 'Time to', remarks: 'Remark' }
export const orientationLineKey = (index, field) => `line:${index}:${field}`
export function orientationValidationFields(lines) {
  const fields = {
    empNo: { key: 'employee', step: 0, label: 'Employee', fields: ['employee.employeeNumber'] },
    fromOrient: { key: 'fromOrient', step: 0, label: 'From date' },
    lines: { key: 'lines', step: 1, label: 'Training rows' },
  }
  lines.forEach((_, index) => Object.entries(labels).forEach(([field, label]) => {
    fields[`lines.${index}.${field}`] = { key: orientationLineKey(index, field), step: 1, label, fields: [`lines.${index}.${field}`] }
  }))
  return fields
}
const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
const seconds = (value) => {
  const [hours, mins, secs = '0'] = value.split(':')
  return Number(hours) * 3600 + Number(mins) * 60 + Number(secs)
}
const hasDateRange = (line) => isIsoDate(line.fromDate) && isIsoDate(line.toDate) && line.toDate >= line.fromDate
const hasTimeRange = (line) => validTime(line.timeFrom) && validTime(line.timeTo) && seconds(line.timeTo) > seconds(line.timeFrom)

// Session fields remain optional. Check provided values, row order and
// cross-row time clashes; a blank session must not block a legacy draft.
export function orientationStepErrors(form, { setupLoading = false, setupError = '' } = {}) {
  const employee = {}
  const sessions = {}
  if (!form.employee?.employeeNumber) employee.employee = 'Select an employee.'
  else if (setupLoading) employee.employee = 'Wait for the employee details to finish loading.'
  else if (setupError) employee.employee = setupError
  else if (!form.lines.length) employee.employee = 'Select an employee to load the training rows.'
  if (!form.fromOrient) employee.fromOrient = 'From date is required.'
  else if (!isIsoDate(form.fromOrient)) employee.fromOrient = 'Enter a valid From date.'
  form.lines.forEach((line, index) => {
    const fail = (field, message) => { sessions[orientationLineKey(index, field)] = message }
    if (!line.department?.trim()) fail('department', 'The training name is missing. Reload the employee details.')
    if ((line.departmentHead?.length || 0) > 1000) fail('departmentHead', 'Department head must be 1000 characters or fewer.')
    for (const field of ['fromDate', 'toDate']) {
      if (line[field] && !isIsoDate(line[field])) fail(field, 'Enter a valid date.')
    }
    if (isIsoDate(line.fromDate) && isIsoDate(line.toDate) && line.toDate < line.fromDate) fail('toDate', 'To date must be on or after From date.')
    for (const field of ['timeFrom', 'timeTo']) {
      if (line[field] && !validTime(line[field])) fail(field, 'Enter a valid time.')
    }
    if (validTime(line.timeFrom) && validTime(line.timeTo) && seconds(line.timeTo) < seconds(line.timeFrom)) fail('timeTo', 'Time to must be on or after Time from.')
    if ((line.remarks?.length || 0) > 1000) fail('remarks', 'Remark must be 1000 characters or fewer.')
  })
  for (let firstIndex = 0; firstIndex < form.lines.length; firstIndex += 1) {
    const first = form.lines[firstIndex]
    if (!hasDateRange(first) || !hasTimeRange(first)) continue
    for (let secondIndex = firstIndex + 1; secondIndex < form.lines.length; secondIndex += 1) {
      const second = form.lines[secondIndex]
      if (!hasDateRange(second) || !hasTimeRange(second)) continue
      const datesOverlap = first.fromDate <= second.toDate && second.fromDate <= first.toDate
      const timesOverlap = seconds(first.timeFrom) < seconds(second.timeTo) && seconds(second.timeFrom) < seconds(first.timeTo)
      if (datesOverlap && timesOverlap) {
        sessions[orientationLineKey(secondIndex, 'timeFrom')] = `This time overlaps with ${first.department}. Choose another time for this date.`
      }
    }
  }
  return [employee, sessions, {}, {}]
}
const date = (value) => isIsoDate(value) ? enDate(value) : value
export function orientationReviewSections(form, record, errors = {}) {
  const employee = form.employee
  return [
    { title: 'Employee details', rows: [
      reviewField('Employee name', employee?.name, true, errors.employee),
      reviewField('Employee number', employee?.employeeNumber),
      reviewField('Position', employee?.position), reviewField('Section', employee?.section),
      reviewField('Division', employee?.divisionName || employee?.division), reviewField('Type', employee?.employmentType),
      reviewField('Start date', date(employee?.startDate)),
    ] },
    { title: 'Orientation schedule', rows: [
      reviewField('From', date(form.fromOrient), true, errors.fromOrient),
      reviewField('To (same as From)', date(form.fromOrient)),
      reviewField('Scheduled by', record?.scheduledByName),
      reviewField('Training rows', form.lines.length || '', true, errors.lines),
    ] },
    ...form.lines.map((line, index) => {
      const field = (label, key) => reviewField(label, ['fromDate', 'toDate'].includes(key) ? date(line[key]) : line[key], false, errors[orientationLineKey(index, key)])
      return { title: `${index + 1}. ${line.department}`, rows: [
        reviewField('Training name', line.department, true, errors[orientationLineKey(index, 'department')]),
        field('Department head', 'departmentHead'), field('From date', 'fromDate'), field('To date', 'toDate'),
        reviewField('Orientation days', isIsoDate(line.fromDate) && isIsoDate(line.toDate) ? orientationDays(line.fromDate, line.toDate) : ''),
        field('Time from', 'timeFrom'), field('Time to', 'timeTo'),
        reviewField('Orientation time', validTime(line.timeFrom) && validTime(line.timeTo) ? orientationPeriod(line.timeFrom, line.timeTo) : ''),
        field('Remark', 'remarks'),
      ] }
    }),
  ]
}
