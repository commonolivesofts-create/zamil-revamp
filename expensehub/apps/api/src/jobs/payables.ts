// TRD §7: INT-08 send (hourly when INVOICE_SEND_MODE=AUTO, OQ-16) and INT-09 status poll
// (hourly 07:00–20:00). The logic lives in modules/payables/core (shared with Finance screens).
import { pollInvoiceStatus, sendReportInvoice } from '../modules/payables/core';
import type { JobDefinition } from './types';

export const pollInvoiceStatusJob: JobDefinition = {
  name: 'poll-invoice-status',
  interfaces: ['INT-09'],
  dailyAt: { hour: 7, minute: 0 },
  hourly: { fromHour: 7, toHour: 20 },
  run: (ctx) => pollInvoiceStatus(ctx),
};

export const sendInvoicesJob: JobDefinition = {
  name: 'send-invoices',
  interfaces: ['INT-08'],
  dailyAt: { hour: 7, minute: 0 },
  hourly: { fromHour: 7, toHour: 20 },
  async run(ctx) {
    // OQ-16 proposal: MANUAL by default — Finance sends from the Payables screen.
    const ready = await ctx.data.read(async (r) => {
      const out = [];
      for (const report of await r.reports.listByStatus(['READY_FOR_PAYMENT'])) {
        const mode = (await r.systemOptions.resolve('INVOICE_SEND_MODE', report.businessUnit))
          ?.optionValue;
        if (mode === 'AUTO' && report.syncError === null) out.push(report.reportId);
      }
      return out;
    });
    let sent = 0;
    for (const id of ready) {
      if ((await sendReportInvoice(ctx, id, null)).ok) sent++;
    }
    return { rowsRead: ready.length, rowsChanged: sent };
  },
};
