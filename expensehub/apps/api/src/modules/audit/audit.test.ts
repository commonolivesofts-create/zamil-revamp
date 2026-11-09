// M6 Done-when: each audit rule selects a report; adjustments recalc totals and notify;
// the accounting preview balances (debits = credits).
import {
  accountingPreviewSchema,
  auditQueueSchema,
  inboxListSchema,
  reportDetailSchema,
  type ExpenseInput,
  type ReportDetail,
} from '@expensehub/shared';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AuditRuleCode } from '@expensehub/shared';
import { sampleReceipt } from '../../receipts/testing/sample';
import { H, seededApp, signedIn, testClock } from '../../test-utils';

type Agent = request.Agent;
type Ctx = Awaited<ReturnType<typeof setup>>;

/** Seeded app with the random sample off unless a test turns it on (deterministic tests). */
async function setup(
  rules: Partial<Record<AuditRuleCode, { active?: boolean; paramNumber?: number }>> = {},
) {
  const time = testClock('2026-10-18T06:00:00.000Z');
  const ctx = await seededApp({ clock: time.clock });
  await ctx.data.withTransaction(async (r) => {
    for (const rule of await r.auditRules.list()) {
      const over = { RANDOM_PCT: { active: false }, ...rules }[rule.ruleCode];
      if (over) {
        await r.auditRules.update(
          rule.ruleCode,
          {
            active: over.active === undefined ? rule.active : over.active ? 'Y' : 'N',
            paramNumber: over.paramNumber ?? rule.paramNumber,
          },
          { actorId: null },
        );
      }
    }
  });
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

const parse = (res: { body: unknown }) => reportDetailSchema.parse(res.body);

function airfare(ctx: Ctx, amount: string, over: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    typeId: ctx.typeId('AIRFARE'),
    expenseDate: '2026-10-10',
    merchant: `Saudia ${amount}`,
    description: 'Flight to the Jubail plant',
    attendees: null,
    justification: 'Customer visit',
    amount,
    currency: 'SAR',
    quantity: null,
    tripId: null,
    quickPayId: null,
    costCenter: null,
    taxInvoice: false,
    receiptId: null,
    ...over,
  };
}

/** A line with an attached receipt and no warnings (taxInvoice off: no QR total check). */
async function cleanLine(ctx: Ctx, who: string, amount: string): Promise<ExpenseInput> {
  const agent = await ctx.as(who);
  const up = await agent
    .post('/api/v1/receipts')
    .set(H)
    .attach('file', await sampleReceipt(), `${amount}.png`)
    .expect(201);
  return airfare(ctx, amount, { receiptId: up.body.receiptId });
}

/** Creates the lines, submits, and approves every step before the Accountant. */
async function toAccountant(ctx: Ctx, who: string, lines: ExpenseInput[]): Promise<ReportDetail> {
  const agent = await ctx.as(who);
  const ids: number[] = [];
  for (const line of lines)
    ids.push((await agent.post('/api/v1/expenses').set(H).send(line).expect(201)).body.expenseId);
  let report = parse(
    await agent
      .post('/api/v1/reports')
      .set(H)
      .send({ purpose: 'Plant visit', expenseIds: ids })
      .expect(201),
  );
  report = parse(
    await agent
      .post(`/api/v1/reports/${report.reportId}/submit`)
      .set(H)
      .send({ version: report.version })
      .expect(200),
  );
  const holders: Record<string, string> = {
    'Majed Al-Anazi': '1010',
    'Khalid Al-Harbi': '1001',
    'Noura Al-Dosari': '1003',
    'Faisal Al-Qahtani': '1002',
  };
  for (;;) {
    const step = report.steps.find((s) => s.status === 'PENDING')!;
    if (step.isAuditStep) return report;
    report = parse(
      await (
        await ctx.as(holders[step.assigneeName]!)
      )
        .post(`/api/v1/approvals/${step.stepId}/approve`)
        .set(H)
        .send({})
        .expect(200),
    );
  }
}

const emails = (ctx: Ctx) =>
  ctx.data.read(async (r) =>
    (await r.notifications.listRecent(100)).map((n) => ({
      to: n.recipientId,
      template: n.templateCode,
    })),
  );

