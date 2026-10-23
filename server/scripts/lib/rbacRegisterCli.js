// The RBAC registration CLI (preview and apply). scripts/rbac-register.js is the process entry;
// everything here takes injected dependencies so it is testable without Oracle or a TTY.
import { randomUUID } from 'node:crypto';
import { promptLine } from '../bootstrap-test-rbac.js';
import {
  APPROVED_TARGETS,
  REGISTER_SQL,
  RegistrationRefused,
  applyInserts,
  assertApplyIdentityConfigured,
  assertEnvironment,
  buildPlan,
  oracleErrorCode,
  parseArgs,
  registryDefinitions,
  verifyApplied,
} from './rbacRegistration.js';

// Statement time limit inside the write transaction; restored before the connection is released.
const APPLY_CALL_TIMEOUT_MS = 60_000;

export const EXIT = Object.freeze({ OK: 0, REFUSED: 1, NOT_READY: 2, UNKNOWN_OUTCOME: 3 });

const confirmationPhrase = (target, count, fingerprint) =>
  `REGISTER ${target} ${count} ${fingerprint.slice(0, 12)}`;

function report(say, { identity, problems, plan, fingerprint }) {
  say(`Target: ${identity.target} (service ${identity.serviceName})`);
  say(
    `DB_NAME: ${identity.dbName ?? 'unknown'} ${identity.dbNameApproved ? '(matches the approved DB_NAME)' : '(no approved DB_NAME configured for this target: apply is disabled)'}`,
  );
  for (const status of ['CONFLICT', 'MISSING', 'MATCH', 'UNREGISTERED']) {
    for (const item of plan.items.filter((entry) => entry.status === status)) {
      const reasons = item.reasons?.length ? ` — ${item.reasons.join('; ')}` : '';
      say(`  [${status}] ${item.kind} ${item.key}${reasons}`);
    }
  }
  const { counts } = plan;
  say(
    `Counts: MATCH ${counts.MATCH}, MISSING ${counts.MISSING}, CONFLICT ${counts.CONFLICT}, UNREGISTERED ${counts.UNREGISTERED}`,
  );
  if (problems.length) {
    say('Preconditions failed; nothing can be written:');
    for (const problem of problems) say(`  - ${problem}`);
  }
  say(`Plan fingerprint (SHA-256): ${fingerprint}`);
}

/**
 * Entry point. Dependencies are injected so every guard is testable without Oracle or a TTY.
 *
 * @returns {Promise<number>} exit code (EXIT)
 */
