import { Router } from 'express';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';

import { validate } from '../../../middleware/validate.js';

import { createSalaryCertificateController } from './salary-certificate.controller.js';

import {
  empty,
  idParams,
  empParams,
  listQuery,
  pickerQuery,
  writeBody,
} from './salary-certificate.validation.js';

const RESOURCE = 'HR.SALARY_CERTIFICATES_AR';

export function createSalaryCertificateRoutes({ service, authenticate, authorize, auditService }) {
  const router = Router();

  const controller = createSalaryCertificateController(service);

  const csrf = createRequireCsrfToken({
    auditService,
  });

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const read = (action, schemas = {}) => [
    authenticate,

    authorize(RESOURCE, action),

    validate({
      query: empty,
      ...schemas,
    }),
  ];

  const write = (action, schemas = {}) => [
    authenticate,

    csrf,

    authorize(RESOURCE, action),

    validate({
      query: empty,
      body: empty,
      ...schemas,
    }),
  ];

  // Employee number lookup
  router.get(
    '/lookups/employee-numbers',
    ...read('VIEW', {
      query: pickerQuery,
    }),
    controller.employees,
  );

  // Employee details
  router.get(
    '/lookups/employees/:empNo',
    ...read('VIEW', {
      params: empParams,
    }),
    controller.employee,
  );

  // Approver lookup
  router.get('/lookups/approvers', ...read('VIEW'), controller.approvers);

  // List certificates
  router.get(
    '/',
    ...read('VIEW', {
      query: listQuery,
    }),
    controller.list,
  );

  // Create certificate
  router.post(
    '/',
    ...write('CREATE', {
      body: writeBody,
    }),
    controller.create,
  );

  // HTML print
  router.get(
    '/:id/print',
    ...read('VIEW', {
      params: idParams,
    }),
    controller.print,
  );

  // Get certificate
  router.get(
    '/:id',
    ...read('VIEW', {
      params: idParams,
    }),
    controller.read,
  );

  // Update certificate
  router.put(
    '/:id',
    ...write('UPDATE', {
      params: idParams,
      body: writeBody,
    }),
    controller.update,
  );

  // Delete certificate
  router.delete(
    '/:id',
    ...write('DELETE', {
      params: idParams,
    }),
    controller.remove,
  );

  return router;
}
