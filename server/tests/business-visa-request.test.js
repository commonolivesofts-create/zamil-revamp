// Business Visa Request (legacy visa_request): validation, the service's rules
// with an in-memory repository and storage, and the repository SQL with a
// recording connection (exact binds, legacy check-box literals). Mocked: no Oracle.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as repo from '../src/modules/hr/business-visa-requests/businessVisaRequest.repository.js';
import { createBusinessVisaRequestService } from '../src/modules/hr/business-visa-requests/businessVisaRequest.service.js';
import {
  listQuery,
  writeBody,
} from '../src/modules/hr/business-visa-requests/businessVisaRequest.validation.js';

const BODY = {
  division: '300000003618177',
  dept: 'Human Resources',
  requestDate: '2026-11-04',
  visitorName: 'Visitor',
  visitorPhone: '+1 555',
  nationality: 'german',
  profession: 'Engineer',
  passportNo: 'P1',
  issueDate: '2024-01-01',
  expiryDate: '2030-01-01',
  companyName: 'Partner Co',
  tel: '1',
  fax: '2',
  arrivalDate: '2026-12-01',
  comingFrom: 'Berlin',
  travelRoute: 'BER-DMM',
  visitPurpose: 'Meeting',
  saudiEmbassy: 'Berlin',
  visaSingle: true,
};

