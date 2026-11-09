// D-49: a report goes up the line-manager hierarchy → Finance Manager → Accountant;
// the CEO's own claim goes Finance Manager → Accountant (D-37);
// a role holder's own claim goes to their HCM supervisor (D-34); every transition is in history.
import {
  inboxListSchema,
  reportDetailSchema,
  reportListSchema,
  type ApprovalStepDto,
  type ExpenseInput,
  type ReportDetail,
} from '@expensehub/shared';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import { H, seededApp, signedIn, testClock } from '../../test-utils';

type Agent = request.Agent;
type Ctx = Awaited<ReturnType<typeof setup>>;

async function setup() {
  const time = testClock('2026-10-18T06:00:00.000Z');
  const ctx = await seededApp({ clock: time.clock });
  const types = await ctx.data.read((r) => r.expenseTypes.list());
  const typeId = (code: string) => types.find((t) => t.typeCode === code)!.typeId;
  const people = await ctx.data.read((r) => r.employees.list());
  const pid = (number: string) => people.find((p) => p.personNumber === number)!.personId;
  const agents = new Map<string, Agent>();
  const as = async (number: string) => {
    if (!agents.has(number)) agents.set(number, await signedIn(ctx.app, number));
    return agents.get(number)!;
  };
  return { ...ctx, time, typeId, pid, as };
}