describe('audit selection end to end (FR-AUD-01/02)', () => {
  it('a clean report is quick-released by the Accountant from the inbox (FR-AUD-02)', async () => {
    const ctx = await setup();
    const report = await toAccountant(ctx, '1011', [await cleanLine(ctx, '1011', '500')]);
    expect(report.status).toBe('PENDING_APPROVAL');
    expect(report.audit).toBeNull();
    const inbox = inboxListSchema.parse(
      (await (await ctx.as('1005')).get('/api/v1/approvals/inbox')).body,
    );
    expect(inbox.items[0]).toMatchObject({ kind: 'APPROVAL', stepName: 'Accountant' });
    const done = parse(
      await (
        await ctx.as('1005')
      )
        .post(`/api/v1/approvals/${inbox.items[0]!.stepId}/approve`)
        .set(H)
        .send({})
        .expect(200),
    );
    expect(done.status).toBe('READY_FOR_PAYMENT');
  });

  it.each([
    ['TOTAL_GT', async (ctx: Ctx) => [await cleanLine(ctx, '1011', '3500')]],
    [
      'ANY_WARNING',
      async (ctx: Ctx) => [
        {
          ...(await cleanLine(ctx, '1011', '180')),
          typeId: ctx.typeId('MEALS'),
          attendees: 'Client',
          justification: null,
        },
      ],
    ],
    ['MISSING_RECEIPT', async (ctx: Ctx) => [airfare(ctx, '500')]],
  ] as const)('%s selects the report', async (rule, lines) => {
    const ctx = await setup();
    const report = await toAccountant(ctx, '1011', await lines(ctx));
    expect(report.status).toBe('PENDING_AUDIT');
    expect(report.audit?.reasons).toContain(rule);
    expect(report.history[0]).toMatchObject({
      action: 'AUDIT_SELECTED',
      toStatus: 'PENDING_AUDIT',
    });
    expect((await emails(ctx))[0]).toEqual({ to: ctx.pid('1005'), template: 'AUDIT_REQUEST' });
  });

  it('RANDOM_PCT at 100 % selects a clean report', async () => {
    const ctx = await setup({ RANDOM_PCT: { active: true, paramNumber: 100 } });
    const report = await toAccountant(ctx, '1011', [await cleanLine(ctx, '1011', '500')]);
    expect(report.audit?.reasons).toEqual(['RANDOM_PCT']);
  });

  it('DUPLICATE selects when switched on', async () => {
    const ctx = await setup({ DUPLICATE: { active: true } });
    const line = await cleanLine(ctx, '1011', '500');
    const twin = await cleanLine(ctx, '1011', '500');
    const report = await toAccountant(ctx, '1011', [line, twin]);
    expect(report.audit?.reasons).toEqual(expect.arrayContaining(['ANY_WARNING', 'DUPLICATE']));
  });
});

