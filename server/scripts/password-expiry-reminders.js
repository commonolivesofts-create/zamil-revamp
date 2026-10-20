// Password-expiry reminders (docs/07 §4: 14, 7 and 1 day before expiry) — `npm run
// auth:password-reminders`. Read-only: it counts the ACTIVE accounts due for each reminder on
// today's Asia/Riyadh business date. Sending needs an approved delivery channel and recipient
// source, which do not exist yet (see delivery.js), so nothing is sent and nothing is simulated.
// Prints counts only; no identities.
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import { PASSWORD_POLICY } from '../src/modules/auth/auth.policy.js';
import { listPasswordExpiryReminders } from '../src/modules/auth/recovery.repository.js';
import { createUnconfiguredDelivery } from '../src/modules/notifications/delivery.js';

const { database } = config;
validateWallet(database.walletDir, [database.pools.LOW.alias], database.walletPassword);
await createPool(POOLS.LOW);
try {
  await withConnection(POOLS.LOW, async (connection) => {
    for (const daysBefore of PASSWORD_POLICY.expiryReminderDays) {
      const due = await listPasswordExpiryReminders(connection, {
        daysBefore,
        expiryDays: PASSWORD_POLICY.expiryDays,
      });
      console.log(`${daysBefore}-day reminder: ${due.length} account(s) due today`);
    }
  });
} finally {
  await closeDatabase();
}
if (!createUnconfiguredDelivery().configured) {
  console.log('Delivery channel not configured: no reminders were sent (fail closed).');
}
