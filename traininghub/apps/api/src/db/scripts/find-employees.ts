// npm run db:find-employees — read-only: lists tables/views in the schema that look like an
// employee master (have a person/employee number column), with row counts and columns, so one
// can feed TrainingHub through FUSION_MODE=sql while the Fusion user is being fixed.
import { main, oracleFromEnv } from './cli';

void main(async () => {
  const { store, config } = oracleFromEnv();
  const cands = await store.exec<{ T: string; KIND: string }>(
    `SELECT DISTINCT c.table_name AS T, o.object_type AS KIND
       FROM user_tab_columns c JOIN user_objects o ON o.object_name = c.table_name AND o.object_type IN ('TABLE','VIEW')
      WHERE c.column_name IN ('PERSON_NUMBER','EMP_NUMBER','EMPLOYEE_NUMBER','EMP_NO','EMPLOYEE_NO','PERSON_NO')
        AND c.table_name NOT LIKE :p ESCAPE '\\'
      ORDER BY 1`,
    { p: config.data.prefix.replace('_', '\\_') + '%' },
  );
  if (!cands.rows?.length) console.log('No table with a person / employee number column found.');
  for (const { T, KIND } of cands.rows ?? []) {
    const cols = await store.exec<{ C: string }>(`SELECT column_name AS C FROM user_tab_columns WHERE table_name = :t ORDER BY column_id`, { t: T });
    let n = '?';
    try {
      n = String((await store.exec<{ N: number }>(`SELECT COUNT(*) AS N FROM "${T.replace(/"/g, '')}"`)).rows![0]!.N);
    } catch {
      /* no access */
    }
    console.log(`\n${T} (${KIND.toLowerCase()}, ${n} rows)\n  ${(cols.rows ?? []).map((c) => c.C).join(', ')}`);
  }
  await store.close();
});
