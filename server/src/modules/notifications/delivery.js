import { PRIVILEGE_CLASSIFICATION } from '../auth/auth.policy.js';
import { SUPER_ADMINISTRATOR_RECOVERY_EMAIL } from '../access-control/securityCatalog.js';

/*
 * Out-of-band delivery boundary for account action tokens (docs/07 §4–§5).
 *
 * A delivery channel exposes:
 *   - `configured`: whether messages can be sent at all;
 *   - `resolveRecipient(account)`: the approved recipient `{ channel, address, source }` or null;
 *   - `deliver(message)`: resolves only after the provider accepted the message, rejects otherwise.
 * `message` is { purpose: 'PASSWORD_SETUP' | 'PASSWORD_RESET' | 'MFA_RECOVERY', recipient, userId,
 * employeeNumber, token, expiresAt }. `token` is the raw single-use token: it is handed only to the
 * channel (for the link), never returned by an API, logged or audited.
 *
 * Without SMTP configuration the channel is unconfigured: every delivery-dependent flow fails
 * closed (DELIVERY_UNAVAILABLE) and nothing ever reports a simulated delivery.
 */
export class DeliveryUnavailable extends Error {
  constructor(reason) {
    super(`Delivery unavailable: ${reason}`);
    this.reason = reason;
  }
}

export function createUnconfiguredDelivery() {
  return {
    configured: false,
    resolveRecipient: () => null,
    async deliver() {
      throw new DeliveryUnavailable('NO_CHANNEL_CONFIGURED');
    },
  };
}

const isSuperAdministrator = ({ employeeNumber }) =>
  PRIVILEGE_CLASSIFICATION.protectedEmployeeNumbers.includes(employeeNumber);
const isPrivileged = (account) =>
  isSuperAdministrator(account) ||
  Boolean(account.isPrivilegedRoleMember || account.hasSecurityAdministration);

/**
 * Recipient policy (owner decisions, Phase 05):
 *   - Ordinary accounts: the authoritative XX_DIGI_EMP_MASTER.EMAIL_ADDRESS; with a test override
 *     (non-production only) the approved test mailbox instead, never the employee.
 *   - Privileged accounts (Super Administrator, administrator roles, security permissions): only
 *     with separate approval (`privilegedDeliveryEnabled`) and never redirected to a test mailbox.
 *     The Super Administrator always and only uses the pinned address (docs/07 §5).
 * Returns null when no approved recipient exists (the caller fails closed).
 */
export function createRecipientResolver({
  testRecipientOverride = null,
  privilegedDeliveryEnabled = false,
}) {
  return function resolveRecipient(account) {
    if (isPrivileged(account)) {
      if (testRecipientOverride || !privilegedDeliveryEnabled) return null;
      if (isSuperAdministrator(account)) {
        return { channel: 'EMAIL', address: SUPER_ADMINISTRATOR_RECOVERY_EMAIL, source: 'PINNED' };
      }
    }
    const address = account.employee?.email?.trim().toLowerCase();
    if (!address) return null;
    if (testRecipientOverride) {
      return { channel: 'EMAIL', address: testRecipientOverride, source: 'TEST_OVERRIDE' };
    }
    return { channel: 'EMAIL', address, source: 'EMPLOYEE_MASTER' };
  };
}
