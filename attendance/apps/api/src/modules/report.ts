// The generic "filtered, paginated list + CSV export" module. Each CI3 report becomes a ListSpec
// (whitelisted SQL), a row mapper and one call to reportRoutes(); nothing else is repeated.
import { Router } from 'express';
import type { z } from 'zod';
import { MAX_EXPORT_ROWS, pageMeta, type Paged, type Permission } from '@attendance/shared';
import { requirePermission } from '../auth/middleware';
import type { Db, PoolName, Row } from '../db/oracle';
import { buildExportSql, buildListSql, type ListQuery, type ListSpec } from '../db/sql';
import { sendCsv, type CsvColumn } from '../lib/csv';
import { AppError } from '../lib/errors';

export interface ReportRepository<F, T> {
  list(query: ListQuery<F> & { page: number; limit: number }): Promise<Paged<T>>;
  /** Up to `maxRows` + 1 rows, so callers can tell when the export would be truncated. */
  exportRows(query: ListQuery<F>, maxRows: number): Promise<T[]>;
}

export function oracleReportRepository<F, T>(
  db: Db,
  pool: PoolName,
  spec: ListSpec<F>,
  mapRow: (row: Row) => T,
): ReportRepository<F, T> {
  return {
    async list(query) {
      const { countSql, countBinds, listSql, listBinds } = buildListSql(spec, query);
      const [countRows, rows] = await Promise.all([
        db.query(pool, countSql, countBinds),
        db.query(pool, listSql, listBinds),
      ]);
      const total = Number(countRows[0]?.TOTAL ?? 0);
      return { items: rows.map(mapRow), pagination: pageMeta(query.page, query.limit, total) };
    },
    async exportRows(query, maxRows) {
      const { sql, binds } = buildExportSql(spec, query, maxRows + 1);
      return (await db.query(pool, sql, binds)).map(mapRow);
    },
  };
}

export interface ReportRouteOptions<F, T> {
  /** e.g. '/employees' -> POST /employees/list and POST /employees/export */
  path: string;
  permission: Permission;
  listSchema: z.ZodType<ListQuery<F> & { page: number; limit: number }>;
  repository: ReportRepository<F, T>;
  /** Omit for lists without a CSV export. */
  csv?: {
    exportSchema: z.ZodType<ListQuery<F>>;
    columns: readonly CsvColumn<T>[];
    filePrefix: string;
  };
}

export function reportRoutes<F, T>(options: ReportRouteOptions<F, T>): Router {
  const router = Router();
  const guard = requirePermission(options.permission);

  router.post(`${options.path}/list`, guard, async (req, res) => {
    const query = options.listSchema.parse(req.body ?? {});
    res.json(await options.repository.list(query));
  });

  const csv = options.csv;
  if (!csv) return router;
  router.post(`${options.path}/export`, guard, async (req, res) => {
    const query = csv.exportSchema.parse(req.body ?? {});
    const rows = await options.repository.exportRows(query, MAX_EXPORT_ROWS);
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new AppError(
        'VALIDATION',
        `More than ${MAX_EXPORT_ROWS.toLocaleString('en')} rows match. Narrow the filters and export again.`,
      );
    }
    sendCsv(res, csv.filePrefix, csv.columns, rows);
  });

  return router;
}
