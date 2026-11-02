// HR employee services batch 1: Reward Nomination (1113), Share an Idea (1097)
// and Sick Leave (1076). Response contracts, demo adapter parity with the
// backend contract, lookups, client validation, record access (editable
// statuses), the sidebar sub-group entries by switch and permission, and
// source rules (no browser storage, no demo data in production paths).
// Mocked: the demo adapters stand in for the API; no network, no Oracle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { authorizedNavigation, resolveNavigationEntries } from '../src/config/appNavigation.js'
import { NAVIGATION_GROUPS, registry } from '../src/config/registry/index.js'
import { resolveFormDemo } from '../src/features/hr-employee-services/employeeServicesFormsConfig.js'
import { isEditable, normalizeStatus, pageOf } from '../src/features/hr-employee-services/shared/formRecords.js'
import { createRewardService } from '../src/features/hr-employee-services/reward/rewardService.js'
import { readRewardRecord, readRewardListItem, rewardBody } from '../src/features/hr-employee-services/reward/rewardContract.js'
import { duplicateOf, monthRange, ratingSummary, validateReward } from '../src/features/hr-employee-services/reward/rewardModel.js'
import { createRewardDemoClient } from '../src/features/hr-employee-services/demo/rewardDemoClient.js'
import { createIdeaService } from '../src/features/hr-employee-services/idea/ideaService.js'
import { ideaBody, readIdeaLookups, readIdeaRecord } from '../src/features/hr-employee-services/idea/ideaContract.js'
import { cleanAmount, validateIdea } from '../src/features/hr-employee-services/idea/ideaModel.js'
import { createIdeaDemoClient } from '../src/features/hr-employee-services/demo/ideaDemoClient.js'
import { createSickLeaveService } from '../src/features/hr-employee-services/sickLeave/sickLeaveService.js'
import { readSickLeaveRecord, sickLeaveFields } from '../src/features/hr-employee-services/sickLeave/sickLeaveContract.js'
import {
  backToWork, leaveDays, overlapOf, validateSickLeave, workingDays,
} from '../src/features/hr-employee-services/sickLeave/sickLeaveModel.js'
import { createSickLeaveDemoClient } from '../src/features/hr-employee-services/demo/sickLeaveDemoClient.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const fast = { latencyMs: 0 }
const ready = (keys) => {
  const set = new Set(keys)
  return { status: 'ready', mfaVerified: false, has: (key) => set.has(key) }
}
const FORMS = [
  { id: 'hr-sick-leave', env: 'VITE_FEATURE_HR_SICK_LEAVE', permission: 'HR.SICK_LEAVE:VIEW', path: '/hr/employee-services/sick-leave' },
  { id: 'hr-reward', env: 'VITE_FEATURE_HR_REWARD_NOMINATION', permission: 'HR.EMPLOYEE_OF_THE_MONTH:VIEW', path: '/hr/employee-services/reward-nomination' },
  { id: 'hr-idea', env: 'VITE_FEATURE_HR_IDEAS', permission: 'HR.IDEAS:VIEW', path: '/hr/employee-services/ideas' },
]

// ---------- shared contract helpers ----------

test('statuses: every backend casing is normalized; only drafts and rejected requests are editable', () => {
  assert.equal(normalizeStatus('Draft'), 'DRAFT')
  assert.equal(normalizeStatus('In process'), 'INPROCESS')
  assert.equal(normalizeStatus('Inprocess'), 'INPROCESS')
  assert.equal(normalizeStatus('APPROVED'), 'APPROVED')
  assert.equal(normalizeStatus('Accepted'), 'UNKNOWN', 'an unknown status is never a draft')
  assert.deepEqual(['DRAFT', 'REJECTED', 'INPROCESS', 'APPROVED', 'UNKNOWN'].map(isEditable), [true, true, false, false, false])
  assert.deepEqual(pageOf({ page: 2, pageSize: 10, total: 25 }), { page: 2, limit: 10, total: 25, totalPages: 3, hasNextPage: true, hasPreviousPage: true })
  assert.throws(() => pageOf({ page: 1, pageSize: 0, total: 1 }), { code: 'INVALID_RESPONSE' })
})

