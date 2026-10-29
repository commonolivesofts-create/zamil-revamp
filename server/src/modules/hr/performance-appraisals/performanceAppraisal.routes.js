import { Router } from 'express';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { createPerformanceAppraisalController } from './performanceAppraisal.controller.js';
import {
  createBodySchema,
  employeeLookupQuerySchema,
  employeeNameParams,
  employeeRemarksBodySchema,
  emptyBodySchema,
  emptyQuerySchema,
  headerIdParams,
  listQuerySchema,
  updateBodySchema,
} from './performanceAppraisal.validation.js';

const RESOURCE = 'HR.PERFORMANCE_APPRAISALS';

export function createPerformanceAppraisalRouter({
  performanceAppraisalService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createPerformanceAppraisalController({ performanceAppraisalService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (schemas = {}) => [
    authenticate,
    authorize(RESOURCE, 'VIEW'),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas = {}) => [
    authenticate,
    requireCsrfToken,
    authorize(RESOURCE, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...read({ query: listQuerySchema }), controller.list);
  router.get(
    '/lookups/employees',
    ...read({ query: employeeLookupQuerySchema }),
    controller.employees,
  );
  router.get(
    '/lookups/employees/:name',
    ...read({ params: employeeNameParams, query: employeeLookupQuerySchema }),
    controller.employeeDetails,
  );
  router.get('/lookups/grade-stats', ...read(), controller.gradeStats);
  router.get('/lookups/requestor', ...read(), controller.requestor);
  router.post('/', ...write('CREATE', { body: createBodySchema }), controller.create);
  router.put(
    '/:headerId/employee-remarks',
    ...write('UPDATE', { params: headerIdParams, body: employeeRemarksBodySchema }),
    controller.employeeRemarks,
  );
  router.get('/:headerId', ...read({ params: headerIdParams }), controller.get);
  router.put(
    '/:headerId',
    ...write('UPDATE', { params: headerIdParams, body: updateBodySchema }),
    controller.update,
  );
  router.delete('/:headerId', ...write('DELETE', { params: headerIdParams }), controller.remove);
  return router;
}
