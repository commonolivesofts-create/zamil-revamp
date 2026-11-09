// M9 Done-when: each event puts one message for the right person on the dev Mail page
// (FR-NTF-01: submit, approve → next, reject, info request, audit adjustment, invoiced, paid).
import { devMailResponseSchema } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import { H } from '../../test-utils';
import { journey, type Journey } from '../../testing/workflow';

/** Runs `event` and returns the messages it added (newest first). */
async function added(j: Journey, event: () => Promise<unknown>) {
  const before = (await j.mail()).length;
  await event();
  const after = await j.mail();
  return after.slice(0, after.length - before);
}

describe('one message per event, to the right person (FR-NTF-01)', () => {
  it('walks a claim from submit to paid', async () => {
    const j = await journey();
    const ahmed = j.pid('1011');
    // SAR 4,000 without a receipt: selected for audit (warning, missing receipt, > 3,000).
    let report = await j.draft('1011', [await j.expense('1011', '4000')]);

    expect(await added(j, async () => (report = await j.submit('1011', report)))).toEqual([
      { to: j.pid('1010'), template: 'APPROVAL_REQUEST', status: 'QUEUED' },
    ]);
    expect(
      await added(
        j,
        async () => (report = await j.decide(report, 'request-info', 'Which customer?')),
      ),
    ).toEqual([{ to: ahmed, template: 'INFO_REQUESTED', status: 'QUEUED' }]);
    expect(
      await added(j, () =>
        j
          .as('1011')
          .then((a) =>
            a
              .post(`/api/v1/reports/${report.reportId}/reply-info`)
              .set(H)
              .send({ comment: 'SABIC' })
              .expect(200),
          ),
      ),
    ).toEqual([{ to: j.pid('1010'), template: 'INFO_REPLIED', status: 'QUEUED' }]);
    report = (await j.as('1011').then((a) => a.get(`/api/v1/reports/${report.reportId}`))).body;

    // D-49: Line Manager approves → their manager (the CEO) is next.
    expect(await added(j, async () => (report = await j.decide(report)))).toEqual([
      { to: j.pid('1001'), template: 'APPROVAL_REQUEST', status: 'QUEUED' },
    ]);
    report = await j.decide(report); // level 2 → Finance Manager
    expect(await added(j, async () => (report = await j.decide(report)))).toEqual([
      { to: j.pid('1005'), template: 'AUDIT_REQUEST', status: 'QUEUED' },
    ]);
    expect(report.status).toBe('PENDING_AUDIT');

    const omar = await j.as('1005');
    expect(
      await added(j, () =>
        omar
          .post(`/api/v1/audit/${report.reportId}/lines/${report.lines[0]!.expenseId}/adjust`)
          .set(H)
          .send({ approvedAmount: '3500', reason: 'Economy fare' })
          .expect(200),
      ),
    ).toEqual([{ to: ahmed, template: 'LINE_ADJUSTED', status: 'QUEUED' }]);
    expect(
      await added(j, () =>
        omar.post(`/api/v1/audit/${report.reportId}/release`).set(H).send({}).expect(200),
      ),
    ).toEqual([{ to: ahmed, template: 'REPORT_APPROVED', status: 'QUEUED' }]);

    expect(await added(j, () => j.sendToPayables(report.reportId))).toEqual([
      { to: ahmed, template: 'REPORT_INVOICED', status: 'QUEUED' },
    ]);
    const invoiceId = (await j.data.read((r) => r.reports.getOrThrow(report.reportId)))
      .fusionInvoiceId!;
    expect(await added(j, () => j.simulate(invoiceId, 'pay'))).toEqual([
      { to: ahmed, template: 'REPORT_PAID', status: 'QUEUED' },
    ]);

    // They read as emails on the dev Mail page.
    const page = devMailResponseSchema.parse(
      (await (await j.as('1011')).get('/api/v1/dev/mail').expect(200)).body,
    );
    expect(page.items[0]).toMatchObject({
      templateCode: 'REPORT_PAID',
      to: { name: 'Ahmed Al-Subaie' },
    });
    expect(page.items[0]!.subject).toMatch(/^Paid: EH-IPP-2026-000001/);
    expect(page.items.find((m) => m.templateCode === 'REPORT_INVOICED')!.subject).toMatch(
      /^Sent for payment/,
    );
  });

  it('reject and withdraw', async () => {
    const j = await journey();
    let report = await j.submit('1011', await j.draft('1011', [await j.expense('1011', '300')]));
    expect(
      await added(j, async () => (report = await j.decide(report, 'reject', 'Wrong trip'))),
    ).toEqual([{ to: j.pid('1011'), template: 'REPORT_REJECTED', status: 'QUEUED' }]);

    let second = await j.submit('1011', await j.draft('1011', [await j.expense('1011', '200')]));
    expect(
      await added(j, async () => {
        second = (
          await (
            await j.as('1011')
          )
            .post(`/api/v1/reports/${second.reportId}/withdraw`)
            .set(H)
            .send({ version: second.version })
            .expect(200)
        ).body;
      }),
    ).toEqual([{ to: j.pid('1010'), template: 'REPORT_WITHDRAWN', status: 'QUEUED' }]);
  });
});