test('demo switches: the API unless the form switch is "true" in a development build', () => {
  for (const name of ['reward', 'idea', 'sickLeave']) {
    const flag = { reward: 'VITE_HR_REWARD_NOMINATION_DEMO', idea: 'VITE_HR_IDEAS_DEMO', sickLeave: 'VITE_HR_SICK_LEAVE_DEMO' }[name]
    assert.equal(resolveFormDemo(name, { [flag]: 'true', DEV: true }), true, name)
    assert.equal(resolveFormDemo(name, { [flag]: 'true', DEV: false }), false, `${name}: never in production`)
    assert.equal(resolveFormDemo(name, { DEV: true }), false, `${name}: unset uses the API`)
    assert.equal(resolveFormDemo(name, { VITE_HR_EMPLOYEE_SERVICES_DEMO: 'true', DEV: true }), false, `${name}: separate from the older switch`)
  }
})

// ---------- Reward Nomination (1113) ----------

test('reward: contract readers keep the legacy scale, YYYY-MM-DD dates and refuse unexpected data', () => {
  const record = readRewardRecord({
    headerId: 7, requestNo: 'PROD-0007', department: 'Production', employeeNumber: 9101, employeeName: 'Sample Employee 001',
    employeeEmail: 'employee001@example.invalid', employeePosition: 'Operator', employeeDepartment: 'Injection', activityDate: '2026-10-31',
    overallRating: 'AS', remark: 'Demo', status: 'DRAFT', createdAt: '2026-10-28T09:10:00',
    lines: [0, 1, 2, 3].map((lineNumber) => ({ lineNumber, criterion: 'C', rating: lineNumber ? 'A' : null, remark: null })),
  })
  assert.equal(record.department, 'production')
  assert.equal(record.employee.employeeNumber, '9101')
  assert.equal(record.createdAt, '2026-10-28')
  assert.equal(record.lines[0].rating, '', 'an unsaved criterion is blank')
  assert.throws(() => readRewardRecord({ headerId: 'x', lines: [] }), { code: 'INVALID_RESPONSE' })
  assert.throws(() => readRewardRecord({ headerId: 1, lines: [{ lineNumber: 1 }] }), { code: 'INVALID_RESPONSE' })
  const item = readRewardListItem({ headerId: 3, department: 'Shared-services', ratings: { A: 1, AS: 2 }, status: 'INPROCESS', overallRating: 'ZZ' })
  assert.deepEqual(item.ratings, { A: 1, AS: 2, BS: 0, CS: 0 })
  assert.equal(item.overallRating, '')
  assert.equal(item.department, 'shared-services')
})

