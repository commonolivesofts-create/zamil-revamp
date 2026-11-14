// npm run fusion:check — diagnoses the Fusion connection without printing any secret.
//  1. Compares TrainingHub's FUSION_* settings with ExpenseHub's .env (same / different only).
//  2. Calls each employee report and shows the HTTP result and row count.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { cliConfig, main } from '../../db/scripts/cli';
import { REPO_ROOT } from '../../paths';
import { FusionError, runBipReport } from './bip';

void main(async () => {
  const config = cliConfig();
  const f = config.fusion;
  console.log(`Fusion pod: ${f.baseUrl ?? '(FUSION_BASE_URL not set)'}`);
  console.log(
    `User: ${f.user ?? '(FUSION_USER not set)'} · password ${f.password ? `set (${f.password.length} characters)` : 'NOT SET'}`,
  );
  const ehFile = path.resolve(REPO_ROOT, process.argv[2] ?? '../expensehub', '.env');
  if (existsSync(ehFile)) {
    const eh = parseEnv(readFileSync(ehFile, 'utf8'));
    for (const k of ['FUSION_BASE_URL', 'FUSION_USER', 'FUSION_PASSWORD'] as const) {
      const mine = process.env[k];
      console.log(
        `  ${k}: ${!eh[k] ? 'not in ExpenseHub .env' : mine === eh[k] ? 'same as ExpenseHub' : 'DIFFERENT from ExpenseHub'}`,
      );
    }
  } else console.log(`  (ExpenseHub .env not found at ${ehFile})`);
  if (!f.baseUrl || !f.user || !f.password) throw new Error('Fusion settings are incomplete in .env');
  const conn = { baseUrl: f.baseUrl, user: f.user, password: f.password, timeoutMs: 60_000 };
  for (const report of [f.employeeReport, f.employeeReportFallback]) {
    process.stdout.write(`\n${report}\n  `);
    try {
      const r = await runBipReport(conn, report, { P_AS_OF_DATE: new Date().toISOString().slice(0, 10) });
      console.log(
        `OK — ${r.body.length} rows; columns: ${Object.keys(r.body[0] ?? {}).join(', ') || '(none)'}`,
      );
    } catch (e) {
      const x = e as FusionError;
      console.log(
        `${x.httpStatus === 401 ? 'HTTP 401 — Fusion rejected the user name / password' : x.httpStatus === 403 ? 'HTTP 403 — signed in, but no access to BI Publisher' : x.message}`,
      );
    }
  }
});
