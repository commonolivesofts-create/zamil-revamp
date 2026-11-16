// Master Workflow Manager, Phase 1 packages M1 and M2-A (docs/workflow-manager/DEVELOPMENT-ROADMAP.md).
// Codes mirror the backend permission keys
// (server/src/modules/workflow-manager/workflowManager.catalog.js). The Oracle catalogue
// entries are registered from this definition by `npm run db:rbac-register` only with owner
// approval (gate G1); until they exist and are granted, the backend denies every route and these
// pages are never listed.
// `hidden: true`: a record page reached from its list (path parameter or "register").
import { defineModule } from '../defineModule.js'

const page = (entry) => ({ group: 'workflow-manager', ...entry })

export default defineModule({
  code: 'WORKFLOW_MANAGER',
  name: 'Workflow Manager',
  description: 'Master Workflow Manager configuration: registered forms, approved data sources and their source mappings.',
  displayOrder: 0,
  resources: [
    {
      code: 'OVERVIEW',
      name: 'Workflow Manager Overview',
      description: 'Open the Workflow Manager overview.',
      actions: ['VIEW'],
      navigation: [
        page({ id: 'workflow-manager', path: '/workflow-manager', title: 'Overview', icon: 'workflow', order: 10 }),
      ],
    },
    {
      code: 'FORM_REGISTRY',
      name: 'Form Registry',
      description: 'Business forms registered for workflow configuration.',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE'],
      navigation: [
        page({ id: 'workflow-forms', path: '/workflow-manager/forms', title: 'Form registry', icon: 'file-stack', order: 20 }),
        page({ id: 'workflow-form-new', path: '/workflow-manager/forms/new', title: 'Register form', icon: 'file-plus', order: 21, requiredAction: 'CREATE', hidden: true }),
        page({ id: 'workflow-form', path: '/workflow-manager/forms/:formId', title: 'Registered form', icon: 'file-text', order: 22, hidden: true }),
      ],
    },
    {
      code: 'DATA_SOURCE_REGISTRY',
      name: 'Data Source Registry',
      description: 'Approved tables, views and handlers that workflow forms may use.',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE'],
      navigation: [
        page({ id: 'workflow-data-sources', path: '/workflow-manager/data-sources', title: 'Data source registry', icon: 'database', order: 30 }),
      ],
    },
    {
      // Package M2-A: versioned source mappings, reached from "Manage mapping" in the data
      // source registry (no sidebar entry). Every page and backend route also needs
      // DATA_SOURCE_REGISTRY:VIEW.
      code: 'SOURCE_MAPPING',
      name: 'Source Mapping',
      description: 'Versioned column allowlists, data classes and key candidates of registered data sources.',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
      navigation: [
        page({ id: 'workflow-source-versions', path: '/workflow-manager/data-sources/:sourceId/mapping-versions', title: 'Source versions', icon: 'layers', order: 31, hidden: true, alsoRequires: ['DATA_SOURCE_REGISTRY:VIEW'] }),
        page({ id: 'workflow-source-version-new', path: '/workflow-manager/data-sources/:sourceId/mapping-versions/new', title: 'New source version', icon: 'file-plus', order: 32, requiredAction: 'CREATE', hidden: true, alsoRequires: ['DATA_SOURCE_REGISTRY:VIEW'] }),
        page({ id: 'workflow-source-version', path: '/workflow-manager/data-sources/:sourceId/mapping-versions/:versionId', title: 'Source version', icon: 'file-text', order: 33, hidden: true, alsoRequires: ['DATA_SOURCE_REGISTRY:VIEW'] }),
      ],
    },
  ],
})
