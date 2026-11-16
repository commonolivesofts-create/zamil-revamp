import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../database/oracle.js';
import { parsePermission } from '../access-control/authorization.service.js';
import { AppError } from '../../shared/errors/AppError.js';
import { logger as defaultLogger } from '../../shared/logger/index.js';
import {
  ALLOWED_SOURCE_OWNERS,
  isProtectedObjectName,
  PERMISSIONS,
  PROTECTED_MODULE_CODES,
  PROTECTED_OBJECT_PREFIXES,
  SOURCE_HANDLERS,
  SOURCE_KINDS,
} from './workflowManager.catalog.js';
import * as defaultRepository from './workflowManager.repository.js';

/*
 * Workflow Manager M1 rules — Form Registry and Data Source Registry. `authorize` has already
 * checked the route's WORKFLOW_MANAGER permission; these rules apply on top:
 *   - FORM_CODE / SOURCE_CODE are unique stable identities, chosen at registration and never
 *     changed (409 *_CODE_EXISTS on a duplicate, including a concurrent insert: ORA-00001).
 *   - A form's MODULE_CODE must be an ACTIVE module of the live RBAC catalogue, and never the
 *     security-administration or workflow-manager module.
 *   - A TABLE/VIEW source must name an existing VALID dictionary object of that type, owned by an
 *     allowlisted schema and outside the protected XX_ZRV_ prefix; a HANDLER source must name a
 *     registered server-side handler. Only names are checked; no business data is read.
 *   - A source's identity (kind/owner/object/handler) is locked once a source version exists.
 *     Updates take the parent source row lock (SELECT ... FOR UPDATE) that M2-A version creation
 *     also takes, so the first version and an identity change can never interleave.
 *   - Every change carries the caller's ROW_VERSION; a mismatch is 409 STALE_RECORD.
 *   - Records are deactivated, never deleted (configuration history is kept).
 *   - Nothing here creates workflow instances, tasks or notifications.
 * Organization scope is not a column of XX_ZRV_WF_FORMS; it belongs to the versioned form mapping
 * (XX_ZRV_WF_FORM_VERSIONS.CONFIG_JSON, package M2).
 */
const UNIQUE_VIOLATION = 1; // ORA-00001

