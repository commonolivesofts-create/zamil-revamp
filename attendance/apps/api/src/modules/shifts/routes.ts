// Shifts: POST /shifts/list, /shifts/export, GET /shifts/choices, GET/PUT/DELETE /shifts/:uuid,
// POST /shifts. Sub Shifts: POST /shift-details/list, GET/PUT /shift-details/:uuid.
import { Router } from 'express';
import {
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
import { requireAuth } from '../../auth/middleware';
import { dash, dMY, dMYTime, type CsvExport } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import { body, uuidParam } from '../http';
import { reportRoutes, type ReportRepository } from '../report';
import type { ShiftRepository } from './repository';

const NOT_FOUND = 'Shift not found.';

/** CI3 export: the 19 keys of Shifts::serializeShift, in order, with its formats. */
export const SHIFT_EXPORT: CsvExport<ShiftRow> = {
  filePrefix: 'shift_data',
  emptyMessage: 'No shift data found to export.',
  columns: [
    { label: 'id', value: (r) => r.id },
    { label: 'uuid', value: (r) => r.uuid },
    { label: 'shift_name', value: (r) => r.shiftName },
    { label: 'start_date', value: (r) => r.startDate },
    { label: 'end_date', value: (r) => r.endDate },
    { label: 'status', value: (r) => r.status },
    { label: 'check_in', value: (r) => r.checkIn },
    { label: 'check_out', value: (r) => r.checkOut },
    { label: 'created_at', value: (r) => dMYTime(r.createdAt) },
    { label: 'updated_at', value: (r) => dMYTime(r.updatedAt) },
    { label: 'start_date_display', value: (r) => dash(dMY(r.startDate)) },
    { label: 'end_date_display', value: (r) => dash(dMY(r.endDate)) },
    { label: 'status_display', value: (r) => dash(r.status) },
    { label: 'check_in_display', value: (r) => dash(r.checkIn) },
    { label: 'check_out_display', value: (r) => dash(r.checkOut) },
    { label: 'weekday_ovrtm_cap', value: (r) => r.weekdayOvertimeCap },
    { label: 'weekend_ovrtm_cap', value: (r) => r.weekendOvertimeCap },
    { label: 'weekday_ovrtm_cap_display', value: (r) => dash(r.weekdayOvertimeCap) },
    { label: 'weekend_ovrtm_cap_display', value: (r) => dash(r.weekendOvertimeCap) },
  ],
};
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

  router.use(
    reportRoutes({
      path: '/shifts',
      listSchema: shiftListQuerySchema,
      repository: deps.list,
      csv: { ...SHIFT_EXPORT, exportSchema: shiftExportQuerySchema },
    }),
  );
  router.use(
    reportRoutes({
      path: '/shift-details',
      listSchema: shiftDetailListQuerySchema,
      repository: deps.weekList,
    }),
  );

  router.get('/shifts/choices', requireAuth, async (_req, res) => {
    res.json(await deps.shifts.choices());
  });

  router.get('/shifts/:uuid', requireAuth, async (req, res) => {
    const shift = await deps.shifts.findByUuid(uuidParam(req, NOT_FOUND));
    if (!shift) throw new AppError('NOT_FOUND', NOT_FOUND);
    res.json(shift);
  });

  router.post('/shifts', requireAuth, async (req, res) => {
    const input = body(shiftInputSchema, req);
    if (await deps.shifts.nameExists(input.shiftName)) throw duplicateName();
    const shift = await deps.shifts.insert(input);
    res.status(201).json({ message: 'Shift added successfully.', shift });
  });

  router.put('/shifts/:uuid', requireAuth, async (req, res) => {
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

  router.delete('/shifts/:uuid', requireAuth, async (req, res) => {
    await deps.shifts.remove(uuidParam(req, NOT_FOUND));
    res.json({ message: 'Shift deleted successfully.' });
  });

  router.get('/shift-details/:uuid', requireAuth, async (req, res) => {
    res.json(await deps.shifts.week(uuidParam(req, 'Selected shift was not found.')));
  });

  router.put('/shift-details/:uuid', requireAuth, async (req, res) => {
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
