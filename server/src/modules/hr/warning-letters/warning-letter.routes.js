import { Router } from 'express';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';

import { createWarningLetterController } from './warning-letter.controller.js';

import {
  empty,
  idParams,
  employeeParams,
  lookupQuery,
  listQuery,
  createBody,
  updateBody,
} from './warning-letter.validation.js';

export function createWarningLetterRoutes({ service, authenticate, authorize, auditService }) {
  const router = Router();

  const controller = createWarningLetterController(service);

  const csrf = createRequireCsrfToken({
    auditService,
  });

  const resource = 'HR.WARNING_LETTERS';

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const read = (action, schemas = {}) => [
    authenticate,
    authorize(resource, action),
    validate({
      query: empty,
      ...schemas,
    }),
  ];

  const write = (action, schemas = {}) => [
    authenticate,
    csrf,
    authorize(resource, action),
    validate({
      query: empty,
      ...schemas,
    }),
  ];

  // Employee lookup routes must precede /:id.

  router.get(
    '/lookups/employees',
    ...read('VIEW', {
      query: lookupQuery,
    }),
    controller.employees,
  );

  router.get(
    '/lookups/employee/:empNo',
    ...read('VIEW', {
      params: employeeParams,
    }),
    controller.employee,
  );

  // Listing.

  router.get(
    '/',
    ...read('VIEW', {
      query: listQuery,
    }),
    controller.list,
  );

  // Create.

  router.post(
    '/',
    ...write('CREATE', {
      body: createBody,
    }),
    controller.create,
  );

  // Bilingual print data.

  router.get(
    '/:id/print',
    ...read('VIEW', {
      params: idParams,
    }),
    controller.print,
  );

  // Read.

  router.get(
    '/:id',
    ...read('VIEW', {
      params: idParams,
    }),
    controller.read,
  );

  // Update.

  router.put(
    '/:id',
    ...write('UPDATE', {
      params: idParams,
      body: updateBody,
    }),
    controller.update,
  );

  // Delete.

  router.delete(
    '/:id',
    ...write('DELETE', {
      params: idParams,
    }),
    controller.remove,
  );

  return router;
}
