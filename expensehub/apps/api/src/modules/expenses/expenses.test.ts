// FR-CAP / FR-POL phase-1 behaviour through the API (Done-when: BLOCK refuses the save).
import {
  expenseEvaluationSchema,
  expenseListSchema,
  expenseSchema,
  type ExpenseInput,
} from '@expensehub/shared';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import { sampleReceipt } from '../../receipts/testing/sample';
import { H, seededApp, signedIn, testClock } from '../../test-utils';

async function setup(personNumber = '1011') {
  const ctx = await seededApp({ clock: testClock('2026-10-18T06:00:00.000Z').clock });
  const agent = await signedIn(ctx.app, personNumber);
  const types = await ctx.data.read((r) => r.expenseTypes.list());
  const typeId = (code: string) => types.find((t) => t.typeCode === code)!.typeId;
  return { ...ctx, agent, typeId };
}

function line(typeId: number, overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    typeId,
    expenseDate: '2026-10-12',
    merchant: 'Al Baik',
    description: 'Lunch with client',
    attendees: 'Ahmed, Mr. Saleh (client)',
    justification: null,
    amount: '115.00',
    currency: 'SAR',
    quantity: null,
    tripId: null,
    quickPayId: null,
    costCenter: null,
    taxInvoice: true,
    receiptId: null,
    ...overrides,
  };
}

const validate = (agent: request.Agent, body: object) =>
  agent.post('/api/v1/expenses/validate').set(H).send(body).expect(200);

describe('live checklist — POST /expenses/validate (FR-POL-02)', () => {
  it('applies the expense type limit with the UI-UX wording (D-45)', async () => {
    const { agent, typeId } = await setup();
    const res = expenseEvaluationSchema.parse(
      (await validate(agent, line(typeId('MEALS'), { amount: '180' }))).body,
    );
    expect(res).toMatchObject({
      amountSar: '180.00',
      level: 'WARN',
      chargeAccount: 'IPP.003.127.55210.000.000000',
    });
    expect(res.results.find((r) => r.rule === 'LIMIT')?.message).toBe(
      'Meals & entertainment limit is SAR 150.00 — you entered SAR 180.00 (warning, report will be audited).',
    );
    expect(res.segments.map((s) => [s.segment, s.ok])).toEqual([
      ['COMPANY', true],
      ['LOCATION', true],
      ['COST_CENTER', true],
      ['ACCOUNT', true],
      ['SEGMENT5', true],
      ['SEGMENT6', true],
    ]);
  });

  it('links a line to a business trip and checks its dates (FR-TRP-02)', async () => {
    const { agent, typeId } = await setup();
    const res = (
      await validate(
        agent,
        line(typeId('MEALS'), { amount: '120', tripId: 300000030001, expenseDate: '2026-10-06' }),
      )
    ).body;
    expect(res.results.find((r: { rule: string }) => r.rule === 'TRIP')).toMatchObject({
      level: 'PASS',
      message: 'Within the trip to Dubai, United Arab Emirates.',
    });
  });

  it('converts foreign currency at the corporate rate on or before the date (FR-CAP-06)', async () => {
    const { agent, typeId } = await setup();
    const res = (
      await validate(
        agent,
        line(typeId('TAXI'), { amount: '30', currency: 'USD', taxInvoice: false }),
      )
    ).body;
    expect(res).toMatchObject({
      amountSar: '112.50',
      fxRate: '3.75000000',
      fxRateDate: '2026-10-08',
    });
  });

  it('calculates mileage (FR-CAP-05); there is no per diem type (D-45)', async () => {
    const { agent, typeId } = await setup();
    const km = (
      await validate(
        agent,
        line(typeId('MILEAGE'), {
          amount: null,
          merchant: null,
          quantity: '123.5',
          taxInvoice: false,
        }),
      )
    ).body;
    expect(km).toMatchObject({
      amountSar: '92.63',
      quantity: '123.5',
      unitRateSar: '0.7500',
      level: 'PASS',
    });
    expect(() => typeId('PER_DIEM')).toThrow();
  });

  it('flags a cost-centre override that is disabled in Fusion (FR-POL-05)', async () => {
    const { agent, typeId } = await setup();
    const res = (await validate(agent, line(typeId('MEALS'), { costCenter: '199' }))).body;
    expect(res.level).toBe('BLOCK');
    expect(
      res.segments.find((s: { segment: string }) => s.segment === 'COST_CENTER'),
    ).toMatchObject({ value: '199', ok: false });
  });

  it('only accepts the employee’s own approved trips (FR-TRP-02)', async () => {
    const { agent, typeId } = await setup();
    const res = await agent
      .post('/api/v1/expenses/validate')
      .set(H)
      .send(line(typeId('MEALS'), { tripId: 300000030003 }))
      .expect(400);
    expect(res.body.error.details.issues[0].path).toBe('tripId');
  });
});

