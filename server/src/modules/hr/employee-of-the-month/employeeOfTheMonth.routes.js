import { Router } from 'express';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { AppError } from '../../../shared/errors/AppError.js';

import {
  validationCode,
  headerIdParams,
  emptyBodySchema,
  emptyQuerySchema,
  criteriaQuerySchema,
  employeeQuerySchema,
  listQuerySchema,
  createBodySchema,
  updateBodySchema,
} from './employeeOfTheMonth.validation.js';

import { createEmployeeOfTheMonthController } from './employeeOfTheMonth.controller.js';

const RESOURCE = 'HR.EMPLOYEE_OF_THE_MONTH';

function validate(schemas) {
  return (req, _res, next) => {
    for (const [part, schema] of Object.entries(schemas)) {
      const { error, value } = schema.validate(req[part] ?? {}, {
        abortEarly: false,
        convert: true,
      });

      if (error) {
        const first = error.details[0];
        const field = first.path.join('.');

        return next(
          new AppError(
            400,
            validationCode(field, first.type),
            'Validation failed',
            error.details.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          ),
        );
      }

      Object.defineProperty(req, part, {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };
}

export function createEmployeeOfTheMonthRouter({ service, authenticate, authorize, auditService }) {
  const router = Router();

  const controller = createEmployeeOfTheMonthController({
    service,
  });

  const csrf = createRequireCsrfToken({
    auditService,
  });

  const read = (schemas = {}) => [
    authenticate,
    authorize(RESOURCE, 'VIEW'),
    validate({
      query: emptyQuerySchema,
      ...schemas,
    }),
  ];

  const write = (permission, schemas = {}) => [
    authenticate,
    csrf,
    authorize(RESOURCE, permission),
    validate({
      query: emptyQuerySchema,
      body: emptyBodySchema,
      ...schemas,
    }),
  ];

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Register lookup routes BEFORE /:headerId.
  router.get('/lookups/employees', ...read({ query: employeeQuerySchema }), controller.employees);

  router.get('/lookups/requestor', ...read(), controller.requestor);

  router.get('/lookups/criteria', ...read({ query: criteriaQuerySchema }), controller.criteria);

  router.get('/', ...read({ query: listQuerySchema }), controller.list);

  router.post('/', ...write('CREATE', { body: createBodySchema }), controller.create);

  router.get('/:headerId', ...read({ params: headerIdParams }), controller.get);

  router.put(
    '/:headerId',
    ...write('UPDATE', {
      params: headerIdParams,
      body: updateBodySchema,
    }),
    controller.update,
  );

  router.delete('/:headerId', ...write('DELETE', { params: headerIdParams }), controller.remove);

  return router;
}
