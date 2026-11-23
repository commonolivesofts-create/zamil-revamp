// Attendance processing (CI3 processattendance/*):
//   GET  /processing/departments
//   GET  /processing/employees?department=   (CI3 get_employees_by_department)
//   POST /processing/run                     (CI3 process_attendance)
import { Router } from 'express';
import { ALL, processRequestSchema, type ProcessResult } from '@attendance/shared';
import { requireAuth } from '../../auth/middleware';
import { AppError } from '../../lib/errors';
import { body } from '../http';
import type { ProcessingRepository } from './repository';
import { runProcessing } from './service';

export function processingRoutes(deps: { processing: ProcessingRepository }): Router {
  const router = Router();

  router.get('/processing/departments', requireAuth, async (_req, res) => {
    res.json({ departments: await deps.processing.departments() });
  });

  router.get('/processing/employees', requireAuth, async (req, res) => {
    const department = typeof req.query.department === 'string' ? req.query.department.trim() : '';
    if (department === '') throw new AppError('VALIDATION', 'Department is required.');
    if (department.toUpperCase() === ALL) {
      res.json({ employees: [] });
      return;
    }
    res.json({ employees: await deps.processing.employeesByDepartment(department) });
  });

  router.post('/processing/run', requireAuth, async (req, res) => {
    const request = body(processRequestSchema, req);
    const result: ProcessResult = {
      message: 'Attendance process completed.',
      summary: await runProcessing(deps.processing, request),
    };
    res.json(result);
  });

  return router;
}
