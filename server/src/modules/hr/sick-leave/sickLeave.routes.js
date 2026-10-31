import { Router } from 'express';
import multer from 'multer';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { AppError } from '../../../shared/errors/AppError.js';

import { createSickLeaveController } from './sickLeave.controller.js';

import {
  idParams,
  attachmentParams,
  employeeParams,
  employeesQuery,
  listQuery,
  writeBody,
  empty,
} from './sickLeave.validation.js';

// Must match an existing, verified RBAC resource.
// Missing configuration fails closed.
const RESOURCE = process.env.SICK_LEAVE_RESOURCE_KEY;

const missingResource = (_req, _res, next) =>
  next(
    new AppError(
      503,
      'SICK_LEAVE_RBAC_UNVERIFIED',
      'Sick Leave permission resource is not configured',
    ),
  );

const protect = (authorize, action) => (RESOURCE ? authorize(RESOURCE, action) : missingResource);

export function createSickLeaveRouter({ service, authenticate, authorize, auditService }) {
  const r = Router();

  const ctl = createSickLeaveController(service);

  const csrf = createRequireCsrfToken({
    auditService,
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 10,
    },
  }).array('files', 10);

  const files = (req, res, next) =>
    upload(req, res, (e) =>
      e ? next(new AppError(400, 'VALIDATION_ERROR', 'Invalid attachment upload')) : next(),
    );

  const read = (schema) => [authenticate, protect(authorize, 'VIEW'), validate(schema)];

  const write = (action) => [authenticate, csrf, protect(authorize, action)];

  r.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // List requests.
  r.get('/', ...read({ query: listQuery }), ctl.list);

  // Employee lookup.
  r.get('/lookups/employees', ...read({ query: employeesQuery }), ctl.employees);

  // Employee autofill.
  r.get(
    '/lookups/employees/:empNumber',
    ...read({
      params: employeeParams,
      query: empty,
    }),
    ctl.employee,
  );

  // Create request, including mandatory attachments.
  r.post(
    '/',
    ...write('CREATE'),
    files,
    validate({
      body: writeBody,
      query: empty,
    }),
    ctl.create,
  );

  // Get request details.
  r.get(
    '/:headerId',
    ...read({
      params: idParams,
      query: empty,
    }),
    ctl.get,
  );

  // Update request.
  r.put(
    '/:headerId',
    ...write('UPDATE'),
    validate({
      params: idParams,
      body: writeBody,
      query: empty,
    }),
    ctl.update,
  );

  // Delete request.
  r.delete(
    '/:headerId',
    ...write('DELETE'),
    validate({
      params: idParams,
      query: empty,
      body: empty,
    }),
    ctl.remove,
  );

  // Add attachments.
  r.post(
    '/:headerId/attachments',
    ...write('MANAGE_ATTACHMENTS'),
    files,
    validate({
      params: idParams,
      query: empty,
      body: empty,
    }),
    ctl.upload,
  );

  // Delete attachment.
  r.delete(
    '/:headerId/attachments/:attachmentId',
    ...write('MANAGE_ATTACHMENTS'),
    validate({
      params: attachmentParams,
      query: empty,
      body: empty,
    }),
    ctl.removeAttachment,
  );

  return r;
}
