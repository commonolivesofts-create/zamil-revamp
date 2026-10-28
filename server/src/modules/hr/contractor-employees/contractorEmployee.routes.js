import { Router } from 'express';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { createContractorEmployeeController } from './contractorEmployee.controller.js';
import {
  conNumberParams,
  emptyBodySchema,
  emptyQuerySchema,
  empIdParams,
  listQuerySchema,
  lookupParams,
  writeBodySchema,
} from './contractorEmployee.validation.js';

const PERMISSION = 'HR.CONTRACTOR_EMPLOYEES';

export function createContractorEmployeeRouter({
  contractorEmployeeService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createContractorEmployeeController({ contractorEmployeeService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (schemas = {}) => [
    authenticate,
    authorize(PERMISSION, 'VIEW'),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas = {}) => [
    authenticate,
    requireCsrfToken,
    authorize(PERMISSION, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const employees = Router();
  const router = Router();

  for (const target of [employees, router]) {
    target.use((_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    });
  }

  employees.get('/lookups/:name', ...read({ params: lookupParams }), controller.lookup);
  employees.get('/', ...read({ query: listQuerySchema }), controller.list);
  employees.post('/', ...write('CREATE', { body: writeBodySchema }), controller.create);
  employees.get('/:empId', ...read({ params: empIdParams }), controller.get);
  employees.put(
    '/:empId',
    ...write('UPDATE', { params: empIdParams, body: writeBodySchema }),
    controller.update,
  );
  employees.delete('/:empId', ...write('DELETE', { params: empIdParams }), controller.remove);

  router.use('/contractor-employees', employees);
  router.get(
    '/contractors/:conNumber',
    ...read({ params: conNumberParams }),
    controller.contractorDetails,
  );
  return router;
}
