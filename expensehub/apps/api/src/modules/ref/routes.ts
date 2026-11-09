// Implements: API §3 reference data (read-only).
import {
  coaQuerySchema,
  employeeRefQuerySchema,
  formatSar,
  isApprover,
  type CoaValueDto,
  type EmployeeRef,
  type TripRef,
} from '@expensehub/shared';
import { Router } from 'express';
import { authOf, requireAuth } from '../../auth/rbac';
import type { DataLayer } from '../../data/ports';
import { AppError } from '../../lib/errors';
import { expenseTypeDto } from '../setup/dto';

export function refRoutes({ data }: { data: DataLayer }): Router {
  const router = Router();

  /** Active expense types with their policy fields (capture form, M4). */
  router.get('/ref/expense-types', requireAuth, async (_req, res) => {
    const rows = await data.read((r) => r.expenseTypes.list());
    res.json({ items: rows.filter((t) => t.active === 'Y').map(expenseTypeDto) });
  });

  /** Own approved business trips (FR-TRP-02), newest first. */
  router.get('/ref/trips/mine', requireAuth, async (req, res) => {
    const { personId } = authOf(req);
    const rows = await data.read((r) => r.businessTrips.listByPerson(personId));
    const items: TripRef[] = rows
      .filter((t) => t.approvalStatus === 'APPROVED')
      .map((t) => ({
        tripId: t.tripId,
        absenceType: t.absenceType,
        startDate: t.startDate,
        endDate: t.endDate,
        days: t.days,
        destination: t.destination,
      }));
    res.json({ items });
  });

  /** Currencies with a Fusion corporate rate, plus SAR (FR-CAP-06). */
  router.get('/ref/currencies', requireAuth, async (_req, res) => {
    const rows = await data.read((r) => r.rates.list());
    const items = [
      'SAR',
      ...[...new Set(rows.map((r) => r.fromCcy))].filter((c) => c !== 'SAR').sort(),
    ];
    res.json({ items });
  });

  /** Own Quick Pays, read-only (API §8, OQ-07 proposal); also the reference list on a line. */
  router.get('/quick-pays/mine', requireAuth, async (req, res) => {
    const { personId } = authOf(req);
    const rows = await data.read((r) => r.quickPays.listByPerson(personId));
    res.json({
      items: rows
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
        .map((q) => ({
          quickPayId: q.quickPayId,
          elementName: q.elementName,
          amountSar: formatSar(q.amountSar),
          effectiveDate: q.effectiveDate,
        })),
    });
  });

  /** COA segment values (FR-CAP-08 / FR-POL-05). */
  router.get('/ref/coa', requireAuth, async (req, res) => {
    const { segment, q, includeDisabled } = coaQuerySchema.parse(req.query);
    const needle = q?.toLowerCase();
    const rows = await data.read((r) => r.coaValues.listBySegment(segment));
    const items: CoaValueDto[] = rows
      .filter((v) => includeDisabled || v.enabled === 'Y')
      .filter(
        (v) =>
          !needle ||
          v.value.toLowerCase().includes(needle) ||
          v.description.toLowerCase().includes(needle),
      )
      .map((v) => ({
        segment: v.segment,
        value: v.value,
        description: v.description,
        enabled: v.enabled === 'Y',
      }));
    res.json({ items });
  });

  /** Employee search — Fin, Adm and approvers (role assignment, delegation pick). */
  router.get('/ref/employees', requireAuth, async (req, res) => {
    const auth = authOf(req);
    const allowed =
      isApprover(auth.capabilities) ||
      auth.capabilities.some((c) => c === 'SYS_ADMIN' || c === 'FINANCE_AP' || c === 'ACCOUNTANT');
    if (!allowed) throw new AppError('FORBIDDEN', 'You do not have access to this.');
    const { q, limit = 20 } = employeeRefQuerySchema.parse(req.query);
    const needle = q?.toLowerCase();
    const rows = await data.read((r) => r.employees.list());
    const items: EmployeeRef[] = rows
      .filter((e) => e.active === 'Y')
      .filter(
        (e) =>
          !needle ||
          e.fullName.toLowerCase().includes(needle) ||
          e.personNumber.includes(needle) ||
          (e.jobName ?? '').toLowerCase().includes(needle),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, limit)
      .map((e) => ({
        personId: e.personId,
        personNumber: e.personNumber,
        fullName: e.fullName,
        businessUnit: e.businessUnit,
        jobName: e.jobName,
      }));
    res.json({ items });
  });

  return router;
}
