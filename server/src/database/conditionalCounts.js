/**
 * Many counts in one statement: each requested filter set becomes a conditional-count column
 * (`COUNT(CASE WHEN <filters> THEN 1 END)`) over one scan of the scoped rows, instead of one
 * `COUNT(*)` round trip per filter set. Repositories pass the same predicates their list uses,
 * so every count equals the list total for that filter set.
 *
 * Each filter set's binds are renamed with a `q<index>_` prefix so equal filter keys of
 * different sets (two months' `dateFrom`, say) never collide; the shared scope binds keep
 * their names. Predicates must reference their binds as `:name` (the repositories' FILTERS do).
 */

/** Most filter sets one statement answers (keeps the SELECT list and bind count bounded). */
export const MAX_COUNT_QUERIES = 60;

const BIND_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** `sql` and `binds` with every bind renamed to `<prefix><name>`. */
export function prefixBinds(sql, binds, prefix) {
  let text = sql;
  const renamed = {};
  for (const [name, value] of Object.entries(binds)) {
    if (!BIND_NAME.test(name)) throw new Error(`Unsupported bind name ${name}`);
    text = text.replace(new RegExp(`:${name}\\b`, 'g'), `:${prefix}${name}`);
    renamed[`${prefix}${name}`] = value;
  }
  return { sql: text, binds: renamed };
}

/**
 * Builds the statement. `sets` are `{ conditions: string[], binds: object }` (an empty
 * `conditions` counts every scoped row). `distinct` counts distinct values of that column
 * (for a FROM with a one-to-many join) instead of rows.
 */
export function buildCountStatement({
  with: cte = '',
  from,
  where = [],
  binds = {},
  sets,
  distinct,
}) {
  if (!Array.isArray(sets) || sets.length === 0 || sets.length > MAX_COUNT_QUERIES) {
    throw new Error(`Between 1 and ${MAX_COUNT_QUERIES} count queries are supported`);
  }
  const allBinds = { ...binds };
  const columns = sets.map((set, index) => {
    const predicate = set.conditions.length ? set.conditions.join(' AND ') : '1 = 1';
    const named = prefixBinds(predicate, set.binds ?? {}, `q${index}_`);
    Object.assign(allBinds, named.binds);
    const value = distinct ?? '1';
    return `COUNT(${distinct ? 'DISTINCT ' : ''}CASE WHEN ${named.sql} THEN ${value} END) AS C${index}`;
  });
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `${cte}
     SELECT ${columns.join(',\n            ')}
       ${from}
      ${filter}`,
    binds: allBinds,
  };
}

/** Runs the statement through the repository's `rows(sql, binds)` and returns the counts in order. */
export async function countSets(rows, statement) {
  const { sql, binds } = buildCountStatement(statement);
  const [row = {}] = await rows(sql, binds);
  return statement.sets.map((_, index) => Number(row[`C${index}`] ?? 0));
}
