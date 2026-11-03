import { Router } from 'express';

import { validate } from '../../../middleware/validate.js';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';

import { createTouristVisaController } from './tourist-visa.controller.js';

import {
  empty,
  uuidParams,
  employeeParams,
  countryParams,
  employeeQuery,
  listQuery,
  writeBody,
} from './tourist-visa-letter.validation.js';

const TOURIST_VISA_LETTERS = 'HR.TOURIST_VISA_LETTERS';

/**
 * Tourist Visa Letter API; mounted at /api/v1/hr/tourist-visa-letters.
 * Every route requires a session and a request-time permission check. Writes also
 * require the session-bound CSRF token. Validation follows authorization.
 */
export function createTouristVisaRoutes({ service, authenticate, authorize, auditService }) {
  const router = Router();

  const controller = createTouristVisaController(service);

  const csrf = createRequireCsrfToken({ auditService });

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const read = (schema = {}) => [
    authenticate,
    authorize(TOURIST_VISA_LETTERS, 'VIEW'),
    validate({
      query: empty,
      ...schema,
    }),
  ];

  const write = (action, schema = {}) => [
    authenticate,
    csrf,
    authorize(TOURIST_VISA_LETTERS, action),
    validate({
      query: empty,
      body: empty,
      ...schema,
    }),
  ];

  // Lookups must be registered before parameterized routes.

  router.get('/lookups/countries', ...read(), controller.countries);

  router.get(
    '/lookups/countries/:country/arabic',
    ...read({ params: countryParams }),
    controller.country,
  );

  router.get('/lookups/employees', ...read({ query: employeeQuery }), controller.employees);

  router.get('/lookups/employees/:empNo', ...read({ params: employeeParams }), controller.employee);

  router.get('/lookups/approvers', ...read(), controller.approvers);

  // Listing and creation

  router.get('/', ...read({ query: listQuery }), controller.list);

  router.post('/', ...write('CREATE', { body: writeBody }), controller.create);

  // Record operations

  router.get('/:uuid/print', ...read({ params: uuidParams }), controller.print);

  router.get('/:uuid', ...read({ params: uuidParams }), controller.read);

  router.put(
    '/:uuid',
    ...write('UPDATE', {
      params: uuidParams,
      body: writeBody,
    }),
    controller.update,
  );

  router.delete(
    '/:uuid',
    ...write('DELETE', {
      params: uuidParams,
    }),
    controller.remove,
  );

  return router;
}
