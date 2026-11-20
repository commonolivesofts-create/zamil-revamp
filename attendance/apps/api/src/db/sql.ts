// SQL building blocks for filtered, paginated lists (replaces the hand-built WHERE clauses of
// every CI3 model). Values are always bind variables; only whitelisted SQL fragments written in
// repositories ever reach the statement text.
import type { Binds } from './oracle';

export class Binder {
  readonly binds: Binds = {};
  private n = 0;
  /** Adds a value and returns its placeholder, e.g. ":b0". */
  add(value: string | number | null): string {
    const name = `b${this.n++}`;
    this.binds[name] = value;
    return `:${name}`;
  }
}

/** Escapes LIKE wildcards so user input matches literally (CI3 let % and _ act as wildcards). */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Case-insensitive "contains": UPPER(expr) LIKE %VALUE%. */
export const containsCi =
  (expr: string) =>
  (value: string, b: Binder): string =>
    `UPPER(${expr}) LIKE ${b.add(`%${escapeLike(value.toUpperCase())}%`)} ESCAPE '\\'`;

/** Case-sensitive "contains": expr LIKE %value%. */
export const contains =
  (expr: string) =>
  (value: string, b: Binder): string =>
    `${expr} LIKE ${b.add(`%${escapeLike(value)}%`)} ESCAPE '\\'`;

/** A DATE column on a calendar day (index friendly, same result as TO_CHAR(col) = day). */
export const onDay =
  (column: string) =>
  (isoDay: string, b: Binder): string => {
    const day = b.add(isoDay);
    return `(${column} >= TO_DATE(${day}, 'YYYY-MM-DD') AND ${column} < TO_DATE(${day}, 'YYYY-MM-DD') + 1)`;
  };

export type FilterRule = (value: string, b: Binder) => string;

export interface ListSpec<F> {
  /** e.g. "XX_DIGI_EMP_MASTER d" */
  from: string;
  /** Select list (aliases become the row keys). */
  select: string;
  /** Conditions always applied (fixed SQL, no user input). */
  where?: string[];
  /** One rule per supported filter key. */
  filters: { [K in keyof F]-?: FilterRule };
  /** Columns matched by the free-text search (OR, case-insensitive contains). */
  search: string[];
  orderBy: string;
}

export interface ListQuery<F> {
  search: string;
  filters: F;
}

export function buildWhere<F>(spec: ListSpec<F>, query: ListQuery<F>, b: Binder): string {
  const parts = [...(spec.where ?? [])];
  for (const key of Object.keys(spec.filters) as (keyof F)[]) {
    const value = query.filters[key];
    if (typeof value === 'string' && value !== '') parts.push(spec.filters[key](value, b));
  }
  if (query.search) {
    const ors = spec.search.map((column) => containsCi(column)(query.search, b));
    parts.push(`(${ors.join(' OR ')})`);
  }
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
}

/** COUNT and page statements for one list request. */
export function buildListSql<F>(
  spec: ListSpec<F>,
  query: ListQuery<F> & { page: number; limit: number },
) {
  const b = new Binder();
  const where = buildWhere(spec, query, b);
  const countSql = `SELECT COUNT(1) AS TOTAL FROM ${spec.from}${where}`;
  const countBinds = { ...b.binds };
  const offset = b.add((query.page - 1) * query.limit);
  const limit = b.add(query.limit);
  const listSql = `SELECT ${spec.select} FROM ${spec.from}${where} ORDER BY ${spec.orderBy} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
  return { countSql, countBinds, listSql, listBinds: b.binds };
}

/** All matching rows up to `maxRows` (exports). */
export function buildExportSql<F>(spec: ListSpec<F>, query: ListQuery<F>, maxRows: number) {
  const b = new Binder();
  const where = buildWhere(spec, query, b);
  const limit = b.add(maxRows);
  return {
    sql: `SELECT ${spec.select} FROM ${spec.from}${where} ORDER BY ${spec.orderBy} FETCH FIRST ${limit} ROWS ONLY`,
    binds: b.binds,
  };
}
