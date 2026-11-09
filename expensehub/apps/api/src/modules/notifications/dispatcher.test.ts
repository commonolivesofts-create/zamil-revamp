// TRD §7 notification-dispatch and the FR-NTF-01 adapters (outbox, SMTP, Teams channel).
import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../lib/logger';
import { seededApp, testConfig } from '../../test-utils';
import { MAX_ATTEMPTS, NotificationDispatcher } from './dispatcher';
import { enqueueEmail } from './outbox';
import {
  OutboxTransport,
  SmtpTransport,
  TeamsWebhookNotifier,
  type ChannelPost,
  type MessageTransport,
  type OutgoingMessage,
} from './transports';

const logger = createLogger(testConfig({ LOG_LEVEL: 'silent' }));

class Capture implements MessageTransport {
  readonly name = 'smtp' as const;
  readonly external = true;
  readonly sent: OutgoingMessage[] = [];
  failTimes = 0;
  async send(message: OutgoingMessage) {
    if (this.failTimes > 0) {
      this.failTimes--;
      throw new Error('SMTP 451 try again later');
    }
    this.sent.push(message);
  }
}

async function setup(
  transport: MessageTransport = new Capture(),
  teams: ChannelPost[] | null = null,
) {
  const ctx = await seededApp();
  const people = await ctx.data.read((r) => r.employees.list());
  const pid = (n: string) => people.find((p) => p.personNumber === n)!.personId;
  const dispatcher = new NotificationDispatcher({
    data: ctx.data,
    logger,
    transport,
    teams: teams ? { post: async (p) => void teams.push(p) } : null,
  });
  const rows = () => ctx.data.read((r) => r.notifications.listRecent(50));
  return { ...ctx, pid, dispatcher, rows };
}

const claim = {
  reportNumber: 'EH-IPP-2026-000009',
  purpose: 'Jubail visit',
  claimantName: 'Ahmed Al-Subaie',
  total: 'SAR 500.00',
  stepName: null,
  actorName: null,
  comment: 'PAY-2026-000123',
  link: 'http://localhost:7386/reports/9',
};

