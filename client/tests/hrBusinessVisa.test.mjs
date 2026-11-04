// Business Visa Request (legacy visa_request): readers, request body, validation,
// the service's requests and the Letters sidebar entry. Mocked: a recording
// client; no network, no Oracle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizedNavigation, resolveNavigationEntries } from '../src/config/appNavigation.js'
import { registry } from '../src/config/registry/index.js'
import { NATIONALITIES } from '../src/features/hr-employee-services/businessVisa/nationalities.js'
import {
  blankRequest, createBusinessVisaService, documentName, fileProblem, readOptions, readRequest, requestBody, validateRequest,
} from '../src/features/hr-employee-services/businessVisa/businessVisaService.js'

const FORM = {
  ...blankRequest('2026-11-04'),
  division: '300000003618177', dept: 'Human Resources', visitorName: ' Visitor ', visitorPhone: '+1 555', nationality: 'german',
  profession: 'Engineer', passportNo: 'P1', issueDate: '2024-01-01', expiryDate: '2030-01-01', companyName: 'Partner Co', tel: '1', fax: '2',
  arrivalDate: '2026-12-01', comingFrom: 'Berlin', travelRoute: 'BER-DMM', visitPurpose: 'Meeting', saudiEmbassy: 'Berlin', visaSingle: true,
}
const RECORD = { id: 7, requestNo: '300000003618177 - 0007', status: 'Draft', requestedBy: 'Requester', editable: true, documents: [{ lineId: 3, name: 'passport', fileName: 'passport.pdf' }], ...FORM }

test('the legacy nationality list is complete and unique', () => {
  assert.equal(NATIONALITIES.length, 210)
  assert.equal(new Set(NATIONALITIES.map((item) => item.value)).size, NATIONALITIES.length)
  assert.ok(NATIONALITIES.every((item) => item.label && !/[<>]/.test(item.label)))
})

test('readers keep the request shape and reject unexpected data', () => {
  const record = readRequest(RECORD)
  assert.equal(record.requestId, '7')
  assert.equal(record.status, 'DRAFT')
  assert.equal(record.visaSingle, true)
  assert.equal(record.visaMultiple, false)
  assert.deepEqual(record.documents.map((item) => item.attachmentId), ['3'])
  assert.throws(() => readRequest({ id: 'x' }), { code: 'INVALID_RESPONSE' })
  assert.deepEqual(readOptions({ divisions: [{ code: '1', name: 'IPP' }], departments: ['HR', ''] }), { divisions: [{ code: '1', name: 'IPP' }], departments: ['HR'] })
})

test('body trims text; validation follows the legacy required fields', () => {
  const body = requestBody(FORM)
  assert.equal(body.visitorName, 'Visitor')
  assert.equal(body.hotelOther, false)
  assert.equal('requestNo' in body || 'status' in body, false, 'the server owns the number and status')
  assert.deepEqual(validateRequest(FORM), {})
  assert.deepEqual(validateRequest({ ...FORM, address: '', otherDetails: '' }), {}, 'address is optional')
  const errors = validateRequest({ ...FORM, fax: ' ', visaSingle: false, expiryDate: '2023-01-01', hotelOther: true })
  assert.deepEqual(Object.keys(errors).sort(), ['expiryDate', 'fax', 'otherDetails', 'visaType'])
})

test('files follow the legacy allowed types and size', () => {
  assert.equal(fileProblem({ name: 'scan.PDF', size: 1000 }), '')
  assert.match(fileProblem({ name: 'run.exe', size: 1 }), /not allowed/)
  assert.match(fileProblem({ name: 'big.pdf', size: 25 * 1024 * 1024 }), /larger/)
  assert.equal(documentName('passport copy.pdf'), 'passport copy')
})

test('service: create, then each document, then the stored request', async () => {
  const calls = []
  const call = (method) => async (path, ...rest) => {
    calls.push([method, path, method === 'GET' ? rest[0]?.params : rest[0]])
    if (method === 'POST' && path.endsWith('/documents')) return { data: { lineId: 4 } }
    if (method === 'POST') return { data: { id: 7 } }
    if (path.endsWith('/hr/business-visa-requests')) return { data: { items: [RECORD], page: 1, pageSize: 25, total: 1 } }
    return { data: RECORD }
  }
  const service = createBusinessVisaService({ client: { get: call('GET'), post: call('POST'), put: call('PUT'), delete: call('DELETE') } })
  assert.equal((await service.save(null, FORM)).requestId, '7')
  assert.deepEqual(calls.map(([method, path]) => [method, path]), [['POST', '/hr/business-visa-requests'], ['GET', '/hr/business-visa-requests/7']])
  await service.addDocument('7', { fileName: 'passport.pdf', file: new Blob(['x']) })
  const upload = calls.at(-2)
  assert.equal(upload[1], '/hr/business-visa-requests/7/documents')
  assert.equal(upload[2].get('name'), 'passport')
  await service.save('7', FORM)
  assert.equal(calls.at(-2)[0], 'PUT')
  await service.removeDocument('7', '3')
  assert.deepEqual(calls.at(-2).slice(0, 2), ['DELETE', '/hr/business-visa-requests/7/documents/3'])
  const page = await service.list({ page: 1, pageSize: 25, q: '', status: 'DRAFT' })
  assert.deepEqual(calls.at(-1)[2], { page: 1, pageSize: 25, status: 'DRAFT' })
  assert.equal(page.items[0].requestNo, RECORD.requestNo)
  await assert.rejects(() => service.getById('../7'), { code: 'INVALID_ID' })
})

test('sidebar: under Human resources → Letters, behind its switch and VIEW permission', () => {
  const entries = (env, keys) => {
    const set = new Set(keys)
    return authorizedNavigation({ status: 'ready', mfaVerified: false, has: (key) => set.has(key) }, resolveNavigationEntries(registry.entries, env))
      .flatMap((section) => section.items).filter((item) => item.id.startsWith('hr-business-visa'))
  }
  const on = entries({ VITE_FEATURE_HR_BUSINESS_VISA: 'true', DEV: false }, ['HR.BUSINESS_VISA_LETTERS:VIEW'])
  assert.deepEqual(on.map((item) => [item.id, item.subgroup]), [['hr-business-visa', 'hr-letters']])
  assert.deepEqual(entries({ VITE_FEATURE_HR_BUSINESS_VISA: 'true', DEV: false }, []), [])
  assert.deepEqual(entries({ DEV: false }, ['HR.BUSINESS_VISA_LETTERS:VIEW']), [])
})
