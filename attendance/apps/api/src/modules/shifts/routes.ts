// Shifts: POST /shifts/list, /shifts/export, GET /shifts/choices, GET/PUT/DELETE /shifts/:uuid,
// POST /shifts. Sub Shifts: POST /shift-details/list, GET/PUT /shift-details/:uuid.
import { Router } from 'express';
import {
  SHIFT_EXPORT_COLUMNS,
  shiftDetailListQuerySchema,
  shiftExportQuerySchema,
  shiftInputSchema,
  shiftListQuerySchema,
  shiftWeekInputSchema,
  type ShiftDetailFilters,
  type ShiftDetailRow,
  type ShiftFilters,
  type ShiftRow,
} from '@attendance/shared';
import { requirePermission } from '../../auth/middleware';
import { AppError } from '../../lib/errors';
import { body, uuidParam } from '../http';
import { reportRoutes, type ReportRepository } from '../report';
import type { ShiftRepository } from './repository';

const NOT_FOUND = 'Shift not found.';
const duplicateName = () =>
  new AppError('VALIDATION', 'The Shift Name already exists. Please use a unique value.', {
    issues: [
      { path: 'shiftName', message: 'The Shift Name already exists. Please use a unique value.' },
    ],
  });

export function shiftRoutes(deps: {
  shifts: ShiftRepository;
  list: ReportRepository<ShiftFilters, ShiftRow>;
  weekList: ReportRepository<ShiftDetailFilters, ShiftDetailRow>;
}): Router {
  const router = Router();
  const view = requirePermission('setup:view');
  const manage = requirePermission('setup:manage');

  router.use(
    reportRoutes({
      path: '/shifts',
      permission: 'setup:view',
      listSchema: shiftListQuerySchema,
      repository: deps.list,
      csv: {
        exportSchema: shiftExportQuerySchema,
        columns: SHIFT_EXPORT_COLUMNS,
        filePrefix: 'shift_data',
      },
    }),
  );
  router.use(
    reportRoutes({
      path: '/shift-details',
      permission: 'setup:view',
      listSchema: shiftDetailListQuerySchema,
      repository: deps.weekList,
    }),
  );

  router.get('/shifts/choices', view, async (_req, res) => {
    res.json(await deps.shifts.choices());
  });

  router.get('/shifts/:uuid', view, async (req, res) => {
    const shift = await deps.shifts.findByUuid(uuidParam(req, NOT_FOUND));
    if (!shift) throw new AppError('NOT_FOUND', NOT_FOUND);
    res.json(shift);
  });

  router.post('/shifts', manage, async (req, res) => {
    const input = body(shiftInputSchema, req);
    if (await deps.shifts.nameExists(input.shiftName)) throw duplicateName();
    const shift = await deps.shifts.insert(input);
    res.status(201).json({ message: 'Shift added successfully.', shift });
  });

  router.put('/shifts/:uuid', manage, async (req, res) => {
    const uuid = uuidParam(req, NOT_FOUND);
    const input = body(shiftInputSchema, req);
    if (await deps.shifts.nameExists(input.shiftName, uuid)) throw duplicateName();
    const { shift, changed } = await deps.shifts.update(uuid, input);
    res.json({
      message: changed ? 'Shift updated successfully.' : 'No changes detected.',
      shift,
      changed,
    });
  });

  router.delete('/shifts/:uuid', manage, async (req, res) => {
    await deps.shifts.remove(uuidParam(req, NOT_FOUND));
    res.json({ message: 'Shift deleted successfully.' });
  });

  router.get('/shift-details/:uuid', view, async (req, res) => {
    res.json(await deps.shifts.week(uuidParam(req, 'Selected shift was not found.')));
  });

  router.put('/shift-details/:uuid', manage, async (req, res) => {
    const uuid = uuidParam(req, 'Selected shift was not found.');
    const input = body(shiftWeekInputSchema, req);
    const { existed } = await deps.shifts.saveWeek(uuid, input);
    res.json({
      message: existed
        ? 'Shift details updated successfully.'
        : 'Shift details saved successfully.',
    });
  });

  return router;
}
