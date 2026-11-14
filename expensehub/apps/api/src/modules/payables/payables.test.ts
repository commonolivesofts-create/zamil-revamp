// M7 Done-when: in mock mode a report goes READY → INVOICED → PAID from the simulator panel;
// sending twice creates one invoice; a mock 400 shows on the Errors tab with Retry.
import {
  devFusionStateSchema,
  payablesResponseSchema,
  quickPayQueueSchema,
  reportDetailSchema,
  sendResultSchema,
  type ExpenseInput,
  type ReportDetail,
} from '@expensehub/shared';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import { sampleReceipt } from '../../receipts/testing/sample';
import { H, seededApp, signedIn, testClock } from '../../test-utils';

type Agent = request.Agent;
type Ctx = Awaited<ReturnType<typeof setup>>;

async function setup() {
  const time = testClock('2026-10-18T06:00:00.000Z');
  const ctx = await seededApp({ clock: time.clock });
  // Deterministic: no random audit sample.
  await ctx.data.withTransaction((r) =>
    r.auditRules.update('RANDOM_PCT', { active: 'N' }, { actorId: null }),
  );
  const types = await ctx.data.read((r) => r.expenseTypes.list());
  const typeId = (code: string) => types.find((t) => t.typeCode === code)!.typeId;
  const people = await ctx.data.read((r) => r.employees.list());
  const pid = (n: string) => people.find((p) => p.personNumber === n)!.personId;
  const agents = new Map<string, Agent>();
  const as = async (n: string) => {
    if (!agents.has(n)) agents.set(n, await signedIn(ctx.app, n));
    return agents.get(n)!;
  };
  return { ...ctx, time, typeId, pid, as };
}

const HOLDERS: Record<string, string> = {
  'Majed Al-Anazi': '1010',
  'Khalid Al-Harbi': '1001',
  'Noura Al-Dosari': '1003',
  'Faisal Al-Qahtani': '1002',
  'Omar Al-Shehri': '1005',
};

