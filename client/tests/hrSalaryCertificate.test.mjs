// Salary Certificate (English and Arabic in one form): language-prefixed ids,
// readers over both APIs, request body, validation, the service's requests per
// language and the sidebar entry. Mocked: a recording client; no network, no Oracle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizedNavigation, resolveNavigationEntries } from '../src/config/appNavigation.js'
import { registry } from '../src/config/registry/index.js'
import {
  certificateBody, createSalaryCertificateService, parseCertificateId, readApprovers, readCertificate, validateCertificate,
} from '../src/features/hr-employee-services/salaryCertificate/salaryCertificateService.js'

const RECORD = {
  id: 12, refNo: 'ZPIL/26/012', certDate: '2026-11-04', employeeNo: '1001', employeeName: 'موظف', nationality: 'سعودي', nationalIdentifier: '1234',
  jobTitle: 'مهندس', joiningDate: '2020-01-05', division: 'IPP', basicSalary: 5000, housingAllowance: 1250, transportAllowance: 500,
  commAllowance: 0, carAllowance: 0, totalSalary: 6750, allowanceFlag: 'Yes', approvalName: 'معتمد', positionName: 'مدير', toEmpName: 'Bank', status: 'DRAFT',
}
const EMPLOYEE = { ...RECORD.employee, employeeNo: '1001', joiningDate: '2020-01-05', allowanceFlag: 'Yes' }

test('ids carry the language; anything else is refused', () => {
  assert.deepEqual(parseCertificateId('ar-12'), { language: 'ar', id: '12' })
  for (const bad of ['12', 'fr-1', 'en-0', 'en-1x', '../en-1']) assert.throws(() => parseCertificateId(bad), { code: 'INVALID_ID' }, bad)
})

test('records and approvers read the same shape from both APIs', () => {
  const record = readCertificate('ar', RECORD)
  assert.equal(record.certificateId, 'ar-12')
  assert.equal(record.employee.name, 'موظف')
  assert.equal(record.employee.totalSalary, 6750)
  assert.equal(record.approvalPosition, 'مدير')
  assert.deepEqual(readApprovers('ar', [{ employeeNo: 1, nameAr: 'معتمد', positionAr: 'مدير' }]), [{ employeeNo: '1', name: 'معتمد', position: 'مدير' }])
  assert.deepEqual(readApprovers('en', [{ employeeNo: 1, name: 'Approver', position: 'Manager' }])[0].name, 'Approver')
  assert.throws(() => readCertificate('en', { id: 'x' }), { code: 'INVALID_RESPONSE' })
})

test('body and validation follow the backend write schema', () => {
  const form = { employee: EMPLOYEE, certDate: '2026-11-04', toEmpName: ' Bank ', approvalName: 'معتمد' }
  assert.deepEqual(certificateBody(form), { employeeNo: '1001', certDate: '2026-11-04', toEmpName: 'Bank', approvalName: 'معتمد', allowanceFlag: 'Yes', joiningDate: '2020-01-05' })
  const approvers = [{ name: 'معتمد' }]
  assert.deepEqual(validateCertificate(form, { approvers }), {})
  assert.deepEqual(Object.keys(validateCertificate({ employee: null, certDate: '', toEmpName: ' ', approvalName: 'x' }, { approvers })), ['employee', 'certDate', 'toEmpName', 'approvalName'])
})

test('service: each language uses its own API; create returns the stored record', async () => {
  const calls = []
  const call = (method) => async (path, ...rest) => {
    calls.push({ method, path, params: (method === 'GET' ? rest[0] : rest[1])?.params, body: method === 'GET' ? undefined : rest[0] })
    if (path.endsWith('/lookups/employee-numbers')) return { data: [{ employeeNo: '1001' }] }
    if (method === 'POST') return { data: { id: 12, refNo: 'ZPIL/26/012' } }
    if (method === 'PUT') return { data: { id: 12 } }
    if (/\/(salary-certificates|salary-certificates-ar)$/.test(path)) return { data: { items: [RECORD], page: 1, pageSize: 20, total: 1 } }
    return { data: RECORD }
  }
  const service = createSalaryCertificateService({ client: { get: call('GET'), post: call('POST'), put: call('PUT') } })
  const found = await service.searchEmployees('ar', ' 10 ')
  assert.deepEqual([calls.at(-1).path, calls.at(-1).params], ['/salary-certificates-ar/lookups/employee-numbers', { q: '10', pageSize: 20 }])
  assert.equal(found.items[0].employeeNumber, '1001')
  const page = await service.list('en', { page: 1, pageSize: 20, q: '' })
  assert.equal(calls.at(-1).path, '/salary-certificates')
  assert.equal(page.items[0].certificateId, 'en-12')
  const form = { employee: EMPLOYEE, certDate: '2026-11-04', toEmpName: 'Bank', approvalName: 'معتمد' }
  assert.equal((await service.save(null, 'ar', form)).certificateId, 'ar-12')
  assert.deepEqual(calls.slice(-2).map((item) => [item.method, item.path]), [['POST', '/salary-certificates-ar'], ['GET', '/salary-certificates-ar/12']])
  await service.save('en-12', 'ar', form)
  assert.deepEqual(calls.slice(-2).map((item) => [item.method, item.path]), [['PUT', '/salary-certificates/12'], ['GET', '/salary-certificates/12']], 'a saved certificate keeps its language')
})

test('sidebar: one entry for both languages, behind its switch and the English VIEW permission', () => {
  const ids = (env, keys) => {
    const set = new Set(keys)
    return authorizedNavigation({ status: 'ready', mfaVerified: false, has: (key) => set.has(key) }, resolveNavigationEntries(registry.entries, env))
      .flatMap((section) => section.items).map((item) => item.id).filter((id) => id.startsWith('hr-salary-certificate'))
  }
  assert.deepEqual(ids({ VITE_FEATURE_HR_SALARY_CERTIFICATE: 'true', DEV: false }, ['HR.SALARY_CERTIFICATES:VIEW']), ['hr-salary-certificate'])
  assert.deepEqual(ids({ VITE_FEATURE_HR_SALARY_CERTIFICATE: 'true', DEV: false }, []), [])
  assert.deepEqual(ids({ DEV: false }, ['HR.SALARY_CERTIFICATES:VIEW']), [])
})
