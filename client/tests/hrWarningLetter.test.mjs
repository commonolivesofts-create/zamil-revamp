// Warning Letter (legacy Warning_letter): readers over the snake_case API,
// request body, the backend's rules, the service's requests and the Letters
// sidebar entry. Mocked: a recording client; no network, no Oracle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizedNavigation, resolveNavigationEntries } from '../src/config/appNavigation.js'
import { registry } from '../src/config/registry/index.js'
import {
  blankLetter, createWarningLetterService, letterBody, letterFormOf, readLetter, readLetterPage, validateLetter,
} from '../src/features/hr-employee-services/warningLetter/warningLetterService.js'

const ROW = {
  id: 5, reference_no: 'ZPIL/5/1234', warning_no: '2', emp_no: '1001', emp_name: 'Employee', emp_div: 'IPP', emp_job: 'Operator',
  war_date: '2026-11-04', irregular_flag: 'Y', absent_flag: 'N', eating_flag: 'N', delaying_flag: 'N', make_problems_flag: 'N',
  others_text: '', others_text_ar: 'أخرى', action_text: 'Deduction', action_text_ar: '', warning_letter_flag: 'Y',
  warning_letter_comment: 'First', other_letter_flag: 'N', other_letter_comment: null, status: 'DRAFT',
}

test('readers map the snake_case row and the page', () => {
  const letter = readLetter(ROW)
  assert.equal(letter.letterId, '5')
  assert.equal(letter.employee.position, 'Operator')
  assert.equal(letter.irregular, true)
  assert.equal(letter.absent, false)
  assert.equal(letter.othersTextAr, 'أخرى')
  assert.equal(letter.otherComment, '')
  assert.throws(() => readLetter({ id: 'x' }), { code: 'INVALID_RESPONSE' })
  const page = readLetterPage({ rows: [ROW], pagination: { total_records: 26, total_pages: 2, current_page: 1, limit: 25 } })
  assert.deepEqual([page.pagination.total, page.pagination.totalPages, page.pagination.hasNextPage], [26, 2, true])
})

test('body: Y/N flags, trimmed texts, the employee only on create', () => {
  const form = { ...letterFormOf(readLetter(ROW)), actionText: ' Deduction ' }
  const created = letterBody(form, { creating: true })
  assert.equal(created.emp_no, '1001')
  assert.equal(created.irregular_flag, 'Y')
  assert.equal(created.make_problems_flag, 'N')
  assert.equal(created.action_text, 'Deduction')
  assert.equal('emp_no' in letterBody(form, { creating: false }), false)
})

test('validation follows the backend rules', () => {
  const blank = blankLetter('2026-11-04')
  assert.deepEqual(Object.keys(validateLetter(blank)).sort(), ['employee', 'reasons'])
  const employee = { employeeNo: '1001' }
  assert.deepEqual(validateLetter({ ...blank, employee, othersTextAr: 'أخرى' }), {}, 'Others alone is a reason')
  assert.deepEqual(Object.keys(validateLetter({ ...blank, employee, absent: true, warningLetter: true, otherLetter: true })).sort(), ['otherComment', 'warningComment'])
})

test('service: search needs two characters; create and update return the stored letter', async () => {
  const calls = []
  const call = (method) => async (path, ...rest) => {
    calls.push([method, path, method === 'GET' ? rest[0]?.params : rest[0]])
    if (path.endsWith('/lookups/employees')) return { data: [{ emp_no: '1001', emp_name: 'Employee' }] }
    if (path.includes('/lookups/employee/')) return { data: { emp_no: '1001', emp_name: 'Employee', emp_div: 'IPP', emp_job: 'Operator', warning_no: 3 } }
    if (path === '/hr/warning-letters' && method === 'GET') return { data: { rows: [ROW], pagination: { total_records: 1, current_page: 1, limit: 25 } } }
    return { data: ROW }
  }
  const service = createWarningLetterService({ client: { get: call('GET'), post: call('POST'), put: call('PUT') } })
  assert.equal((await service.searchEmployees('1')).items.length, 0)
  assert.equal(calls.length, 0, 'one character does not call the API')
  assert.equal((await service.searchEmployees(' 10 ')).items[0].employeeNumber, '1001')
  assert.equal((await service.employee('1001')).nextWarningNo, '3')
  const form = { ...letterFormOf(readLetter(ROW)) }
  assert.equal((await service.save(null, form)).letterId, '5')
  assert.equal(calls.at(-1)[0], 'POST')
  await service.save('5', form)
  assert.deepEqual(calls.at(-1).slice(0, 2), ['PUT', '/hr/warning-letters/5'])
  await service.list({ page: 2, pageSize: 25, q: 'a', flag: 'absent', dateFrom: '2026-01-01' })
  assert.deepEqual(calls.at(-1)[2], { page: 2, limit: 25, search: 'a', flag: 'absent', date_from: '2026-01-01' })
})

test('sidebar: under Human resources → Letters, behind its switch and VIEW permission', () => {
  const entries = (env, keys) => {
    const set = new Set(keys)
    return authorizedNavigation({ status: 'ready', mfaVerified: false, has: (key) => set.has(key) }, resolveNavigationEntries(registry.entries, env))
      .flatMap((section) => section.items).filter((item) => item.id.startsWith('hr-warning-letter'))
  }
  assert.deepEqual(entries({ VITE_FEATURE_HR_WARNING_LETTER: 'true', DEV: false }, ['HR.WARNING_LETTERS:VIEW']).map((item) => [item.id, item.subgroup]), [['hr-warning-letter', 'hr-letters']])
  assert.deepEqual(entries({ VITE_FEATURE_HR_WARNING_LETTER: 'true', DEV: false }, []), [])
  assert.deepEqual(entries({ DEV: false }, ['HR.WARNING_LETTERS:VIEW']), [])
})
