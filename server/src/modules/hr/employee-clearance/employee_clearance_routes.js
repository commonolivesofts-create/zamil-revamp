import { Router } from 'express';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';

import { createEmployeeClearanceController } from './employee_clearance_controller.js';

import {
  writeBodySchema,
  headerIdParams,
  listQuerySchema,
  employeesQuerySchema,
  approversQuerySchema,
  emptyQuerySchema,
  empParams,
  emptyBodySchema,
} from './employee_clearance_validation.js';

const RESOURCE = 'EMPLOYEE_CLEARANCE.EMPLOYEE_CLEARANCE';

export function createEmployeeClearanceRouter({
  employeeClearanceService,
  authenticate,
  authorize,
  auditService,
}) {
  const router = Router();

  const c = createEmployeeClearanceController({
    employeeClearanceService,
  });

  const csrf = createRequireCsrfToken({ auditService });

  const read = (q = emptyQuerySchema, params) => [
    authenticate,
    authorize(RESOURCE, 'VIEW'),
    validate({
      query: q,
      ...(params ? { params } : {}),
    }),
  ];

  const write = (action, body = emptyBodySchema, params) => [
    authenticate,
    csrf,
    authorize(RESOURCE, action),
    validate({
      query: emptyQuerySchema,
      body,
      ...(params ? { params } : {}),
    }),
  ];

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Employee lookup
  router.get('/lookups/employees', ...read(employeesQuerySchema), c.employees);

  // Employee autofill
  router.get('/lookups/employees/:empNo', ...read(emptyQuerySchema, empParams), c.employee);

  // Approver lookup
  router.get('/lookups/approvers', ...read(approversQuerySchema), c.approvers);

  // Computer destinations
  router.get('/lookups/computer-destinations', ...read(), c.computerDestinations);

  // Listing
  router.get('/', ...read(listQuerySchema), c.list);

  // Create
  router.post('/', ...write('CREATE', writeBodySchema), c.create);

  // Read
  router.get('/:headerId', ...read(emptyQuerySchema, headerIdParams), c.get);

  // Update
  router.put('/:headerId', ...write('UPDATE', writeBodySchema, headerIdParams), c.update);

  // Delete
  router.delete('/:headerId', ...write('DELETE', emptyBodySchema, headerIdParams), c.remove);

  return router;
}
