import { Router } from 'express';

import { validate } from '../../../middleware/validate.js';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';

import { createSurveyReportController } from './surveyReport.controller.js';

import * as validation from './surveyReport.validation.js';

export function createSurveyReportRouter({
  surveyReportService,
  authenticate,
  authorize,
  auditService,
  surveyResourceKey,
}) {
  const router = Router();

  const controller = createSurveyReportController({
    surveyReportService,
  });

  const requireCsrfToken = createRequireCsrfToken({
    auditService,
  });

  // No new resource or permission is registered here.
  // The key must refer to an approved entry in the
  // application's existing authorization catalogue.
  const requireSurveyPermission = (action) => {
    if (!surveyResourceKey) {
      return (_req, _res, next) => {
        const error = new Error('Survey report permission is not configured');
        error.status = 503;
        next(error);
      };
    }

    return authorize(surveyResourceKey, action);
  };

  const read = (schemas = {}) => [
    authenticate,
    requireSurveyPermission('VIEW'),
    validate({
      query: validation.empty,
      ...schemas,
    }),
  ];

  // These POST operations only read report information.
  const reportPost = (bodySchema) => [
    authenticate,
    requireSurveyPermission('VIEW'),
    validate({
      query: validation.empty,
      body: bodySchema,
    }),
  ];

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Survey form metadata
  router.get(
    '/meta',
    validate({
      query: validation.empty,
    }),
    controller.meta,
  );

  // Anonymous survey submission
  router.post(
    '/responses',
    validate({
      query: validation.empty,
      body: validation.submission,
    }),
    controller.create,
  );

  // Survey response listing
  router.get(
    '/responses',
    ...read({
      query: validation.listing,
    }),
    controller.list,
  );

  // Read one submitted response
  router.get(
    '/responses/:headerId',
    ...read({
      params: validation.params,
    }),
    controller.get,
  );

  // Delete a submitted response
  router.delete(
    '/responses/:headerId',

    authenticate,

    requireCsrfToken,

    requireSurveyPermission('DELETE'),

    validate({
      query: validation.empty,
      params: validation.params,
    }),

    controller.remove,
  );

  // Question catalogue
  router.get('/reports/questions', ...read(), controller.questions);

  // Global report filters
  router.get('/reports/filters', ...read(), controller.filters);

  // Question-specific report filters
  router.post(
    '/reports/question-filters',
    ...reportPost(validation.questionBody),
    controller.questionFilters,
  );

  // Answer distribution
  router.post(
    '/reports/distribution',
    ...reportPost(validation.distributionBody),
    controller.distribution,
  );

  // Category weighted score
  router.post(
    '/reports/category-score',
    ...reportPost(validation.categoryBody),
    controller.categoryScore,
  );

  // Yearwise report
  router.post('/reports/yearwise', ...reportPost(validation.yearwiseBody), controller.yearwise);

  // Category and department analysis
  router.get(
    '/reports/category-department',
    ...read({
      query: validation.categoryDepartmentQuery,
    }),
    controller.categoryDepartment,
  );

  return router;
}
