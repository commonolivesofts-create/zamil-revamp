import { Router } from 'express';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';

import { validate } from '../../../middleware/validate.js';

import { createVisitingVisaController } from './business-visiting-visa-letter.controller.js';

import {
  idParams,
  employeeParams,
  noQuery,
  employeeSearchQuery,
  listQuery,
  writeBody,
} from './business-visiting-visa-letter.validation.js';

const RESOURCE = 'HR.BUSINESS_VISA_LETTERS';

export function createVisitingVisaRouter({ service, authenticate, authorize, auditService }) {
  const c = createVisitingVisaController({ service });
  const router = Router();

  const csrf = createRequireCsrfToken({
    auditService,
  });

  const read = (schema = noQuery) => [
    authenticate,
    authorize(RESOURCE, 'VIEW'),
    validate({ query: schema }),
  ];

  const write = (action, schema) => [
    authenticate,
    csrf,
    authorize(RESOURCE, action),
    validate({
      query: noQuery,
      ...(schema ? { body: schema } : {}),
    }),
  ];

  router.use((_q, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Listing
  router.get('/', ...read(listQuery), c.list);

  // Employee dropdown
  router.get('/lookups/employees', ...read(employeeSearchQuery), c.employees);

  // Static options
  router.get('/lookups/options', ...read(), c.options);

  // Employee auto-fill
  router.get(
    '/lookups/employee/:employeeNumber',
    authenticate,
    authorize(RESOURCE, 'VIEW'),
    validate({
      query: noQuery,
      params: employeeParams,
    }),
    c.employee,
  );

  // CSV export
  router.get('/export', ...read(listQuery), c.export);

  // Create
  router.post('/', ...write('CREATE', writeBody), c.create);

  // Print preview data
  router.get(
    '/:id/print',
    authenticate,
    authorize(RESOURCE, 'VIEW'),
    validate({
      query: noQuery,
      params: idParams,
    }),
    c.print,
  );

  // Read individual
  router.get(
    '/:id',
    authenticate,
    authorize(RESOURCE, 'VIEW'),
    validate({
      query: noQuery,
      params: idParams,
    }),
    c.get,
  );

  // Update
  router.put(
    '/:id',
    authenticate,
    csrf,
    authorize(RESOURCE, 'UPDATE'),
    validate({
      query: noQuery,
      params: idParams,
      body: writeBody,
    }),
    c.update,
  );

  // Delete
  router.delete(
    '/:id',
    authenticate,
    csrf,
    authorize(RESOURCE, 'DELETE'),
    validate({
      query: noQuery,
      params: idParams,
    }),
    c.remove,
  );

  return router;
}