export function searchPattern(search) {
  if (!search) return undefined;
  return `%${search.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const notFound = (what) => new AppError(404, 'RESOURCE_NOT_FOUND', `${what} not found`);
const stale = (what) =>
  new AppError(
    409,
    'STALE_RECORD',
    `The ${what} was changed by someone else. Reload it and apply your change again.`,
  );
const invalid = (field, message) =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message }]);

const isUniqueViolation = (error) => error?.errorNum === UNIQUE_VIOLATION;

// ORA-30006 (FOR UPDATE WAIT expired) / ORA-00054 (resource busy): another change of the same
// data source is still running. Nothing was changed; the caller may retry.
export const isLockTimeout = (error) => error?.errorNum === 30006 || error?.errorNum === 54;
export const sourceBusy = () =>
  new AppError(
    409,
    'SOURCE_BUSY',
    'Another change to this data source is in progress. Wait a moment and try again.',
  );

export function createWorkflowManagerService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
  holds = async () => false,
  logger = defaultLogger,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  async function assertModule(c, moduleCode) {
    if (PROTECTED_MODULE_CODES.includes(moduleCode)) {
      throw invalid('moduleCode', 'This module cannot own workflow forms.');
    }
    const module = await repository.findActiveModule(c, moduleCode);
    if (!module) {
      throw invalid('moduleCode', 'The module is not an active module of the permission catalog.');
    }
    return module;
  }

  /** Verifies a source identity against the allowlists and the Oracle dictionary. */
  async function assertSourceIdentity(c, { sourceKind, ownerName, objectName, handlerCode }) {
    if (sourceKind === 'HANDLER') {
      if (!SOURCE_HANDLERS.some((handler) => handler.code === handlerCode)) {
        throw invalid('handlerCode', 'SOURCE_HANDLER_NOT_ALLOWED');
      }
      return;
    }
    if (!ALLOWED_SOURCE_OWNERS.includes(ownerName)) {
      throw invalid('ownerName', 'SOURCE_OWNER_NOT_ALLOWED');
    }
    if (isProtectedObjectName(objectName)) {
      throw invalid('objectName', 'SOURCE_OBJECT_PROTECTED');
    }
    const objects = await repository.findDictionaryObject(c, { ownerName, objectName });
    const match = objects.find((object) => object.objectType === sourceKind);
    if (!match) {
      throw invalid(
        'objectName',
        objects.length ? 'SOURCE_OBJECT_TYPE_MISMATCH' : 'SOURCE_OBJECT_NOT_FOUND',
      );
    }
    if (match.status !== 'VALID') throw invalid('objectName', 'SOURCE_OBJECT_INVALID');
  }

  const sameIdentity = (a, b) =>
    a.sourceKind === b.sourceKind &&
    (a.ownerName ?? null) === (b.ownerName ?? null) &&
    (a.objectName ?? null) === (b.objectName ?? null) &&
    (a.handlerCode ?? null) === (b.handlerCode ?? null);

  /** Optimistic-lock outcome: 0 rows means the record is gone (404) or was changed (409). */
  async function requireChanged(c, changed, find, what) {
    if (changed) return;
    if (!(await find(c))) throw notFound(what);
    throw stale(what.toLowerCase());
  }

  const audit = (event, fields) =>
    logger.info({ event, ...fields }, 'Workflow configuration changed');

  async function getForm(formId) {
    const form = await read((c) => repository.findForm(c, formId));
    if (!form) throw notFound('Form');
    return form;
  }

  async function getSource(sourceId) {
    const source = await read((c) => repository.findSource(c, sourceId));
    if (!source) throw notFound('Data source');
    return source;
  }

  return {
    // --- Overview ------------------------------------------------------------------------------
    async overview(actor) {
      const [canForms, canSources] = await Promise.all([
        holds(actor.userId, parsePermission(PERMISSIONS.FORM_REGISTRY, 'VIEW')),
        holds(actor.userId, parsePermission(PERMISSIONS.DATA_SOURCE_REGISTRY, 'VIEW')),
      ]);
      return read(async (c) => {
        const forms = canForms ? await repository.countForms(c) : null;
        let dataSources = null;
        if (canSources) {
          const counts = await repository.countSources(c);
          const byKind = Object.fromEntries(
            SOURCE_KINDS.map((kind) => {
              const row = counts.find((item) => item.sourceKind === kind);
              return [kind, { total: row?.total ?? 0, active: row?.active ?? 0 }];
            }),
          );
          dataSources = {
            total: counts.reduce((sum, item) => sum + item.total, 0),
            active: counts.reduce((sum, item) => sum + item.active, 0),
            byKind,
          };
        }
        return { forms, dataSources };
      });
    },

    // --- Forms ---------------------------------------------------------------------------------
    listForms({ page, pageSize, search, sortBy, sortDir, ...filters }) {
      return read((c) =>
        repository.listForms(c, {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          filters: { ...filters, search: searchPattern(search) },
          sortBy,
          sortDir,
        }),
      );
    },

    getForm,

    async listFormVersions(formId) {
      return read(async (c) => {
        if (!(await repository.findForm(c, formId))) throw notFound('Form');
        return repository.listFormVersions(c, formId);
      });
    },

    async createForm(actor, body) {
      const formId = await withTransaction(POOLS.LOW, async (c) => {
        await assertModule(c, body.moduleCode);
        if (await repository.findFormIdByCode(c, body.formCode)) throw formCodeExists();
        try {
          return await repository.insertForm(c, { ...body, actorUserId: actor.userId });
        } catch (error) {
          if (isUniqueViolation(error)) throw formCodeExists();
          throw error;
        }
      });
      audit('WORKFLOW_FORM_REGISTERED', {
        formId,
        formCode: body.formCode,
        actorUserId: actor.userId,
      });
      return getForm(formId);
    },

    async updateForm(actor, formId, { rowVersion, ...body }) {
      await withTransaction(POOLS.LOW, async (c) => {
        const existing = await repository.findForm(c, formId);
        if (!existing) throw notFound('Form');
        // An unchanged module stays valid even if the catalogue later deactivated it.
        if (body.moduleCode !== existing.moduleCode) await assertModule(c, body.moduleCode);
        const changed = await repository.updateForm(c, {
          ...body,
          formId,
          rowVersion,
          actorUserId: actor.userId,
        });
        await requireChanged(c, changed, (cc) => repository.findForm(cc, formId), 'Form');
      });
      audit('WORKFLOW_FORM_UPDATED', { formId, actorUserId: actor.userId });
      return getForm(formId);
    },

    async setFormActive(actor, formId, isActive, { rowVersion }) {
      await withTransaction(POOLS.LOW, async (c) => {
        const changed = await repository.setFormActive(c, {
          formId,
          isActive,
          rowVersion,
          actorUserId: actor.userId,
        });
        await requireChanged(c, changed, (cc) => repository.findForm(cc, formId), 'Form');
      });
      audit(isActive ? 'WORKFLOW_FORM_ACTIVATED' : 'WORKFLOW_FORM_DEACTIVATED', {
        formId,
        actorUserId: actor.userId,
      });
      return getForm(formId);
    },

    async listModules() {
      const modules = await read((c) => repository.listActiveModules(c));
      return modules.filter((module) => !PROTECTED_MODULE_CODES.includes(module.moduleCode));
    },

    // --- Data sources --------------------------------------------------------------------------
    listSources({ page, pageSize, search, sortBy, sortDir, ...filters }) {
      return read((c) =>
        repository.listSources(c, {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          filters: { ...filters, search: searchPattern(search) },
          sortBy,
          sortDir,
        }),
      );
    },

    getSource,

    async listSourceVersions(sourceId) {
      return read(async (c) => {
        if (!(await repository.findSource(c, sourceId))) throw notFound('Data source');
        return repository.listSourceVersions(c, sourceId);
      });
    },

    async createSource(actor, body) {
      const sourceId = await withTransaction(POOLS.LOW, async (c) => {
        await assertSourceIdentity(c, body);
        if (await repository.findSourceIdByCode(c, body.sourceCode)) throw sourceCodeExists();
        try {
          return await repository.insertSource(c, { ...body, actorUserId: actor.userId });
        } catch (error) {
          if (isUniqueViolation(error)) throw sourceCodeExists();
          throw error;
        }
      });
      audit('WORKFLOW_DATA_SOURCE_REGISTERED', {
        sourceId,
        sourceCode: body.sourceCode,
        actorUserId: actor.userId,
      });
      return getSource(sourceId);
    },

    async updateSource(actor, sourceId, { rowVersion, ...body }) {
      await withTransaction(POOLS.LOW, async (c) => {
        // Parent-row lock shared with M2-A version creation: the version count read below is
        // current, and no first version can be inserted until this identity change commits.
        if (!(await repository.lockSource(c, sourceId))) throw notFound('Data source');
        const existing = await repository.findSource(c, sourceId);
        if (!existing) throw notFound('Data source');
        if (!sameIdentity(existing, body)) {
          if (existing.versionCount > 0) {
            throw new AppError(
              409,
              'SOURCE_IDENTITY_LOCKED',
              'The source object cannot change after source versions exist. Register a new data source instead.',
            );
          }
          await assertSourceIdentity(c, body);
        }
        const changed = await repository.updateSource(c, {
          ...body,
          sourceId,
          rowVersion,
          actorUserId: actor.userId,
        });
        await requireChanged(
          c,
          changed,
          (cc) => repository.findSource(cc, sourceId),
          'Data source',
        );
      }).catch((error) => {
        throw isLockTimeout(error) ? sourceBusy() : error;
      });
      audit('WORKFLOW_DATA_SOURCE_UPDATED', { sourceId, actorUserId: actor.userId });
      return getSource(sourceId);
    },

    async setSourceActive(actor, sourceId, isActive, { rowVersion }) {
      await withTransaction(POOLS.LOW, async (c) => {
        const changed = await repository.setSourceActive(c, {
          sourceId,
          isActive,
          rowVersion,
          actorUserId: actor.userId,
        });
        await requireChanged(
          c,
          changed,
          (cc) => repository.findSource(cc, sourceId),
          'Data source',
        );
      });
      audit(isActive ? 'WORKFLOW_DATA_SOURCE_ACTIVATED' : 'WORKFLOW_DATA_SOURCE_DEACTIVATED', {
        sourceId,
        actorUserId: actor.userId,
      });
      return getSource(sourceId);
    },

    listSourceObjects({ objectType, search }) {
      return read((c) =>
        repository.listDictionaryObjects(c, {
          owners: [...ALLOWED_SOURCE_OWNERS],
          objectType,
          search: searchPattern(search),
          excludedPrefixes: [...PROTECTED_OBJECT_PREFIXES],
          limit: 50,
        }),
      );
    },

    /** The allowlist policy the registration screen explains (no secrets, no data). */
    sourcePolicy() {
      return {
        sourceKinds: [...SOURCE_KINDS],
        allowedOwners: [...ALLOWED_SOURCE_OWNERS],
        protectedObjectPrefixes: [...PROTECTED_OBJECT_PREFIXES],
        handlers: SOURCE_HANDLERS.map((handler) => ({ ...handler })),
      };
    },
  };
}

function formCodeExists() {
  return new AppError(409, 'FORM_CODE_EXISTS', 'A form with this code is already registered.');
}

function sourceCodeExists() {
  return new AppError(
    409,
    'SOURCE_CODE_EXISTS',
    'A data source with this code is already registered.',
  );
}
