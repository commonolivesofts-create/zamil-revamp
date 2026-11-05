import test from 'node:test'
import assert from 'node:assert/strict'
import { blankOrientation, orientationFormFromRecord, orientationReviewSections, orientationStepErrors, orientationValidationFields } from '../src/features/hr-recruitment/orientation/orientationForm.js'
import { blankProbation, probationFormFromRecord, probationReviewSections, probationStepErrors, probationValidationFields } from '../src/features/hr-recruitment/probation/probationForm.js'
import { activeRecruitmentErrors, recruitmentValidation } from '../src/features/hr-recruitment/shared/recruitmentFieldErrors.js'
import { recruitmentStepProgress, reviewCompletion } from '../src/features/hr-recruitment/shared/recruitmentSteps.js'

const employee = { name: 'Sample Employee', employeeNumber: 'E001', startDate: '2026-08-01', position: 'Sample Position', departmentName: 'Sample Department' }
const session = () => ({ department: 'Training with HR Dept', departmentHead: '', fromDate: '', toDate: '', timeFrom: '', timeTo: '', remarks: '' })
const orientation = () => ({ ...blankOrientation(), employee, fromOrient: '2026-11-04', lines: [session(), { ...session(), department: 'Training with IT Dept' }] })
const probation = () => ({ ...blankProbation(), employee, formType: 'Trainee', formDate: employee.startDate, fromDate: '2026-08-01', toDate: '2026-10-31', lines: Array.from({ length: 20 }, (_, index) => ({ param: `Criterion ${index + 1}`, paramAr: '', rating: '' })) })
const firstInvalid = (errors) => recruitmentStepProgress(errors).firstInvalid

test('orientation unlocks from valid employee setup and From without requiring optional session fields', () => {
  assert.equal(firstInvalid(orientationStepErrors(blankOrientation())), 0)
  assert.equal(firstInvalid(orientationStepErrors(orientation())), -1)
  assert.equal(recruitmentStepProgress(orientationStepErrors(orientation())).unlocked, 3)
  assert.equal(firstInvalid(orientationStepErrors({ ...orientation(), lines: [] })), 0)
  assert.match(orientationStepErrors(orientation(), { setupLoading: true })[0].employee, /finish loading/)
  assert.equal(orientationStepErrors(orientation(), { setupError: 'Setup failed' })[0].employee, 'Setup failed')
})

test('orientation locates optional date and time mistakes on the exact row and allows same-day sessions', () => {
  const form = orientation()
  form.lines[0] = { ...session(), fromDate: '2026-11-05', toDate: '2026-11-04', timeFrom: '11:30:00', timeTo: '10:30:00' }
  const errors = orientationStepErrors(form)
  assert.equal(firstInvalid(errors), 1)
  assert.deepEqual(Object.keys(errors[1]), ['line:0:toDate', 'line:0:timeTo'])
  form.lines[0].toDate = '2026-11-05'
  form.lines[0].timeTo = '11:30:00'
  assert.equal(firstInvalid(orientationStepErrors(form)), -1)
  const rows = orientationReviewSections(form, null)[2].rows
  assert.equal(rows.find((row) => row.label === 'Orientation days').value, 0)
  assert.equal(rows.find((row) => row.label === 'Orientation time').value, '0.00 Hrs')
  form.lines[1].fromDate = '2026-02-30'
  form.lines[1].timeFrom = '24:01'
  form.lines[1].remarks = 'a'.repeat(1001)
  assert.deepEqual(Object.keys(orientationStepErrors(form)[1]), ['line:1:fromDate', 'line:1:timeFrom', 'line:1:remarks'])
})

test('orientation review includes employee, derived To, each session field and a truthful required count', () => {
  const form = orientation()
  form.lines[0] = { ...session(), departmentHead: 'Sample Manager', fromDate: '2026-11-04', toDate: '2026-11-05', timeFrom: '09:00:00', timeTo: '10:30:00', remarks: 'Bring ID' }
  const snapshot = structuredClone(form)
  const sections = orientationReviewSections(form, { scheduledByName: 'Sample Scheduler' })
  assert.equal(sections.length, 4)
  assert.deepEqual(reviewCompletion(sections), { complete: 5, total: 5 })
  const schedule = sections[1].rows
  assert.equal(schedule.find((row) => row.label.startsWith('To')).value, schedule.find((row) => row.label === 'From').value)
  const sessionRows = sections[2].rows
  for (const value of ['Sample Manager', '09:00:00', '10:30:00', '1.30 Hrs', 'Bring ID']) assert.ok(sessionRows.some((row) => row.value === value))
  assert.ok(sections[3].rows.some((row) => !row.required && !row.hasValue))
  assert.deepEqual(form, snapshot)
})

