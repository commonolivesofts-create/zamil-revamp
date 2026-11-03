import { Router } from 'express';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';

import { validate } from '../../../middleware/validate.js';

import { createIdeaController } from './idea form controller.js';

import {
  empty,
  idParams,
  attachmentParams,
  listQuery,
  searchQuery,
  empParams,
  writeBody,
} from './idea form validation.js';

// Every route needs the signed-in user's permission on this resource (deny by default).
const RESOURCE = 'HR.IDEAS';

export function createIdeaRouter({ ideaService, authenticate, authorize, auditService }) {
  const r = Router();

  const c = createIdeaController(ideaService);

  const csrf = createRequireCsrfToken({
    auditService,
  });

  r.use(authenticate);

  r.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const read = (query = empty, params) => [
    authorize(RESOURCE, 'VIEW'),
    validate({
      query,
      ...(params ? { params } : {}),
    }),
  ];

  const write = (action, body = empty, params) => [
    csrf,
    authorize(RESOURCE, action),
    validate({
      query: empty,
      body,
      ...(params ? { params } : {}),
    }),
  ];

  // List ideas
  r.get('/', ...read(listQuery), c.list);

  // Employee lookups
  r.get('/lookups/employees', ...read(searchQuery), c.employees);

  r.get('/lookups/employees/:empNo', ...read(empty, empParams), c.employee);

  // Division lookup
  r.get('/lookups/divisions', ...read(), c.divisions);

  // Category lookup
  r.get('/lookups/categories', ...read(), c.categories);

  // Create idea
  r.post('/', ...write('CREATE', writeBody), c.create);

  // Read one idea
  r.get('/:headerId', ...read(empty, idParams), c.get);

  // Update idea
  r.put('/:headerId', ...write('UPDATE', writeBody, idParams), c.update);

  // Soft delete — currently blocked
  r.delete('/:headerId', ...write('DELETE', empty, idParams), c.remove);

  // Feasibility calculation
  r.post('/:headerId/feasibility', ...write('UPDATE', empty, idParams), c.feasibility);

  // Attachment upload — currently blocked
  r.post(
    '/:headerId/attachments',
    csrf,
    authorize(RESOURCE, 'MANAGE_ATTACHMENTS'),
    validate({
      params: idParams,
      query: empty,
    }),
    c.upload,
  );

  // Attachment deletion — currently blocked
  r.delete(
    '/:headerId/attachments/:attachmentId',
    ...write('MANAGE_ATTACHMENTS', empty, attachmentParams),
    c.deleteAttachment,
  );

  return r;
}
