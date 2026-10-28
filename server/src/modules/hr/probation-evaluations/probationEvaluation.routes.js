import { Router } from 'express';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { createProbationEvaluationController } from './probationEvaluation.controller.js';
import {
  createBodySchema,
  emptyBodySchema,
  emptyQuerySchema,
  employeeDetailsQuerySchema,
  headerIdParams,
  listQuerySchema,
  updateBodySchema,
} from './probationEvaluation.validation.js';

const PROBATION_EVALUATIONS = 'HR.PROBATION_EVALUATIONS';

export function createProbationEvaluationRouter({
  probationEvaluationService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createProbationEvaluationController({ probationEvaluationService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (schemas = {}) => [
    authenticate,
    authorize(PROBATION_EVALUATIONS, 'VIEW'),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas = {}) => [
    authenticate,
    requireCsrfToken,
    authorize(PROBATION_EVALUATIONS, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...read({ query: listQuerySchema }), controller.list);
  router.get('/lookups/form-types', ...read(), controller.formTypes);
  router.get('/lookups/employees', ...read(), controller.employees);
  router.get('/lookups/requestor', ...read(), controller.requestor);
  router.get(
    '/lookups/employee-details',
    ...read({ query: employeeDetailsQuerySchema }),
    controller.employeeDetails,
  );
  router.post('/', ...write('CREATE', { body: createBodySchema }), controller.create);
  router.get('/:headerId', ...read({ params: headerIdParams }), controller.get);
  router.put(
    '/:headerId',
    ...write('UPDATE', { params: headerIdParams, body: updateBodySchema }),
    controller.update,
  );
  router.delete('/:headerId', ...write('DELETE', { params: headerIdParams }), controller.remove);

  return router;
}