describe('audit workspace (FR-AUD-03/04)', () => {
  it('queues, adjusts with totals + email, disallows, previews a balanced journal, releases', async () => {
    const ctx = await setup();
    let report = await toAccountant(ctx, '1011', [airfare(ctx, '4000'), airfare(ctx, '2000')]);
    expect(report.audit?.reasons).toEqual(['ANY_WARNING', 'MISSING_RECEIPT', 'TOTAL_GT']);
    const omar = await ctx.as('1005');

    const queue = auditQueueSchema.parse((await omar.get('/api/v1/audit/queue').expect(200)).body);
    expect(queue.items).toEqual([
      expect.objectContaining({
        reportId: report.reportId,
        totalSar: '6000.00',
        lineCount: 2,
        receipts: 0,
        reasons: report.audit!.reasons,
      }),
    ]);
    const inbox = inboxListSchema.parse((await omar.get('/api/v1/approvals/inbox')).body);
    expect(inbox.items[0]!.kind).toBe('AUDIT');
    // In audit, the approval endpoint does not apply.
    await omar
      .post(`/api/v1/approvals/${inbox.items[0]!.stepId}/approve`)
      .set(H)
      .send({})
      .expect(409);
    expect(report.permissions.canAudit).toBe(false); // seen by the Finance Manager
    expect(parse(await omar.get(`/api/v1/reports/${report.reportId}`)).permissions.canAudit).toBe(
      true,
    );

    const [big, small] = report.lines;
    const adjust = (
      who: Agent,
      line: { expenseId: number },
      approvedAmount: string,
      reason: string,
    ) =>
      who
        .post(`/api/v1/audit/${report.reportId}/lines/${line.expenseId}/adjust`)
        .set(H)
        .send({ approvedAmount, reason });

    expect(
      (await adjust(omar, big!, '4500', 'x').expect(400)).body.error.details.issues[0].path,
    ).toBe('approvedAmount');
    await adjust(omar, big!, '3000', '').expect(400);
    await adjust(await ctx.as('1011'), big!, '3000', 'Mine').expect(403); // not an approver at all
    await adjust(await ctx.as('1002'), big!, '3000', 'Not my step').expect(404);

    report = parse(await adjust(omar, big!, '3000', 'Economy fare only').expect(200));
    expect(report).toMatchObject({
      totalSar: '6000.00',
      cashSar: '5000.00',
      netPayableSar: '5000.00',
    });
    expect(report.lines[0]).toMatchObject({
      amountSar: '4000.00',
      approvedAmountSar: '3000.00',
      adjustmentReason: 'Economy fare only',
    });
    expect(report.history[0]).toMatchObject({
      action: 'LINE_ADJUSTED',
      actorName: 'Omar Al-Shehri',
    });
    expect(report.history[0]!.comment).toContain('SAR 4,000.00 → SAR 3,000.00');
    expect((await emails(ctx))[0]).toEqual({ to: ctx.pid('1011'), template: 'LINE_ADJUSTED' });

    report = parse(await adjust(omar, small!, '0', 'Duplicate of another claim').expect(200));
    expect(report.netPayableSar).toBe('3000.00');
    expect(report.history[0]!.action).toBe('LINE_DISALLOWED');

    const preview = accountingPreviewSchema.parse(
      (await omar.get(`/api/v1/reports/${report.reportId}/accounting-preview`).expect(200)).body,
    );
    expect(preview).toMatchObject({ totalDr: '3000.00', totalCr: '3000.00', balanced: true });
    expect(preview.lines.map((l) => [l.side, l.kind, l.amountSar])).toEqual([
      ['DR', 'EXPENSE', '3000.00'],
      ['CR', 'EMPLOYEE_LIABILITY', '3000.00'],
    ]);
    expect(preview.lines[1]!.account).toBe('IPP.001.110.21510.000.000000');

    report = parse(
      await omar
        .post(`/api/v1/audit/${report.reportId}/release`)
        .set(H)
        .send({ comment: 'Checked' })
        .expect(200),
    );
    expect(report.status).toBe('READY_FOR_PAYMENT');
    expect(report.audit).toMatchObject({
      outcome: 'RELEASED',
      auditorName: 'Omar Al-Shehri',
      notes: 'Checked',
    });
    expect(report.steps.at(-1)).toMatchObject({ status: 'APPROVED', comment: 'Checked' });
    expect((await emails(ctx))[0]).toEqual({ to: ctx.pid('1011'), template: 'REPORT_APPROVED' });
    // Nothing more to do in audit.
    await adjust(omar, big!, '2000', 'late').expect(404);
  });

  it('verifies receipts', async () => {
    const ctx = await setup();
    const report = await toAccountant(ctx, '1011', [await cleanLine(ctx, '1011', '3500')]);
    const receiptId = report.lines[0]!.receipt!.receiptId;
    const omar = await ctx.as('1005');
    const after = parse(
      await omar
        .post(`/api/v1/audit/${report.reportId}/receipts/${receiptId}/verify`)
        .set(H)
        .send({})
        .expect(200),
    );
    expect(after.lines[0]!.receipt!.verified).toBe(true);
    expect(after.history[0]!.action).toBe('RECEIPT_VERIFIED');
    expect((await omar.get('/api/v1/audit/queue')).body.items[0]).toMatchObject({
      receipts: 1,
      receiptsVerified: 1,
    });
    await omar
      .post(`/api/v1/audit/${report.reportId}/receipts/999999/verify`)
      .set(H)
      .send({})
      .expect(404);
  });

  it('rejects with a reason; a resubmission is audited afresh', async () => {
    const ctx = await setup();
    let report = await toAccountant(ctx, '1011', [airfare(ctx, '4000')]);
    const omar = await ctx.as('1005');
    await omar
      .post(`/api/v1/audit/${report.reportId}/lines/${report.lines[0]!.expenseId}/adjust`)
      .set(H)
      .send({ approvedAmount: '1000', reason: 'Cap' })
      .expect(200);
    await omar
      .post(`/api/v1/audit/${report.reportId}/reject`)
      .set(H)
      .send({ comment: '' })
      .expect(400);
    report = parse(
      await omar
        .post(`/api/v1/audit/${report.reportId}/reject`)
        .set(H)
        .send({ comment: 'Attach the invoice' })
        .expect(200),
    );
    expect(report.status).toBe('REJECTED');
    expect(report.audit).toMatchObject({ outcome: 'REJECTED', notes: 'Attach the invoice' });

    const ahmed = await ctx.as('1011');
    report = parse(
      await ahmed
        .post(`/api/v1/reports/${report.reportId}/correct`)
        .set(H)
        .send({ version: report.version })
        .expect(200),
    );
    report = parse(
      await ahmed
        .post(`/api/v1/reports/${report.reportId}/submit`)
        .set(H)
        .send({ version: report.version })
        .expect(200),
    );
    expect(report.lines[0]).toMatchObject({ approvedAmountSar: '4000.00', adjustmentReason: null });
    expect(report.netPayableSar).toBe('4000.00');
  });

  it('the Accountant’s own claim is audited by their supervisor (D-34)', async () => {
    const ctx = await setup();
    const report = await toAccountant(ctx, '1005', [airfare(ctx, '4000')]);
    expect(report.steps.at(-1)).toMatchObject({
      assigneeName: 'Faisal Al-Qahtani',
      note: 'SELF_APPROVAL',
    });
    const faisal = await ctx.as('1002');
    expect(
      inboxListSchema.parse((await faisal.get('/api/v1/approvals/inbox')).body).items[0]!.kind,
    ).toBe('AUDIT');
    await (
      await ctx.as('1005')
    )
      .post(`/api/v1/audit/${report.reportId}/release`)
      .set(H)
      .send({})
      .expect(404);
    const done = parse(
      await faisal.post(`/api/v1/audit/${report.reportId}/release`).set(H).send({}).expect(200),
    );
    expect(done.status).toBe('READY_FOR_PAYMENT');
  });
});

