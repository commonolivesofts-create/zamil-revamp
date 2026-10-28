import { Router } from 'express';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { createInterviewAssessmentController } from './interviewAssessment.controller.js';
import {
  emptyBodySchema,
  emptyQuerySchema,
  headerIdParams,
  listQuerySchema,
  writeBodySchema,
} from './interviewAssessment.validation.js';

// Key mirrors the owner-registered Oracle catalogue: module INTERVIEW_ASSESSMENTS, resource
// INTERVIEW_ASSESSMENTS.
const INTERVIEW_ASSESSMENTS = 'INTERVIEW_ASSESSMENTS.INTERVIEW_ASSESSMENTS';

/**
 * Interview Assessment Form CRUD, mounted at /api/v1/hr/interview-assessments. Every route
 * requires an authenticated session and the INTERVIEW_ASSESSMENTS.INTERVIEW_ASSESSMENTS action
 * (re-evaluated in Oracle per request); changes also require the session-bound CSRF token.
 * Validation runs after authorization. The lookups are declared before /:headerId.
 */
export function createInterviewAssessmentRouter({
  interviewAssessmentService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createInterviewAssessmentController({ interviewAssessmentService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (action, schemas = {}) => [
    authenticate,
    authorize(INTERVIEW_ASSESSMENTS, action),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas = {}) => [
    authenticate,
    requireCsrfToken,
    authorize(INTERVIEW_ASSESSMENTS, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...read('VIEW', { query: listQuerySchema }), controller.list);
  router.get('/lookups/nationalities', ...read('VIEW'), controller.nationalities);
  router.get('/lookups/requisitions', ...read('VIEW'), controller.requisitions);
  router.get('/lookups/employees', ...read('VIEW'), controller.employees);
  router.post('/', ...write('CREATE', { body: writeBodySchema }), controller.create);
  router.get('/:headerId', ...read('VIEW', { params: headerIdParams }), controller.get);
  router.put(
    '/:headerId',
    ...write('UPDATE', { params: headerIdParams, body: writeBodySchema }),
    controller.update,
  );
  router.delete('/:headerId', ...write('DELETE', { params: headerIdParams }), controller.remove);

  return router;
}
