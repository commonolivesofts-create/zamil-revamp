// D-33 dev tools — only mounted when dev quick-login is enabled (never in production).
// GET /dev/mail: the notification outbox rendered as emails (no sign-in needed, so a
// password link can be opened before anyone can sign in).
// /dev/fusion: the D-36 Fusion simulator — move mock invoices through validated / paid /
// cancelled / voided (what Payables does in Fusion), auto-advance, inject a failure. Each action
// runs the INT-09 status poll so ExpenseHub picks it up at once.
import {
  SIMULATOR_ACTIONS,
  devFailNextSchema,
  type DevFusionState,
  type DevMailResponse,
} from '@expensehub/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/rbac';
import type { AppConfig } from '../../config';
import type { DataLayer } from '../../data/ports';
import type { FusionClient } from '../../integrations/fusion/client';
import { MockFusionClient } from '../../integrations/fusion/mock/client';
import type { JobRunner } from '../../jobs/runner';
import { AppError } from '../../lib/errors';
import { renderTemplate } from '../notifications/templates';

const actionParams = z.object({
  id: z.coerce.number().int().positive(),
  action: z.enum(SIMULATOR_ACTIONS),
});

export function devRoutes({
  data,
  config,
  fusionClient,
  jobs,
}: {
  data: DataLayer;
  config: AppConfig;
  fusionClient: FusionClient;
  jobs: JobRunner;
}): Router {
  const router = Router();

  router.get('/dev/mail', async (_req, res) => {
    const items = await data.read(async (r) => {
      const out: DevMailResponse['items'] = [];
      for (const n of await r.notifications.listRecent(100)) {
        if (n.channel !== 'EMAIL') continue;
        const person = await r.employees.get(n.recipientId);
        const name = person?.fullName ?? `Person ${n.recipientId}`;
        const rendered = renderTemplate(n.templateCode, n.payload, name);
        out.push({
          id: n.notificationId,
          templateCode: n.templateCode,
          status: n.status,
          createdAt: n.createdAt,
          to: { name, email: person?.email ?? null },
          ...rendered,
        });
      }
      return out;
    });
    const body: DevMailResponse = { items };
    res.set('Cache-Control', 'no-store').json(body);
  });

  // ─── D-36 Fusion simulator (mock mode only) ───────────────────────────────

  const mock = (_req: Request) => {
    if (!(fusionClient instanceof MockFusionClient)) {
      throw new AppError('NOT_FOUND', 'The Fusion simulator exists only with FUSION_MODE=mock.');
    }
    return fusionClient;
  };

  const state = (client: MockFusionClient): Promise<DevFusionState> =>
    data.read(async (r) => {
      const reports = await r.reports.listByStatus(['READY_FOR_PAYMENT', 'INVOICED', 'PAID']);
      const quickPays = (
        await Promise.all(
          (await r.quickPays.list()).map((q) => r.quickPayInvoices.getByQuickPay(q.quickPayId)),
        )
      ).filter((x) => x !== undefined);
      return {
        autoAdvance: client.autoAdvance,
        fusionPodUrl: config.fusion.podUrl,
        pendingFailures: client.pendingFailures(),
        invoices: client.listInvoices().map((i) => {
          const report = reports.find((x) => x.fusionInvoiceNum === i.InvoiceNumber);
          const qp = quickPays.find((x) => x.invoiceNumber === i.InvoiceNumber);
          return {
            invoiceId: i.InvoiceId,
            invoiceNumber: i.InvoiceNumber,
            supplier: i.Supplier,
            supplierNumber: i.SupplierNumber,
            businessUnit: i.BusinessUnit,
            invoiceDate: i.InvoiceDate,
            amount: i.InvoiceAmount.toFixed(2),
            validationStatus: i.ValidationStatus,
            paidStatus: i.PaidStatus,
            canceled: i.CanceledFlag,
            attachments: i.attachments.length,
            lines: i.lines.length,
            payments: i.payments.map((p) => ({
              paymentNumber: p.paymentNumber,
              paymentDate: p.paymentDate,
              status: p.status,
            })),
            ref: report
              ? { kind: 'REPORT' as const, id: report.reportId, status: report.status }
              : qp
                ? { kind: 'QUICK_PAY' as const, id: qp.quickPayId, status: qp.status }
                : null,
          };
        }),
      };
    });

  router.get('/dev/fusion', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await state(mock(req)));
  });

  router.post('/dev/fusion/invoices/:id/:action', requireAuth, async (req, res) => {
    const client = mock(req);
    const { id, action } = actionParams.parse(req.params);
    try {
      client.act(id, action);
    } catch (err) {
      throw new AppError('INVALID_STATE', err instanceof Error ? err.message : String(err));
    }
    await jobs.run('poll-invoice-status');
    res.json(await state(client));
  });

  router.post('/dev/fusion/auto-advance', requireAuth, async (req, res) => {
    const client = mock(req);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    client.setAutoAdvance(enabled);
    res.json(await state(client));
  });

  router.post('/dev/fusion/fail-next', requireAuth, async (req, res) => {
    const client = mock(req);
    const { target, httpStatus } = devFailNextSchema.parse(req.body);
    client.failNext(target, httpStatus);
    res.json(await state(client));
  });

  return router;
}
