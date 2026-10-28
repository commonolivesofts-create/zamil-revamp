import { Router } from 'express';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { createOrientationTrainingController } from './orientationTraining.controller.js';
import {
  createBodySchema,
  emptyBodySchema,
  emptyQuerySchema,
  employeeDetailsQuerySchema,
  flagQuerySchema,
  headerIdParams,
  lineIdParams,
  listQuerySchema,
  skillsQuerySchema,
  updateBodySchema,
} from './orientationTraining.validation.js';

const ORIENTATION_TRAININGS = 'HR.ORIENTATION_TRAININGS';

export function createOrientationTrainingRouter({
  orientationTrainingService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createOrientationTrainingController({ orientationTrainingService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (schemas = {}) => [
    authenticate,
    authorize(ORIENTATION_TRAININGS, 'VIEW'),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas = {}) => [
    authenticate,
    requireCsrfToken,
    authorize(ORIENTATION_TRAININGS, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...read({ query: listQuerySchema }), controller.list);
  router.get('/lookups/flag', ...read({ query: flagQuerySchema }), controller.flag);
  router.get('/lookups/employees', ...read(), controller.employees);
  router.get('/lookups/managers', ...read(), controller.managers);
  router.get(
    '/lookups/employee-details',
    ...read({ query: employeeDetailsQuerySchema }),
    controller.employeeDetails,
  );
  router.get('/lookups/skills', ...read({ query: skillsQuerySchema }), controller.skills);
  router.post('/', ...write('CREATE', { body: createBodySchema }), controller.create);
  router.delete(
    '/:headerId/lines/:lineId',
    ...write('MANAGE_LINES', { params: lineIdParams }),
    controller.removeLine,
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
