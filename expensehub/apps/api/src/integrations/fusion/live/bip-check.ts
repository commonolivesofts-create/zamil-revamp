// npm run fusion:bip-check [REPORT ...] [--invoice-ids=1,2] [--show-fields]
// D-44: runs the ExpenseHub BIP reports in the Fusion pod (read-only) and checks each one against
// its CSV contract. Prints counts, column names and contract problems only — never row data.
// D-46: --show-fields lists the business leave request fields of EH_HCM_BUSINESS_TRIPS with how
// often each is filled and up to 3 sample values, to find the one that holds the destination.
import path from 'node:path';
import type { z } from 'zod';
import { addDays, riyadhDate } from '../../../lib/dates';
import { BIP_REPORTS, type BipReport } from '../client';
import {
  apPayeeCsv,
  businessTripCsv,
  ContractError,
  glDailyRateCsv,
  glSegmentValueCsv,
  hcmEmployeeCsv,
  invoicePaymentCsv,
  parseRows,
  quickPayCsv,
} from '../contracts';
import { runBipReport } from './bip';

const CONTRACTS: Record<BipReport, z.ZodObject> = {
  EH_HCM_EMPLOYEES: hcmEmployeeCsv,
  EH_AP_EMPLOYEE_PAYEES: apPayeeCsv,
  EH_GL_SEGMENT_VALUES: glSegmentValueCsv,
  EH_HCM_BUSINESS_TRIPS: businessTripCsv,
  EH_PAY_QUICK_PAYS: quickPayCsv,
  EH_AP_INVOICE_PAYMENTS: invoicePaymentCsv,
  EH_GL_DAILY_RATES: glDailyRateCsv,
};

/** Counted per value of this column (aggregates only). */
const GROUP_BY: Partial<Record<BipReport, string>> = {
  EH_HCM_EMPLOYEES: 'BU_CODE',
  EH_AP_EMPLOYEE_PAYEES: 'BU_CODE',
  EH_GL_SEGMENT_VALUES: 'SEGMENT',
  EH_HCM_BUSINESS_TRIPS: 'ABSENCE_TYPE',
  EH_PAY_QUICK_PAYS: 'BU_CODE',
  EH_GL_DAILY_RATES: 'FROM_CURRENCY',
};

/** D-46: the trips report carries every leave-request field; DESTINATION is filled by the sync. */
const OPTIONAL_COLUMNS: Partial<Record<BipReport, string[]>> = {
  EH_HCM_BUSINESS_TRIPS: ['DESTINATION'],
};
const EXTRA_COLUMNS_ALLOWED = new Set<BipReport>(['EH_HCM_BUSINESS_TRIPS']);

const say = (line: string) => process.stdout.write(`${line}\n`);

const root = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '..');
process.loadEnvFile(path.join(root, '.env'));
const env = process.env;
const args = process.argv.slice(2);
const invoiceIds = args.find((a) => a.startsWith('--invoice-ids='))?.split('=')[1] ?? '0';
const showFields = args.includes('--show-fields');
const wanted = args.filter((a) => !a.startsWith('--'));
const reports = (wanted.length ? wanted : BIP_REPORTS) as BipReport[];

const today = riyadhDate(new Date());
const PARAMS: Record<BipReport, Record<string, string>> = {
  EH_HCM_EMPLOYEES: { P_AS_OF_DATE: today },
  EH_AP_EMPLOYEE_PAYEES: {},
  EH_GL_SEGMENT_VALUES: {},
  EH_HCM_BUSINESS_TRIPS: {
    P_ABSENCE_TYPES: 'Business Leave,Business Leaves',
    P_FROM_DATE: addDays(today, -365),
  },
  EH_PAY_QUICK_PAYS: {
    P_ELEMENTS: '', // D-48: every QuickPay
    P_FROM_DATE: addDays(today, -90),
  },
  EH_AP_INVOICE_PAYMENTS: { P_INVOICE_IDS: invoiceIds },
  EH_GL_DAILY_RATES: {
    P_TO_CURRENCY: 'SAR',
    P_RATE_TYPE: 'Corporate',
    P_FROM_DATE: addDays(today, -365),
  },
};

