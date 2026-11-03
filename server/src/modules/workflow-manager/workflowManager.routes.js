import { Router } from 'express';
import { createRequireCsrfToken } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from './workflowManager.catalog.js';
import { createWorkflowManagerController } from './workflowManager.controller.js';
import {
  emptyBodySchema,
  emptyQuerySchema,
  formCreateBodySchema,
  formIdParams,
  formListQuerySchema,
  formUpdateBodySchema,
  rowVersionBodySchema,
  sourceCreateBodySchema,
  sourceIdParams,
  sourceListQuerySchema,
  sourceObjectsQuerySchema,
  sourceUpdateBodySchema,
} from './workflowManager.validation.js';

const { OVERVIEW, FORM_REGISTRY: FORMS, DATA_SOURCE_REGISTRY: SOURCES } = PERMISSIONS;

/**
 * Workflow Manager M1 (Form Registry and Data Source Registry), mounted at
 * /api/v1/workflow-manager. Every route requires an authenticated session and a WORKFLOW_MANAGER
 * permission re-evaluated in Oracle per request; changes also require the session-bound CSRF
 * token. Validation runs after authorization. Lookups are declared before the /:id routes.
 */
export function createWorkflowManagerRouter({
  workflowManagerService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createWorkflowManagerController({ workflowManagerService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (resource, action, schemas = {}) => [
    authenticate,
    authorize(resource, action),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (resource, action, schemas = {}) => [
    authenticate,
    requireCsrfToken,
    authorize(resource, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/overview', ...read(OVERVIEW, 'VIEW'), controller.overview);

  // --- Form Registry ---------------------------------------------------------------------------
  router.get('/lookups/modules', ...read(FORMS, 'VIEW'), controller.modules);
  router.get(
    '/forms',
    ...read(FORMS, 'VIEW', { query: formListQuerySchema }),
    controller.listForms,
  );
  router.post(
    '/forms',
    ...write(FORMS, 'CREATE', { body: formCreateBodySchema }),
    controller.createForm,
  );
  router.get(
    '/forms/:formId',
    ...read(FORMS, 'VIEW', { params: formIdParams }),
    controller.getForm,
  );
  router.get(
    '/forms/:formId/versions',
    ...read(FORMS, 'VIEW', { params: formIdParams }),
    controller.listFormVersions,
  );
  router.put(
    '/forms/:formId',
    ...write(FORMS, 'UPDATE', { params: formIdParams, body: formUpdateBodySchema }),
    controller.updateForm,
  );
  router.post(
    '/forms/:formId/activate',
    ...write(FORMS, 'ACTIVATE', { params: formIdParams, body: rowVersionBodySchema }),
    controller.activateForm,
  );
  router.post(
    '/forms/:formId/deactivate',
    ...write(FORMS, 'DEACTIVATE', { params: formIdParams, body: rowVersionBodySchema }),
    controller.deactivateForm,
  );

  // --- Data Source Registry --------------------------------------------------------------------
  router.get('/lookups/source-policy', ...read(SOURCES, 'VIEW'), controller.sourcePolicy);
  router.get(
    '/lookups/source-objects',
    ...read(SOURCES, 'VIEW', { query: sourceObjectsQuerySchema }),
    controller.sourceObjects,
  );
  router.get(
    '/data-sources',
    ...read(SOURCES, 'VIEW', { query: sourceListQuerySchema }),
    controller.listSources,
  );
  router.post(
    '/data-sources',
    ...write(SOURCES, 'CREATE', { body: sourceCreateBodySchema }),
    controller.createSource,
  );
  router.get(
    '/data-sources/:sourceId',
    ...read(SOURCES, 'VIEW', { params: sourceIdParams }),
    controller.getSource,
  );
  router.get(
    '/data-sources/:sourceId/versions',
    ...read(SOURCES, 'VIEW', { params: sourceIdParams }),
    controller.listSourceVersions,
  );
  router.put(
    '/data-sources/:sourceId',
    ...write(SOURCES, 'UPDATE', { params: sourceIdParams, body: sourceUpdateBodySchema }),
    controller.updateSource,
  );
  router.post(
    '/data-sources/:sourceId/activate',
    ...write(SOURCES, 'ACTIVATE', { params: sourceIdParams, body: rowVersionBodySchema }),
    controller.activateSource,
  );
  router.post(
    '/data-sources/:sourceId/deactivate',
    ...write(SOURCES, 'DEACTIVATE', { params: sourceIdParams, body: rowVersionBodySchema }),
    controller.deactivateSource,
  );

  return router;
}
