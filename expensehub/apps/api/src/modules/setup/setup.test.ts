// API §10 setup endpoints: access, validation, business rules, history (FR-SET-01/04/05).
import {
  approvalRuleListSchema,
  expenseTypeListSchema,
  meResponseSchema,
  roleAssignmentListSchema,
  setupHistoryListSchema,
  systemOptionListSchema,
} from '@expensehub/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { H, seededApp, signedIn, testClock } from '../../test-utils';

const newType = {
  typeCode: 'parking',
  name: 'Parking',
  nameAr: null,
  category: 'STANDARD',
  naturalAccount: '55240',
  defaultLimitSar: '50',
  limitAction: 'WARN',
  receiptOverSar: '0',
  justificationReq: false,
  attendeesReq: false,
  vatEligible: true,
  unit: null,
  unitRateSar: null,
  icon: 'parking-meter',
  sortOrder: 45,
  isPlaceholder: true,
  active: true,
};

const issuePaths = (res: request.Response) =>
  (res.body.error.details.issues as { path: string }[]).map((i) => i.path);

describe('access (default deny)', () => {
  it('401 signed out, 403 for non-admins, 200 for the admin', async () => {
    const { app } = await seededApp();
    await request(app).get('/api/v1/setup/expense-types').expect(401);
    const accountant = await signedIn(app, '1005');
    await accountant.get('/api/v1/setup/expense-types').expect(403);
    await accountant.get('/api/v1/setup/options').expect(403);
    await accountant.post('/api/v1/setup/role-assignments').set(H).send({}).expect(403);
    const admin = await signedIn(app, '1009');
    await admin.get('/api/v1/setup/expense-types').expect(200);
  });
});

