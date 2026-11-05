import { Router } from 'express';
import multer from 'multer';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { AppError } from '../../../shared/errors/AppError.js';

import { createBusinessVisaRequestController } from './businessVisaRequest.controller.js';
import {
  documentBody,
  documentParams,
  empty,
  idParams,
  listQuery,
  writeBody,
} from './businessVisaRequest.validation.js';

// The existing Business Visa Letters resource also guards this form (owner decision, 2026-11-04).
const RESOURCE = 'HR.BUSINESS_VISA_LETTERS';

export function createBusinessVisaRequestRouter({
  service,
  authenticate,
  authorize,
  auditService,
}) {
  const router = Router();
  const c = createBusinessVisaRequestController(service);
  const csrf = createRequireCsrfToken({ auditService });

  // Legacy max_size 24000 KB; one file per request.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 24 * 1024 * 1024, files: 1 },
  }).single('file');
  const file = (req, res, next) =>
    upload(req, res, (error) =>
      error ? next(new AppError(400, 'VALIDATION_ERROR', 'Invalid attachment upload')) : next(),
    );

  const read = (schemas) => [authenticate, authorize(RESOURCE, 'VIEW'), validate(schemas)];
  const write = (action) => [authenticate, csrf, authorize(RESOURCE, action)];

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...read({ query: listQuery }), c.list);
  router.get('/lookups/options', ...read({ query: empty }), c.options);
  router.get('/:id', ...read({ params: idParams, query: empty }), c.get);
  router.post('/', ...write('CREATE'), validate({ body: writeBody, query: empty }), c.create);
  router.put(
    '/:id',
    ...write('UPDATE'),
    validate({ params: idParams, body: writeBody, query: empty }),
    c.update,
  );
  router.post(
    '/:id/documents',
    ...write('UPDATE'),
    file,
    validate({ params: idParams, body: documentBody, query: empty }),
    c.addDocument,
  );
  router.delete(
    '/:id/documents/:lineId',
    ...write('UPDATE'),
    validate({ params: documentParams, query: empty, body: empty }),
    c.removeDocument,
  );

  return router;
}
