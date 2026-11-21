// The generic "filtered, paginated list + CSV export" module. Each CI3 report becomes a ListSpec
// (whitelisted SQL), a row mapper and one call to reportRoutes(); nothing else is repeated.
// Access is the same as CI3: every signed-in user.
import { Router } from 'express';
import type { z } from 'zod';
import { pageMeta, type Paged } from '@attendance/shared';
import { requireAuth } from '../auth/middleware';
import type { Db, PoolName, Row } from '../db/oracle';
import { buildExportSql, buildListSql, type ListQuery, type ListSpec } from '../db/sql';
import { sendCsv, type CsvExport } from '../lib/csv';

export interface ReportRepository<F, T> {
  list(query: ListQuery<F> & { page: number; limit: number }): Promise<Paged<T>>;
  /** Every matching row (CI3 exports had no limit). */
  exportRows(query: ListQuery<F>): Promise<T[]>;
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
    async exportRows(query) {
      const { sql, binds } = buildExportSql(spec, query);
      return (await db.query(pool, sql, binds)).map(mapRow);
    },
  };
}

export interface ReportRouteOptions<F, T> {
  /** e.g. '/employees' -> POST /employees/list and POST /employees/export */
  path: string;
  listSchema: z.ZodType<ListQuery<F> & { page: number; limit: number }>;
  repository: ReportRepository<F, T>;
  /** Omit for lists without a CSV export. */
  csv?: CsvExport<T> & { exportSchema: z.ZodType<ListQuery<F>> };
}

export function reportRoutes<F, T>(options: ReportRouteOptions<F, T>): Router {
  const router = Router();

  router.post(`${options.path}/list`, requireAuth, async (req, res) => {
    const query = options.listSchema.parse(req.body ?? {});
    res.json(await options.repository.list(query));
  });

  const csv = options.csv;
  if (!csv) return router;
  router.post(`${options.path}/export`, requireAuth, async (req, res) => {
    const query = csv.exportSchema.parse(req.body ?? {});
    sendCsv(res, csv, await options.repository.exportRows(query));
  });

  return router;
}
