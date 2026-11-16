/*
 * Workflow Manager constants (docs/workflow-manager/DEVELOPMENT-ROADMAP.md, packages M1 and M2-A).
 *
 * Permission keys mirror the WORKFLOW_MANAGER module of the client registry
 * (client/src/config/registry/modules/workflowManager.module.js), which is the source the RBAC
 * catalogue registration (`npm run db:rbac-register`, gate G1) reads. Until the owner registers and
 * grants them, every route below denies (default deny: PERMISSION_UNKNOWN).
 *
 * Source allowlist: a TABLE/VIEW data source may name only an existing, VALID object of the same
 * type owned by an allowlisted schema, outside the protected application prefixes; a HANDLER source
 * may name only a server-side handler registered in SOURCE_HANDLERS. Nothing here reads business
 * data or executes caller-supplied SQL: object names are bound into dictionary queries only.
 */
import { sourceHandlerRegistry } from './integrations/index.js';

export const WORKFLOW_MODULE_CODE = 'WORKFLOW_MANAGER';

export const PERMISSIONS = Object.freeze({
  OVERVIEW: `${WORKFLOW_MODULE_CODE}.OVERVIEW`,
  FORM_REGISTRY: `${WORKFLOW_MODULE_CODE}.FORM_REGISTRY`,
  DATA_SOURCE_REGISTRY: `${WORKFLOW_MODULE_CODE}.DATA_SOURCE_REGISTRY`,
  // M2-A source version mapping (column allowlist, classification, key candidates). Every
  // SOURCE_MAPPING route also requires DATA_SOURCE_REGISTRY:VIEW (client `alsoRequires`).
  SOURCE_MAPPING: `${WORKFLOW_MODULE_CODE}.SOURCE_MAPPING`,
});

// Physical CHECK ZWF_CK_SRC_1 (deployed TEST dictionary, 2026-11-02).
export const SOURCE_KINDS = Object.freeze(['TABLE', 'VIEW', 'HANDLER']);

// The application schema that owns every business form table the Node modules use today.
export const ALLOWED_SOURCE_OWNERS = Object.freeze(['XXZP']);

// Application security, session, RBAC and workflow tables can never be workflow sources.
export const PROTECTED_OBJECT_PREFIXES = Object.freeze(['XX_ZRV_']);

// Modules whose resources can never be registered as workflow forms.
export const PROTECTED_MODULE_CODES = Object.freeze([
  'SECURITY_ADMINISTRATION',
  WORKFLOW_MODULE_CODE,
]);

/**
 * Server-side source handlers a HANDLER data source may reference: a frozen array of
 * `{ code, name, description }` (unchanged M1 shape). Since M2-0 it is derived from the form-owned
 * SourceHandler registry composed in integrations/index.js (mapping/sourceHandlers.js). That list
 * is empty, so HANDLER sources are still refused with SOURCE_HANDLER_NOT_ALLOWED.
 */
export const SOURCE_HANDLERS = sourceHandlerRegistry.descriptors();

export const isProtectedObjectName = (objectName) =>
  PROTECTED_OBJECT_PREFIXES.some((prefix) => objectName.startsWith(prefix));