describe('accounting preview (FR-ACC-01)', () => {
  it('splits recoverable VAT from a ZATCA receipt and hides the report from others', async () => {
    const ctx = await setup();
    // D-41 turns VAT recovery off; this covers the switch being turned back on.
    await ctx.data.withTransaction((r) =>
      r.systemOptions.update(
        { optionKey: 'VAT_RECOVERY', businessUnit: '*' },
        { optionValue: 'Y' },
        { actorId: null },
      ),
    );
    const ahmed = await ctx.as('1011');
    const up = await ahmed
      .post('/api/v1/receipts')
      .set(H)
      .attach('file', await sampleReceipt(), 'albaik.png')
      .expect(201);
    const id = (
      await ahmed
        .post('/api/v1/expenses')
        .set(H)
        .send({
          ...airfare(ctx, '115'),
          typeId: ctx.typeId('MEALS'),
          merchant: 'Al Baik',
          attendees: 'Client',
          justification: null,
          taxInvoice: true,
          receiptId: up.body.receiptId,
        })
        .expect(201)
    ).body.expenseId;
    const report = parse(
      await ahmed
        .post('/api/v1/reports')
        .set(H)
        .send({ purpose: 'Lunch', expenseIds: [id] })
        .expect(201),
    );
    const preview = accountingPreviewSchema.parse(
      (await ahmed.get(`/api/v1/reports/${report.reportId}/accounting-preview`).expect(200)).body,
    );
    expect(preview.lines).toEqual([
      {
        side: 'DR',
        kind: 'EXPENSE',
        account: 'IPP.003.127.55210.000.000000',
        accountName: expect.any(String),
        amountSar: '100.00',
      },
      {
        side: 'DR',
        kind: 'INPUT_VAT',
        account: 'IPP.001.110.13410.000.000000',
        accountName: expect.any(String),
        amountSar: '15.00',
      },
      {
        side: 'CR',
        kind: 'EMPLOYEE_LIABILITY',
        account: 'IPP.001.110.21510.000.000000',
        accountName: expect.any(String),
        amountSar: '115.00',
      },
    ]);
    expect(preview.balanced).toBe(true);
    await (
      await ctx.as('1012')
    )
      .get(`/api/v1/reports/${report.reportId}/accounting-preview`)
      .expect(404);
  });
});
