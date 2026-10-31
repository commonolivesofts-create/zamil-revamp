import { Router } from 'express';
import { validate } from '../../../middleware/validate.js';
import { createPeriodwiseEmployeeController } from './periodwiseEmployee.controller.js';
import { emptyQuerySchema, reportQuerySchema } from './periodwiseEmployee.validation.js';

// Registered in the client module registry (HR.PERIODWISE_EMPLOYEES); read-only, VIEW only.
const PERIODWISE_EMPLOYEES = 'HR.PERIODWISE_EMPLOYEES';

/**
 * Periodwise Employees report, mounted at /api/v1/hr/reports/periodwise-employees. Read-only:
 * every route requires an authenticated session and HR.PERIODWISE_EMPLOYEES:VIEW (re-evaluated
 * in Oracle per request). Validation runs after authorization. The lookup is declared first.
 */
export function createPeriodwiseEmployeeRouter({
  periodwiseEmployeeService,
  authorize,
  authenticate,
}) {
  const controller = createPeriodwiseEmployeeController({ periodwiseEmployeeService });
  const read = (query) => [
    authenticate,
    authorize(PERIODWISE_EMPLOYEES, 'VIEW'),
    validate({ query }),
  ];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/lookups/departments', ...read(emptyQuerySchema), controller.departments);
  router.get('/', ...read(reportQuerySchema), controller.report);

  return router;
}
