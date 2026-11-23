// Applies attendance_schema.sql to the ADW configured in server/.env (XXZP test).
// Guard: only CREATE TABLE / CREATE INDEX on XX_DIGI_* objects; existing tables
// are skipped (ORA-00955). Nothing is dropped or altered.
//
// Run from server/ (uses its oracledb driver and wallet settings):
//   node --env-file=.env ../zamil-attendance/db/apply-schema.mjs ../zamil-attendance/db/attendance_schema.sql           (dry run)
//   node --env-file=.env ../zamil-attendance/db/apply-schema.mjs ../zamil-attendance/db/attendance_schema.sql apply     (create)
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('package.json')); const oracledb = require('oracledb'); const e = process.env;
const [file, mode] = process.argv.slice(2);
const sql = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
const stmts = sql.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
for (const s of stmts) {  // guard: additive XX_DIGI_* objects only
  if (!/^CREATE\s+(TABLE|INDEX)\s+XX_DIGI_[A-Z0-9_]+\b/i.test(s) || /\b(DROP|TRUNCATE|DELETE|ALTER|GRANT)\b/i.test(s)) throw new Error('Refusing statement: ' + s.slice(0, 80));
  if (/^CREATE\s+INDEX/i.test(s) && !/\bON\s+XX_DIGI_/i.test(s)) throw new Error('Index on non XX_DIGI table: ' + s.slice(0, 80));
}
console.log(`${stmts.length} statements passed guard (${mode === "apply" ? "applying" : "dry run, nothing executed"})`);
if (mode !== 'apply') process.exit(0);
const w = path.resolve(e.ORACLE_WALLET_DIR);
const c = await oracledb.getConnection({ user: e.ORACLE_USER, password: e.ORACLE_PASSWORD, connectString: e.ORACLE_HIGH_ALIAS, configDir: w, walletLocation: w, walletPassword: e.ORACLE_WALLET_PASSWORD });
for (const s of stmts) {
  const name = s.match(/^CREATE\s+\w+\s+(\w+)/i)[1];
  try { await c.execute(s); console.log('created', name); }
  catch (err) { if (err.errorNum === 955) console.log('exists, skipped', name); else { console.log('FAILED', name, err.message); } }
}
await c.close();
