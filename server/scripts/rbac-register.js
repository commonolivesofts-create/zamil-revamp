// Registration of developer-defined RBAC catalogue entries in Oracle (Phase 2B).
//
//   npm run db:rbac-register -- --target=TEST
//       READ-ONLY preview: verifies environment, wallet, database identity and constraints, compares
//       the active registry (client/src/config/registry/index.js) with the catalogue and prints
//       MATCH / MISSING / CONFLICT / UNREGISTERED, counts and the SHA-256 plan fingerprint.
//   npm run db:rbac-register -- --target=TEST --apply --fingerprint=<sha256>
//       Writes only with separate owner authorization (gate G1): requires an interactive terminal,
//       the reviewed fingerprint and a typed confirmation, then inserts the MISSING records in one
//       LOW transaction under NOWAIT table locks, re-checking identity, preconditions and the plan,
//       with one SYSTEM RBAC_CATALOG_CHANGED audit row per record, verified before commit.
//
// Never runs automatically. Never updates, deletes, activates, deactivates or renames catalogue
// rows; never grants permissions, assigns roles or changes overrides; never writes inside
// SECURITY_ADMINISTRATION. See server/docs/RBAC-REGISTRATION.md.
import { pathToFileURL } from 'node:url';
import { describeStartupError } from './lib/safeErrors.js';

// Only the dependency-free error helper is imported statically. Everything that loads the
// configuration, the Oracle driver or the registry is imported inside the try block, so every
// failure (including an invalid configuration) is reported through describeStartupError().
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let exitCode = 1;
  let oracle;
  try {
    const [cli, lib, { config }, database, { validateWallet }, registry] = await Promise.all([
      import('./lib/rbacRegisterCli.js'),
      import('./lib/rbacRegistration.js'),
      import('../src/config/index.js'),
      import('../src/database/oracle.js'),
      import('../src/database/wallet.js'),
      import('../../client/src/config/registry/index.js'),
    ]);
    const options = lib.parseArgs(process.argv.slice(2));
    lib.assertEnvironment(config, lib.APPROVED_TARGETS[options.target]);
    validateWallet(
      config.database.walletDir,
      [config.database.pools.LOW.alias],
      config.database.walletPassword,
    );
    oracle = database;
    await oracle.createPool(oracle.POOLS.LOW);
    exitCode = await cli.main({
      argv: process.argv.slice(2),
      appConfig: config,
      db: { withConnection: oracle.withConnection, withTransaction: oracle.withTransaction },
      io: { input: process.stdin, output: process.stdout },
      registeredModules: registry.registeredModules,
    });
  } catch (error) {
    process.stdout.write(`Refused: ${describeStartupError(error)}\n`);
  } finally {
    await oracle?.closeDatabase().catch(() => {});
  }
  process.exitCode = exitCode;
}