function recordingConnection(rows = [{ TOTAL: 0 }]) {
  const statements = [];
  return {
    statements,
    execute: async (sql, binds = {}) => {
      statements.push({ sql, binds });
      return { rows, outBinds: { newId: [9], lineId: [4] }, rowsAffected: 1 };
    },
  };
}
const placeholders = (sql) =>
  new Set([...sql.replace(/'[^']*'/g, '').matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
const assertExactBinds = (statements) => {
  assert.ok(statements.length > 0);
  for (const { sql, binds } of statements) {
    assert.deepEqual(new Set(Object.keys(binds)), placeholders(sql), sql.trim().slice(0, 80));
  }
};

describe('Business visa request validation', () => {
  it('accepts the legacy required fields and fills the optional ones', () => {
    const { value, error } = writeBody.validate(BODY);
    assert.equal(error, undefined);
    assert.equal(value.address, '');
    assert.equal(value.hotelOther, false);
  });

  it('rejects a missing field, a visa without type, other without details and reversed dates', () => {
    for (const body of [
      { ...BODY, fax: '' },
      { ...BODY, visaSingle: false },
      { ...BODY, visaMultiple: true },
      { ...BODY, travelOther: true },
      { ...BODY, expiryDate: '2023-01-01' },
      { ...BODY, division: 'IBM' },
      { ...BODY, status: 'APPROVED' },
    ]) {
      assert.ok(writeBody.validate(body).error, JSON.stringify(body).slice(0, 60));
    }
  });

  it('pages the list with defaults', () => {
    assert.deepEqual(listQuery.validate({}).value, { page: 1, pageSize: 25 });
  });
});

describe('Business visa request repository SQL', () => {
  it('stores the legacy check-box literals', () => {
    const binds = repo.headerBinds(writeBody.validate(BODY).value);
    assert.equal(binds.VISA_TYPE_SINGLE, 'Single');
    assert.equal(binds.VISA_TYPE_MULTIPLE, 'Null');
    assert.equal(binds.HOTEL_EX_OTHER, 'Null');
    assert.equal(binds.NATION, 'german');
  });

  it('every statement gets exactly the binds it references', async () => {
    const c = recordingConnection();
    const body = writeBody.validate(BODY).value;
    await repo.list(c, {
      page: 2,
      pageSize: 10,
      q: 'a',
      status: 'DRAFT',
      division: 'x',
      dept: 'y',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    await repo.list(c, { page: 1, pageSize: 10 });
    await repo.header(c, '1', { lock: true });
    await repo.documents(c, '1');
    await repo.document(c, '1', '2');
    await repo.insertHeader(c, body, { uuid: 'u', requestedBy: 'R', createdBy: 1 });
    await repo.updateHeader(c, '1', body, { updatedBy: 1 });
    await repo.insertDocument(c, { id: '1', uuid: 'u', name: 'n', fileName: 'f' });
    await repo.deleteDocument(c, '1', '2');
    await repo.deleteDocuments(c, '1');
    await repo.deleteHeader(c, '1');
    await repo.requester(c, '100');
    assertExactBinds(c.statements);
    const reqNo = c.statements.find(({ sql }) => sql.includes('SET REQ_NO'));
    assert.match(reqNo.sql, /:division \|\| ' - ' \|\| LPAD\(:id, 4, '0'\)/);
    assert.match(
      c.statements.find(({ sql }) => sql.includes('INSERT INTO XXZP.XX_BUS_VISA_HEADER')).sql,
      /'DRAFT'/,
    );
  });
});

function fakes({ status = 'DRAFT' } = {}) {
  const calls = [];
  const header = {
    HEADER_ID: 7,
    STATUS: status,
    REQ_NO: 'X - 0007',
    DIVISION: '300000003618177',
    VISA_TYPE_SINGLE: 'Single',
  };
  const repository = {
    requester: async () => 'Requester',
    departments: async () => ['Human Resources'],
    header: async (_c, id, options) => (
      calls.push(['header', id, options]),
      String(id) === '7' ? header : null
    ),
    documents: async () => [],
    document: async () => ({ LINE_ID: 4, DOC_FILE_NAME: 'p.pdf' }),
    insertHeader: async (_c, body, meta) => (calls.push(['insertHeader', meta]), '7'),
    updateHeader: async (_c, id, body, meta) => calls.push(['updateHeader', id, meta]),
    insertDocument: async (_c, doc) => (
      calls.push(['insertDocument', doc.name, doc.fileName]),
      '4'
    ),
    deleteDocument: async () => true,
    deleteDocuments: async (_c, id) => calls.push(['deleteDocuments', id]),
    deleteHeader: async (_c, id) => (calls.push(['deleteHeader', id]), true),
    list: async () => ({ total: 1, items: [header] }),
  };
  const storage = {
    saved: [],
    removed: [],
    save: async (file) => storage.saved.push(file.attachmentId),
    remove: async (file) => storage.removed.push(file.attachmentId),
  };
  const run = (_pool, work) => work({});
  const service = createBusinessVisaRequestService({
    repository,
    storage,
    withConnection: run,
    withTransaction: run,
  });
  return { service, calls, repository, storage };
}

describe('Business visa request service', () => {
  const actor = { userId: 11, employeeNumber: '100' };
  const file = { originalname: 'passport copy.pdf', buffer: Buffer.from('x') };

  it('creates a draft with the requester resolved by the server', async () => {
    const { service, calls } = fakes();
    assert.deepEqual(await service.create(actor, BODY), { id: '7' });
    assert.equal(calls[0][1].requestedBy, 'Requester');
    assert.equal(calls[0][1].createdBy, 11);
  });

  it('maps a row to the API shape with the division name', async () => {
    const { service } = fakes();
    const item = await service.get('7');
    assert.equal(item.divisionName, 'IPP');
    assert.equal(item.visaSingle, true);
    assert.equal(item.editable, true);
    await assert.rejects(() => service.get('8'), { statusCode: 404 });
  });

  it('in-process and approved requests are read-only', async () => {
    for (const status of ['INPROCESS', 'APPROVED']) {
      const { service, storage } = fakes({ status });
      await assert.rejects(() => service.update(actor, '7', BODY), { statusCode: 409 });
      await assert.rejects(() => service.addDocument('7', file, ''), { statusCode: 409 });
      await assert.rejects(() => service.removeDocument('7', '4'), { statusCode: 409 });
      assert.deepEqual(storage.saved, []);
    }
    const { service } = fakes({ status: 'REJECTED' });
    assert.deepEqual(await service.update(actor, '7', BODY), { id: '7' });
  });

  it('documents: legacy types only, safe names, default name, file removed with its row', async () => {
    const { service, calls, storage } = fakes();
    await assert.rejects(
      () => service.addDocument('7', { originalname: 'x.exe', buffer: Buffer.from('x') }, ''),
      {
        statusCode: 400,
      },
    );
    assert.deepEqual(await service.addDocument('7', file, ''), {
      lineId: '4',
      name: 'Document - 1',
      fileName: 'passport_copy.pdf',
    });
    assert.deepEqual(storage.saved, ['4']);
    await service.removeDocument('7', '4');
    assert.deepEqual(storage.removed, ['4']);
    assert.ok(calls.some(([name]) => name === 'insertDocument'));
  });

  it('a failed file write rolls back and removes the partial file', async () => {
    const { service, storage } = fakes();
    storage.save = async () => {
      throw new Error('disk full');
    };
    await assert.rejects(() => service.addDocument('7', file, 'Passport'), /disk full/);
    assert.deepEqual(storage.removed, ['4']);
  });

  it('rejects a department that is not in the lookup', async () => {
    const { service, calls } = fakes();
    await assert.rejects(() => service.create(actor, { ...BODY, dept: 'Unknown' }), {
      statusCode: 400,
    });
    assert.ok(!calls.some(([name]) => name === 'insertHeader'));
  });

  it('refuses to create when the requester cannot be resolved', async () => {
    const { calls, repository, storage } = fakes();
    const emptyRequester = createBusinessVisaRequestService({
      repository: { ...repository, requester: async () => null },
      storage,
      withConnection: (_pool, work) => work({}),
      withTransaction: (_pool, work) => work({}),
    });
    await assert.rejects(() => emptyRequester.create(actor, BODY), {
      statusCode: 400,
      code: 'REQUESTER_NOT_FOUND',
    });
    assert.ok(!calls.some(([name]) => name === 'insertHeader'));
  });

  it('deletes the documents, the header and the stored files', async () => {
    const { calls, repository, storage } = fakes();
    const withDocument = createBusinessVisaRequestService({
      repository: {
        ...repository,
        documents: async () => [{ LINE_ID: 4, DOC_FILE_NAME: 'p.pdf' }],
      },
      storage,
      withConnection: (_pool, work) => work({}),
      withTransaction: (_pool, work) => work({}),
    });
    assert.deepEqual(await withDocument.remove('7'), { id: '7' });
    assert.deepEqual(
      calls.filter(([name]) => name === 'deleteDocuments' || name === 'deleteHeader'),
      [
        ['deleteDocuments', '7'],
        ['deleteHeader', '7'],
      ],
    );
    assert.deepEqual(storage.removed, ['4']);
  });

  it('answers 404 when deleting a request that does not exist', async () => {
    const { service } = fakes();
    await assert.rejects(() => service.remove('8'), { statusCode: 404 });
  });
});
