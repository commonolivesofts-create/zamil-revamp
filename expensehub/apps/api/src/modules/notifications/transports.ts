// Implements: FR-NTF-01 delivery adapters (TRD §6 notificationService).
//   outbox — D-33 dev: messages stay readable on the dev Mail page; the console gets one line
//            per message (template, recipient, subject — never the body, which can hold a token).
//   smtp   — OQ-25: Office 365 / any SMTP relay via nodemailer. Written now, switched on in M10.
//   Teams  — OQ-26 proposal A: a Finance channel post through a Teams Workflows webhook, only
//            when TEAMS_WEBHOOK_URL is set (M10).
import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from 'pino';
import type { AppConfig } from '../../config';

export interface OutgoingMessage {
  templateCode: string;
  to: { name: string; email: string };
  subject: string;
  text: string;
  action: { label: string; url: string } | null;
}

export interface MessageTransport {
  readonly name: 'outbox' | 'smtp';
  /** True when messages leave the system — one-time tokens are then cleared from the outbox. */
  readonly external: boolean;
  send(message: OutgoingMessage): Promise<void>;
}

/** D-33: dev / test — nothing leaves the machine. */
export class OutboxTransport implements MessageTransport {
  readonly name = 'outbox' as const;
  readonly external = false;
  constructor(private readonly logger: Logger) {}
  async send(message: OutgoingMessage): Promise<void> {
    this.logger.info(
      { template: message.templateCode, to: message.to.name, subject: message.subject },
      'email (outbox — see the dev Mail page)',
    );
  }
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Plain, readable HTML version of a message (text stays the source of truth). */
export function messageHtml(message: OutgoingMessage): string {
  const paragraphs = message.text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = message.action
    ? `<p style="margin:20px 0"><a href="${escape(message.action.url)}" style="background:#047857;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escape(message.action.label)}</a></p>`
    : '';
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;max-width:560px">${paragraphs}${button}<p style="color:#6b7280;font-size:12px;margin-top:24px">ExpenseHub · Zamil Plastic Industries</p></div>`;
}

/** OQ-25: SMTP relay. */
export class SmtpTransport implements MessageTransport {
  readonly name = 'smtp' as const;
  readonly external = true;
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  static fromConfig(smtp: { host: string; port: number; from: string }): SmtpTransport {
    return new SmtpTransport(
      nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465 }),
      smtp.from,
    );
  }

  async send(message: OutgoingMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: { name: message.to.name, address: message.to.email },
      subject: message.subject,
      text: message.action
        ? `${message.text}\n\n${message.action.label}: ${message.action.url}`
        : message.text,
      html: messageHtml(message),
    });
  }
}

export function createTransport(config: AppConfig, logger: Logger): MessageTransport {
  return config.notify.transport === 'smtp' && config.notify.smtp
    ? SmtpTransport.fromConfig(config.notify.smtp)
    : new OutboxTransport(logger);
}

// ─── Teams channel (OQ-26 A) ────────────────────────────────────────────────

export interface ChannelPost {
  title: string;
  text: string;
  url: string | null;
}

export interface TeamsNotifier {
  post(post: ChannelPost): Promise<void>;
}

/** Teams Workflows "post to a channel when a webhook request is received" — an Adaptive Card. */
export class TeamsWebhookNotifier implements TeamsNotifier {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async post(post: ChannelPost): Promise<void> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [
                {
                  type: 'TextBlock',
                  text: post.title,
                  weight: 'Bolder',
                  size: 'Medium',
                  wrap: true,
                },
                { type: 'TextBlock', text: post.text, wrap: true },
              ],
              actions: post.url
                ? [{ type: 'Action.OpenUrl', title: 'Open in ExpenseHub', url: post.url }]
                : [],
            },
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Teams webhook answered HTTP ${res.status}`);
  }
}

export function createTeamsNotifier(config: AppConfig, _logger: Logger): TeamsNotifier | null {
  return config.notify.teamsWebhookUrl
    ? new TeamsWebhookNotifier(config.notify.teamsWebhookUrl)
    : null;
}
