import { Router } from 'express';
import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';
import { createEmploymentOfferController } from './employmentOffer.controller.js';
import {
  allowancesQuerySchema,
  candidatesQuerySchema,
  emptyBodySchema,
  emptyQuerySchema,
  headerIdParams,
  hijriDateQuerySchema,
  listQuerySchema,
  numberToArabicQuerySchema,
  writeBodySchema,
} from './employmentOffer.validation.js';

// Key mirrors the owner-registered Oracle catalogue: module EMPLOYMENT_OFFERS, resource
// EMPLOYMENT_OFFERS (the UPDATE action exists there; EDIT does not).
const EMPLOYMENT_OFFERS = 'EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS';

/**
 * Employment Offer Form CRUD, mounted at /api/v1/hr/employment-offers. Every route requires an
 * authenticated session and the EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS action (re-evaluated in
 * Oracle per request);
 * changes also require the session-bound CSRF token. Validation runs after authorization. The
 * lookups are declared before /:headerId.
 */
export function createEmploymentOfferRouter({
  employmentOfferService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createEmploymentOfferController({ employmentOfferService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (action, schemas = {}) => [
    authenticate,
    authorize(EMPLOYMENT_OFFERS, action),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas = {}) => [
    authenticate,
    requireCsrfToken,
    authorize(EMPLOYMENT_OFFERS, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...read('VIEW', { query: listQuerySchema }), controller.list);
  router.get(
    '/lookups/candidates',
    ...read('VIEW', { query: candidatesQuerySchema }),
    controller.candidates,
  );
  router.get('/lookups/titles', ...read('VIEW'), controller.titles);
  router.get(
    '/lookups/allowances',
    ...read('VIEW', { query: allowancesQuerySchema }),
    controller.allowances,
  );
  router.get('/lookups/business-units', ...read('VIEW'), controller.businessUnits);
  router.get(
    '/lookups/number-to-arabic',
    ...read('VIEW', { query: numberToArabicQuerySchema }),
    controller.numberToArabic,
  );
  router.get(
    '/lookups/hijri-date',
    ...read('VIEW', { query: hijriDateQuerySchema }),
    controller.hijriDate,
  );
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
