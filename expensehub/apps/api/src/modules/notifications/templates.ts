// Implements: FR-NTF-01 email templates (more arrive in M5/M9). Rendering happens when the
// outbox is read (dev Mail page now, SMTP dispatcher in M9), so wording changes apply to all.

export interface RenderedMessage {
  subject: string;
  text: string;
  action: { label: string; url: string } | null;
}

export interface PasswordLinkPayload {
  /** Contains the one-time token. M9's dispatcher must clear it once the email is sent. */
  link: string;
  expiresAt: string;
  firstTime: boolean;
}

export interface SyncFailedPayload {
  jobName: string;
  interfaces: string[];
  runId: number;
  error: string;
  /** Absolute link to the integration monitor. */
  link: string;
}

/** Every claim email (FR-NTF-01, M5). No bank data, no receipt contents. */
export interface ClaimPayload {
  reportNumber: string;
  purpose: string;
  claimantName: string;
  /** "SAR 6,000.00" */
  total: string;
  /** Approval step concerned (e.g. "HR Manager"). */
  stepName: string | null;
  /** Who acted (approver, or the claimant replying). */
  actorName: string | null;
  comment: string | null;
  link: string;
}

type Renderer = (payload: never, recipientName: string) => RenderedMessage;

const quote = (comment: string | null) => (comment ? ['', `“${comment}”`] : []);