test('reward: client validation mirrors the backend and adds the one-per-month rule', () => {
  const criteria = [0, 1, 2, 3].map((lineNumber) => ({ lineNumber, criterion: 'C' }))
  const employee = { employeeNumber: '9101', name: 'Sample Employee 001', email: 'e@example.invalid', position: 'Operator', departmentName: 'Injection' }
  const form = { department: 'production', activityDate: '2026-10-31', overallRating: 'A', remark: 'Good', lines: criteria.map(() => ({ rating: 'AS', remark: 'Evidence' })) }
  assert.deepEqual(validateReward(form, { employee, requestor: { employeeNumber: '9100' }, criteria }), {})
  assert.match(validateReward(form, { employee, requestor: { employeeNumber: '9101' }, criteria }).employee, /yourself/)
  assert.match(validateReward(form, { employee: { ...employee, email: '' }, criteria }).employee, /incomplete/)
  const errors = validateReward({ ...form, overallRating: '', remark: ' ', lines: [{ rating: '', remark: 'x'.repeat(501) }] }, { employee, criteria })
  assert.deepEqual(Object.keys(errors).sort(), ['overallRating', 'rating:0', 'rating:1', 'rating:2', 'rating:3', 'remark', 'remark:0', 'remark:1', 'remark:2', 'remark:3'])
  const duplicate = duplicateOf([{ nominationId: '2', employeeNumber: '9101', activityDate: '2026-10-05', status: 'INPROCESS', requestNo: 'PROD-0002' }],
    { nominationId: '9', employeeNumber: '9101', activityDate: '2026-10-31' })
  assert.equal(duplicate.requestNo, 'PROD-0002')
  assert.equal(duplicateOf([{ nominationId: '2', employeeNumber: '9101', activityDate: '2026-10-05', status: 'REJECTED' }], { employeeNumber: '9101', activityDate: '2026-10-31' }), null)
  assert.deepEqual(monthRange('2026-02-10'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(ratingSummary([{ rating: 'A' }, { rating: 'A' }, { rating: '' }]).counts, { A: 2, AS: 0, BS: 0, CS: 0 })
  assert.deepEqual(rewardBody({ ...form, remark: ' Good ' }, employee).employee, { number: '9101', name: 'Sample Employee 001', email: 'e@example.invalid', position: 'Operator', departmentName: 'Injection' })
})

test('reward: the service runs unchanged on the demo adapter (parity with the backend contract)', async () => {
  const service = createRewardService({ client: createRewardDemoClient(fast) })
  const criteria = await service.criteria('shared-services')
  assert.equal(criteria.criteria.length, 6)
  assert.deepEqual(criteria.ratingScale.map((item) => item.code), ['A', 'AS', 'BS', 'CS'])
  assert.equal((await service.requestor()).employeeNumber, '9100')
  const found = await service.searchEmployees('Employee 002')
  assert.deepEqual(found.items.map((item) => item.employeeNumber), ['9102'])
  const page = await service.list({ status: 'DRAFT' })
  assert.equal(page.pagination.total, 1)
  const sorted = await service.list({ sort: 'activityDate', order: 'asc' })
  assert.deepEqual(sorted.items.map((item) => item.activityDate), ['2026-09-30', '2026-09-30', '2026-10-31'])
  const employee = (await service.searchEmployees('Employee 004')).items[0]
  const form = { department: 'shared-services', activityDate: '2026-11-02', overallRating: 'A', remark: 'Demo', lines: criteria.criteria.map(() => ({ rating: 'AS', remark: 'Evidence' })) }
  const saved = await service.save(null, form, employee)
  assert.equal(saved.requestNo, `SS-${saved.nominationId.padStart(4, '0')}`)
  assert.equal(saved.status, 'DRAFT')
  assert.equal((await service.save(saved.nominationId, { ...form, remark: 'Changed' }, employee)).remark, 'Changed')
  await assert.rejects(service.save('3', { ...form, department: 'production', lines: form.lines.slice(0, 4) }, employee), { status: 409 })
  await assert.rejects(service.save(null, form, (await service.searchEmployees('9100')).items[0]), { code: 'SELF_NOMINATION_NOT_ALLOWED' })
  await assert.rejects(service.save(null, form, { ...employee, position: 'Other' }), { code: 'EMPLOYEE_DATA_MISMATCH' })
  await assert.rejects(service.getById('999'), { status: 404 })
  assert.deepEqual((await service.sameMonth('9101', '2026-09-15')).map((item) => item.requestNo), ['PROD-0001'])
})

// ---------- Share an Idea (1097) ----------

test('idea: lookups and records follow the backend contract; the server owns the feasibility', () => {
  const lookups = readIdeaLookups([{ id: '300000003618177', name: 'IPP BU' }], {
    projectTypes: [{ value: 'innovation', label: 'Innovation' }], investmentCategories: [{ value: 'machine', label: 'Machine', depreciationYears: 10 }],
  })
  assert.deepEqual(lookups.divisions, [{ value: '300000003618177', label: 'IPP BU' }])
  assert.equal(lookups.investmentCategories[0].depreciationYears, 10)
  assert.throws(() => readIdeaLookups(null, {}), { code: 'INVALID_RESPONSE' })
  const record = readIdeaRecord({ headerId: 4, idNo: 'ID202611020004', empNo: '9101', hasInvestment: 'yes', investmentValue: '1000', saving: 600, npv: 12.5, irr: 9, status: 'Draft', creationDate: '2026-11-02' })
  assert.equal(record.feasibility.npv, 12.5)
  assert.equal(record.investmentValue, 1000)
  assert.equal(record.status, 'DRAFT')
  assert.deepEqual(record.attachments, [])
  const body = ideaBody({ employee: { employeeNumber: '9101' }, division: 'd', title: ' T ', idea: ' I ', projectType: 'innovation', investmentCategory: 'machine', hasInvestment: 'no', investmentValue: '50', saving: '' })
  assert.deepEqual(body, { empNo: '9101', division: 'd', title: 'T', idea: 'I', projectType: 'innovation', investmentCategory: 'machine', hasInvestment: 'no', investmentValue: 0, saving: 0 })
  assert.equal(['depreciation', 'irr', 'npv', 'roi'].some((key) => key in body), false, 'results are never sent')
})

test('idea: client validation (required lists, title, 40-character idea, amounts)', () => {
  const form = { employee: { employeeNumber: '9101' }, division: 'd', investmentCategory: 'machine', projectType: 'innovation', title: 'Title', idea: 'x'.repeat(40), hasInvestment: 'yes', investmentValue: '1200.50', saving: '' }
  assert.deepEqual(validateIdea(form), {})
  assert.deepEqual(Object.keys(validateIdea({ ...form, employee: null, division: '', investmentCategory: '', projectType: '', title: '', idea: 'short', hasInvestment: '' })).sort(),
    ['division', 'employee', 'hasInvestment', 'idea', 'investmentCategory', 'projectType', 'title'])
  assert.ok(validateIdea({ ...form, investmentValue: '0' }).investmentValue)
  assert.ok(validateIdea({ ...form, saving: '1.234' }).saving)
  assert.equal(validateIdea({ ...form, hasInvestment: 'no', investmentValue: '' }).investmentValue, undefined)
  assert.equal(cleanAmount('12,000.5.1'), '12000.51')
})

test('idea: the service runs unchanged on the demo adapter (parity with the backend contract)', async () => {
  const service = createIdeaService({ client: createIdeaDemoClient(fast) })
  const lookups = await service.getLookups()
  assert.deepEqual(lookups.divisions.map((item) => item.label), ['IPP BU', 'FPP BU'])
  assert.equal(lookups.investmentCategories.length, 9)
  const details = await service.employeeDetails('9101')
  assert.equal(details.divisionId, '300000003618177')
  const page = await service.list({ q: 'cooling' })
  assert.deepEqual(page.items.map((item) => item.title), ['Reuse mould cooling water'])
  assert.equal(page.pagination.total, 1)
  const form = { employee: details, division: details.divisionId, investmentCategory: 'machine', projectType: 'automation', title: 'Demo idea', idea: 'x'.repeat(40), hasInvestment: 'yes', investmentValue: '10000', saving: '3000' }
  const saved = await service.save(null, form)
  assert.match(saved.idNo, /^ID\d{8}\d{4,}$/)
  assert.equal(saved.feasibility.depreciation, 1000, 'depreciation = investment / 10 years (machine)')
  const updated = await service.save(saved.ideaId, { ...form, saving: '5000' })
  assert.equal(updated.saving, 5000)
  await assert.rejects(service.save('3', form), { status: 409, code: 'IDEA_LOCKED' })
  await assert.rejects(service.save(null, { ...form, investmentValue: '0' }), { status: 400 })
})

// ---------- Sick Leave (1076) ----------

test('sick leave: days follow the server rule; working days and back-to-work skip Friday and Saturday', () => {
  assert.equal(leaveDays({ fromDate: '2026-11-01', toDate: '2026-11-05', fromDayType: 'FULL', toDayType: 'FULL' }), 5)
  assert.equal(leaveDays({ fromDate: '2026-11-01', toDate: '2026-11-05', fromDayType: 'HALF', toDayType: 'HALF' }), 4)
  assert.equal(leaveDays({ fromDate: '2026-11-03', toDate: '2026-11-03', fromDayType: 'HALF', toDayType: 'HALF' }), 0.5)
  assert.equal(leaveDays({ fromDate: '2026-11-05', toDate: '2026-11-01', fromDayType: 'FULL', toDayType: 'FULL' }), 0)
  assert.equal(workingDays('2026-11-05', '2026-11-08'), 2, 'Thu and Sun')
  assert.equal(backToWork('2026-11-05'), '2026-11-08', 'Thursday → Sunday')
})

test('sick leave: client validation (legacy required fields, attachments, 30 days back, overlap)', () => {
  const file = { fileName: 'certificate.pdf', sizeBytes: 1000, file: {} }
  const form = { employee: { employeeNumber: '9200' }, fromDate: '2026-10-20', toDate: '2026-10-21', fromDayType: 'FULL', toDayType: 'FULL', comments: 'Fever', files: [file] }
  assert.deepEqual(validateSickLeave(form, { isNew: true, today: '2026-11-02' }), {})
  assert.match(validateSickLeave({ ...form, files: [] }, { isNew: true, today: '2026-11-02' }).files, /at least one/)
  assert.equal(validateSickLeave({ ...form, files: [] }, { isNew: false, today: '2026-11-02' }).files, undefined, 'an existing request keeps its files')
  assert.match(validateSickLeave({ ...form, files: [{ ...file, fileName: 'x.exe' }] }, { isNew: true }).files, /Remove x.exe/)
  assert.match(validateSickLeave({ ...form, files: [{ ...file, sizeBytes: 11 * 1024 * 1024 }] }, { isNew: true }).files, /10 MB/)
  assert.match(validateSickLeave({ ...form, fromDate: '2026-09-01' }, { isNew: true, today: '2026-11-02' }).fromDate, /30 days/)
  assert.equal(validateSickLeave({ ...form, fromDate: '2026-09-01' }, { isNew: false, today: '2026-11-02' }).fromDate, undefined)
  assert.match(validateSickLeave({ ...form, toDate: '2026-10-19' }, { isNew: true }).toDate, /before/)
  assert.ok(validateSickLeave({ ...form, toDate: '2026-10-20', toDayType: 'HALF' }, { isNew: true }).toDayType)
  assert.ok(validateSickLeave({ ...form, comments: ' ' }, { isNew: true }).comments)
  const overlap = overlapOf([{ leaveId: '3', fromDate: '2026-10-21', toDate: '2026-10-23', status: 'INPROCESS' }], form)
  assert.equal(overlap.leaveId, '3')
  assert.equal(overlapOf([{ leaveId: '3', fromDate: '2026-10-21', toDate: '2026-10-23', status: 'REJECTED' }], form), null)
  assert.deepEqual(sickLeaveFields({ ...form, toDate: '2026-10-20', fromDayType: 'HALF', toDayType: 'FULL' }), {
    empNumber: '9200', leaveType: 'Sick Leave', fromDate: '2026-10-20', toDate: '2026-10-20', fromDayType: 'HALF', toDayType: 'HALF', comments: 'Fever',
  })
})

test('sick leave: records read camelCase attachments and YYYY-MM-DD dates', () => {
  const record = readSickLeaveRecord({
    headerId: 5, empId: '9200', empName: 'Demo Requester', fromDate: '2026-10-05', toDate: '2026-10-06', days: 1.5, status: 'Draft', comments: '-',
    fromDayType: 'FULL', toDayType: 'HALF', createdAt: '2026-10-07T06:00:00.000Z', attachments: [{ attachmentId: 21, fileName: 'a.pdf', attachedOn: '2026-10-07' }],
  })
  assert.equal(record.status, 'DRAFT')
  assert.equal(record.comments, '', "the legacy '-' placeholder reads as blank")
  assert.deepEqual(record.attachments, [{ attachmentId: '21', fileName: 'a.pdf', attachedOn: '2026-10-07' }])
  assert.throws(() => readSickLeaveRecord({ headerId: 5, attachments: [{ ATTACHMENT_ID: 1 }] }), { code: 'INVALID_RESPONSE' })
})

test('sick leave: the service runs unchanged on the demo adapter (multipart create, uploads, 409)', async () => {
  const service = createSickLeaveService({ client: createSickLeaveDemoClient(fast) })
  const employees = await service.searchEmployees('')
  assert.deepEqual(employees.items.map((item) => item.employeeNumber), ['9200', '9201', '9202'])
  const page = await service.list({ status: 'APPROVED' })
  assert.equal(page.items[0].days, 1.5)
  assert.equal(page.items[0].totalLeaveDays, 1.5)
  const file = { fileName: 'certificate.pdf', sizeBytes: 3, file: new File(['pdf'], 'certificate.pdf') }
  const form = { employee: employees.items[1], fromDate: '2026-11-01', toDate: '2026-11-03', fromDayType: 'FULL', toDayType: 'HALF', comments: 'Demo' }
  const saved = await service.save(null, form, [file])
  assert.equal(saved.days, 2.5)
  assert.equal(saved.status, 'DRAFT')
  assert.deepEqual(saved.attachments.map((item) => item.fileName), ['certificate.pdf'])
  const updated = await service.save(saved.leaveId, { ...form, comments: 'Changed' }, [{ ...file, fileName: 'second.pdf', file: new File(['x'], 'second.pdf') }])
  assert.equal(updated.comments, 'Changed')
  assert.equal(updated.attachments.length, 2)
  const removed = await service.removeAttachment(saved.leaveId, updated.attachments[0].attachmentId)
  assert.equal(removed.attachments.length, 1)
  await assert.rejects(service.save(null, form, []), { status: 400 })
  await assert.rejects(service.save('3', form, []), { status: 409 })
  assert.deepEqual((await service.overlapping('9201', '2026-10-20', '2026-10-21')).map((item) => item.leaveId), ['3'])
})

// ---------- sidebar: HR → Employee services ----------

test('sidebar: each form appears in Employee services only with its switch on AND its VIEW permission', () => {
  const hrGroup = NAVIGATION_GROUPS.find((group) => group.id === 'human-resources')
  assert.deepEqual(hrGroup.subgroups.map((item) => item.id), ['hr-recruitment', 'hr-employee-services', 'hr-reports'])
  const allOn = Object.fromEntries(FORMS.map((form) => [form.env, 'true']))
  const permissions = FORMS.map((form) => form.permission)
  const listed = (env, keys) => authorizedNavigation(ready(keys), resolveNavigationEntries(registry.entries, env))
    .find((section) => section.id === 'human-resources')?.items ?? []

  const items = listed(allOn, permissions)
  assert.deepEqual(items.map((item) => item.id), ['hr-sick-leave', 'hr-reward', 'hr-idea'], 'reports and records are not listed')
  for (const form of FORMS) {
    const item = items.find((entry) => entry.id === form.id)
    assert.equal(item.subgroup, 'hr-employee-services', form.id)
    assert.equal(item.path, form.path, `${form.id} opens its own page`)
    assert.equal(item.permission, form.permission)
    assert.ok(!listed({ ...allOn, [form.env]: 'false' }, permissions).some((entry) => entry.id === form.id), `${form.id}: switch off`)
    assert.ok(!listed(allOn, permissions.filter((key) => key !== form.permission)).some((entry) => entry.id === form.id), `${form.id}: no permission`)
    assert.ok(!listed({ DEV: false }, permissions).some((entry) => entry.id === form.id), `${form.id}: unset in production`)
  }
  assert.deepEqual(listed({}, []), [])
  const paths = items.map((item) => item.path)
  assert.equal(new Set(paths).size, paths.length, 'no two links share a page')
})

test('sidebar: every HR entry belongs to a sub-group of its section; the flyout lists them', async () => {
  for (const entry of registry.entries.filter((item) => item.section === 'human-resources')) {
    assert.ok(['hr-recruitment', 'hr-employee-services', 'hr-reports'].includes(entry.subgroup), entry.id)
  }
  const sidebar = await read('../src/components/layout/Sidebar.jsx')
  const flyout = await read('../src/components/layout/SidebarFlyout.jsx')
  assert.match(sidebar, /item\.subgroup === subgroup\.id/)
  assert.match(sidebar, /<SidebarFlyout/)
  assert.match(flyout, /aria-expanded=\{open\}/)
  assert.match(flyout, /event\.key === 'Escape'/)
  assert.match(flyout, /ArrowDown/)
  assert.match(flyout, /<NavLink to=\{item\.path\}/, 'flyout entries are real links to their own page')
})

// ---------- source rules ----------

async function sources(dir) {
  const entries = await readdir(new URL(dir, import.meta.url), { withFileTypes: true, recursive: true })
  return entries.filter((entry) => entry.isFile() && /\.(js|jsx)$/.test(entry.name))
    .map((entry) => `${entry.parentPath ?? entry.path}/${entry.name}`.replaceAll('\\', '/'))
}

test('source: no browser storage, no *Data.js or demo imports in production paths, dates as strings', async () => {
  const files = (await sources('../src/features/hr-employee-services/'))
    .filter((path) => /\/(reward|idea|sickLeave)\//.test(path) || /\/shared\/(formRecords|ServerRecordList|FormParts)/.test(path) || /\/demo\/(reward|idea|sickLeave|formsDemoKit)/.test(path))
  assert.ok(files.length >= 18, `found ${files.length} files`)
  for (const path of files) {
    const text = await readFile(path, 'utf8')
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB/, path)
    if (!path.includes('/demo/')) {
      // The prototype's data modules (rewardData.js, ideaData.js, sickData.js) and any demo data file.
      assert.doesNotMatch(text, /(reward|idea|sick|[Dd]emo)Data\.js'/, `${path}: no demo data module`)
      assert.doesNotMatch(text, /from '[^']*\/demo\/(?!(reward|idea|sickLeave)DemoClient\.js)/, `${path}: only the selected adapter`)
      assert.doesNotMatch(text, /createHashRouter|HashRouter|window\.location\.hash/, `${path}: react-router paths, no hash routing`)
    }
  }
  for (const form of ['reward/rewardService.js', 'idea/ideaService.js', 'sickLeave/sickLeaveService.js']) {
    const text = await read(`../src/features/hr-employee-services/${form}`)
    assert.match(text, /employeeServicesFormsConfig\.demo\./, `${form}: demo only through its switch`)
  }
})
