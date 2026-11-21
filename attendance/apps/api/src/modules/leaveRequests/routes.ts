// Leave Requests (CI3 /leave-requests): POST /leave-requests/list and GET /leave-requests/defaults.
// Reads XX_DIGI_EMP_ABSENCE_TYPE in ADW (CI3 Leave_model). Leave dates are 'DD-MM-YY' text.
import { Router } from 'express';
import {
  leaveRequestListQuerySchema,
  pageMeta,
  payrollPeriodContaining,
  type LeaveRequestPage,
  type LeaveRequestRow,
} from '@attendance/shared';
import { requireAuth } from '../../auth/middleware';
import { clean, num, type Db, type Row } from '../../db/oracle';
import { dMY } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import { periodEndingOn } from '../dashboard/repository';

// Fixed (as in the Absence report): an unparsable leave date no longer fails the whole query.
const START = `TO_DATE(LEAVE_START_DATE DEFAULT NULL ON CONVERSION ERROR, 'DD-MM-RR')`;
const IN_PERIOD = `${START} BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')`;

export interface LeaveRequestRepository {
  summary(from: string, to: string): Promise<LeaveRequestPage['summary']>;
  total(from: string, to: string): Promise<number>;
  page(from: string, to: string, page: number, limit: number): Promise<LeaveRequestRow[]>;
  /** The latest processed date (the CI3 page opened on the dashboard's period). */
  latestProcessedDate(): Promise<string | null>;
}

const mapRow = (row: Row): LeaveRequestRow => ({
  empName: clean(row.EMP_NAME),
  leaveType: clean(row.LEAVE_TYPE),
  leaveStartDate: clean(row.LEAVE_START_DATE),
  leaveEndDate: clean(row.LEAVE_END_DATE),
  totalDays: clean(row.TOTAL_DAYS),
  approvalStatus: clean(row.APPROVAL_STATUS),
});

export function oracleLeaveRequestRepository(db: Db): LeaveRequestRepository {
  return {
    async summary(fromDate, toDate) {
      const count = (status: string) => `NVL(SUM(CASE WHEN ${status} THEN 1 ELSE 0 END), 0)`;
      const [row = {}] = await db.query(
        'adw',
        `SELECT ${count("UPPER(APPROVAL_STATUS) = 'APPROVED'")} AS APPROVED,
                ${count("UPPER(APPROVAL_STATUS) IN ('PENDING','AWAITING')")} AS PENDING,
                ${count("UPPER(APPROVAL_STATUS) IN ('UNPLANNED','DENIED')")} AS DENIED,
                COUNT(*) AS TOTAL
           FROM XX_DIGI_EMP_ABSENCE_TYPE WHERE ${IN_PERIOD}`,
        { fromDate, toDate },
      );
      return {
        approved: num(row.APPROVED) ?? 0,
        pending: num(row.PENDING) ?? 0,
        denied: num(row.DENIED) ?? 0,
        total: num(row.TOTAL) ?? 0,
      };
    },
    async total(fromDate, toDate) {
      const [row] = await db.query(
        'adw',
        `SELECT COUNT(*) AS TOTAL FROM XX_DIGI_EMP_ABSENCE_TYPE WHERE ${IN_PERIOD}`,
        { fromDate, toDate },
      );
      return num(row?.TOTAL) ?? 0;
    },
    async page(fromDate, toDate, page, limit) {
      const rows = await db.query(
        'adw',
        `SELECT EMP_NAME, LEAVE_TYPE, LEAVE_START_DATE, LEAVE_END_DATE, TO_CHAR(TOTAL_DAYS) AS TOTAL_DAYS,
                APPROVAL_STATUS
           FROM XX_DIGI_EMP_ABSENCE_TYPE
          WHERE ${IN_PERIOD}
          ORDER BY ${START} ASC
          OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
        { fromDate, toDate, offset: (page - 1) * limit, limit },
      );
      return rows.map(mapRow);
    },
    async latestProcessedDate() {
      const [row] = await db.query(
        'adw',
        `SELECT TO_CHAR(MAX(TRUNC(ATT_DATE)), 'YYYY-MM-DD') AS MAX_DATE FROM XX_DIGI_ATT_ATT_SHEET`,
      );
      return clean(row?.MAX_DATE);
    },
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: string) =>
  ISO.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function leaveRequestRoutes(deps: { leave: LeaveRequestRepository }): Router {
  const router = Router();

  router.get('/leave-requests/defaults', requireAuth, async (_req, res) => {
    const period = periodEndingOn(await deps.leave.latestProcessedDate());
    res.json({ fromDate: period.fromDate, toDate: period.toDate });
  });

  router.post('/leave-requests/list', requireAuth, async (req, res) => {
    const body = leaveRequestListQuerySchema.parse(req.body ?? {});
    // CI3: no dates means the payroll period containing today.
    const fallback = payrollPeriodContaining(new Date());
    const fromDate = body.filters.fromDate ?? fallback.from;
    const toDate = body.filters.toDate ?? fallback.to;
    if (!validDay(fromDate) || !validDay(toDate))
      throw new AppError('VALIDATION', 'Invalid date format.');
    if (fromDate > toDate)
      throw new AppError('VALIDATION', 'From Date cannot be greater than To Date.');

    const [summary, total, items] = await Promise.all([
      deps.leave.summary(fromDate, toDate),
      deps.leave.total(fromDate, toDate),
      deps.leave.page(fromDate, toDate, body.page, body.limit),
    ]);
    const page: LeaveRequestPage = {
      period: { fromDate, toDate, fromLabel: dMY(fromDate)!, toLabel: dMY(toDate)! },
      summary,
      items,
      pagination: pageMeta(body.page, body.limit, total),
    };
    res.json(page);
  });

  return router;
}
