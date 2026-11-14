import assert from 'node:assert/strict';
import test from 'node:test';
import { createTouristVisaService } from '../src/modules/hr/tourist-visa-letters/tourist-visa-letter.service.js';
import { writeBody } from '../src/modules/hr/tourist-visa-letters/tourist-visa-letter.validation.js';

const LETTER = {
  cur_date: '2026-11-07',
  division: 'ZPIL',
  country: 'India',
  employee_no: '100',
  tourism_to: 'Saudi Arabia',
  tourism_from: 'India',
  approval_name: 'Manager',
  position_name: 'HR Manager',
};

test('the letter date and division are required, the other dates may be blank', () => {
  const { error, value } = writeBody.validate({
    ...LETTER,
    pass_issue_date: null,
    nati_issue_date: '',
    contract_expired: null,
  });

  assert.equal(error, undefined);
  assert.equal(value.pass_issue_date, null);
  assert.equal(value.nati_issue_date, '');
  assert.ok(writeBody.validate({ ...LETTER, cur_date: null }).error);
  assert.ok(writeBody.validate({ ...LETTER, division: 'OTHER' }).error);
});

function fakeRepository({ salary = 5000, country = 'India', insertError } = {}) {
  const inserted = [];
  const employee = {
    employee_no: '100',
    employee_name: 'Employee',
    employee_name_ar: 'موظف',
    nationality: 'Indian',
    nationality_ar: 'هندي',
    passport_no: 'P123',
    national_id: 'ID1',
    position: 'Engineer',
    position_ar: 'مهندس',
    country,
    country_ar: 'الهند',
    salary,
    contract: 'Permanent',
  };

  return {
    inserted,
    metadata: async () => [{ column_name: 'CUR_DATE', data_type: 'DATE' }],
    employee: async () => [employee],
    countries: async () => [
      { country: 'India' },
      { country: 'Saudi Arabia' },
      { country: 'Pakistan' },
      { country: 'Germany' },
    ],
    country: async (_c, value) => ({ country_ar: `${value} AR` }),
    approvers: async () => [{ approval_name: 'Manager', position_name: 'HR Manager' }],
    insert: async (_c, data) => {
      if (insertError) throw insertError;
      inserted.push(data);
    },
    get: async (_c, uuid) => ({ uuid, ...inserted[inserted.length - 1] }),
  };
}

const auth = { userId: '1' };
const run = (_pool, work) => work({});

test('create keeps the requester origin instead of the employee country', async () => {
  const repository = fakeRepository({ country: 'India' });
  const service = createTouristVisaService({
    repository,
    withConnection: run,
    withTransaction: run,
  });

  await service.create({ ...LETTER, tourism_from: 'Pakistan', tourism_from_ar: 'باكستان' }, auth);

  assert.equal(repository.inserted[0].tourism_from, 'Pakistan');
  assert.equal(repository.inserted[0].tourism_from_ar, 'باكستان');
});

test('create writes a Hijri letter date without an era suffix', async () => {
  const repository = fakeRepository();
  const service = createTouristVisaService({
    repository,
    withConnection: run,
    withTransaction: run,
  });

  await service.create(LETTER, auth);

  assert.match(repository.inserted[0].cur_date_ar, /^\d{2}\/\d{2}\/\d{4}$/);
});

test('a blank or non-numeric salary is rejected, not stored as zero', async () => {
  for (const salary of ['', '  ', 'not a number']) {
    const repository = fakeRepository({ salary });
    const service = createTouristVisaService({
      repository,
      withConnection: run,
      withTransaction: run,
    });

    await assert.rejects(() => service.create(LETTER, auth), { code: 'SALARY_INVALID' });
    assert.deepEqual(repository.inserted, []);
  }
});

test('a missing passport is identified by the required-field key and is never inserted', async () => {
  const repository = fakeRepository();
  repository.employee = async () => [
    {
      employee_no: '100',
      employee_name: 'Employee',
      nationality: 'Indian',
      passport_no: '',
      national_id: 'ID1',
      position: 'Engineer',
      salary: 5000,
      country: 'India',
    },
  ];
  const service = createTouristVisaService({
    repository,
    withConnection: run,
    withTransaction: run,
  });

  await assert.rejects(service.create(LETTER, auth), (error) => {
    assert.equal(error.code, 'FIELD_REQUIRED');
    assert.match(error.message, /^passport_no is missing from employee master$/);
    return true;
  });
  assert.equal(repository.inserted.length, 0);
});

test('create and update require an authenticated actor before opening a transaction', async () => {
  let transactionCalls = 0;
  const service = createTouristVisaService({
    repository: {},
    withTransaction: async () => {
      transactionCalls += 1;
    },
  });

  for (const operation of [
    () => service.create({}, null),
    () => service.update('record-uuid', {}, null),
  ]) {
    await assert.rejects(operation, (error) => {
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, 'UNAUTHENTICATED');
      return true;
    });
  }

  assert.equal(transactionCalls, 0);
});
