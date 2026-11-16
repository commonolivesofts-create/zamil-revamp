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
import { createSourceMappingController } from './sourceMapping.controller.js';
import {
  sourceVersionCreateBodySchema,
  sourceVersionListQuerySchema,
  sourceVersionParams,
  sourceVersionRowVersionBodySchema,
  sourceVersionUpdateBodySchema,
} from './sourceMapping.validation.js';

const {
  OVERVIEW,
  FORM_REGISTRY: FORMS,
  DATA_SOURCE_REGISTRY: SOURCES,
  SOURCE_MAPPING: MAPPING,
} = PERMISSIONS;

// Every SOURCE_MAPPING route also needs the data source registry it maps (client alsoRequires).
const MAPPING_PREREQUISITE = [SOURCES, 'VIEW'];

/**
 * Workflow Manager M1 (Form Registry, Data Source Registry) and M2-A (source version mapping), mounted at
 * /api/v1/workflow-manager. Every route requires an authenticated session and a WORKFLOW_MANAGER
 * permission re-evaluated in Oracle per request; changes also require the session-bound CSRF
 * token. Validation runs after authorization. Lookups are declared before the /:id routes.
 */
export function createWorkflowManagerRouter({
  workflowManagerService,
  sourceMappingService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createWorkflowManagerController({ workflowManagerService });
  const mapping = createSourceMappingController({ sourceMappingService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  // `prerequisite`: a further [resource, action] the route needs (checked first; both must hold).
  const guards = (resource, action, prerequisite) => [
    ...(prerequisite ? [authorize(...prerequisite)] : []),
    authorize(resource, action),
  ];
  const read = (resource, action, schemas = {}, prerequisite = null) => [
    authenticate,
    ...guards(resource, action, prerequisite),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (resource, action, schemas = {}, prerequisite = null) => [
    authenticate,
    requireCsrfToken,
    ...guards(resource, action, prerequisite),
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

  // --- Source version mapping (M2-A) -----------------------------------------------------------
  // The M1 metadata-only GET /data-sources/:sourceId/versions above is unchanged.
  const sourceParams = { params: sourceIdParams };
  const versionParams = { params: sourceVersionParams };
  router.get(
    '/data-sources/:sourceId/dictionary',
    ...read(MAPPING, 'VIEW', sourceParams, MAPPING_PREREQUISITE),
    mapping.dictionary,
  );
  router.get(
    '/data-sources/:sourceId/mapping-versions',
    ...read(
      MAPPING,
      'VIEW',
      { ...sourceParams, query: sourceVersionListQuerySchema },
      MAPPING_PREREQUISITE,
    ),
    mapping.listVersions,
  );
  router.post(
    '/data-sources/:sourceId/mapping-versions',
    ...write(
      MAPPING,
      'CREATE',
      { ...sourceParams, body: sourceVersionCreateBodySchema },
      MAPPING_PREREQUISITE,
    ),
    mapping.createVersion,
  );
  router.get(
    '/data-sources/:sourceId/mapping-versions/:versionId',
    ...read(MAPPING, 'VIEW', versionParams, MAPPING_PREREQUISITE),
    mapping.getVersion,
  );
  router.put(
    '/data-sources/:sourceId/mapping-versions/:versionId',
    ...write(
      MAPPING,
      'UPDATE',
      { ...versionParams, body: sourceVersionUpdateBodySchema },
      MAPPING_PREREQUISITE,
    ),
    mapping.updateVersion,
  );
  router.post(
    '/data-sources/:sourceId/mapping-versions/:versionId/revalidate',
    ...write(
      MAPPING,
      'UPDATE',
      { ...versionParams, body: sourceVersionRowVersionBodySchema },
      MAPPING_PREREQUISITE,
    ),
    mapping.revalidateVersion,
  );
  router.get(
    '/data-sources/:sourceId/mapping-versions/:versionId/drift',
    ...read(MAPPING, 'VIEW', versionParams, MAPPING_PREREQUISITE),
    mapping.driftVersion,
  );
  router.post(
    '/data-sources/:sourceId/mapping-versions/:versionId/clone',
    ...write(MAPPING, 'CREATE', versionParams, MAPPING_PREREQUISITE),
    mapping.cloneVersion,
  );
  router.delete(
    '/data-sources/:sourceId/mapping-versions/:versionId',
    ...write(
      MAPPING,
      'DELETE',
      { ...versionParams, body: sourceVersionRowVersionBodySchema },
      MAPPING_PREREQUISITE,
    ),
    mapping.deleteVersion,
  );

  return router;
}
