import { Router } from 'express';
import multer from 'multer';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { createRequisitionController } from './requisition.controller.js';
import {
  attachmentParams,
  budgetQuerySchema,
  createBodySchema,
  emptyBodySchema,
  emptyQuerySchema,
  listQuerySchema,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_FILES,
  requisitionIdParams,
  updateBodySchema,
} from './requisition.validation.js';

// Key mirrors the owner-registered Oracle catalogue: module REQUISITIONS, resource REQUISITIONS
// (actions VIEW, CREATE, UPDATE, DELETE, MANAGE_ATTACHMENTS) — aligned 2026-10-28 to the module
// code registered in the permission catalog, as already done for EMPLOYMENT_OFFERS and
// INTERVIEW_ASSESSMENTS.
const REQUISITIONS = 'REQUISITIONS.REQUISITIONS';

const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: 'File exceeds the allowed size',
  LIMIT_FILE_COUNT: 'Too many files',
  LIMIT_PART_COUNT: 'Too many parts',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
};

/**
 * Personal Requisition Form CRUD, mounted at /api/v1/hr/requisitions. Every route requires an
 * authenticated session and the REQUISITIONS.REQUISITIONS action (re-evaluated in Oracle per request);
 * changes also require the session-bound CSRF token. Validation runs after authorization.
 * `POST /` and `PUT /:requisitionId` accept either JSON (header fields only) or multipart
 * (the same fields as form parts plus `files`); the attachment upload is multipart only.
 * Lookups are declared before /:requisitionId.
 */
export function createRequisitionRouter({
  requisitionService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createRequisitionController({ requisitionService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENT_FILES },
  });
  // Parses multipart uploads after authorization (bounded by multer's limits); JSON requests
  // pass through untouched. Multer's own errors surface as 400, never as 500.
  const files = (req, res, next) =>
    upload.array('files', MAX_ATTACHMENT_FILES)(req, res, (error) => {
      if (!error) return next();
      if (error.name === 'MulterError') {
        return next(
          new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
            { field: 'files', message: UPLOAD_ERRORS[error.code] ?? 'File upload failed' },
          ]),
        );
      }
      next(error);
    });

  const read = (action, schemas = {}) => [
    authenticate,
    authorize(REQUISITIONS, action),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const guard = (action) => [authenticate, requireCsrfToken, authorize(REQUISITIONS, action)];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...read('VIEW', { query: listQuerySchema }), controller.list);
  router.get('/lookups/job-titles', ...read('VIEW'), controller.jobTitles);
  router.get('/lookups/requestor', ...read('VIEW'), controller.requestor);
  router.get('/lookups/capabilities', ...read('VIEW'), controller.capabilities);
  router.get('/lookups/departments', ...read('VIEW'), controller.departments);
  router.get('/lookups/replacement-for', ...read('VIEW'), controller.replacementFor);
  router.get('/lookups/budget', ...read('VIEW', { query: budgetQuerySchema }), controller.budget);
  router.get('/lookups/filter-options', ...read('VIEW'), controller.filterOptions);

  router.post(
    '/',
    ...guard('CREATE'),
    files,
    validate({ query: emptyQuerySchema, body: createBodySchema }),
    controller.create,
  );
  router.get('/:requisitionId', ...read('VIEW', { params: requisitionIdParams }), controller.get);
  router.put(
    '/:requisitionId',
    ...guard('UPDATE'),
    files,
    validate({ params: requisitionIdParams, query: emptyQuerySchema, body: updateBodySchema }),
    controller.update,
  );
  router.delete(
    '/:requisitionId',
    ...guard('DELETE'),
    validate({ params: requisitionIdParams, query: emptyQuerySchema, body: emptyBodySchema }),
    controller.remove,
  );
  router.post(
    '/:requisitionId/attachments',
    ...guard('MANAGE_ATTACHMENTS'),
    files,
    validate({ params: requisitionIdParams, query: emptyQuerySchema, body: emptyBodySchema }),
    controller.uploadAttachments,
  );
  router.delete(
    '/:requisitionId/attachments/:attachmentId',
    ...guard('MANAGE_ATTACHMENTS'),
    validate({ params: attachmentParams, query: emptyQuerySchema, body: emptyBodySchema }),
    controller.removeAttachment,
  );

  return router;
}
