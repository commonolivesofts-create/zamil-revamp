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

// Registered in the client module registry (hrForms.module.js). Deny by
// default: a user without the permission gets 403.
const RESOURCE = 'HR.SICK_LEAVE';

const protect = (authorize, action) => authorize(RESOURCE, action);

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
