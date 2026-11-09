// M9 Done-when: dashboards match totals computed directly from the repositories (FR-DSH-01/02/03).
import {
  approverDashboardSchema,
  employeeDashboardSchema,
  financeDashboardSchema,
  formatSar,
  sumSar,
  type Halalas,
  type ReportStatus,
} from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import { journey, type Journey } from '../../testing/workflow';

const sum = (xs: number[]) => formatSar(sumSar(xs as Halalas[]));

/** A spread of claims for 1011: unreported, draft, in approval, in audit, ready, invoiced, paid. */
async function dataset(j: Journey) {
  await j.expense('1011', '120'); // unreported
  await j.expense('1011', '80.50'); // unreported
  await j.draft('1011', [await j.expense('1011', '250')], 'Draft'); // draft
  await j.submit(
    '1011',
    await j.draft('1011', [await j.expense('1011', '300', { receipt: true })], 'Waiting'),
  ); // with 1010
  let audit = await j.submit(
    '1011',
    await j.draft('1011', [await j.expense('1011', '3600')], 'Audit me'),
  );
  while (audit.status === 'PENDING_APPROVAL') audit = await j.decide(audit); // → PENDING_AUDIT (> 3,000)
  await j.ready('640'); // READY_FOR_PAYMENT
  const invoiced = await j.ready('410');
  await j.sendToPayables(invoiced.reportId); // INVOICED
  const paid = await j.ready('905.25');
  await j.sendToPayables(paid.reportId);
  const invoiceId = (await j.data.read((r) => r.reports.getOrThrow(paid.reportId)))
    .fusionInvoiceId!;
  await j.simulate(invoiceId, 'pay'); // PAID
  return { audit };
}

