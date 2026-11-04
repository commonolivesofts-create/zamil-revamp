// Tourist Visa Letter (legacy Tourist_visa): readers over the snake_case API,
// request body, validation, the service's requests and the Letters sidebar
// entry. Mocked: a recording client; no network, no Oracle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizedNavigation, resolveNavigationEntries } from '../src/config/appNavigation.js'
import { registry } from '../src/config/registry/index.js'
import {
  blankLetter, createTouristVisaService, letterBody, letterFormOf, readLetter, validateLetter,
} from '../src/features/hr-employee-services/touristVisa/touristVisaService.js'

const UUID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
const ROW = {
  uuid: UUID, id: 3, ref_no: 'ZPIL/26/123', cur_date: '2026-11-04', cur_date_ar: '13/05/1448', division: 'ZPIL', country: 'France',
  country_ar: 'فرنسا', employee_no: '1001', employee_name: 'Employee', employee_name_ar: 'موظف', nationality: 'Indian',
  passport_no: 'P1', national_id: 'N1', position: 'Operator', position_ar: 'مشغل', contract: 'Single', salary: '5000',
  salary_word: 'Five Thousand Saudi Riyals Only', tourism_to: 'France', tourism_from: 'India', tourism_from_ar: 'الهند',
  pass_issue_date: '2020-01-01', position_start_date: '2021-02-03', approval_name: 'Approver', position_name: 'Manager',
}
const APPROVERS = [{ name: 'Approver', position: 'Manager' }]

test('readers map the letter and refuse an unexpected one', () => {
  const letter = readLetter(ROW)
  assert.equal(letter.letterId, UUID)
  assert.equal(letter.employee.employee_name_ar, 'موظف')
  assert.equal(letter.dates.position_start_date, '2021-02-03')
  assert.equal(letter.dates.contract_expired, '')
  assert.throws(() => readLetter({ uuid: '12' }), { code: 'INVALID_RESPONSE' })
})

test('body: the answers, the approver position and Arabic dates that follow the English ones', () => {
  const form = { ...blankLetter('2026-11-04'), division: 'ZPIL', country: 'France', employee: readLetter(ROW).employee, tourismTo: 'France', tourismFrom: 'India', approvalName: 'Approver' }
  form.dates.pass_issue_date = '2020-01-01'
  const body = letterBody(form, { approvers: APPROVERS, saved: null })
  assert.equal(body.position_name, 'Manager')
  assert.equal(body.pass_issue_date_ar, '2020-01-01')
  assert.equal(body.contract_expired, null)
  assert.equal('salary' in body, false, 'a new letter takes the salary from the master')
  const saved = readLetter(ROW)
  const update = letterBody({ ...letterFormOf(saved), tourismTo: 'Italy', curDate: '2026-11-05' }, { approvers: APPROVERS, saved })
  assert.deepEqual([update.tourism_to_ar, update.cur_date_ar, update.salary, 'tourism_from_ar' in update], ['', '', '5000', false])
})

test('validation: every required answer and an approver from the list', () => {
  assert.deepEqual(Object.keys(validateLetter(blankLetter(''), { approvers: APPROVERS })).sort(),
    ['approvalName', 'country', 'curDate', 'division', 'employee', 'tourismFrom', 'tourismTo'])
  assert.equal(validateLetter({ ...letterFormOf(readLetter(ROW)), approvalName: 'Someone' }, { approvers: APPROVERS }).approvalName, 'Choose the approver from the list.')
})

test('service: lookups, a two-character search, create and update by UUID', async () => {
  const calls = []
  const call = (method) => async (path, ...rest) => {
    calls.push([method, path, method === 'GET' ? rest[0]?.params : rest[0]])
    if (path.endsWith('/lookups/countries')) return { data: [{ country: 'France' }, { country: '' }] }
    if (path.endsWith('/lookups/approvers')) return { data: [{ approval_name: 'Approver', position_name: 'Manager' }] }
    if (path.endsWith('/lookups/employees')) return { data: [{ employee_no: '1001', employee_name: 'Employee' }] }
    if (path === '/hr/tourist-visa-letters' && method === 'GET') return { data: { rows: [ROW], pagination: { total_records: 1, current_page: 1, limit: 25 } } }
    return { data: ROW }
  }
  const service = createTouristVisaService({ client: { get: call('GET'), post: call('POST'), put: call('PUT') } })
  assert.deepEqual(await service.lookups(), { countries: ['France'], approvers: APPROVERS })
  calls.length = 0
  assert.equal((await service.searchEmployees('1')).items.length, 0)
  assert.equal(calls.length, 0)
  assert.equal((await service.searchEmployees('10')).items[0].name, 'Employee')
  const form = letterFormOf(readLetter(ROW))
  assert.equal((await service.save(null, form, APPROVERS)).letterId, UUID)
  assert.equal(calls.at(-1)[0], 'POST')
  await service.save(readLetter(ROW), form, APPROVERS)
  assert.deepEqual(calls.at(-1).slice(0, 2), ['PUT', `/hr/tourist-visa-letters/${UUID}`])
  assert.equal((await service.list({ page: 1, pageSize: 25, q: 'a', division: 'ZPIL' })).items[0].refNo, 'ZPIL/26/123')
  assert.deepEqual(calls.at(-1)[2], { page: 1, limit: 25, search: 'a', division: 'ZPIL' })
  await assert.rejects(() => service.getById('../1'), { code: 'INVALID_ID' })
})

test('sidebar: under Human resources → Letters, behind its switch and VIEW permission', () => {
  const entries = (env, keys) => {
    const set = new Set(keys)
    return authorizedNavigation({ status: 'ready', mfaVerified: false, has: (key) => set.has(key) }, resolveNavigationEntries(registry.entries, env))
      .flatMap((section) => section.items).filter((item) => item.id.startsWith('hr-tourist-visa'))
  }
  assert.deepEqual(entries({ VITE_FEATURE_HR_TOURIST_VISA: 'true', DEV: false }, ['HR.TOURIST_VISA_LETTERS:VIEW']).map((item) => [item.id, item.subgroup]), [['hr-tourist-visa', 'hr-letters']])
  assert.deepEqual(entries({ VITE_FEATURE_HR_TOURIST_VISA: 'true', DEV: false }, []), [])
  assert.deepEqual(entries({ DEV: false }, ['HR.TOURIST_VISA_LETTERS:VIEW']), [])
})