const TEMPLATES = {
  PASSWORD_LINK: ((payload: PasswordLinkPayload, name: string) => {
    const expires = new Date(payload.expiresAt).toLocaleString('en-GB', {
      timeZone: 'Asia/Riyadh',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const verb = payload.firstTime ? 'set' : 'reset';
    return {
      subject: payload.firstTime
        ? 'Set your ExpenseHub password'
        : 'Reset your ExpenseHub password',
      text: [
        `Hello ${name},`,
        '',
        `Use the link below to ${verb} your ExpenseHub password. It works once and expires on ${expires} (Riyadh time).`,
        '',
        'If you did not ask for this, ignore this email — your password stays the same.',
      ].join('\n'),
      action: { label: `${payload.firstTime ? 'Set' : 'Reset'} password`, url: payload.link },
    };
  }) satisfies Renderer,

  // INTEGRATION §2.4: Finance / Admin are told when an interface fails after its retries.
  SYNC_FAILED: ((payload: SyncFailedPayload, name: string) => ({
    subject: `Oracle Fusion sync failed: ${payload.jobName}`,
    text: [
      `Hello ${name},`,
      '',
      `The ${payload.jobName} job (${payload.interfaces.join(', ')}) failed and made no changes.`,
      '',
      `Error: ${payload.error}`,
      '',
      'ExpenseHub keeps using the data from the last successful sync. Check the integration monitor for the request and response.',
    ].join('\n'),
    action: { label: 'Open integration monitor', url: payload.link },
  })) satisfies Renderer,

  // ─── Claims (M5) ──────────────────────────────────────────────────────────
  APPROVAL_REQUEST: ((p: ClaimPayload, name: string) => ({
    subject: `Approval needed: ${p.reportNumber} · ${p.claimantName} · ${p.total}`,
    text: [
      `Hello ${name},`,
      '',
      `${p.claimantName} submitted expense report ${p.reportNumber} for ${p.total}.`,
      `Purpose: ${p.purpose}`,
      '',
      `It is waiting for your approval as ${p.stepName}.`,
    ].join('\n'),
    action: { label: 'Review the report', url: p.link },
  })) satisfies Renderer,

  // FR-AUD-01: the report was selected for audit; `comment` carries the matched rules.
  AUDIT_REQUEST: ((p: ClaimPayload, name: string) => ({
    subject: `Audit needed: ${p.reportNumber} · ${p.claimantName} · ${p.total}`,
    text: [
      `Hello ${name},`,
      '',
      `Expense report ${p.reportNumber} from ${p.claimantName} (${p.total}) is approved and was selected for audit.`,
      `Purpose: ${p.purpose}`,
      `Why: ${p.comment ?? '—'}`,
      '',
      'Verify the receipts, adjust lines if needed, then release or reject it.',
    ].join('\n'),
    action: { label: 'Open the audit', url: p.link },
  })) satisfies Renderer,

  // FR-AUD-04: `comment` = "<line>: SAR a → SAR b — <reason>".
  LINE_ADJUSTED: ((p: ClaimPayload, name: string) => ({
    subject: `Amount changed in audit: ${p.reportNumber}`,
    text: [
      `Hello ${name},`,
      '',
      `${p.actorName} adjusted a line on your expense report ${p.reportNumber} during audit:`,
      '',
      p.comment ?? '',
      '',
      'The report total has been recalculated. Your original amount is kept in the history.',
    ].join('\n'),
    action: { label: 'Open the report', url: p.link },
  })) satisfies Renderer,

  REPORT_APPROVED: ((p: ClaimPayload, name: string) => ({
    subject: `Approved: ${p.reportNumber} (${p.total})`,
    text: [
      `Hello ${name},`,
      '',
      `Your expense report ${p.reportNumber} for ${p.total} is fully approved and is ready for payment.`,
      'Finance sends it to Oracle Fusion Payables; you will see the invoice and payment on the report.',
    ].join('\n'),
    action: { label: 'Open the report', url: p.link },
  })) satisfies Renderer,

  // INT-08: the report is now a Fusion Payables invoice (FR-NTF-01 "invoiced").
  REPORT_INVOICED: ((p: ClaimPayload, name: string) => ({
    subject: `Sent for payment: ${p.reportNumber} (${p.total})`,
    text: [
      `Hello ${name},`,
      '',
      `Your expense report ${p.reportNumber} is now invoice ${p.comment ?? p.reportNumber} in Oracle Fusion Payables.`,
      'It is paid with the next payment run; you will get an email with the payment reference.',
    ].join('\n'),
    action: { label: 'Open the report', url: p.link },
  })) satisfies Renderer,

  // INT-09: Fusion paid the invoice; `comment` = payment reference.
  REPORT_PAID: ((p: ClaimPayload, name: string) => ({
    subject: `Paid: ${p.reportNumber} (${p.total})`,
    text: [
      `Hello ${name},`,
      '',
      `Your expense report ${p.reportNumber} has been paid by Oracle Fusion Payables.`,
      `Payment reference: ${p.comment ?? '—'}`,
      '',
      'The money reaches your bank account according to the bank transfer schedule.',
    ].join('\n'),
    action: { label: 'Open the report', url: p.link },
  })) satisfies Renderer,

  REPORT_REJECTED: ((p: ClaimPayload, name: string) => ({
    subject: `Rejected: ${p.reportNumber}`,
    text: [
      `Hello ${name},`,
      '',
      `${p.actorName} (${p.stepName}) rejected your expense report ${p.reportNumber} for ${p.total}.`,
      ...quote(p.comment),
      '',
      'Correct the report and submit it again; the approval starts from the first step.',
    ].join('\n'),
    action: { label: 'Correct the report', url: p.link },
  })) satisfies Renderer,

  INFO_REQUESTED: ((p: ClaimPayload, name: string) => ({
    subject: `More information needed: ${p.reportNumber}`,
    text: [
      `Hello ${name},`,
      '',
      `${p.actorName} (${p.stepName}) needs more information about your expense report ${p.reportNumber}.`,
      ...quote(p.comment),
      '',
      'Reply on the report. You can also add receipts and update the purpose or justification.',
    ].join('\n'),
    action: { label: 'Reply', url: p.link },
  })) satisfies Renderer,

  INFO_REPLIED: ((p: ClaimPayload, name: string) => ({
    subject: `Reply received: ${p.reportNumber}`,
    text: [
      `Hello ${name},`,
      '',
      `${p.claimantName} replied to your question on expense report ${p.reportNumber} (${p.total}).`,
      ...quote(p.comment),
    ].join('\n'),
    action: { label: 'Review the report', url: p.link },
  })) satisfies Renderer,

  REPORT_WITHDRAWN: ((p: ClaimPayload, name: string) => ({
    subject: `Withdrawn: ${p.reportNumber}`,
    text: [
      `Hello ${name},`,
      '',
      `${p.claimantName} withdrew expense report ${p.reportNumber} (${p.total}). No action is needed from you.`,
    ].join('\n'),
    action: null,
  })) satisfies Renderer,
} as const;

export type TemplateCode = keyof typeof TEMPLATES;

export function renderTemplate(
  code: string,
  payload: unknown,
  recipientName: string,
): RenderedMessage {
  const render = (TEMPLATES as Record<string, Renderer | undefined>)[code];
  if (!render) {
    return { subject: `[${code}]`, text: JSON.stringify(payload, null, 2), action: null };
  }
  return render(payload as never, recipientName);
}
