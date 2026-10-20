// Operator check for Office 365 SMTP (`npm run smtp:verify`). Sends NO e-mail. With the test
// override configured it first confirms (read-only) that the connected database is the configured
// TEST database, then opens smtp.office365.com:587, upgrades with STARTTLS (certificate verified)
// and authenticates (XOAUTH2 or the tenant-permitted basic AUTH). Prints PASS/FAIL and error codes
// only; never credentials, tokens or addresses.
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import { findDatabaseName } from '../src/modules/notifications/databaseIdentity.repository.js';
import { createSmtpDelivery } from '../src/modules/notifications/smtpDelivery.js';

const { smtp, links, database } = config;
if (!smtp.enabled) {
  console.log('FAIL  SMTP_ENABLED is not true; nothing to verify.');
  process.exit(1);
}
console.log(
  `INFO  ${smtp.host}:${smtp.port} STARTTLS, auth ${smtp.authMethod}, test override ${smtp.testRecipientOverride ? 'ON' : 'OFF'}, privileged delivery ${smtp.privilegedDeliveryEnabled ? 'ON' : 'OFF'}`,
);

validateWallet(database.walletDir, [database.pools.LOW.alias], database.walletPassword);
await createPool(POOLS.LOW);
let failed = false;
try {
  const channel = createSmtpDelivery({
    smtp,
    links,
    readDatabaseName: () => withConnection(POOLS.LOW, findDatabaseName),
  });
  try {
    await channel.verifyConnection();
    console.log('PASS  database identity (when overridden), STARTTLS and SMTP authentication');
  } catch (error) {
    failed = true;
    console.log(
      `FAIL  ${error.reason ?? error.code ?? error.name}${error.responseCode ? ` (SMTP ${error.responseCode})` : ''}`,
    );
  }
} finally {
  await closeDatabase();
}
process.exitCode = failed ? 1 : 0;