describe('save — the engine is authoritative (FR-POL-03)', () => {
  it('D-41: no VAT is recovered by default — the line stays gross, no VAT checks', async () => {
    const { agent, typeId } = await setup();
    const receipt = await agent
      .post('/api/v1/receipts')
      .set(H)
      .attach('file', await sampleReceipt(), 'albaik.png')
      .expect(201);
    const res = expenseEvaluationSchema.parse(
      (await validate(agent, line(typeId('MEALS'), { receiptId: receipt.body.receiptId }))).body,
    );
    expect(res).toMatchObject({ vatRecovery: false, vatSar: '0.00', netSar: '115.00' });
    expect(res.results.some((r) => r.rule === 'VAT')).toBe(false);
    // A valid QR still guards the amount.
    const off = (
      await validate(
        agent,
        line(typeId('MEALS'), { amount: '140', receiptId: receipt.body.receiptId }),
      )
    ).body;
    expect(off.results.find((r: { rule: string }) => r.rule === 'QR_TOTAL').level).toBe('WARN');
  });

  it('saves a line with a ZATCA receipt: VAT from the QR when recovery is on (FR-CAP-04/07)', async () => {
    const { agent, typeId, data } = await setup();
    await data.withTransaction((r) =>
      r.systemOptions.update(
        { optionKey: 'VAT_RECOVERY', businessUnit: '*' },
        { optionValue: 'Y' },
        { actorId: null },
      ),
    );
    const receipt = await agent
      .post('/api/v1/receipts')
      .set(H)
      .attach('file', await sampleReceipt(), 'albaik.png')
      .expect(201);
    const res = await agent
      .post('/api/v1/expenses')
      .set(H)
      .send(line(typeId('MEALS'), { receiptId: receipt.body.receiptId }))
      .expect(201);
    const expense = expenseSchema.parse(res.body);
    expect(expense).toMatchObject({
      amountSar: '115.00',
      vatSar: '15.00',
      netSar: '100.00',
      approvedAmountSar: '115.00',
      receiptAttached: true,
      receiptRequired: true,
      policyLevel: 'PASS',
      reportId: null,
      chargeAccount: 'IPP.003.127.55210.000.000000',
      receipt: { receiptId: receipt.body.receiptId, qrValid: true },
    });
    const list = expenseListSchema.parse(
      (await agent.get('/api/v1/expenses?unreported=true')).body,
    );
    expect(list.items.map((e) => e.expenseId)).toEqual([expense.expenseId]);
  });

  it('refuses a BLOCK and saves nothing (Done-when: BLOCK disables save)', async () => {
    const { agent, typeId, data } = await setup();
    const res = await agent
      .post('/api/v1/expenses')
      .set(H)
      .send(line(typeId('TELECOM'), { merchant: 'STC', amount: '350', attendees: null }))
      .expect(422);
    expect(res.body.error.code).toBe('POLICY_BLOCK');
    expect(res.body.error.details.results[0]).toMatchObject({ rule: 'LIMIT', level: 'BLOCK' });
    expect(await data.read((r) => r.expenses.list())).toHaveLength(0);
  });

  it('stores warnings as policy violations and warns on a duplicate (FR-CAP-10)', async () => {
    const { agent, typeId } = await setup();
    const first = await agent
      .post('/api/v1/expenses')
      .set(H)
      .send(line(typeId('MEALS'), { amount: '180', taxInvoice: false }))
      .expect(201);
    expect(first.body.violations.map((v: { ruleCode: string }) => v.ruleCode).sort()).toEqual([
      'LIMIT',
      'RECEIPT',
    ]);
    const second = await agent
      .post('/api/v1/expenses')
      .set(H)
      .send(line(typeId('MEALS'), { amount: '180', taxInvoice: false }))
      .expect(201);
    expect(second.body.violations.map((v: { ruleCode: string }) => v.ruleCode)).toContain(
      'DUPLICATE',
    );
  });

  it('blocks a future date', async () => {
    const { agent, typeId } = await setup();
    const res = await agent
      .post('/api/v1/expenses')
      .set(H)
      .send(line(typeId('MEALS'), { expenseDate: '2026-10-19' }))
      .expect(422);
    expect(res.body.error.details.results[0].rule).toBe('DATE');
  });
});

