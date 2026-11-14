// npm run db:migrate [-- --dry-run]
// Creates missing TrainingHub tables, columns, unique keys and indexes in the shared schema.
// It only ever CREATEs or ADDs objects whose names start with the TrainingHub prefix; it never
// drops or alters anything else, so the other objects in the schema are untouched.
import { writeFileSync } from 'node:fs';
import { fromRepoRoot } from '../../paths';
import { columnSql, createTableSql, fullSchemaSql } from '../ddl';
import { ALL_TABLES, toSnake } from '../tables';
import { main, oracleFromEnv } from './cli';

const SCHEMA_VERSION = 1;
const dryRun = process.argv.includes('--dry-run');

void main(async () => {
  const { config, store } = oracleFromEnv();
  const P = config.data.prefix;
  writeFileSync(fromRepoRoot('db/schema.sql'), fullSchemaSql(P) + '\n');
  const like = { p: P.replace('_', '\\_') + '%' };

  const q = async <X>(sql: string, binds = like) => ((await store.exec<X>(sql, binds)).rows ?? []) as X[];
  const tables = new Set(
    (
      await q<{ T: string }>(`SELECT table_name AS T FROM user_tables WHERE table_name LIKE :p ESCAPE '\\'`)
    ).map((r) => r.T),
  );
  const cols = new Set(
    (
      await q<{ T: string; C: string }>(
        `SELECT table_name AS T, column_name AS C FROM user_tab_columns WHERE table_name LIKE :p ESCAPE '\\'`,
      )
    ).map((r) => `${r.T}.${r.C}`),
  );
  const objects = new Set(
    [
      ...(await q<{ N: string }>(
        `SELECT index_name AS N FROM user_indexes WHERE index_name LIKE :p ESCAPE '\\'`,
      )),
      ...(await q<{ N: string }>(
        `SELECT constraint_name AS N FROM user_constraints WHERE constraint_name LIKE :p ESCAPE '\\'`,
      )),
    ].map((r) => r.N),
  );

  const plan: string[] = [];
  const warnings: string[] = [];
  if (!tables.has(`${P}SCHEMA_MIGRATIONS`))
    plan.push(
      `CREATE TABLE ${P}SCHEMA_MIGRATIONS (VERSION_NO NUMBER(10) NOT NULL, DESCRIPTION VARCHAR2(400 CHAR), APPLIED_AT TIMESTAMP(3) DEFAULT SYSTIMESTAMP NOT NULL, CONSTRAINT ${P}SCHEMA_MIGRATIONS_PK PRIMARY KEY (VERSION_NO))`,
    );
  for (const def of ALL_TABLES) {
    const t = P + def.name;
    if (!tables.has(t)) {
      plan.push(...createTableSql(def, P));
      continue;
    }
    for (const [c, spec] of Object.entries(def.cols)) {
      if (cols.has(`${t}.${toSnake(c)}`)) continue;
      let sql = columnSql(def, c, spec);
      if (spec.req && !spec.def) {
        sql = sql.replace(' NOT NULL', '');
        warnings.push(`${t}.${toSnake(c)} added as nullable (no default for existing rows)`);
      }
      plan.push(`ALTER TABLE ${t} ADD (${sql})`);
    }
    (def.unique ?? []).forEach((u, i) => {
      const n = `${t}_UK${i + 1}`;
      if (!objects.has(n))
        plan.push(`ALTER TABLE ${t} ADD CONSTRAINT ${n} UNIQUE (${u.map(toSnake).join(', ')})`);
    });
    (def.indexes ?? []).forEach((ix, i) => {
      const n = `${t}_IX${i + 1}`;
      if (!objects.has(n)) plan.push(`CREATE INDEX ${n} ON ${t} (${ix.map(toSnake).join(', ')})`);
    });
  }

  // Guard: every statement must only name prefixed objects.
  for (const s of plan) {
    const target = s.match(/^(?:CREATE TABLE|ALTER TABLE|CREATE INDEX \S+ ON)\s+(\S+)/)?.[1] ?? '';
    if (!target.startsWith(P))
      throw new Error(`Refusing to run a statement outside ${P}*: ${s.slice(0, 80)}`);
  }

  console.log(`${P}* objects: ${tables.size} tables found, ${plan.length} statement(s) to run.`);
  for (const w of warnings) console.log(`  ! ${w}`);
  if (dryRun) {
    plan.forEach((s) => console.log(`\n${s};`));
    console.log('\n(dry run — nothing executed)');
    await store.close();
    return;
  }
  for (const s of plan) {
    process.stdout.write(`  ${s.split('\n')[0]!.slice(0, 100)} … `);
    await store.exec(s);
    console.log('ok');
  }
  const has = await q<{ N: number }>(
    `SELECT COUNT(*) AS N FROM ${P}SCHEMA_MIGRATIONS WHERE VERSION_NO = :v`,
    {
      v: SCHEMA_VERSION,
    } as never,
  );
  if (!Number(has[0]?.N))
    await store.exec(`INSERT INTO ${P}SCHEMA_MIGRATIONS (VERSION_NO, DESCRIPTION) VALUES (:v, :d)`, {
      v: SCHEMA_VERSION,
      d: `TrainingHub schema v${SCHEMA_VERSION}: ${ALL_TABLES.length} tables`,
    });
  console.log(`✔ Schema is at version ${SCHEMA_VERSION}. Next: npm run db:seed`);
  await store.close();
});
