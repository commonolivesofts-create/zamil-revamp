import { Router } from 'express';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { createTransferRequestController } from './transferRequest.controller.js';
import {
  emptyBodySchema,
  emptyQuerySchema,
  employeeNameParams,
  headerIdParams,
  listQuerySchema,
  writeBodySchema,
} from './transferRequest.validation.js';

const RESOURCE = 'HR.TRANSFER_REQUESTS';

export function createTransferRequestRouter({
  transferRequestService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createTransferRequestController({ transferRequestService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (action, schemas = {}) => [
    authenticate,
    authorize(RESOURCE, action),
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

  router.get('/', ...read('VIEW', { query: listQuerySchema }), controller.list);
  router.get('/lookups/employees', ...read('VIEW'), controller.employees);
  router.get(
    '/lookups/employees/:name',
    ...read('VIEW', { params: employeeNameParams }),
    controller.employeeDetails,
  );
  router.get('/lookups/jobs', ...read('VIEW'), controller.jobs);
  router.get('/lookups/sections', ...read('VIEW'), controller.sections);
  router.get('/lookups/departments', ...read('VIEW'), controller.departments);
  router.get('/lookups/directors', ...read('VIEW'), controller.directors);
  router.get('/lookups/blood-types', ...read('VIEW'), controller.bloodTypes);
  router.get('/lookups/requestor', ...read('VIEW'), controller.requestor);
  router.post('/', ...write('CREATE', { body: writeBodySchema }), controller.create);
  router.get('/:headerId', ...read('VIEW', { params: headerIdParams }), controller.get);
  router.put(
    '/:headerId',
    ...write('UPDATE', { params: headerIdParams, body: writeBodySchema }),
    controller.update,
  );
  router.delete('/:headerId', ...write('DELETE', { params: headerIdParams }), controller.remove);
  return router;
}
