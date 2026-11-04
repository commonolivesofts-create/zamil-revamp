// Business Visa Letter (legacy Business_visa_letter): readers over the
// snake_case API, request body, validation, the service's requests and the
// Letters sidebar entry. Mocked: a recording client; no network, no Oracle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizedNavigation, resolveNavigationEntries } from '../src/config/appNavigation.js'
import { registry } from '../src/config/registry/index.js'
import {
  blankLetter, createBusinessVisaLetterService, letterBody, readEmployee, readLetter, validateLetter,
} from '../src/features/hr-employee-services/businessVisaLetter/businessVisaLetterService.js'

const ROW = {
  id: 4, ref_no: 'ZPIL/BV/1', letter_date: '2026-11-04', division_id: '300000003618177', embassy: 'Indian', embassy_ar: 'سفارة الهند',
  request_for: 'Business Single', employee_name: 'Employee', monthly_salary: 5000, visit_days: 7, visit_place: 'Mumbai', status: 'DRAFT',
  created_at: '2026-11-04 10:00',
}

test('readers keep every letter field and the master details', () => {
  const letter = readLetter(ROW)
  assert.equal(letter.letterId, '4')
  assert.equal(letter.form.monthly_salary, '5000')
  assert.equal(letter.form.passport_date, '')
  assert.throws(() => readLetter({ id: 'x' }), { code: 'INVALID_RESPONSE' })
  const employee = readEmployee({ employee_name: 'Employee', id_expiration_date: '2027-01-01', monthly_salary: null })
  assert.deepEqual([employee.id_expiration_date, employee.monthly_salary, employee.passport_no], ['2027-01-01', '', ''])
})

test('body: numbers as numbers, blanks as null; validation of the required fields', () => {
  const form = { ...blankLetter('2026-11-04'), ...readLetter(ROW).form, visit_days: ' 7 ', passport_no: ' ' }
  const body = letterBody(form)
  assert.equal(body.visit_days, 7)
  assert.equal(body.passport_no, null)
  assert.equal(body.visit_purpose, null, 'the server applies the legacy default')
  assert.equal(letterBody(blankLetter('2026-11-04')).visit_purpose, 'Business discussions.')
  assert.equal('id' in body, false)
  assert.deepEqual(validateLetter(form), {})
  assert.deepEqual(Object.keys(validateLetter({ ...blankLetter(''), visit_days: '-1' })).sort(), ['division_id', 'employee_name', 'letter_date', 'ref_no', 'visit_days'])
})

test('service: employees fetched once and filtered; create, then update read back', async () => {
  const calls = []
  const call = (method) => async (path, ...rest) => {
    calls.push([method, path, method === 'GET' ? rest[0]?.params : rest[0]])
    if (path.endsWith('/lookups/employees')) return { data: [{ employee_number: '1001', full_name: 'Alpha' }, { employee_number: '2002', full_name: 'Beta' }] }
    if (path === '/hr/business-visa-letters' && method === 'GET') return { data: { pagination: { total_records: 1, current_page: 1, limit: 25 }, letters: [ROW] } }
    if (method === 'PUT') return { data: { changed: true, letter: ROW } }
    return { data: ROW }
  }
  const service = createBusinessVisaLetterService({ client: { get: call('GET'), post: call('POST'), put: call('PUT') } })
  assert.deepEqual((await service.searchEmployees('bet')).items.map((item) => item.employeeNumber), ['2002'])
  assert.equal((await service.searchEmployees('100')).items[0].name, 'Alpha')
  assert.equal(calls.filter(([, path]) => path.endsWith('/lookups/employees')).length, 1)
  const form = { ...blankLetter('2026-11-04'), ...readLetter(ROW).form }
  assert.equal((await service.save(null, form)).letterId, '4')
  assert.equal(calls.at(-1)[0], 'POST')
  assert.equal((await service.save('4', form)).form.ref_no, 'ZPIL/BV/1')
  assert.deepEqual(calls.slice(-2).map(([method, path]) => [method, path]), [['PUT', '/hr/business-visa-letters/4'], ['GET', '/hr/business-visa-letters/4']])
  const page = await service.list({ page: 1, pageSize: 25, q: 'a', division: '300000003618177', dateFrom: '2026-01-01' })
  assert.equal(page.items[0].form.ref_no, 'ZPIL/BV/1')
  assert.deepEqual(calls.at(-1)[2], { page: 1, limit: 25, search: 'a', division_id: '300000003618177', from: '2026-01-01' })
})

test('sidebar: under Human resources → Letters, behind its switch and the letters VIEW permission', () => {
  const entries = (env, keys) => {
    const set = new Set(keys)
    return authorizedNavigation({ status: 'ready', mfaVerified: false, has: (key) => set.has(key) }, resolveNavigationEntries(registry.entries, env))
      .flatMap((section) => section.items).filter((item) => item.id.startsWith('hr-business-visa-letter'))
  }
  assert.deepEqual(entries({ VITE_FEATURE_HR_BUSINESS_VISA_LETTER: 'true', DEV: false }, ['HR.BUSINESS_VISA_LETTERS:VIEW']).map((item) => [item.id, item.subgroup]), [['hr-business-visa-letter', 'hr-letters']])
  assert.deepEqual(entries({ VITE_FEATURE_HR_BUSINESS_VISA_LETTER: 'true', DEV: false }, []), [])
  assert.deepEqual(entries({ DEV: false }, ['HR.BUSINESS_VISA_LETTERS:VIEW']), [])
})