describe('edit, delete and ownership (FR-CAP-09)', () => {
  it('updates with optimistic locking and re-evaluates', async () => {
    const { agent, typeId } = await setup();
    const created = (
      await agent
        .post('/api/v1/expenses')
        .set(H)
        .send(line(typeId('MEALS'), { taxInvoice: false }))
        .expect(201)
    ).body;
    const updated = await agent
      .patch(`/api/v1/expenses/${created.expenseId}`)
      .set(H)
      .send({
        ...line(typeId('MEALS'), { amount: '160', taxInvoice: false }),
        version: created.version,
      })
      .expect(200);
    expect(updated.body).toMatchObject({ amountSar: '160.00', policyLevel: 'WARN', version: 2 });
    await agent
      .patch(`/api/v1/expenses/${created.expenseId}`)
      .set(H)
      .send({ ...line(typeId('MEALS')), version: created.version })
      .expect(409);
  });

  it('hides other people’s expenses and deletes only one’s own', async () => {
    const { app, agent, typeId, data } = await setup();
    const receipt = await agent
      .post('/api/v1/receipts')
      .set(H)
      .attach('file', await sampleReceipt(), 'r.png')
      .expect(201);
    const created = (
      await agent
        .post('/api/v1/expenses')
        .set(H)
        .send(line(typeId('MEALS'), { receiptId: receipt.body.receiptId }))
        .expect(201)
    ).body;

    const lama = await signedIn(app, '1012');
    await lama.get(`/api/v1/expenses/${created.expenseId}`).expect(404);
    await lama.delete(`/api/v1/expenses/${created.expenseId}`).set(H).expect(404);

    await agent.delete(`/api/v1/expenses/${created.expenseId}`).set(H).expect(204);
    await agent.get(`/api/v1/expenses/${created.expenseId}`).expect(404);
    expect(await data.read((r) => r.receipts.get(receipt.body.receiptId))).toBeUndefined();
    const history = await data.read((r) => r.reportHistory.listFor('EXPENSE', created.expenseId));
    expect(history.map((h) => h.action)).toEqual(['CREATED', 'DELETED']);
  });

  it('will not attach someone else’s receipt', async () => {
    const { app, agent, typeId } = await setup();
    const lama = await signedIn(app, '1012');
    const theirs = await lama
      .post('/api/v1/receipts')
      .set(H)
      .attach('file', await sampleReceipt(), 'r.png')
      .expect(201);
    const res = await agent
      .post('/api/v1/expenses')
      .set(H)
      .send(line(typeId('MEALS'), { receiptId: theirs.body.receiptId }))
      .expect(400);
    expect(res.body.error.details.issues[0].path).toBe('receiptId');
  });
});

describe('reference data for the capture form (API §3)', () => {
  it('lists own approved trips, currencies with a rate, and own Quick Pays', async () => {
    const { agent } = await setup();
    const trips = (await agent.get('/api/v1/ref/trips/mine').expect(200)).body.items;
    expect(trips.map((t: { tripId: number }) => t.tripId)).toEqual([300000030001, 300000030002]);
    expect((await agent.get('/api/v1/ref/currencies').expect(200)).body.items).toEqual([
      'SAR',
      'AED',
      'BHD',
      'EUR',
      'INR',
      'USD',
    ]);
    const qps = (await agent.get('/api/v1/quick-pays/mine').expect(200)).body.items;
    expect(qps).toEqual([
      expect.objectContaining({ elementName: 'Business Trip Allowance', amountSar: '2400.00' }),
    ]);
  });
});