describe('notification dispatch (TRD §7)', () => {
  it('sends queued emails rendered from their template, then marks them SENT', async () => {
    const transport = new Capture();
    const t = await setup(transport);
    await t.data.withTransaction((r) => enqueueEmail(r, t.pid('1011'), 'REPORT_PAID', claim));
    expect(await t.dispatcher.dispatchPending()).toEqual({ sent: 1, failed: 0, retrying: 0 });
    expect(transport.sent[0]).toMatchObject({
      templateCode: 'REPORT_PAID',
      to: { name: 'Ahmed Al-Subaie', email: 'ahmed.alsubaie@zpi-demo.test' },
      subject: 'Paid: EH-IPP-2026-000009 (SAR 500.00)',
      action: { label: 'Open the report', url: claim.link },
    });
    expect(transport.sent[0]!.text).toContain('Payment reference: PAY-2026-000123');
    expect((await t.rows())[0]).toMatchObject({ status: 'SENT', attempts: 1, errorText: null });
    expect(await t.dispatcher.dispatchPending()).toEqual({ sent: 0, failed: 0, retrying: 0 });
  });

  it('retries a failing send and gives up after the last attempt', async () => {
    const transport = new Capture();
    transport.failTimes = 99;
    const t = await setup(transport);
    await t.data.withTransaction((r) => enqueueEmail(r, t.pid('1011'), 'REPORT_PAID', claim));
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      expect(await t.dispatcher.dispatchPending()).toEqual({ sent: 0, failed: 0, retrying: 1 });
    }
    expect(await t.dispatcher.dispatchPending()).toEqual({ sent: 0, failed: 1, retrying: 0 });
    expect((await t.rows())[0]).toMatchObject({
      status: 'FAILED',
      attempts: MAX_ATTEMPTS,
      errorText: 'SMTP 451 try again later',
    });
  });

  it('fails a message for someone without an email address in HCM', async () => {
    const t = await setup();
    await t.data.withTransaction(async (r) => {
      const e = (await r.employees.get(t.pid('1012')))!;
      await r.employees.upsert({ ...e, email: null });
      await enqueueEmail(r, e.personId, 'REPORT_PAID', claim);
    });
    expect(await t.dispatcher.dispatchPending()).toMatchObject({ failed: 1 });
    expect((await t.rows())[0]!.errorText).toBe('No email address in Oracle HCM');
  });

  it('clears a one-time password link once it has left through a real transport', async () => {
    const t = await setup(new Capture());
    await t.data.withTransaction((r) =>
      enqueueEmail(r, t.pid('1011'), 'PASSWORD_LINK', {
        link: 'http://x/reset?token=SECRET',
        expiresAt: '2026-10-19T06:00:00Z',
        firstTime: false,
      }),
    );
    await t.dispatcher.dispatchPending();
    expect(JSON.stringify((await t.rows())[0]!.payload)).not.toContain('SECRET');
  });

  it('keeps the dev outbox readable (D-33) — nothing leaves, links stay', async () => {
    const t = await setup(new OutboxTransport(logger));
    await t.data.withTransaction((r) =>
      enqueueEmail(r, t.pid('1011'), 'PASSWORD_LINK', {
        link: 'http://x/reset?token=DEV',
        expiresAt: '2026-10-19T06:00:00Z',
        firstTime: true,
      }),
    );
    expect(await t.dispatcher.dispatchPending()).toMatchObject({ sent: 1 });
    expect(JSON.stringify((await t.rows())[0]!.payload)).toContain('token=DEV');
  });

  it('posts a Finance event to the Teams channel once, however many people are emailed (OQ-26 A)', async () => {
    const posts: ChannelPost[] = [];
    const t = await setup(new Capture(), posts);
    const failure = {
      jobName: 'sync-hcm',
      interfaces: ['INT-01'],
      runId: 7,
      error: 'HTTP 503',
      link: 'http://x/admin/integrations',
    };
    await t.data.withTransaction(async (r) => {
      await enqueueEmail(r, t.pid('1009'), 'SYNC_FAILED', failure);
      await enqueueEmail(r, t.pid('1007'), 'SYNC_FAILED', failure);
      await enqueueEmail(r, t.pid('1011'), 'REPORT_PAID', claim); // not a channel event
    });
    expect(await t.dispatcher.dispatchPending()).toMatchObject({ sent: 3 });
    expect(posts).toEqual([
      expect.objectContaining({
        title: 'Oracle Fusion sync failed: sync-hcm',
        url: 'http://x/admin/integrations',
      }),
    ]);
  });
});

describe('adapters', () => {
  it('SMTP sends text and HTML with the action link (OQ-25)', async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const sent: string[] = [];
    const smtp = new SmtpTransport(
      {
        sendMail: async (mail: object) =>
          sent.push((await transporter.sendMail(mail)).message as string),
      } as never,
      'ExpenseHub <expensehub@zamilplastic.com>',
    );
    await smtp.send({
      templateCode: 'REPORT_PAID',
      to: { name: 'Ahmed Al-Subaie', email: 'ahmed@zpi-demo.test' },
      subject: 'Paid: EH-1',
      text: 'Hello Ahmed,\n\nYour report <EH-1> is paid.',
      action: { label: 'Open the report', url: 'http://x/reports/1' },
    });
    const mail = JSON.parse(sent[0]!);
    expect(mail).toMatchObject({
      subject: 'Paid: EH-1',
      from: { address: 'expensehub@zamilplastic.com' },
    });
    expect(mail.text).toContain('Open the report: http://x/reports/1');
    expect(mail.html).toContain('&lt;EH-1&gt;'); // escaped
    expect(mail.html).toContain('href="http://x/reports/1"');
  });

  it('Teams posts an Adaptive Card to the Workflows webhook', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    await new TeamsWebhookNotifier('https://example.test/hook', fake).post({
      title: 'T',
      text: 'Body',
      url: 'http://x',
    });
    expect(calls[0]!.url).toBe('https://example.test/hook');
    expect(JSON.stringify(calls[0]!.body)).toContain('application/vnd.microsoft.card.adaptive');
    const failing = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    await expect(
      new TeamsWebhookNotifier('https://example.test/hook', failing).post({
        title: 'T',
        text: 'B',
        url: null,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