/** An airfare line (no limit; justification required) that passes policy with a WARN at most. */
function airfare(ctx: Ctx, amount: string, over: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    typeId: ctx.typeId('AIRFARE'),
    expenseDate: '2026-10-10',
    merchant: 'Saudia',
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

async function newExpense(agent: Agent, body: ExpenseInput): Promise<number> {
  return (await agent.post('/api/v1/expenses').set(H).send(body).expect(201)).body.expenseId;
}

async function draft(
  ctx: Ctx,
  who: string,
  amounts: string[],
  purpose = 'Plant visit',
): Promise<ReportDetail> {
  const agent = await ctx.as(who);
  const ids: number[] = [];
  for (const [i, amount] of amounts.entries()) {
    ids.push(await newExpense(agent, airfare(ctx, amount, { merchant: `Saudia ${i}` })));
  }
  const res = await agent
    .post('/api/v1/reports')
    .set(H)
    .send({ purpose, expenseIds: ids })
    .expect(201);
  return reportDetailSchema.parse(res.body);
}

async function submit(ctx: Ctx, who: string, report: ReportDetail, status = 200) {
  const res = await (
    await ctx.as(who)
  )
    .post(`/api/v1/reports/${report.reportId}/submit`)
    .set(H)
    .send({ version: report.version })
    .expect(status);
  return status === 200 ? reportDetailSchema.parse(res.body) : res.body;
}

/** The pending step of a report, acted on by whoever holds it. */
async function act(
  ctx: Ctx,
  who: string,
  report: ReportDetail,
  action: 'approve' | 'reject' | 'request-info',
  comment?: string,
  status = 200,
) {
  const step = report.steps.find((s) => s.status === 'PENDING')!;
  const res = await (
    await ctx.as(who)
  )
    .post(`/api/v1/approvals/${step.stepId}/${action}`)
    .set(H)
    .send(comment === undefined ? {} : { comment })
    .expect(status);
  return status === 200 ? reportDetailSchema.parse(res.body) : res.body;
}

const route = (d: ReportDetail) =>
  d.steps.map((s) => `${s.stepName}:${s.status === 'SKIPPED' ? 'skipped' : s.assigneeName}`);

const emails = (ctx: Ctx) =>
  ctx.data.read(async (r) =>
    (await r.notifications.listRecent(100)).map((n) => ({
      to: n.recipientId,
      template: n.templateCode,
    })),
  );

describe('submit builds the chain (FR-APR-01, D-49)', () => {
  it('SAR 6,000 goes up the line-manager hierarchy → Finance Manager → Accountant, then ready for payment', async () => {
    const ctx = await setup();
    let report = await draft(ctx, '1011', ['4000', '2000']);
    expect(report).toMatchObject({
      status: 'DRAFT',
      reportNumber: null,
      totalSar: '6000.00',
      lineCount: 2,
    });

    report = await submit(ctx, '1011', report);
    expect(report.status).toBe('PENDING_APPROVAL');
    expect(report.reportNumber).toBe('EH-IPP-2026-000001');
    // 1011 → line manager 1010 → their manager 1001 (top of HCM).
    expect(route(report)).toEqual([
      'Line Manager:Majed Al-Anazi',
      'Line Manager · level 2:Khalid Al-Harbi',
      'Finance Manager:Faisal Al-Qahtani',
      'Accountant:Omar Al-Shehri',
    ]);
    expect(report.currentStep).toMatchObject({
      stepName: 'Line Manager',
      assigneeName: 'Majed Al-Anazi',
      since: '2026-10-18T06:00:00.000Z',
    });

    for (const approver of ['1010', '1001', '1002']) {
      ctx.time.advance(3_600_000);
      report = await act(
        ctx,
        approver,
        report,
        'approve',
        approver === '1001' ? 'OK for the plant' : undefined,
      );
    }
    // OQ-03: the Accountant step is the audit; > SAR 3,000 selects it (FR-AUD-01, OQ-33).
    expect(report.status).toBe('PENDING_AUDIT');
    ctx.time.advance(3_600_000);
    report = reportDetailSchema.parse(
      (
        await (
          await ctx.as('1005')
        )
          .post(`/api/v1/audit/${report.reportId}/release`)
          .set(H)
          .send({})
          .expect(200)
      ).body,
    );
    expect(report.status).toBe('READY_FOR_PAYMENT');
    expect(report.steps.every((s) => s.status === 'APPROVED')).toBe(true);
    expect(report.steps[1]).toMatchObject({
      actedByName: 'Khalid Al-Harbi',
      comment: 'OK for the plant',
    });

    // Every transition is in the history (newest first), with who and when.
    expect(report.history.map((h) => h.action).reverse()).toEqual([
      'CREATED',
      'SUBMITTED',
      'STEP_APPROVED',
      'STEP_APPROVED',
      'STEP_APPROVED',
      'AUDIT_SELECTED',
      'STEP_APPROVED',
      'AUDIT_RELEASED',
    ]);
    expect(report.history[0]).toMatchObject({
      actorName: 'Omar Al-Shehri',
      toStatus: 'READY_FOR_PAYMENT',
    });

    // Each approver was emailed in turn; the claimant hears about the outcome.
    const sent = await emails(ctx);
    expect(
      sent
        .filter((m) => m.template === 'APPROVAL_REQUEST')
        .map((m) => m.to)
        .reverse(),
    ).toEqual(['1010', '1001', '1002'].map(ctx.pid));
    expect(sent).toContainEqual({ to: ctx.pid('1005'), template: 'AUDIT_REQUEST' });
    expect(sent[0]).toEqual({ to: ctx.pid('1011'), template: 'REPORT_APPROVED' });
  });

  it('APPROVAL_MAX_LEVELS limits how far up the hierarchy goes', async () => {
    const ctx = await setup();
    await ctx.data.withTransaction((r) =>
      r.systemOptions.update(
        { optionKey: 'APPROVAL_MAX_LEVELS', businessUnit: '*' },
        { optionValue: '1' },
        { actorId: null },
      ),
    );
    const report = await submit(ctx, '1011', await draft(ctx, '1011', ['1000']));
    expect(route(report)).toEqual([
      'Line Manager:Majed Al-Anazi',
      'Finance Manager:Faisal Al-Qahtani',
      'Accountant:Omar Al-Shehri',
    ]);
  });

  it('the CEO’s own claim goes Finance Manager → Accountant (D-37)', async () => {
    const ctx = await setup();
    const report = await submit(ctx, '1001', await draft(ctx, '1001', ['9000']));
    expect(route(report)).toEqual([
      'Finance Manager:Faisal Al-Qahtani',
      'Accountant:Omar Al-Shehri',
    ]);
  });

  it('a role holder’s own step goes to their HCM supervisor (D-34)', async () => {
    const ctx = await setup();
    // The Finance Manager (supervisor: the CEO) claims SAR 1,000.
    const report = await submit(ctx, '1002', await draft(ctx, '1002', ['1000']));
    expect(route(report)).toEqual([
      'Line Manager:Khalid Al-Harbi',
      'Finance Manager:Khalid Al-Harbi',
      'Accountant:Omar Al-Shehri',
    ]);
    expect(report.steps[1]!.note).toBe('SELF_APPROVAL');
  });

  it('uses the claimant’s BU role holders (OQ-02: per business unit)', async () => {
    const ctx = await setup();
    const report = await submit(ctx, '1013', await draft(ctx, '1013', ['500']));
    expect(route(report).at(-1)).toMatch(/^Accountant:/);
    expect(route(report).at(-1)).not.toBe('Accountant:Omar Al-Shehri'); // FPP's accountant
  });
});

describe('submit is refused when it cannot go anywhere (FR-SET-02, FR-APR-08, FR-REP-03)', () => {
  it('without a line manager or reimbursement set-up', async () => {
    const ctx = await setup();
    const noManager = await submit(ctx, '1016', await draft(ctx, '1016', ['100']), 422);
    expect(noManager.error.code).toBe('PREREQUISITE_MISSING');
    expect(noManager.error.details.checks[0].code).toBe('LINE_MANAGER');
    const noBank = await submit(ctx, '1014', await draft(ctx, '1014', ['100']), 422);
    expect(noBank.error.details.checks[0]).toMatchObject({ code: 'PAYEE', contact: 'FINANCE' });
  });

  it('when a line now breaks a blocking rule (re-checked at submit)', async () => {
    const ctx = await setup();
    const report = await draft(ctx, '1011', ['500']);
    // Fusion disabled the employee's cost centre after the line was saved (FR-POL-05).
    await ctx.data.withTransaction(async (r) => {
      const cc = (await r.coaValues.get({ segment: 'COST_CENTER', value: '127' }))!;
      await r.coaValues.upsert({ ...cc, enabled: 'N' });
    });
    const res = await submit(ctx, '1011', report, 422);
    expect(res.error.code).toBe('POLICY_BLOCK');
    expect(res.error.details.lines[0].results[0].rule).toBe('ACCOUNT');
    const after = await (
      await ctx.as('1011')
    )
      .get(`/api/v1/reports/${report.reportId}`)
      .expect(200);
    expect(after.body).toMatchObject({ status: 'DRAFT', reportNumber: null });
  });
});

describe('reject → correct → resubmit (FR-APR-04, FR-REP-04)', () => {
  it('needs a reason, cancels the rest, and restarts from step 1 with the same number', async () => {
    const ctx = await setup();
    let report = await submit(ctx, '1011', await draft(ctx, '1011', ['1000']));
    report = await act(ctx, '1010', report, 'approve');

    const noReason = await act(ctx, '1001', report, 'reject', '', 400);
    expect(noReason.error.code).toBe('VALIDATION');
    report = await act(ctx, '1001', report, 'reject', 'Attach the boarding pass');
    expect(report.status).toBe('REJECTED');
    expect(report.steps.map((s: ApprovalStepDto) => s.status)).toEqual([
      'APPROVED',
      'REJECTED',
      'CANCELLED',
      'CANCELLED',
    ]);
    expect(report.history[0]).toMatchObject({
      action: 'REJECTED',
      comment: 'Attach the boarding pass',
      stepName: 'Line Manager · level 2',
    });
    expect((await emails(ctx))[0]).toEqual({ to: ctx.pid('1011'), template: 'REPORT_REJECTED' });

    const claimant = await ctx.as('1011');
    const corrected = await claimant
      .post(`/api/v1/reports/${report.reportId}/correct`)
      .set(H)
      .send({ version: report.version })
      .expect(200);
    expect(corrected.body.status).toBe('DRAFT');
    report = await submit(ctx, '1011', reportDetailSchema.parse(corrected.body));
    expect(report.reportNumber).toBe('EH-IPP-2026-000001');
    expect(report.steps.every((s: ApprovalStepDto) => s.cycleNo === 2)).toBe(true);
    expect(report.currentStep?.stepName).toBe('Line Manager');
  });
});

describe('withdraw (FR-REP-05)', () => {
  it('works until the first approval, then is refused', async () => {
    const ctx = await setup();
    const claimant = await ctx.as('1011');
    let report = await submit(ctx, '1011', await draft(ctx, '1011', ['1000']));
    const withdrawn = await claimant
      .post(`/api/v1/reports/${report.reportId}/withdraw`)
      .set(H)
      .send({ version: report.version })
      .expect(200);
    expect(withdrawn.body.status).toBe('DRAFT');
    expect((await emails(ctx))[0]).toEqual({ to: ctx.pid('1010'), template: 'REPORT_WITHDRAWN' });

    report = await submit(ctx, '1011', reportDetailSchema.parse(withdrawn.body));
    report = await act(ctx, '1010', report, 'approve');
    const late = await claimant
      .post(`/api/v1/reports/${report.reportId}/withdraw`)
      .set(H)
      .send({ version: report.version })
      .expect(409);
    expect(late.body.error.code).toBe('INVALID_STATE');
  });
});

describe('request more information (OQ-06 proposal)', () => {
  it('flags the report, allows purpose and justification edits only, and returns on reply', async () => {
    const ctx = await setup();
    const claimant = await ctx.as('1011');
    let report = await submit(ctx, '1011', await draft(ctx, '1011', ['1000']));
    report = await act(ctx, '1010', report, 'request-info', 'Which customer?');
    expect(report).toMatchObject({ status: 'PENDING_APPROVAL', infoRequested: true });
    expect((await emails(ctx))[0]).toEqual({ to: ctx.pid('1011'), template: 'INFO_REQUESTED' });

    // The claimant may refine the justification, not the amount (DB-06).
    const line = report.lines[0]!;
    const base = airfare(ctx, '1000', { merchant: line.merchant });
    await claimant
      .patch(`/api/v1/expenses/${line.expenseId}`)
      .set(H)
      .send({ ...base, justification: 'Customer: SABIC Jubail', version: line.version })
      .expect(200);
    const amount = await claimant
      .patch(`/api/v1/expenses/${line.expenseId}`)
      .set(H)
      .send({ ...base, amount: '900', version: line.version + 1 })
      .expect(409);
    expect(amount.body.error.code).toBe('INVALID_STATE');

    const fresh = (await claimant.get(`/api/v1/reports/${report.reportId}`).expect(200)).body;
    expect(fresh.permissions).toMatchObject({
      canReplyInfo: true,
      canEditPurpose: true,
      canEdit: false,
    });
    const replied = await claimant
      .post(`/api/v1/reports/${report.reportId}/reply-info`)
      .set(H)
      .send({ comment: 'SABIC, for the Q4 order' })
      .expect(200);
    expect(replied.body.infoRequested).toBe(false);
    expect((await emails(ctx))[0]).toEqual({ to: ctx.pid('1010'), template: 'INFO_REPLIED' });

    // After the reply the line is locked again.
    await claimant
      .patch(`/api/v1/expenses/${line.expenseId}`)
      .set(H)
      .send({ ...base, justification: 'x', version: line.version + 1 })
      .expect(409);
  });
});

describe('segregation of duties and access (D-24, API §1)', () => {
  it('only the current assignee acts; others cannot see the report', async () => {
    const ctx = await setup();
    const report = await submit(ctx, '1011', await draft(ctx, '1011', ['1000']));
    await act(ctx, '1002', report, 'approve', undefined, 404); // Finance Manager, not yet
    await act(ctx, '1012', report, 'approve', undefined, 403); // not an approver at all

    await (await ctx.as('1012')).get(`/api/v1/reports/${report.reportId}`).expect(404);
    await (await ctx.as('1010')).get(`/api/v1/reports/${report.reportId}`).expect(200);
    // API §1 "Fin": Finance AP (all BUs) sees it; the FPP accountant's backup grant covers IPP too.
    await (await ctx.as('1007')).get(`/api/v1/reports/${report.reportId}`).expect(200);
    await (await ctx.as('1013')).get(`/api/v1/reports/${report.reportId}`).expect(404); // FPP manager
  });

  it('a claimant who approves cannot approve their own report (DB-01)', async () => {
    const ctx = await setup();
    // 1010 is a line manager; their own claim goes to their supervisor (the CEO).
    const report = await submit(ctx, '1010', await draft(ctx, '1010', ['300']));
    expect(report.steps[0]!.assigneeName).toBe('Khalid Al-Harbi');
    await act(ctx, '1010', report, 'approve', undefined, 404);
  });
});

describe('drafts (FR-REP-01)', () => {
  it('edits lines and purpose, and deletes a draft that was never submitted', async () => {
    const ctx = await setup();
    const claimant = await ctx.as('1011');
    const report = await draft(ctx, '1011', ['100', '200']);
    const keep = report.lines[0]!.expenseId;
    const res = await claimant
      .patch(`/api/v1/reports/${report.reportId}`)
      .set(H)
      .send({ purpose: 'Jubail visit', expenseIds: [keep], version: report.version })
      .expect(200);
    expect(res.body).toMatchObject({ purpose: 'Jubail visit', totalSar: '100.00', lineCount: 1 });
    expect((await claimant.get('/api/v1/expenses?unreported=true')).body.items).toHaveLength(1);

    await claimant
      .patch(`/api/v1/reports/${report.reportId}`)
      .set(H)
      .send({ purpose: 'Stale', version: report.version })
      .expect(409);

    await claimant.delete(`/api/v1/reports/${report.reportId}`).set(H).expect(204);
    expect((await claimant.get('/api/v1/expenses?unreported=true')).body.items).toHaveLength(2);
    expect(reportListSchema.parse((await claimant.get('/api/v1/reports')).body).items).toHaveLength(
      0,
    );
  });

  it('refuses someone else’s expense and keeps submitted reports', async () => {
    const ctx = await setup();
    const theirs = await newExpense(await ctx.as('1012'), airfare(ctx, '100'));
    const res = await (
      await ctx.as('1011')
    )
      .post('/api/v1/reports')
      .set(H)
      .send({ purpose: 'Mine', expenseIds: [theirs] })
      .expect(400);
    expect(res.body.error.details.issues[0].path).toBe('expenseIds');

    const submitted = await submit(ctx, '1011', await draft(ctx, '1011', ['100']));
    await (await ctx.as('1011')).delete(`/api/v1/reports/${submitted.reportId}`).set(H).expect(409);
  });
});

describe('approval inbox (UI-UX §5.4)', () => {
  it('lists my pending steps with flags, oldest first', async () => {
    const ctx = await setup();
    const claimant = await ctx.as('1011');
    const meal = await newExpense(claimant, {
      ...airfare(ctx, '180'),
      typeId: ctx.typeId('MEALS'),
      merchant: 'Al Baik',
      attendees: 'Client',
      justification: null,
    });
    const usd = await newExpense(
      claimant,
      airfare(ctx, '100', { currency: 'USD', merchant: 'Emirates' }),
    );
    const report = (
      await claimant
        .post('/api/v1/reports')
        .set(H)
        .send({ purpose: 'Client visit', expenseIds: [meal, usd] })
        .expect(201)
    ).body;
    await submit(ctx, '1011', reportDetailSchema.parse(report));

    const inbox = inboxListSchema.parse(
      (await (await ctx.as('1010')).get('/api/v1/approvals/inbox').expect(200)).body,
    );
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({
      stepName: 'Line Manager',
      claimantName: 'Ahmed Al-Subaie',
      reportNumber: 'EH-IPP-2026-000001',
      flags: ['OVER_LIMIT', 'MISSING_RECEIPT', 'FOREIGN_CURRENCY'],
    });
    expect(
      (await (await ctx.as('1003')).get('/api/v1/approvals/inbox').expect(200)).body.items,
    ).toEqual([]);
    await (await ctx.as('1012')).get('/api/v1/approvals/inbox').expect(403);
  });
});
