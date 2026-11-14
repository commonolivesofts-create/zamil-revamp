// Implements: TRD §7 notification-dispatch — sends the EH_NOTIFICATIONS outbox through the
// configured transport (every minute while the API runs; tests call dispatchPending()).
// Each message: QUEUED → SENT, or retried on the next tick up to MAX_ATTEMPTS, then FAILED.
// A runs-every-minute loop is kept out of EH_JOB_RUNS so the integration monitor stays readable;
// failures are visible per message (status / error_text) and in the log.
import type { Logger } from 'pino';
import type { NotificationRow } from '../../data/entities';
import type { DataLayer } from '../../data/ports';
import { renderTemplate } from './templates';
import type { MessageTransport, TeamsNotifier } from './transports';

export const MAX_ATTEMPTS = 5;

/** OQ-26 A: which messages are also posted to the Finance Teams channel (once per event). */
const CHANNEL_TEMPLATES = new Set(['SYNC_FAILED', 'REPORT_APPROVED']);

export interface DispatchResult {
  sent: number;
  failed: number;
  retrying: number;
}

export class NotificationDispatcher {
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly deps: {
      data: DataLayer;
      logger: Logger;
      transport: MessageTransport;
      teams: TeamsNotifier | null;
    },
  ) {}

  get transportName() {
    return this.deps.transport.name;
  }

  start(intervalMs = 60_000): this {
    this.timer = setInterval(() => {
      void this.dispatchPending().catch((err: unknown) =>
        this.deps.logger.error({ err }, 'notification dispatch crashed'),
      );
    }, intervalMs);
    this.timer.unref();
    return this;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends up to `limit` queued messages, oldest first. Re-entrant calls are skipped. */
  async dispatchPending(limit = 50): Promise<DispatchResult> {
    const result: DispatchResult = { sent: 0, failed: 0, retrying: 0 };
    if (this.running) return result;
    this.running = true;
    try {
      const queued = await this.deps.data.read((r) =>
        r.notifications.listByStatus('QUEUED', limit),
      );
      const posted = new Set<string>();
      for (const row of queued) {
        const outcome = await this.deliver(row);
        result[outcome]++;
        if (outcome === 'sent') await this.postToChannel(row, posted);
      }
      if (queued.length) this.deps.logger.info({ ...result }, 'notifications dispatched');
      return result;
    } finally {
      this.running = false;
    }
  }

  private async deliver(row: NotificationRow): Promise<keyof DispatchResult> {
    const { data, transport } = this.deps;
    if (row.channel !== 'EMAIL') {
      await data.withTransaction((r) =>
        r.notifications.update(row.notificationId, {
          status: 'FAILED',
          errorText: `${row.channel} is phase 2 (OQ-27)`,
        }),
      );
      return 'failed';
    }
    const person = await data.read((r) => r.employees.get(row.recipientId));
    if (!person?.email) {
      await data.withTransaction((r) =>
        r.notifications.update(row.notificationId, {
          status: 'FAILED',
          errorText: 'No email address in Oracle HCM',
        }),
      );
      return 'failed';
    }
    const rendered = renderTemplate(row.templateCode, row.payload, person.fullName);
    try {
      await transport.send({
        templateCode: row.templateCode,
        to: { name: person.fullName, email: person.email },
        ...rendered,
      });
    } catch (err) {
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await data.withTransaction((r) =>
        r.notifications.update(row.notificationId, {
          attempts,
          status: failed ? 'FAILED' : 'QUEUED',
          errorText: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
        }),
      );
      this.deps.logger.warn({ notificationId: row.notificationId, attempts }, 'email not sent');
      return failed ? 'failed' : 'retrying';
    }
    await data.withTransaction((r) =>
      r.notifications.update(row.notificationId, {
        status: 'SENT',
        attempts: row.attempts + 1,
        sentAt: new Date().toISOString(),
        errorText: null,
        // A one-time password link must not stay in the database once it has left (templates.ts).
        ...(transport.external && row.templateCode === 'PASSWORD_LINK'
          ? { payload: { ...(row.payload as object), link: '(sent — not kept)' } }
          : {}),
      }),
    );
    return 'sent';
  }

  /** OQ-26 A: one Finance channel post per event (several recipients share one event). */
  private async postToChannel(row: NotificationRow, posted: Set<string>) {
    const teams = this.deps.teams;
    if (!teams || !CHANNEL_TEMPLATES.has(row.templateCode)) return;
    const p = row.payload as Record<string, unknown>;
    const key = `${row.templateCode}:${String(p.runId ?? p.reportNumber ?? row.notificationId)}`;
    if (posted.has(key)) return;
    posted.add(key);
    const rendered = renderTemplate(row.templateCode, row.payload, 'Finance team');
    try {
      await teams.post({
        title: rendered.subject,
        text:
          row.templateCode === 'REPORT_APPROVED'
            ? `Ready for payment in ExpenseHub.`
            : rendered.text.split('\n').slice(2).join('\n'),
        url: rendered.action?.url ?? null,
      });
    } catch (err) {
      this.deps.logger.warn({ err, template: row.templateCode }, 'Teams channel post failed');
    }
  }
}
