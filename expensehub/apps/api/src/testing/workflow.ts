// Test helpers for whole-claim journeys on the dev seed: sign-ins, lines, reports through the
// approval chain, audit and Payables. Each call goes through the real HTTP API.
import {
  reportDetailSchema,
  sendResultSchema,
  type ExpenseInput,
  type ReportDetail,
} from '@expensehub/shared';
import type request from 'supertest';
import { sampleReceipt } from '../receipts/testing/sample';
import { H, seededApp, signedIn, testClock } from '../test-utils';

export type Agent = request.Agent;
export type Journey = Awaited<ReturnType<typeof journey>>;

const HOLDERS: Record<string, string> = {
  'Majed Al-Anazi': '1010',
  'Khalid Al-Harbi': '1001',
  'Noura Al-Dosari': '1003',
  'Faisal Al-Qahtani': '1002',
  'Omar Al-Shehri': '1005',
};

/** Seeded app on a fixed clock, with the random audit sample off (deterministic). */
export async function journey(start = '2026-10-18T06:00:00.000Z') {
  const time = testClock(start);
  const ctx = await seededApp({ clock: time.clock });
  await ctx.data.withTransaction((r) =>
    r.auditRules.update('RANDOM_PCT', { active: 'N' }, { actorId: null }),
  );
  const types = await ctx.data.read((r) => r.expenseTypes.list());
  const people = await ctx.data.read((r) => r.employees.list());
  const agents = new Map<string, Agent>();

  const j = {
    ...ctx,
    time,
    typeId: (code: string) => types.find((t) => t.typeCode === code)!.typeId,
    pid: (n: string) => people.find((p) => p.personNumber === n)!.personId,
    async as(n: string): Promise<Agent> {
      if (!agents.has(n)) agents.set(n, await signedIn(ctx.app, n));
      return agents.get(n)!;
    },
    /** An airfare line; `receipt` = attach the sample receipt (no audit warnings). */
    async expense(
      who: string,
      amount: string,
      opts: { receipt?: boolean; over?: Partial<ExpenseInput> } = {},
    ) {
      const agent = await j.as(who);
      let receiptId: number | null = null;
      if (opts.receipt) {
        receiptId = (
          await agent
            .post('/api/v1/receipts')
            .set(H)
            .attach('file', await sampleReceipt(), 'r.png')
            .expect(201)
        ).body.receiptId;
      }
      const body: ExpenseInput = {
        typeId: j.typeId('AIRFARE'),
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
        receiptId,
        ...opts.over,
      };
      return (await agent.post('/api/v1/expenses').set(H).send(body).expect(201)).body
        .expenseId as number;
    },
    async draft(who: string, expenseIds: number[], purpose = 'Plant visit'): Promise<ReportDetail> {
      return reportDetailSchema.parse(
        (
          await (
            await j.as(who)
          )
            .post('/api/v1/reports')
            .set(H)
            .send({ purpose, expenseIds })
            .expect(201)
        ).body,
      );
    },
    async submit(who: string, report: ReportDetail): Promise<ReportDetail> {
      return reportDetailSchema.parse(
        (
          await (
            await j.as(who)
          )
            .post(`/api/v1/reports/${report.reportId}/submit`)
            .set(H)
            .send({ version: report.version })
            .expect(200)
        ).body,
      );
    },
    /** The holder of the pending step decides it. */
    async decide(
      report: ReportDetail,
      decision: 'approve' | 'reject' | 'request-info' = 'approve',
      comment?: string,
    ) {
      const step = report.steps.find((s) => s.status === 'PENDING')!;
      const agent = await j.as(HOLDERS[step.assigneeName]!);
      return reportDetailSchema.parse(
        (
          await agent
            .post(`/api/v1/approvals/${step.stepId}/${decision}`)
            .set(H)
            .send(comment ? { comment } : {})
            .expect(200)
        ).body,
      );
    },
    /** Approves every step; a selected report is released by its auditor. */
    async approveAll(report: ReportDetail): Promise<ReportDetail> {
      let current = report;
      while (current.status === 'PENDING_APPROVAL' || current.status === 'PENDING_AUDIT') {
        if (current.status === 'PENDING_AUDIT') {
          const step = current.steps.find((s) => s.status === 'PENDING')!;
          current = reportDetailSchema.parse(
            (
              await (
                await j.as(HOLDERS[step.assigneeName]!)
              )
                .post(`/api/v1/audit/${current.reportId}/release`)
                .set(H)
                .send({})
                .expect(200)
            ).body,
          );
        } else {
          current = await j.decide(current);
        }
      }
      return current;
    },
    /** A clean claim by 1011, approved → READY_FOR_PAYMENT. */
    async ready(amount = '500'): Promise<ReportDetail> {
      const report = await j.submit(
        '1011',
        await j.draft('1011', [await j.expense('1011', amount, { receipt: true })]),
      );
      return j.approveAll(report);
    },
    async sendToPayables(reportId: number) {
      return sendResultSchema.parse(
        (
          await (
            await j.as('1007')
          )
            .post('/api/v1/payables/send')
            .set(H)
            .send({ ids: [reportId] })
            .expect(200)
        ).body,
      ).items[0]!;
    },
    async simulate(invoiceId: number, action: 'validate' | 'pay' | 'cancel' | 'void') {
      await (
        await j.as('1007')
      )
        .post(`/api/v1/dev/fusion/invoices/${invoiceId}/${action}`)
        .set(H)
        .send({})
        .expect(200);
    },
    /** Outbox rows, newest first. */
    mail: () =>
      ctx.data.read(async (r) =>
        (await r.notifications.listRecent(500)).map((n) => ({
          to: n.recipientId,
          template: n.templateCode,
          status: n.status,
        })),
      ),
  };
  return j;
}