export async function main({
  argv,
  appConfig,
  db,
  io,
  registeredModules,
  newCorrelationId = () => `rbac-register-${randomUUID()}`,
  targets = APPROVED_TARGETS,
}) {
  const say = (line = '') => io.output.write(`${line}\n`);
  let stage = 'prepare';
  let correlationId = null;
  try {
    const options = parseArgs(argv, targets);
    const target = targets[options.target];
    assertEnvironment(appConfig, target);
    // Fail closed before connecting: apply needs the complete approved identity.
    if (options.apply) assertApplyIdentityConfigured(target);
    const definitions = registryDefinitions(registeredModules);

    say(
      `Zamil Digitalization RBAC catalogue registration — ${options.apply ? 'APPLY' : 'PREVIEW (read-only)'}`,
    );
    const preview = await db.withConnection('LOW', (connection) =>
      buildPlan(connection, { target, definitions, forApply: options.apply }),
    );
    report(say, preview);

    if (preview.problems.length) return EXIT.NOT_READY;
    if (preview.plan.counts.CONFLICT) {
      say(
        'Conflicts must be resolved by an authorized administrator; this script never changes existing records. Nothing was written.',
      );
      return EXIT.NOT_READY;
    }
    if (!preview.plan.counts.MISSING) {
      say('No changes needed: every registry entry already exists. Nothing was written.');
      return EXIT.OK;
    }
    if (!options.apply) {
      say(
        `${preview.plan.counts.MISSING} record(s) would be inserted. Preview only; nothing was written.`,
      );
      say('To apply after owner authorization, record this preview and run:');
      say(
        `  npm run db:rbac-register -- --target=${target.name} --apply --fingerprint=${preview.fingerprint}`,
      );
      return EXIT.OK;
    }

    if (options.fingerprint !== preview.fingerprint) {
      throw new RegistrationRefused(
        'The current plan differs from the reviewed fingerprint; preview again and obtain approval for the new plan.',
      );
    }
    if (!io.input.isTTY || typeof io.input.setRawMode !== 'function') {
      throw new RegistrationRefused('--apply requires an interactive terminal (TTY).');
    }
    const phrase = confirmationPhrase(
      target.name,
      preview.plan.counts.MISSING,
      preview.fingerprint,
    );
    const typed = await promptLine(
      io,
      `Type "${phrase}" to insert into ${target.name} (${preview.identity.dbName ?? preview.identity.serviceName}): `,
    );
    if (typed !== phrase)
      throw new RegistrationRefused('Confirmation did not match; nothing written.');

    correlationId = newCorrelationId();
    stage = 'transaction';
    const created = await db.withTransaction('LOW', async (connection) => {
      const previousCallTimeout = connection.callTimeout;
      connection.callTimeout = APPLY_CALL_TIMEOUT_MS;
      try {
        // NOWAIT: a concurrent registration or catalogue change fails fast instead of queueing.
        await connection.execute(REGISTER_SQL.lock);
        // Everything is re-read under the lock: identity (SERVICE_NAME and DB_NAME), constraints,
        // catalogue and plan.
        const fresh = await buildPlan(connection, { target, definitions, forApply: true });
        if (fresh.problems.length)
          throw new RegistrationRefused(`Preconditions changed: ${fresh.problems.join('; ')}`);
        if (fresh.plan.counts.CONFLICT)
          throw new RegistrationRefused('A conflict appeared after the preview.');
        if (fresh.fingerprint !== options.fingerprint) {
          throw new RegistrationRefused(
            'The catalogue changed after the preview; the plan no longer matches the reviewed fingerprint.',
          );
        }
        const inserted = await applyInserts(connection, {
          inserts: fresh.plan.inserts,
          catalog: fresh.catalog,
          identity: fresh.identity,
          fingerprint: fresh.fingerprint,
          correlationId,
        });
        const problems = await verifyApplied(connection, {
          definitions,
          planned: inserted,
          correlationId,
        });
        if (problems.length)
          throw new RegistrationRefused(`Verification failed: ${problems.join('; ')}`);
        stage = 'commit';
        return inserted;
      } finally {
        connection.callTimeout = previousCallTimeout;
      }
    });

    say(`Committed ${created.length} record(s):`);
    for (const key of created) say(`  + ${key}`);
    say(`Correlation ID: ${correlationId}`);
    say(`Plan fingerprint: ${options.fingerprint}`);
    say(
      'Record the operator, owner approval, target, fingerprint and correlation ID in the change log.',
    );
    say('No permission was granted to any role or user.');
    return EXIT.OK;
  } catch (error) {
    const code = oracleErrorCode(error);
    if (stage === 'commit') {
      // The commit itself failed or its result was lost: the outcome cannot be known here.
      say(`UNKNOWN OUTCOME (${code ?? 'no code'}): the commit may or may not have completed.`);
      say(
        `Correlation ID: ${correlationId}. If the transaction committed, XX_ZRV_RBAC_AUDIT_LOGS has RBAC_CATALOG_CHANGED rows with this CORRELATION_ID.`,
      );
      say(
        'Do NOT re-run --apply. Run the preview to see the actual catalogue state and record this in the change log.',
      );
      return EXIT.UNKNOWN_OUTCOME;
    }
    const written =
      stage === 'transaction'
        ? ' The transaction was rolled back; nothing was committed.'
        : ' Nothing was written.';
    if (error instanceof RegistrationRefused) say(`Refused: ${error.message}${written}`);
    else if (code === 'ORA-00054')
      say(
        `Refused: the catalogue tables are locked by another session (ORA-00054).${written} Preview again later.`,
      );
    else if (code === 'ORA-00001')
      say(`Refused: a record was created concurrently (ORA-00001).${written} Preview again.`);
    else say(`Registration failed (${code ?? error?.name ?? 'error'}).${written}`);
    return EXIT.REFUSED;
  }
}
