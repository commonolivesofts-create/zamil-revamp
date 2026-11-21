// Timetable: POST /timetables/list, /timetables/export, POST /timetables (new assignment),
// PUT /timetables/:uuid (new version of an assignment), DELETE /timetables/:uuid,
// GET /timetables/employee/:empNo (name lookup for the form).
import { Router } from 'express';
import {
  TIMETABLE_EXPORT_COLUMNS,
  timetableExportQuerySchema,
  timetableInputSchema,
  timetableListQuerySchema,
  type TimetableFilters,
  type TimetableInput,
  type TimetableRow,
} from '@attendance/shared';
import { requirePermission } from '../../auth/middleware';
import { AppError } from '../../lib/errors';
import { body, uuidParam } from '../http';
import { reportRoutes, type ReportRepository } from '../report';
import type { TimetableRepository } from './repository';

const NOT_FOUND = 'Timetable not found.';

export function timetableRoutes(deps: {
  timetables: TimetableRepository;
  list: ReportRepository<TimetableFilters, TimetableRow>;
}): Router {
  const router = Router();
  const view = requirePermission('setup:view');
  const manage = requirePermission('setup:manage');

  router.use(
    reportRoutes({
      path: '/timetables',
      permission: 'setup:view',
      listSchema: timetableListQuerySchema,
      repository: deps.list,
      csv: {
        exportSchema: timetableExportQuerySchema,
        columns: TIMETABLE_EXPORT_COLUMNS,
        filePrefix: 'timetable_data',
      },
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

  router.get('/timetables/employee/:empNo', view, async (req, res) => {
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

  router.post('/timetables', manage, async (req, res) => {
    const input = await validInput(body(timetableInputSchema, req));
    const timetable = await deps.timetables.saveVersion(input);
    res.status(201).json({ message: 'Timetable added successfully.', timetable });
  });

  router.put('/timetables/:uuid', manage, async (req, res) => {
    const uuid = uuidParam(req, NOT_FOUND);
    const input = await validInput(body(timetableInputSchema, req));
    const timetable = await deps.timetables.saveVersion(input, uuid);
    res.json({ message: 'Timetable updated successfully.', timetable });
  });

  router.delete('/timetables/:uuid', manage, async (req, res) => {
    await deps.timetables.remove(uuidParam(req, NOT_FOUND));
    res.json({ message: 'Timetable deleted successfully.' });
  });

  return router;
}
