import { Router } from 'express';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { createPersonalStatusController } from './personalStatusChange.controller.js';
import {
  emptyBodySchema,
  emptyQuerySchema,
  employeeNumberParamsSchema,
  headerIdParamsSchema,
  listQuerySchema,
  writeBodySchema,
} from './personalStatusChange.validation.js';

const PERMISSION = 'HR.PERSONNEL_RECORD_CHANGES';

export function createPersonalStatusRoutes({
  personalStatusService,
  authenticate,
  authorize,
  auditService,
}) {
  if (
    typeof authenticate !== 'function' ||
    typeof authorize !== 'function' ||
    !personalStatusService ||
    !auditService
  ) {
    throw new Error(
      'personalStatusService, authenticate, authorize, and auditService are required',
    );
  }

  const controller = createPersonalStatusController(personalStatusService);
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (action, schemas = {}) => [
    authenticate,
    authorize(PERMISSION, action),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas = {}) => [
    authenticate,
    requireCsrfToken,
    authorize(PERMISSION, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/lookups/employees', ...read('VIEW'), controller.employees);

  router.get('/lookups/positions', ...read('VIEW'), controller.positions);

  router.get(
    '/lookups/employees/:empNo',
    ...read('VIEW', { params: employeeNumberParamsSchema }),
    controller.autoFill,
  );

  router.get('/', ...read('VIEW', { query: listQuerySchema }), controller.list);

  router.post('/', ...write('CREATE', { body: writeBodySchema }), controller.create);

  router.get('/:headerId', ...read('VIEW', { params: headerIdParamsSchema }), controller.read);

  router.put(
    '/:headerId',
    ...write('UPDATE', {
      params: headerIdParamsSchema,
      body: writeBodySchema,
    }),
    controller.update,
  );

  router.delete(
    '/:headerId',
    ...write('DELETE', { params: headerIdParamsSchema }),
    controller.remove,
  );

  return router;
}