describe('dashboards = repository totals', () => {
  it('employee (FR-DSH-01)', async () => {
    const j = await journey();
    await dataset(j);
    const body = employeeDashboardSchema.parse(
      (await (await j.as('1011')).get('/api/v1/dashboards/employee').expect(200)).body,
    );

    // Independently from the repositories.
    const expected = await j.data.read(async (r) => {
      const reports = await r.reports.listByPerson(j.pid('1011'));
      const of = (...s: ReportStatus[]) => reports.filter((x) => s.includes(x.status));
      const spent = of(
        'PENDING_APPROVAL',
        'PENDING_AUDIT',
        'READY_FOR_PAYMENT',
        'INVOICED',
        'PAID',
        'SETTLED',
      );
      const lines = (
        await Promise.all(spent.map((x) => r.expenses.listByReport(x.reportId)))
      ).flat();
      return {
        onItsWay: {
          count: of('READY_FOR_PAYMENT', 'INVOICED').length,
          amountSar: sum(of('READY_FOR_PAYMENT', 'INVOICED').map((x) => x.netPayableSar)),
        },
        unreported: (await r.expenses.listUnreported(j.pid('1011'))).map((e) => e.amountSar),
        drafts: of('DRAFT').map((x) => x.totalSar),
        paid: of('PAID').map((x) => x.netPayableSar),
        spend: sum(lines.map((l) => l.approvedAmountSar)),
      };
    });
    expect(body.onItsWay).toEqual(expected.onItsWay);
    expect(body.onItsWay).toEqual({ count: 2, amountSar: '1050.00' });
    expect(body.unreported).toEqual({ count: 2, amountSar: sum(expected.unreported) });
    expect(body.unreported.amountSar).toBe('200.50');
    expect(body.drafts).toEqual({ count: 1, amountSar: '250.00' });
    expect(body.paidLast90Days).toEqual({ count: 1, amountSar: sum(expected.paid) });
    expect(body.openAdvance).toBeNull();
    // Quick Pays: Ahmed's one is already paid (seed).
    expect(body.quickPaysPending).toEqual({ count: 0, amountSar: '0.00' });

    // Spend: every submitted line is from October 2026, all Airfare.
    expect(body.monthlyTrend).toHaveLength(12);
    expect(body.monthlyTrend.at(-1)).toEqual({ month: '2026-10', amountSar: expected.spend });
    expect(body.monthlyTrend[0]!.month).toBe('2025-11');
    expect(body.spendByCategory).toEqual([
      { typeName: 'Airfare', icon: expect.any(String), amountSar: expected.spend },
    ]);
  });

  it('approver (FR-DSH-02)', async () => {
    const j = await journey();
    await dataset(j);
    const majed = approverDashboardSchema.parse(
      (await (await j.as('1010')).get('/api/v1/dashboards/approver').expect(200)).body,
    );
    expect(majed).toMatchObject({
      pending: { count: 1, amountSar: '300.00' },
      flagged: 0,
      audit: { count: 0 },
    });
    expect(majed.decidedThisMonth).toBe(
      await j.data.read(
        async (r) =>
          (await r.approvalSteps.list()).filter(
            (s) => s.actedBy === j.pid('1010') && s.status === 'APPROVED',
          ).length,
      ),
    );
    const omar = approverDashboardSchema.parse(
      (await (await j.as('1005')).get('/api/v1/dashboards/approver').expect(200)).body,
    );
    expect(omar.audit).toEqual({ count: 1, amountSar: '3600.00' });
    await (await j.as('1012')).get('/api/v1/dashboards/approver').expect(403);
  });

  it('finance (FR-DSH-03), scoped to Finance BUs', async () => {
    const j = await journey();
    await dataset(j);
    const body = financeDashboardSchema.parse(
      (await (await j.as('1007')).get('/api/v1/dashboards/finance').expect(200)).body,
    );
    const expected = await j.data.read(async (r) => {
      const all = await r.reports.list();
      const net = (s: ReportStatus) =>
        all.filter((x) => x.status === s).map((x) => x.netPayableSar);
      return {
        ready: net('READY_FOR_PAYMENT'),
        invoiced: net('INVOICED'),
        paid: net('PAID'),
        approval: net('PENDING_APPROVAL'),
        audit: net('PENDING_AUDIT'),
      };
    });
    expect(body.businessUnits).toEqual(['IPP', 'FPP', 'APP']);
    expect(body.readyForPayment).toEqual({
      count: expected.ready.length,
      amountSar: sum(expected.ready),
    });
    expect(body.invoicedUnpaid).toEqual({ count: 1, amountSar: sum(expected.invoiced) });
    expect(body.paidThisMonth).toEqual({ count: 1, amountSar: '905.25' });
    expect(body.pipeline).toEqual([
      { status: 'PENDING_APPROVAL', count: 1, amountSar: sum(expected.approval) },
      { status: 'PENDING_AUDIT', count: 1, amountSar: sum(expected.audit) },
      { status: 'READY_FOR_PAYMENT', count: 1, amountSar: '640.00' },
      { status: 'INVOICED', count: 1, amountSar: '410.00' },
      { status: 'PAID', count: 1, amountSar: '905.25' },
    ]);
    // Seed: Lama 1,500 (IPP), Mohammed 5,000 + Bandar 900 (FPP) are not invoiced yet.
    expect(body.quickPaysPending).toEqual({ count: 3, amountSar: '7400.00' });
    expect(body.integrationErrors).toEqual({ last24h: 0, failingJobs: [] });

    const ipp = financeDashboardSchema.parse(
      (await (await j.as('1007')).get('/api/v1/dashboards/finance?bu=FPP').expect(200)).body,
    );
    expect(ipp).toMatchObject({
      businessUnits: ['FPP'],
      readyForPayment: { count: 0 },
      quickPaysPending: { count: 2, amountSar: '5900.00' },
    });
    await (await j.as('1011')).get('/api/v1/dashboards/finance').expect(403);
  });

  it('counts a failing interface', async () => {
    const j = await journey();
    j.fusion.failNext('EH_HCM_EMPLOYEES', 400);
    await j.services.jobs.run('sync-hcm');
    const body = financeDashboardSchema.parse(
      (await (await j.as('1007')).get('/api/v1/dashboards/finance').expect(200)).body,
    );
    expect(body.integrationErrors.last24h).toBe(1);
    expect(body.integrationErrors.failingJobs.map((f) => f.jobName)).toEqual(['sync-hcm']);
  });
});
