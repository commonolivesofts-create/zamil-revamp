// Start-up sequence of the RBAC registration executable (scripts/rbac-register.js). Every guard that
// needs no database runs before the Oracle module is loaded, the wallet is validated or the LOW
// pool is created:
//   1. arguments   2. target and environment   3. --apply: approved DB_NAME configured
//   4. wallet validation and LOW pool   5. cli.main() (which repeats the guards: defence in depth)
// Modules are supplied by `load` so the order is testable without Oracle. Dependency-free apart
// from the safe error helper, so even failures while loading modules are reported safely.
import { describeStartupError } from './safeErrors.js';

/**
 * @param {object} options
 * @param {string[]} options.argv
 * @param {{ input: object, output: { write(text: string): void } }} options.io
 * @param {Record<'registration'|'config'|'wallet'|'database'|'cli'|'registry', () => Promise<object>>} options.load
 * @returns {Promise<number>} process exit code
 */
export async function runCli({ argv, io, load }) {
  let oracle;
  let exitCode = 1;
  try {
    const lib = await load.registration();
    const options = lib.parseArgs(argv);
    const target = lib.APPROVED_TARGETS[options.target];
    const { config } = await load.config();
    lib.assertEnvironment(config, target);
    // Fail closed before any wallet or connection work: apply needs the approved DB_NAME.
    if (options.apply) lib.assertApplyIdentityConfigured(target);

    const { validateWallet } = await load.wallet();
    validateWallet(
      config.database.walletDir,
      [config.database.pools.LOW.alias],
      config.database.walletPassword,
    );
    const [database, cli, registry] = await Promise.all([
      load.database(),
      load.cli(),
      load.registry(),
    ]);
    oracle = database;
    await oracle.createPool(oracle.POOLS.LOW);
    exitCode = await cli.main({
      argv,
      appConfig: config,
      db: { withConnection: oracle.withConnection, withTransaction: oracle.withTransaction },
      io,
      registeredModules: registry.registeredModules,
    });
  } catch (error) {
    io.output.write(`Refused: ${describeStartupError(error)}\n`);
  } finally {
    await oracle?.closeDatabase().catch(() => {});
  }
  return exitCode;
}