describe('expense types (FR-POL-01)', () => {
  it('creates a type, upper-cases the code and records history', async () => {
    const { app } = await seededApp();
    const admin = await signedIn(app, '1009');
    const res = await admin.post('/api/v1/setup/expense-types').set(H).send(newType).expect(201);
    expect(res.body).toMatchObject({
      typeCode: 'PARKING',
      defaultLimitSar: '50.00',
      receiptOverSar: '0.00',
      version: 1,
    });

    const list = expenseTypeListSchema.parse((await admin.get('/api/v1/setup/expense-types')).body);
    expect(list.items.map((t) => t.typeCode)).toContain('PARKING');

    const history = setupHistoryListSchema.parse(
      (await admin.get('/api/v1/admin/setup-history')).body,
    );
    expect(history.items[0]).toMatchObject({
      tableName: 'EH_EXPENSE_TYPES',
      rowKey: 'PARKING',
      actor: { fullName: 'Yousef Al-Malki' },
      oldJson: null,
    });
    expect(history.items[0]?.newJson).not.toHaveProperty('version');
  });

  it('rejects a duplicate code, an unknown account and an invalid category set-up', async () => {
    const { app } = await seededApp();
    const admin = await signedIn(app, '1009');
    const dup = await admin
      .post('/api/v1/setup/expense-types')
      .set(H)
      .send({ ...newType, typeCode: 'MEALS' })
      .expect(400);
    expect(issuePaths(dup)).toEqual(['typeCode']);
    const account = await admin
      .post('/api/v1/setup/expense-types')
      .set(H)
      .send({ ...newType, naturalAccount: '99999' })
      .expect(400);
    expect(issuePaths(account)).toEqual(['naturalAccount']);
    const mileage = await admin
      .post('/api/v1/setup/expense-types')
      .set(H)
      .send({ ...newType, typeCode: 'KM2', category: 'MILEAGE' })
      .expect(400);
    expect(issuePaths(mileage)).toEqual(expect.arrayContaining(['unit', 'unitRateSar']));
  });

  it('updates with optimistic locking (API §1)', async () => {
    const { app } = await seededApp();
    const admin = await signedIn(app, '1009');
    const meals = expenseTypeListSchema
      .parse((await admin.get('/api/v1/setup/expense-types')).body)
      .items.find((t) => t.typeCode === 'MEALS')!;
    const { typeId, typeCode: _code, updatedAt: _at, ...fields } = meals;
    const ok = await admin
      .patch(`/api/v1/setup/expense-types/${typeId}`)
      .set(H)
      .send({ ...fields, defaultLimitSar: '175.5' })
      .expect(200);
    expect(ok.body).toMatchObject({ defaultLimitSar: '175.50', version: 2 });
    const stale = await admin
      .patch(`/api/v1/setup/expense-types/${typeId}`)
      .set(H)
      .send({ ...fields, defaultLimitSar: '200' })
      .expect(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('system options (FR-SET-01)', () => {
  async function option(admin: request.Agent, key: string, bu = '*') {
    const list = systemOptionListSchema.parse((await admin.get('/api/v1/setup/options')).body);
    return list.items.find((o) => o.optionKey === key && o.businessUnit === bu)!;
  }

  it('validates by key and keeps history', async () => {
    const { app } = await seededApp();
    const admin = await signedIn(app, '1009');
    const ceo = await option(admin, 'CEO_THRESHOLD_SAR');
    await admin
      .patch('/api/v1/setup/options/CEO_THRESHOLD_SAR/*')
      .set(H)
      .send({ optionValue: 'lots', version: ceo.version })
      .expect(400);
    const ok = await admin
      .patch('/api/v1/setup/options/CEO_THRESHOLD_SAR/*')
      .set(H)
      .send({ optionValue: '7500', version: ceo.version })
      .expect(200);
    expect(ok.body).toMatchObject({ optionValue: '7500', version: 2 });

    const acct = await option(admin, 'ACCT_INPUT_VAT', 'FPP');
    const wrongBu = await admin
      .patch('/api/v1/setup/options/ACCT_INPUT_VAT/FPP')
      .set(H)
      .send({ optionValue: 'IPP.001.110.13410.000.000000', version: acct.version })
      .expect(400);
    expect(wrongBu.body.error.message).toMatch(/must be FPP/);

    const history = setupHistoryListSchema.parse(
      (await admin.get('/api/v1/admin/setup-history?table=EH_SYSTEM_OPTIONS')).body,
    );
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({
      rowKey: 'CEO_THRESHOLD_SAR|*',
      oldJson: { optionValue: '5000' },
      newJson: { optionValue: '7500' },
    });
  });
});

describe('approval rules (FR-APR-01, D-37)', () => {
  it('keeps the audit step unique and last, and seq unique per chain', async () => {
    const { app } = await seededApp();
    const admin = await signedIn(app, '1009');
    const rules = approvalRuleListSchema.parse(
      (await admin.get('/api/v1/setup/approval-rules')).body,
    ).items;
    expect(rules.filter((r) => r.chainCode === 'CEO_CLAIMANT').map((r) => r.stepName)).toEqual([
      'Finance Manager',
      'Accountant',
    ]);

    const step = {
      chainCode: 'STANDARD',
      seq: 6,
      stepName: 'Second audit',
      approverSource: 'ROLE',
      roleCode: 'ACCOUNTANT',
      conditionType: 'ALWAYS',
      conditionAmountSar: null,
      isAuditStep: true,
      active: true,
    };
    const twoAudits = await admin
      .post('/api/v1/setup/approval-rules')
      .set(H)
      .send(step)
      .expect(400);
    expect(twoAudits.body.error.message).toMatch(/only one audit step/);

    const dupSeq = await admin
      .post('/api/v1/setup/approval-rules')
      .set(H)
      .send({ ...step, seq: 1, isAuditStep: false })
      .expect(400);
    expect(issuePaths(dupSeq)).toEqual(['seq']);

    // Moving the Finance Manager behind the Accountant would leave the audit step mid-chain.
    const fm = rules.find((r) => r.chainCode === 'STANDARD' && r.stepName === 'Finance Manager')!;
    const { ruleId, chainCode: _c, updatedAt: _u, ...fields } = fm;
    const notLast = await admin
      .patch(`/api/v1/setup/approval-rules/${ruleId}`)
      .set(H)
      .send({ ...fields, seq: 9 })
      .expect(400);
    expect(notLast.body.error.message).toMatch(/must be the last step/);

    // A "total above" CEO step with its own threshold can still be added (FR-APR-02).
    const res = await admin
      .post('/api/v1/setup/approval-rules')
      .set(H)
      .send({
        ...step,
        seq: 2,
        stepName: 'CEO',
        roleCode: 'APPROVER_CEO',
        conditionType: 'TOTAL_GT',
        conditionAmountSar: '6000',
        isAuditStep: false,
      })
      .expect(400); // seq 2 is the Finance Manager
    expect(issuePaths(res)).toEqual(['seq']);
    const added = await admin
      .post('/api/v1/setup/approval-rules')
      .set(H)
      .send({
        ...step,
        seq: 1,
        chainCode: 'CEO_CLAIMANT',
        stepName: 'Board',
        roleCode: 'APPROVER_CEO',
        conditionType: 'TOTAL_GT',
        conditionAmountSar: '6000',
        isAuditStep: false,
      });
    expect(added.status).toBe(400); // seq 1 is taken in that chain too
    // The hierarchy step takes no role.
    const withRole = await admin
      .post('/api/v1/setup/approval-rules')
      .set(H)
      .send({ ...step, seq: 7, approverSource: 'SUPERVISOR_HIERARCHY', isAuditStep: false })
      .expect(400);
    expect(issuePaths(withRole)).toEqual(['roleCode']);
  });
});

describe('audit rules (FR-AUD-01, OQ-33)', () => {
  it('validates the parameter per rule', async () => {
    const { app } = await seededApp();
    const admin = await signedIn(app, '1009');
    await admin
      .patch('/api/v1/setup/audit-rules/RANDOM_PCT')
      .set(H)
      .send({ paramNumber: 150, active: true, version: 1 })
      .expect(400);
    await admin
      .patch('/api/v1/setup/audit-rules/ANY_WARNING')
      .set(H)
      .send({ paramNumber: 5, active: true, version: 1 })
      .expect(400);
    const ok = await admin
      .patch('/api/v1/setup/audit-rules/TOTAL_GT')
      .set(H)
      .send({ paramNumber: 2500, active: true, version: 1 })
      .expect(200);
    expect(ok.body).toMatchObject({ ruleCode: 'TOTAL_GT', paramNumber: 2500, version: 2 });
  });
});

describe('role assignments (FR-SET-04, OQ-02)', () => {
  it('grants a role that applies at once and ends it again', async () => {
    const { app, data } = await seededApp({ clock: testClock('2026-10-18T06:00:00.000Z').clock });
    const admin = await signedIn(app, '1009');
    const majed = await data.read((r) => r.employees.getByPersonNumber('1010'));
    const created = await admin
      .post('/api/v1/setup/role-assignments')
      .set(H)
      .send({
        personId: majed!.personId,
        roleCode: 'ACCOUNTANT',
        businessUnit: 'FPP',
        isBackup: true,
        startDate: '2026-01-01',
        endDate: null,
      })
      .expect(201);
    expect(created.body).toMatchObject({ fullName: 'Majed Al-Anazi', current: true });

    const majedSession = await signedIn(app, '1010');
    expect(
      meResponseSchema.parse((await majedSession.get('/api/v1/auth/me')).body).capabilities,
    ).toContain('ACCOUNTANT');

    const again = await admin
      .post('/api/v1/setup/role-assignments')
      .set(H)
      .send({
        personId: majed!.personId,
        roleCode: 'ACCOUNTANT',
        businessUnit: 'FPP',
        isBackup: false,
        startDate: '2026-01-01',
        endDate: null,
      })
      .expect(400);
    expect(again.body.error.message).toMatch(/already holds/);

    const ended = await admin
      .delete(`/api/v1/setup/role-assignments/${created.body.assignmentId}`)
      .set(H)
      .expect(200);
    expect(ended.body).toMatchObject({ current: false, endDate: '2026-10-17' });
    expect(
      meResponseSchema.parse((await majedSession.get('/api/v1/auth/me')).body).capabilities,
    ).not.toContain('ACCOUNTANT');

    const list = roleAssignmentListSchema.parse(
      (await admin.get('/api/v1/setup/role-assignments')).body,
    );
    expect(list.items.find((a) => a.assignmentId === created.body.assignmentId)?.current).toBe(
      false,
    );
  });

  it('never lets an administrator change their own roles (SoD)', async () => {
    const { app, data } = await seededApp();
    const admin = await signedIn(app, '1009');
    const me = await data.read((r) => r.employees.getByPersonNumber('1009'));
    const res = await admin
      .post('/api/v1/setup/role-assignments')
      .set(H)
      .send({
        personId: me!.personId,
        roleCode: 'ACCOUNTANT',
        businessUnit: null,
        isBackup: false,
        startDate: '2026-01-01',
        endDate: null,
      })
      .expect(403);
    expect(res.body.error.code).toBe('SOD_VIOLATION');
    const own = roleAssignmentListSchema
      .parse((await admin.get('/api/v1/setup/role-assignments')).body)
      .items.find((a) => a.personNumber === '1009')!;
    await admin.delete(`/api/v1/setup/role-assignments/${own.assignmentId}`).set(H).expect(403);
  });
});

describe('reference data (API §3)', () => {
  it('serves enabled COA values to any signed-in user', async () => {
    const { app } = await seededApp();
    const employee = await signedIn(app, '1011');
    const res = await employee.get('/api/v1/ref/coa?segment=LOCATION').expect(200);
    expect(res.body.items.map((v: { value: string }) => v.value)).toEqual(['001', '002', '003']);
    const all = await employee
      .get('/api/v1/ref/coa?segment=LOCATION&includeDisabled=true')
      .expect(200);
    expect(all.body.items).toHaveLength(4);
  });

  it('lets approvers and Finance search employees, not plain employees', async () => {
    const { app } = await seededApp();
    await (await signedIn(app, '1011')).get('/api/v1/ref/employees?q=ahmed').expect(403);
    const manager = await signedIn(app, '1010');
    const res = await manager.get('/api/v1/ref/employees?q=al-sub').expect(200);
    expect(res.body.items.map((e: { personNumber: string }) => e.personNumber)).toEqual(['1011']);
  });
});
