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
import { runCli } from './lib/rbacRegisterEntry.js';

// Only the dependency-free start-up sequence is imported statically. Configuration, the Oracle
// driver and the registry are loaded through these functions, in the order runCli() enforces:
// every pre-connection guard (including the approved DB_NAME for --apply) passes before the
// wallet is validated or the LOW pool is created.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    io: { input: process.stdin, output: process.stdout },
    load: {
      registration: () => import('./lib/rbacRegistration.js'),
      config: () => import('../src/config/index.js'),
      wallet: () => import('../src/database/wallet.js'),
      database: () => import('../src/database/oracle.js'),
      cli: () => import('./lib/rbacRegisterCli.js'),
      registry: () => import('../../client/src/config/registry/index.js'),
    },
  });
}
