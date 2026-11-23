// Timetable: POST /timetables/list, /timetables/export, POST /timetables (new assignment),
// PUT /timetables/:uuid (new version of an assignment), DELETE /timetables/:uuid,
// GET /timetables/employee/:empNo (name lookup for the form).
import { Router } from 'express';
import {
  timetableExportQuerySchema,
  timetableInputSchema,
  timetableListQuerySchema,
  type TimetableFilters,
  type TimetableInput,
  type TimetableRow,
} from '@attendance/shared';
import { requireAuth } from '../../auth/middleware';
import { dash, dMY, dMYTime, type CsvExport } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import { body, uuidParam } from '../http';
import { reportRoutes, type ReportRepository } from '../report';
import type { TimetableRepository } from './repository';

const NOT_FOUND = 'Timetable not found.';

/** CI3 export: the 17 keys of Timetable::serializeTimetable (including its "overtime_alowed"). */
export const TIMETABLE_EXPORT: CsvExport<TimetableRow> = {
  filePrefix: 'timetable_data',
  emptyMessage: 'No timetable data found to export.',
  columns: [
    { label: 'id', value: (r) => r.id },
    { label: 'uuid', value: (r) => r.uuid },
    { label: 'emp_no', value: (r) => r.empNo },
    { label: 'emp_name', value: (r) => r.empName },
    { label: 'shift_id', value: (r) => r.shiftId },
    { label: 'shift_name', value: (r) => r.shiftName },
    { label: 'start_date', value: (r) => r.startDate },
    { label: 'end_date', value: (r) => r.endDate },
    { label: 'exclude_timesheet', value: (r) => r.excludeTimesheet },
    { label: 'overtime_alowed', value: (r) => r.overtimeAllowed },
    { label: 'status', value: (r) => r.status },
    { label: 'created_at', value: (r) => dMYTime(r.createdAt) },
    { label: 'updated_at', value: (r) => dMYTime(r.updatedAt) },
    { label: 'start_date_display', value: (r) => dash(dMY(r.startDate)) },
    { label: 'end_date_display', value: (r) => dash(dMY(r.endDate)) },
    { label: 'status_display', value: (r) => dash(r.status) },
    { label: 'shift_name_display', value: (r) => dash(r.shiftName) },
  ],
};

export function timetableRoutes(deps: {
  timetables: TimetableRepository;
  list: ReportRepository<TimetableFilters, TimetableRow>;
}): Router {
  const router = Router();

  router.use(
    reportRoutes({
      path: '/timetables',
      listSchema: timetableListQuerySchema,
      repository: deps.list,
      csv: { ...TIMETABLE_EXPORT, exportSchema: timetableExportQuerySchema },
    }),
  );

  const validInput = async (input: TimetableInput) => {
    if (!(await deps.timetables.shiftExists(Number(input.shiftId)))) {
      throw new AppError('VALIDATION', 'Selected shift does not exist.', {
        issues: [{ path: 'shiftId', message: 'Selected shift does not exist.' }],
      });
    }
    return input;
  };

  router.get('/timetables/employee/:empNo', requireAuth, async (req, res) => {
    const empNo = String(req.params.empNo ?? '').trim();
    if (!/^\d+$/.test(empNo)) throw new AppError('VALIDATION', 'Employee Number must be numeric.');
    if (empNo.length < 3) {
      throw new AppError('VALIDATION', 'Please enter at least 3 digits for Employee Number.');
    }
    const employee = await deps.timetables.lookupEmployee(empNo);
    if (!employee)
      throw new AppError('NOT_FOUND', 'Employee not found for the provided Employee Number.');
    res.json(employee);
  });

  router.post('/timetables', requireAuth, async (req, res) => {
    const input = await validInput(body(timetableInputSchema, req));
    const timetable = await deps.timetables.saveVersion(input);
    res.status(201).json({ message: 'Timetable added successfully.', timetable });
  });

  router.put('/timetables/:uuid', requireAuth, async (req, res) => {
    const uuid = uuidParam(req, NOT_FOUND);
    const input = await validInput(body(timetableInputSchema, req));
    const timetable = await deps.timetables.saveVersion(input, uuid);
    res.json({ message: 'Timetable updated successfully.', timetable });
  });

  router.delete('/timetables/:uuid', requireAuth, async (req, res) => {
    await deps.timetables.remove(uuidParam(req, NOT_FOUND));
    res.json({ message: 'Timetable deleted successfully.' });
  });

  return router;
}