// --bi-user: run as the BI author account (FUSION_BI_USER) instead of the integration user.
const asBiUser = args.includes('--bi-user');
const runUser = asBiUser ? env.FUSION_BI_USER : env.FUSION_USER;
const runPassword = asBiUser ? env.FUSION_BI_PASSWORD : env.FUSION_PASSWORD;
if (!env.FUSION_BASE_URL || !runUser || !runPassword) {
  console.error(
    `[bip-check] FUSION_BASE_URL and ${asBiUser ? 'FUSION_BI_USER / FUSION_BI_PASSWORD' : 'FUSION_USER / FUSION_PASSWORD'} must be set in .env`,
  );
  process.exit(1);
}
const conn = {
  baseUrl: env.FUSION_BASE_URL,
  user: runUser,
  password: runPassword,
  pathPrefix: env.FUSION_BIP_PATH_PREFIX ?? '/Custom/ExpenseHub',
};

let failed = 0;
for (const report of reports) {
  // Diagnostics (fusion/bip/discovery): metadata and counts only, printed as they come.
  if (report.startsWith('EH_DISCOVER_')) {
    try {
      const { body: rows, raw } = await runBipReport(conn, report, {});
      say(`[bip-check] ${report}: ${rows.length ? `${rows.length} rows` : raw}`);
      for (const r of rows) say(`  ${Object.values(r).join(' | ')}`);
    } catch (err) {
      failed++;
      say(`[bip-check] ${report}: FAILED — ${(err as Error).message.split('\n')[0]}`);
    }
    continue;
  }
  const contract = CONTRACTS[report];
  if (!contract) {
    console.error(`[bip-check] unknown report ${report}; known: ${BIP_REPORTS.join(', ')}`);
    failed++;
    continue;
  }
  const started = Date.now();
  try {
    const { body: rows } = await runBipReport(conn, report, PARAMS[report]);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const expected = Object.keys(contract.shape);
    const actual = rows[0] ? Object.keys(rows[0]) : [];
    const optional = OPTIONAL_COLUMNS[report] ?? [];
    const missing = expected.filter((c) => !actual.includes(c) && !optional.includes(c));
    const extraAll = actual.filter((c) => !expected.includes(c));
    const extra = EXTRA_COLUMNS_ALLOWED.has(report) ? [] : extraAll;
    let line = `[bip-check] ${report}: ${rows.length} rows in ${seconds}s`;
    const by = GROUP_BY[report];
    if (by && rows.length) {
      const counts = new Map<string, number>();
      for (const r of rows)
        counts.set(r[by] || '(blank)', (counts.get(r[by] || '(blank)') ?? 0) + 1);
      line += ` · by ${by}: ${[...counts].map(([k, n]) => `${k} ${n}`).join(', ')}`;
    }
    say(line);
    if (EXTRA_COLUMNS_ALLOWED.has(report) && extraAll.length && rows.length) {
      say(`  leave request fields (filled in how many of ${rows.length} trips):`);
      for (const column of extraAll) {
        const values = rows.map((r) => r[column] ?? '').filter((v) => v !== '');
        let detail = `    ${column.padEnd(22)} ${values.length}`;
        if (showFields && values.length) {
          const samples = [...new Set(values)].slice(0, 3).map((v) => `"${v.slice(0, 40)}"`);
          detail += `  e.g. ${samples.join(', ')}`;
        }
        say(detail);
      }
      if (!showFields) say('  (add --show-fields to see sample values)');
    }
    if (rows.length && (missing.length || extra.length)) {
      say(
        `  columns — missing: ${missing.join(', ') || 'none'}; unexpected: ${extra.join(', ') || 'none'}`,
      );
      failed++;
      continue;
    }
    parseRows(contract, rows, report);
    say(rows.length ? '  OK — every row matches the contract' : '  OK — ran, but returned no rows');
  } catch (err) {
    failed++;
    if (err instanceof ContractError) {
      say(`  CONTRACT — ${err.issues.length} problem(s):`);
      for (const issue of err.issues.slice(0, 10)) say(`    ${issue}`);
    } else {
      say(`[bip-check] ${report}: FAILED — ${(err as Error).message.split('\n')[0]}`);
    }
  }
}
process.exitCode = failed ? 1 : 0;