test('probation first save allows blank points and comments; editing requires all points then both comments', () => {
  const form = probation()
  assert.equal(firstInvalid(probationStepErrors(form)), -1)
  const saved = { saved: true }
  assert.equal(firstInvalid(probationStepErrors(form, saved)), 1)
  assert.equal(Object.keys(probationStepErrors(form, saved)[1]).length, 20)
  form.lines.forEach((line) => { line.rating = '4' })
  assert.equal(firstInvalid(probationStepErrors(form, saved)), 2)
  form.comment = 'Good progress'
  form.comments = 'Continue development'
  assert.equal(firstInvalid(probationStepErrors(form, saved)), -1)
  // Legacy saved headers are read only: a missing old header date is not a new requirement.
  form.fromDate = ''
  form.formDate = ''
  assert.equal(firstInvalid(probationStepErrors(form, saved)), -1)
})

test('probation blocks dependent lookup failures, invalid dates and provided points outside the legacy scale', () => {
  const form = probation()
  for (const status of ['loading', 'error']) {
    assert.equal(firstInvalid(probationStepErrors(form, { employeeStatus: status })), 0)
    assert.equal(firstInvalid(probationStepErrors(form, { criteriaStatus: status })), 0)
  }
  form.formDate = '2026-02-30'
  assert.ok(probationStepErrors(form)[0].formDate)
  form.formDate = ''
  form.toDate = '2026-07-31'
  assert.ok(probationStepErrors(form)[0].toDate)
  form.toDate = '2026-10-31'
  for (const rating of ['0', '6', '3.5', 'bad']) {
    form.lines[0].rating = rating
    assert.equal(firstInvalid(probationStepErrors(form)), 1)
  }
  form.lines[0].rating = ''
  assert.equal(firstInvalid(probationStepErrors(form)), -1)
})

test('probation review shows the real saved values and separates missing points from the computed result', () => {
  const form = probation()
  assert.deepEqual(reviewCompletion(probationReviewSections(form, null, {})), { complete: 4, total: 4 })
  const record = { ...form, status: 'DRAFT', preparedBy: 'Sample Appraiser' }
  let sections = probationReviewSections(form, record, {})
  assert.deepEqual(reviewCompletion(sections), { complete: 0, total: 22 })
  form.lines.forEach((line) => { line.rating = '4' })
  form.comment = 'Good progress'
  form.comments = 'Continue development'
  sections = probationReviewSections(form, { ...record, status: 'APPROVED' }, {})
  assert.deepEqual(reviewCompletion(sections), { complete: 22, total: 22 })
  const summary = sections[2].rows
  assert.equal(summary.find((row) => row.label === 'Total points (out of 100)').value, 80)
  assert.equal(summary.find((row) => row.label === 'Evaluation result').value, 'Acceptable')
  assert.equal(summary.find((row) => row.label === 'Approved by').value, 'HR SUPERVISOR')
})

test('dynamic row validation maps API errors to the rejected row and clears them only when that value changes', () => {
  for (const [form, definitions, field, key] of [
    [orientation(), orientationValidationFields, 'lines.1.remarks', 'line:1:remarks'],
    [probation(), probationValidationFields, 'lines.1.rating', 'rating:1'],
  ]) {
    const mapped = recruitmentValidation({ code: 'VALIDATION_ERROR', details: [{ field: `body.${field}`, message: 'Rejected value' }] }, definitions(form.lines), form)
    assert.equal(mapped.step, 1)
    assert.equal(activeRecruitmentErrors(mapped.errors, form)[key], 'Rejected value')
    form.lines[0].remarks = 'An unrelated change'
    assert.equal(activeRecruitmentErrors(mapped.errors, form)[key], 'Rejected value')
    form.lines[1][field.split('.').at(-1)] = 'New value'
    assert.deepEqual(activeRecruitmentErrors(mapped.errors, form), {})
  }
})

test('save resets use server canonical employee and row values without retaining stale state', () => {
  const orientationRecord = { employee, flag: 'Y', fromDate: '2026-11-04', lines: [{ ...session(), lineId: '51', remarks: null }] }
  assert.equal(orientationFormFromRecord(orientationRecord).lines[0].remarks, '')
  assert.equal(orientationFormFromRecord(orientationRecord).flag, 'Y')
  const probationRecord = { ...probation(), comment: 'Stored comment', comments: 'Stored suggestion' }
  const restored = probationFormFromRecord(probationRecord)
  assert.equal(restored.employee.employeeNumber, employee.employeeNumber)
  assert.equal(restored.comment, 'Stored comment')
  restored.lines[0].rating = '5'
  assert.equal(probationRecord.lines[0].rating, '')
})