/** A clean SAR <amount> claim with a receipt, approved through every step → READY_FOR_PAYMENT. */
async function readyReport(ctx: Ctx, amount = '500'): Promise<ReportDetail> {
  const ahmed = await ctx.as('1011');
  const up = await ahmed
    .post('/api/v1/receipts')
    .set(H)
    .attach('file', await sampleReceipt(), 'r.png')
    .expect(201);
  const line: ExpenseInput = {
    typeId: ctx.typeId('AIRFARE'),
    expenseDate: '2026-10-10',
    merchant: `Saudia ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Flight to Jubail',
    attendees: null,
    justification: 'Customer visit',
    amount,
    currency: 'SAR',
    quantity: null,
    tripId: null,
    quickPayId: null,
    costCenter: null,
    taxInvoice: false,
    receiptId: up.body.receiptId,
  };
  const id = (await ahmed.post('/api/v1/expenses').set(H).send(line).expect(201)).body.expenseId;
  let report = reportDetailSchema.parse(
    (
      await ahmed
        .post('/api/v1/reports')
        .set(H)
        .send({ purpose: 'Jubail visit', expenseIds: [id] })
        .expect(201)
    ).body,
  );
  report = reportDetailSchema.parse(
    (
      await ahmed
        .post(`/api/v1/reports/${report.reportId}/submit`)
        .set(H)
        .send({ version: report.version })
        .expect(200)
    ).body,
  );
  while (report.status === 'PENDING_APPROVAL') {
    const step = report.steps.find((s) => s.status === 'PENDING')!;
    report = reportDetailSchema.parse(
      (
        await (
          await ctx.as(HOLDERS[step.assigneeName]!)
        )
          .post(`/api/v1/approvals/${step.stepId}/approve`)
          .set(H)
          .send({})
          .expect(200)
      ).body,
    );
  }
  expect(report.status).toBe('READY_FOR_PAYMENT');
  return report;
}

const finance = (ctx: Ctx) => ctx.as('1007');
const send = async (ctx: Ctx, ids: number[]) =>
  sendResultSchema.parse(
    (await (await finance(ctx)).post('/api/v1/payables/send').set(H).send({ ids }).expect(200))
      .body,
  ).items;
const payables = async (ctx: Ctx) =>
  payablesResponseSchema.parse(
    (await (await finance(ctx)).get('/api/v1/payables').expect(200)).body,
  ).items;
const item = async (ctx: Ctx, reportId: number) =>
  (await payables(ctx)).find((i) => i.reportId === reportId)!;
const simulator = async (ctx: Ctx, invoiceId: number, action: string) =>
  devFusionStateSchema.parse(
    (
      await (
        await finance(ctx)
      )
        .post(`/api/v1/dev/fusion/invoices/${invoiceId}/${action}`)
        .set(H)
        .send({})
        .expect(200)
    ).body,
  );
const invoicesInMock = (ctx: Ctx, number: string) =>
  ctx.fusion.listInvoices().filter((i) => i.InvoiceNumber === number);

describe('INT-08 send to Payables (FR-PAY-01/05)', () => {
  it('READY → INVOICED → PAID from the simulator panel (Done-when)', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    expect((await item(ctx, report.reportId)).queue).toBe('READY');

    const [result] = await send(ctx, [report.reportId]);
    expect(result).toMatchObject({
      ok: true,
      invoiceNumber: report.reportNumber,
      reused: false,
      warnings: [],
    });
    const invoiced = await item(ctx, report.reportId);
    expect(invoiced).toMatchObject({
      status: 'INVOICED',
      queue: 'INVOICED',
      fusionInvoiceNum: report.reportNumber,
      fusionStatus: 'Not validated',
    });

    const [mockInvoice] = invoicesInMock(ctx, report.reportNumber!);
    expect(mockInvoice).toMatchObject({
      InvoiceAmount: 500,
      SupplierNumber: '1011', // D-42: supplier number = person number
      BusinessUnit: 'IPP BU',
    });
    expect(ctx.fusion.calls.find((c) => c.target === 'createInvoice')!.params).toMatchObject({
      SupplierSite: 'IPP-EMP',
      PaymentMethodCode: 'EFT',
      PayGroup: 'EMPLOYEES',
      PaymentTerms: 'Immediate',
    });
    expect(mockInvoice!.attachments).toEqual(['r.png']); // OQ-17
    expect(mockInvoice!.lines[0]).toMatchObject({
      LineAmount: 500,
      DistributionCombination: 'IPP.003.127.55230.000.000000',
    });

    const state = await simulator(ctx, invoiced.fusionInvoiceId!, 'pay');
    expect(state.invoices.find((i) => i.invoiceId === invoiced.fusionInvoiceId)!.ref).toMatchObject(
      { kind: 'REPORT', status: 'PAID' },
    );
    const paid = await item(ctx, report.reportId);
    expect(paid).toMatchObject({ status: 'PAID', queue: 'PAID', paymentRef: 'PAY-2026-000001' });

    const detail = reportDetailSchema.parse(
      (await (await ctx.as('1011')).get(`/api/v1/reports/${report.reportId}`)).body,
    );
    expect(detail.history.slice(0, 2).map((h) => h.action)).toEqual(['PAID', 'SENT_TO_PAYABLES']);
    const mail = await ctx.data.read((r) => r.notifications.listRecent(1));
    expect(mail[0]).toMatchObject({ recipientId: ctx.pid('1011'), templateCode: 'REPORT_PAID' });
  });

  it('sending twice — or at the same time — creates one invoice (Done-when)', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    const [first, second] = await Promise.all([
      send(ctx, [report.reportId]),
      send(ctx, [report.reportId]),
    ]);
    const again = await send(ctx, [report.reportId]);
    expect(invoicesInMock(ctx, report.reportNumber!)).toHaveLength(1);
    expect([first[0]!.ok, second[0]!.ok].filter(Boolean)).toHaveLength(1); // the other: "already being sent"
    expect(again[0]).toMatchObject({ ok: true, reused: true });
  });

  it('reuses an invoice Fusion already has (idempotency check before POST)', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    // As if a previous send reached Fusion but ExpenseHub never saved the answer.
    await ctx.fusion.createInvoice({
      InvoiceNumber: report.reportNumber!,
      InvoiceCurrency: 'SAR',
      PaymentCurrency: 'SAR',
      InvoiceAmount: 500,
      InvoiceDate: '2026-10-18',
      BusinessUnit: 'IPP BU',
      Supplier: 'Ahmed Al-Subaie',
      SupplierNumber: '1011',
      SupplierSite: 'IPP-EMP',
      InvoiceType: 'Standard',
      InvoiceSource: 'EXPENSEHUB',
      Description: 'x',
      PaymentMethodCode: 'EFT',
      PayGroup: 'EMPLOYEES',
      PaymentTerms: 'Immediate',
      invoiceLines: [],
    });
    const [result] = await send(ctx, [report.reportId]);
    expect(result).toMatchObject({ ok: true, reused: true });
    expect(invoicesInMock(ctx, report.reportNumber!)).toHaveLength(1);
    expect(ctx.fusion.calls.filter((c) => c.target === 'createInvoice')).toHaveLength(1);
  });

  it('a Fusion 400 lands on the Errors tab and Retry sends it (Done-when)', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    await (
      await finance(ctx)
    )
      .post('/api/v1/dev/fusion/fail-next')
      .set(H)
      .send({ target: 'createInvoice', httpStatus: 400 })
      .expect(200);

    const [result] = await send(ctx, [report.reportId]);
    expect(result).toMatchObject({
      ok: false,
      error: 'Fusion HTTP 400: Mock HTTP 400 from Fusion',
    });
    expect(await item(ctx, report.reportId)).toMatchObject({
      status: 'READY_FOR_PAYMENT',
      queue: 'ERROR',
      syncError: 'Fusion HTTP 400: Mock HTTP 400 from Fusion',
    });
    // 4xx is never retried (INTEGRATION §2.4).
    const log = await ctx.data.read((r) =>
      r.integrationLog.list({ interface: 'INT-08', status: 'ERROR' }),
    );
    expect(log[0]).toMatchObject({
      httpStatus: 400,
      retries: 0,
      refType: 'REPORT',
      refId: String(report.reportId),
      direction: 'OUT',
    });

    const retried = sendResultSchema.parse(
      (
        await (
          await finance(ctx)
        )
          .post(`/api/v1/payables/${report.reportId}/retry`)
          .set(H)
          .send({})
          .expect(200)
      ).body,
    ).items[0];
    expect(retried).toMatchObject({ ok: true });
    expect(await item(ctx, report.reportId)).toMatchObject({ queue: 'INVOICED', syncError: null });
  });

  it('retries 5xx and succeeds (INTEGRATION §2.4)', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    ctx.fusion.failNext('createInvoice', 503, 2);
    expect((await send(ctx, [report.reportId]))[0]).toMatchObject({ ok: true });
    const log = await ctx.data.read((r) => r.integrationLog.list({ interface: 'INT-08' }));
    expect(log.find((l) => l.httpMethod === 'POST' && l.url?.endsWith('/invoices'))).toMatchObject({
      status: 'OK',
      retries: 2,
    });
  });

  it('refuses without a supplier in Payables (INT-07) — no call to Fusion', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    await ctx.data.withTransaction(async (r) => {
      const e = (await r.employees.get(ctx.pid('1011')))!;
      await r.employees.upsert({ ...e, payeeOk: 'N' });
    });
    const [result] = await send(ctx, [report.reportId]);
    expect(result).toMatchObject({ ok: false });
    expect(ctx.fusion.calls.filter((c) => c.target === 'createInvoice')).toHaveLength(0);
    expect(await item(ctx, report.reportId)).toMatchObject({ queue: 'ERROR', payeeReady: false });
  });
});

describe('INT-09 status (INTEGRATION §6)', () => {
  it('cancelled in Fusion → back to ready with a flag; sending again creates a new invoice', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    await send(ctx, [report.reportId]);
    const first = (await item(ctx, report.reportId)).fusionInvoiceId!;
    await simulator(ctx, first, 'cancel');
    expect(await item(ctx, report.reportId)).toMatchObject({
      status: 'READY_FOR_PAYMENT',
      queue: 'ERROR',
      syncError: 'Cancelled in Fusion',
      fusionInvoiceId: null,
    });
    expect((await send(ctx, [report.reportId]))[0]).toMatchObject({ ok: true, reused: false });
    expect(invoicesInMock(ctx, report.reportNumber!)).toHaveLength(2);
  });

  it('a voided payment puts the report back to invoiced', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    await send(ctx, [report.reportId]);
    const id = (await item(ctx, report.reportId)).fusionInvoiceId!;
    await simulator(ctx, id, 'pay');
    await simulator(ctx, id, 'void');
    expect(await item(ctx, report.reportId)).toMatchObject({
      status: 'INVOICED',
      queue: 'ERROR',
      paymentRef: null,
      syncError: 'Payment voided in Fusion',
    });
  });

  it('auto-advance: each status poll moves the invoice one step (D-36)', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    await send(ctx, [report.reportId]);
    const agent = await finance(ctx);
    await agent.post('/api/v1/dev/fusion/auto-advance').set(H).send({ enabled: true }).expect(200);
    await agent.post('/api/v1/payables/refresh-status').set(H).send({}).expect(200);
    expect(await item(ctx, report.reportId)).toMatchObject({
      status: 'INVOICED',
      fusionStatus: 'Validated',
    });
    const run = (await agent.post('/api/v1/payables/refresh-status').set(H).send({}).expect(200))
      .body;
    expect(run).toMatchObject({ status: 'OK', rowsChanged: 1 });
    expect((await item(ctx, report.reportId)).status).toBe('PAID');
  });
});

describe('Quick Pays (FR-QP-02/03/04)', () => {
  it('queues, invoices once, pays, and excludes with a reason', async () => {
    const ctx = await setup();
    const agent = await finance(ctx);
    const list = async () =>
      quickPayQueueSchema.parse((await agent.get('/api/v1/quick-pays').expect(200)).body).items;
    const items = await list();
    expect(items.map((i) => [i.employeeName, i.status])).toEqual(
      expect.arrayContaining([
        ['Lama Al-Juhani', 'NEW'],
        ['Ahmed Al-Subaie', 'PAID'],
        ['Bandar Al-Rashidi', 'NEW'],
      ]),
    );
    const lama = items.find((i) => i.employeeName === 'Lama Al-Juhani')!;
    const res = sendResultSchema.parse(
      (
        await agent
          .post('/api/v1/quick-pays/invoice')
          .set(H)
          .send({ ids: [lama.quickPayId] })
          .expect(200)
      ).body,
    );
    expect(res.items[0]).toMatchObject({ ok: true, invoiceNumber: 'QP-IPP-2026-000002' });
    await agent
      .post('/api/v1/quick-pays/invoice')
      .set(H)
      .send({ ids: [lama.quickPayId] })
      .expect(200);
    expect(invoicesInMock(ctx, 'QP-IPP-2026-000002')).toHaveLength(1);
    expect(invoicesInMock(ctx, 'QP-IPP-2026-000002')[0]!.lines[0]).toMatchObject({
      LineAmount: 1500,
      DistributionCombination: 'IPP.001.110.55290.000.000000',
    });

    const invoiced = (await list()).find((i) => i.quickPayId === lama.quickPayId)!;
    expect(invoiced).toMatchObject({ status: 'INVOICED', fusionStatus: 'Not validated' });
    await simulator(ctx, invoiced.fusionInvoiceId!, 'pay');
    expect((await list()).find((i) => i.quickPayId === lama.quickPayId)).toMatchObject({
      status: 'PAID',
      paymentRef: expect.stringMatching(/^PAY-2026-/),
    });

    const bandar = items.find((i) => i.employeeName === 'Bandar Al-Rashidi')!;
    await agent
      .post(`/api/v1/quick-pays/${bandar.quickPayId}/exclude`)
      .set(H)
      .send({ reason: '' })
      .expect(400);
    await agent
      .post(`/api/v1/quick-pays/${bandar.quickPayId}/exclude`)
      .set(H)
      .send({ reason: 'Paid through payroll' })
      .expect(204);
    expect((await list()).find((i) => i.quickPayId === bandar.quickPayId)).toMatchObject({
      status: 'EXCLUDED',
      excludedReason: 'Paid through payroll',
    });
    const blocked = sendResultSchema.parse(
      (
        await agent
          .post('/api/v1/quick-pays/invoice')
          .set(H)
          .send({ ids: [bandar.quickPayId] })
          .expect(200)
      ).body,
    );
    expect(blocked.items[0]).toMatchObject({ ok: false, error: 'This Quick Pay was excluded.' });
  });

  it('a Quick Pay for an employee without a bank goes to ERROR', async () => {
    const ctx = await setup();
    const agent = await finance(ctx);
    const items = quickPayQueueSchema.parse(
      (await agent.get('/api/v1/quick-pays?status=NEW')).body,
    ).items;
    const noBank = items.find((i) => i.personNumber === '1014')!;
    expect(noBank.payeeReady).toBe(false);
    const res = sendResultSchema.parse(
      (
        await agent
          .post('/api/v1/quick-pays/invoice')
          .set(H)
          .send({ ids: [noBank.quickPayId] })
          .expect(200)
      ).body,
    );
    expect(res.items[0]!.ok).toBe(false);
    expect(
      quickPayQueueSchema.parse((await agent.get('/api/v1/quick-pays?status=ERROR')).body).items[0],
    ).toMatchObject({ quickPayId: noBank.quickPayId });
  });
});

describe('jobs and access', () => {
  it('send-invoices only sends in AUTO mode (OQ-16)', async () => {
    const ctx = await setup();
    const report = await readyReport(ctx);
    expect(await ctx.services.jobs.run('send-invoices')).toMatchObject({
      status: 'OK',
      rowsRead: 0,
    });
    await ctx.data.withTransaction((r) =>
      r.systemOptions.update(
        { optionKey: 'INVOICE_SEND_MODE', businessUnit: '*' },
        { optionValue: 'AUTO' },
        { actorId: null },
      ),
    );
    expect(await ctx.services.jobs.run('send-invoices')).toMatchObject({
      status: 'OK',
      rowsRead: 1,
      rowsChanged: 1,
    });
    expect((await item(ctx, report.reportId)).status).toBe('INVOICED');
  });

  it('is Finance AP only', async () => {
    const ctx = await setup();
    await (await ctx.as('1011')).get('/api/v1/payables').expect(403);
    await (
      await ctx.as('1005')
    )
      .post('/api/v1/payables/send')
      .set(H)
      .send({ ids: [1] })
      .expect(403);
    await (await ctx.as('1011')).get('/api/v1/quick-pays').expect(403);
  });
});
