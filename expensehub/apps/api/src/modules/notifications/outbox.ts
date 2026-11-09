// Implements: FR-NTF-01 / D-33 — messages go to the EH_NOTIFICATIONS outbox in the caller's
// transaction. Dev: shown on the Mail page. M9: dispatched by the SMTP / Teams adapters.
import type { NotificationRow, PersonId } from '../../data/entities';
import type { Repos } from '../../data/ports';
import type {
  ClaimPayload,
  PasswordLinkPayload,
  SyncFailedPayload,
  TemplateCode,
} from './templates';

interface Payloads {
  PASSWORD_LINK: PasswordLinkPayload;
  SYNC_FAILED: SyncFailedPayload;
  APPROVAL_REQUEST: ClaimPayload;
  AUDIT_REQUEST: ClaimPayload;
  LINE_ADJUSTED: ClaimPayload;
  REPORT_APPROVED: ClaimPayload;
  REPORT_PAID: ClaimPayload;
  REPORT_INVOICED: ClaimPayload;
  REPORT_REJECTED: ClaimPayload;
  INFO_REQUESTED: ClaimPayload;
  INFO_REPLIED: ClaimPayload;
  REPORT_WITHDRAWN: ClaimPayload;
}

export function enqueueEmail<C extends TemplateCode>(
  repos: Repos,
  recipientId: PersonId,
  templateCode: C,
  payload: Payloads[C],
): Promise<NotificationRow> {
  return repos.notifications.insert({
    channel: 'EMAIL',
    recipientId,
    templateCode,
    payload,
    status: 'QUEUED',
    attempts: 0,
    sentAt: null,
    errorText: null,
  });
}
