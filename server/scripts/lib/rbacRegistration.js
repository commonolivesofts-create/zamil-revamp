// Registration of developer-defined RBAC catalogue entries (Phase 2B).
//
// Source of truth: the active module registry client/src/config/registry/index.js (plain
// JavaScript shared with the frontend). Session-only modules (rbac: false, e.g. COMMON) are
// skipped; the example definitions are never imported. Only MISSING modules, resources and
// permissions of business modules are ever inserted. Existing catalogue rows are never updated,
// deleted, activated, deactivated or renamed, and nothing is granted to roles or users. The
// SECURITY_ADMINISTRATION catalogue is verify-only: any difference is a conflict.
//
// This module is pure (no process, TTY or pool handling) so it can be tested with a mocked
// connection; scripts/rbac-register.js is the guarded entry point.
import { createHash } from 'node:crypto';
import oracledb from 'oracledb';
import { STANDARD_ACTIONS } from '../../../client/src/config/registry/actions.js';
import {
  ACTOR_TYPES,
  AUDIT_EVENTS,
  AUDIT_OUTCOMES,
  buildAuditEvent,
} from '../../src/modules/audit/securityAudit.service.js';
import { insertAuditEvent } from '../../src/modules/audit/securityAudit.repository.js';
import {
  SECURITY_MODULE,
  SECURITY_RESOURCES,
} from '../../src/modules/access-control/securityCatalog.js';

export class RegistrationRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistrationRefused';
  }
}

/**
 * Databases this script may connect to. Only Oracle TEST is approved; UAT and production targets
 * require a separately approved change (gate G1) that adds their verified identity here.
 * `dbName` is the owner-approved SYS_CONTEXT('USERENV', 'DB_NAME'). While it is null the preview
 * still runs (and reports the actual DB_NAME), but apply is refused: the identity is incomplete.
 */
export const APPROVED_TARGETS = Object.freeze({
  TEST: Object.freeze({
    name: 'TEST',
    lowAlias: 'zpadwtest_low',
    serviceNamePattern: /_zpadwtest_low\./i,
    dbName: 'G480281AE328134_ZPADWTEST',
    environments: Object.freeze(['development', 'test']),
  }),
});

export const SOURCE = 'REGISTRY_SYNC';
export const USER_AGENT = 'zr-rbac-register';
export const SECURITY_MODULE_CODE = SECURITY_MODULE.code;

// Constraints the comparison and the inserts rely on; each must exist, be ENABLED and VALIDATED.
export const REQUIRED_CONSTRAINTS = Object.freeze([
  'PK_ZRV_MOD',
  'UQ_ZRV_MOD_CODE',
  'CK_ZRV_MOD_CODE',
  'CK_ZRV_MOD_NAME',
  'PK_ZRV_RES',
  'UQ_ZRV_RES_MOD_CODE',
  'CK_ZRV_RES_CODE',
  'CK_ZRV_RES_NAME',
  'FK_ZRV_RES_MOD',
  'PK_ZRV_PERM',
  'UQ_ZRV_PERM_RES_ACT',
  'CK_ZRV_PERM_ACTION',
  'FK_ZRV_PERM_RES',
  'PK_ZRV_AUD',
  'CK_ZRV_AUD_EVENT',
  'CK_ZRV_AUD_ACTOR_ID',
  'CK_ZRV_AUD_TARGET',
  'CK_ZRV_AUD_DETAILS',
  'CK_ZRV_AUD_IMMUT',
]);

// Each statement carries a label comment so tests recognise it without parsing SQL. Reads are
// uncapped: the comparison must see the complete catalogue.
export const REGISTER_SQL = Object.freeze({
  identity: `/* zr-rbac-register:identity */
    SELECT SYS_CONTEXT('USERENV', 'SERVICE_NAME'), SYS_CONTEXT('USERENV', 'DB_NAME') FROM dual`,
  constraints: `/* zr-rbac-register:constraints */
    SELECT constraint_name, status, validated FROM user_constraints
     WHERE table_name IN ('XX_ZRV_APP_MODULES', 'XX_ZRV_RESOURCES', 'XX_ZRV_PERMISSIONS',
                          'XX_ZRV_RBAC_AUDIT_LOGS')`,
  auditEventCheck: `/* zr-rbac-register:audit-event-check */
    SELECT search_condition_vc FROM user_constraints
     WHERE table_name = 'XX_ZRV_RBAC_AUDIT_LOGS' AND constraint_name = 'CK_ZRV_AUD_EVENT'`,
  modules: `/* zr-rbac-register:modules */
    SELECT TO_CHAR(module_id), module_code, module_name, description, display_order, is_active
      FROM xx_zrv_app_modules`,
  resources: `/* zr-rbac-register:resources */
    SELECT TO_CHAR(resource_id), TO_CHAR(module_id), resource_code, resource_name, description, is_active
      FROM xx_zrv_resources`,
  permissions: `/* zr-rbac-register:permissions */
    SELECT TO_CHAR(permission_id), TO_CHAR(resource_id), action_code, is_active
      FROM xx_zrv_permissions`,
  lock: `/* zr-rbac-register:lock */
    LOCK TABLE xx_zrv_app_modules, xx_zrv_resources, xx_zrv_permissions IN EXCLUSIVE MODE NOWAIT`,
  insertModule: `/* zr-rbac-register:insert-module */
    INSERT INTO xx_zrv_app_modules (module_code, module_name, description, display_order, is_active, created_by)
    VALUES (:code, :name, :description, :displayOrder, 1, NULL)
    RETURNING module_id INTO :id`,
  insertResource: `/* zr-rbac-register:insert-resource */
    INSERT INTO xx_zrv_resources (module_id, resource_code, resource_name, description, is_active, created_by)
    VALUES (:moduleId, :code, :name, :description, 1, NULL)
    RETURNING resource_id INTO :id`,
  insertPermission: `/* zr-rbac-register:insert-permission */
    INSERT INTO xx_zrv_permissions (resource_id, action_code, description, is_active, created_by)
    VALUES (:resourceId, :actionCode, :description, 1, NULL)
    RETURNING permission_id INTO :id`,
  auditCount: `/* zr-rbac-register:audit-count */
    SELECT COUNT(*) FROM xx_zrv_rbac_audit_logs WHERE correlation_id = :correlationId`,
});

const ID_OUT = () => ({ dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 });
const rowsOf = async (connection, sql, binds = {}) =>
  (await connection.execute(sql, binds)).rows ?? [];

// --------------------------------------------------------------------------- arguments

const FINGERPRINT = /^[0-9a-f]{64}$/;

/** `--target=<NAME>` (required), `--apply`, `--fingerprint=<sha256>` (apply only). */
export function parseArgs(argv, targets = APPROVED_TARGETS) {
  const options = { target: null, apply: false, fingerprint: null };
  for (const argument of argv) {
    const [flag, value, extra] = argument.split('=');
    if (
      flag === '--target' &&
      value !== undefined &&
      extra === undefined &&
      options.target === null
    ) {
      options.target = value;
    } else if (argument === '--apply' && !options.apply) {
      options.apply = true;
    } else if (
      flag === '--fingerprint' &&
      value !== undefined &&
      extra === undefined &&
      options.fingerprint === null
    ) {
      options.fingerprint = value.toLowerCase();
    } else {
      throw new RegistrationRefused(
        'Unknown or repeated argument. Accepted: --target=<TARGET>, --apply, --fingerprint=<sha256>.',
      );
    }
  }
  if (!options.target)
    throw new RegistrationRefused('--target=<TARGET> is required (approved: TEST).');
  if (!Object.hasOwn(targets, options.target)) {
    throw new RegistrationRefused(
      `Target ${options.target} is not an approved registration target.`,
    );
  }
  if (options.apply && !FINGERPRINT.test(options.fingerprint ?? '')) {
    throw new RegistrationRefused(
      '--apply requires --fingerprint=<the 64-character plan fingerprint>.',
    );
  }
  if (!options.apply && options.fingerprint !== null) {
    throw new RegistrationRefused('--fingerprint is only accepted together with --apply.');
  }
  return options;
}

/** The selected target must match the configured environment and LOW alias. */
export function assertEnvironment(appConfig, target) {
  if (!target.environments.includes(appConfig.env)) {
    throw new RegistrationRefused(
      `NODE_ENV=${appConfig.env} is not permitted for target ${target.name}.`,
    );
  }
  if (appConfig.database?.pools?.LOW?.alias !== target.lowAlias) {
    throw new RegistrationRefused(
      `ORACLE_LOW_ALIAS must be ${target.lowAlias} for target ${target.name}; refusing an unapproved database.`,
    );
  }
}

/** Apply needs the complete approved identity: SERVICE_NAME pattern and DB_NAME. */
export function assertApplyIdentityConfigured(target) {
  if (typeof target.dbName !== 'string' || !target.dbName) {
    throw new RegistrationRefused(
      `Apply is disabled: no approved DB_NAME is configured for target ${target.name}. Record the DB_NAME reported by the preview and have it approved and added to APPROVED_TARGETS.`,
    );
  }
}

/**
 * Confirms the connected database is the selected target: SERVICE_NAME must match, and DB_NAME
 * must equal the approved value when one is configured (always required for apply). Returns the
 * identity for display and for the plan fingerprint.
 */
export async function assertDatabaseIdentity(connection, target, { forApply = false } = {}) {
  const [[serviceName, dbName] = []] = await rowsOf(connection, REGISTER_SQL.identity);
  if (!target.serviceNamePattern.test(serviceName ?? '')) {
    throw new RegistrationRefused(`Connected database is not the approved ${target.name} service.`);
  }
  if (forApply) assertApplyIdentityConfigured(target);
  if (target.dbName && dbName !== target.dbName) {
    throw new RegistrationRefused(`Connected DB_NAME is not the approved ${target.name} database.`);
  }
  return {
    target: target.name,
    serviceName,
    dbName: dbName ?? null,
    dbNameApproved: Boolean(target.dbName),
  };
}

// --------------------------------------------------------------------------- definitions

/**
 * The RBAC modules of the active registry (session-only modules skipped), checked again here:
 * unique codes, and SECURITY_ADMINISTRATION identical to the backend security catalogue.
 */
export function registryDefinitions(registeredModules) {
  const modules = registeredModules.filter((module) => module.rbac !== false);
  const seen = new Set();
  for (const module of modules) {
    if (seen.has(module.code))
      throw new RegistrationRefused(`Duplicate module code ${module.code} in the registry.`);
    seen.add(module.code);
    const resources = new Set();
    for (const resource of module.resources) {
      if (resources.has(resource.code)) {
        throw new RegistrationRefused(
          `Duplicate resource ${module.code}.${resource.code} in the registry.`,
        );
      }
      resources.add(resource.code);
      if (new Set(resource.actions).size !== resource.actions.length) {
        throw new RegistrationRefused(`Duplicate action in ${module.code}.${resource.code}.`);
      }
      for (const action of resource.actions) {
        if (!Object.hasOwn(STANDARD_ACTIONS, action)) {
          throw new RegistrationRefused(
            `${module.code}.${resource.code}:${action} is not a standard action.`,
          );
        }
      }
    }
  }
  const security = modules.find((module) => module.code === SECURITY_MODULE_CODE);
  const expected = JSON.stringify({
    name: SECURITY_MODULE.name,
    description: SECURITY_MODULE.description,
    displayOrder: SECURITY_MODULE.displayOrder,
    resources: SECURITY_RESOURCES.map(({ code, name, actions }) => ({ code, name, actions })),
  });
  const actual =
    security &&
    JSON.stringify({
      name: security.name,
      description: security.description,
      displayOrder: security.displayOrder,
      resources: security.resources.map(({ code, name, actions }) => ({
        code,
        name,
        actions: [...actions],
      })),
    });
  if (actual !== expected) {
    throw new RegistrationRefused(
      'The registry SECURITY_ADMINISTRATION definition differs from the backend security catalogue.',
    );
  }
  return modules;
}

/** Default description of a new permission, e.g. APPROVE on "Sales Budget" → "Approve sales budget". */
export const permissionDescription = (actionCode, resourceName) =>
  `${STANDARD_ACTIONS[actionCode].name} ${resourceName.toLowerCase()}`;

// --------------------------------------------------------------------------- comparison

/** Reads the complete catalogue (modules, resources, permissions) with active flags. */
export async function readCatalog(connection) {
  const modules = (await rowsOf(connection, REGISTER_SQL.modules)).map(
    ([id, code, name, description, displayOrder, isActive]) => ({
      id,
      code,
      name,
      description: description ?? null,
      displayOrder: Number(displayOrder),
      isActive: Number(isActive) === 1,
    }),
  );
  const resources = (await rowsOf(connection, REGISTER_SQL.resources)).map(
    ([id, moduleId, code, name, description, isActive]) => ({
      id,
      moduleId,
      code,
      name,
      description: description ?? null,
      isActive: Number(isActive) === 1,
    }),
  );
  const permissions = (await rowsOf(connection, REGISTER_SQL.permissions)).map(
    ([id, resourceId, actionCode, isActive]) => ({
      id,
      resourceId,
      actionCode,
      isActive: Number(isActive) === 1,
    }),
  );
  return { modules, resources, permissions };
}

const label = {
  module: (m) => m,
  resource: (m, r) => `${m}.${r}`,
  permission: (m, r, a) => `${m}.${r}:${a}`,
};

/**
 * Classifies every registry entry against the catalogue:
 *   MATCH       exists, active and equal in every field the registry defines
 *   MISSING     absent; will be inserted (never inside SECURITY_ADMINISTRATION)
 *   CONFLICT    inactive, different, under a conflicting parent, or missing in the protected
 *               security catalogue; nothing is written while any conflict exists
 *   UNREGISTERED  catalogue rows the registry does not define (reported only)
 * Fields the registry does not define (resource descriptions it omits, every permission
 * description) are never compared; stored values are never changed.
 */
export function comparePlan(definitions, catalog) {
  const items = [];
  const add = (kind, status, key, extra = {}) => items.push({ kind, status, key, ...extra });

  for (const module of definitions) {
    const protectedModule = module.code === SECURITY_MODULE_CODE;
    const existing = catalog.modules.find((row) => row.code === module.code);
    let moduleState;
    if (!existing) {
      moduleState = protectedModule ? 'CONFLICT' : 'MISSING';
      add('MODULE', moduleState, label.module(module.code), {
        reasons: protectedModule ? ['protected security catalogue record is missing'] : [],
        insert: protectedModule
          ? undefined
          : {
              code: module.code,
              name: module.name,
              description: module.description ?? null,
              displayOrder: module.displayOrder,
            },
      });
    } else {
      const reasons = [];
      if (!existing.isActive) reasons.push('inactive in Oracle');
      if (existing.name !== module.name)
        reasons.push(`name "${existing.name}" ≠ registry "${module.name}"`);
      if (module.description !== undefined && existing.description !== module.description) {
        reasons.push('description differs from the registry');
      }
      if (existing.displayOrder !== module.displayOrder) {
        reasons.push(`display order ${existing.displayOrder} ≠ registry ${module.displayOrder}`);
      }
      moduleState = reasons.length ? 'CONFLICT' : 'MATCH';
      add('MODULE', moduleState, label.module(module.code), { reasons });
    }

    for (const resource of module.resources) {
      const row =
        existing &&
        catalog.resources.find((r) => r.moduleId === existing.id && r.code === resource.code);
      let resourceState;
      if (!row) {
        const reasons = [];
        if (protectedModule) reasons.push('protected security catalogue record is missing');
        else if (moduleState === 'CONFLICT') reasons.push('parent module is in conflict');
        resourceState = reasons.length ? 'CONFLICT' : 'MISSING';
        add('RESOURCE', resourceState, label.resource(module.code, resource.code), {
          reasons,
          insert: reasons.length
            ? undefined
            : {
                moduleCode: module.code,
                code: resource.code,
                name: resource.name,
                description: resource.description ?? null,
              },
        });
      } else {
        const reasons = [];
        if (!row.isActive) reasons.push('inactive in Oracle');
        if (row.name !== resource.name)
          reasons.push(`name "${row.name}" ≠ registry "${resource.name}"`);
        if (resource.description !== undefined && row.description !== resource.description) {
          reasons.push('description differs from the registry');
        }
        resourceState = reasons.length ? 'CONFLICT' : 'MATCH';
        add('RESOURCE', resourceState, label.resource(module.code, resource.code), { reasons });
      }

      for (const actionCode of resource.actions) {
        const key = label.permission(module.code, resource.code, actionCode);
        const permission =
          row &&
          catalog.permissions.find((p) => p.resourceId === row.id && p.actionCode === actionCode);
        if (!permission) {
          const reasons = [];
          if (protectedModule) reasons.push('protected security catalogue record is missing');
          else if (resourceState === 'CONFLICT') reasons.push('parent resource is in conflict');
          add('PERMISSION', reasons.length ? 'CONFLICT' : 'MISSING', key, {
            reasons,
            insert: reasons.length
              ? undefined
              : {
                  moduleCode: module.code,
                  resourceCode: resource.code,
                  actionCode,
                  description: permissionDescription(actionCode, resource.name),
                },
          });
        } else {
          add('PERMISSION', permission.isActive ? 'MATCH' : 'CONFLICT', key, {
            reasons: permission.isActive ? [] : ['inactive in Oracle'],
          });
        }
      }
    }
  }

  // Catalogue rows the registry does not define: reported only, never modified.
  const defined = new Map(definitions.map((m) => [m.code, m]));
  for (const module of catalog.modules) {
    const definition = defined.get(module.code);
    if (!definition) {
      const resources = catalog.resources.filter((r) => r.moduleId === module.id);
      const permissions = catalog.permissions.filter((p) =>
        resources.some((r) => r.id === p.resourceId),
      );
      add('MODULE', 'UNREGISTERED', label.module(module.code), {
        reasons: [
          `${resources.length} resource(s), ${permissions.length} permission(s); ${module.isActive ? 'active' : 'inactive'}`,
        ],
      });
      continue;
    }
    for (const resource of catalog.resources.filter((r) => r.moduleId === module.id)) {
      const resourceDefinition = definition.resources.find((r) => r.code === resource.code);
      if (!resourceDefinition) {
        add('RESOURCE', 'UNREGISTERED', label.resource(module.code, resource.code), {
          reasons: [resource.isActive ? 'active' : 'inactive'],
        });
        continue;
      }
      for (const permission of catalog.permissions.filter((p) => p.resourceId === resource.id)) {
        if (!resourceDefinition.actions.includes(permission.actionCode)) {
          add(
            'PERMISSION',
            'UNREGISTERED',
            label.permission(module.code, resource.code, permission.actionCode),
            {
              reasons: [permission.isActive ? 'active' : 'inactive'],
            },
          );
        }
      }
    }
  }

  const counts = { MATCH: 0, MISSING: 0, CONFLICT: 0, UNREGISTERED: 0 };
  for (const item of items) counts[item.status] += 1;
  return {
    items,
    counts,
    inserts: items
      .filter((item) => item.status === 'MISSING')
      .map((item) => ({ kind: item.kind, ...item.insert })),
  };
}

/**
 * Deterministic SHA-256 over the target identity and the exact records to insert (order
 * independent). Matches, conflicts and unregistered rows are not part of it: apply refuses any
 * conflict separately.
 */
export function planFingerprint(identity, inserts) {
  const canonical = inserts
    .map((insert) =>
      JSON.stringify(
        Object.keys(insert)
          .sort()
          .map((key) => [key, insert[key] ?? null]),
      ),
    )
    .sort();
  return createHash('sha256')
    .update(
      JSON.stringify({
        target: identity.target,
        serviceName: identity.serviceName,
        dbName: identity.dbName,
        inserts: canonical,
      }),
    )
    .digest('hex');
}

// --------------------------------------------------------------------------- prechecks

/** Read-only structural preconditions; returns problem descriptions (empty = ready). */
export async function runPrechecks(connection) {
  const problems = [];
  const constraints = new Map(
    (await rowsOf(connection, REGISTER_SQL.constraints)).map(([name, status, validated]) => [
      name,
      { status, validated },
    ]),
  );
  for (const name of REQUIRED_CONSTRAINTS) {
    const constraint = constraints.get(name);
    if (!constraint) problems.push(`Required constraint ${name} is missing`);
    else if (constraint.status !== 'ENABLED' || constraint.validated !== 'VALIDATED') {
      problems.push(`Required constraint ${name} is not ENABLED and VALIDATED`);
    }
  }
  const [[eventCheck] = []] = await rowsOf(connection, REGISTER_SQL.auditEventCheck);
  if (!eventCheck) {
    problems.push('CK_ZRV_AUD_EVENT not found');
  } else {
    // The deployed predicate is evaluated for the event code this script writes.
    const predicate = eventCheck.replaceAll('EVENT_CODE', ':v');
    const [[accepted] = []] = await rowsOf(
      connection,
      `/* zr-rbac-register:audit-event-eval */ SELECT CASE WHEN ${predicate} THEN 1 ELSE 0 END FROM dual`,
      { v: AUDIT_EVENTS.RBAC_CATALOG_CHANGED },
    );
    if (Number(accepted) !== 1)
      problems.push(`CK_ZRV_AUD_EVENT does not accept ${AUDIT_EVENTS.RBAC_CATALOG_CHANGED}`);
  }
  return problems;
}

/** Identity, preconditions, catalogue and plan in one pass (used by preview and under the lock). */
export async function buildPlan(connection, { target, definitions, forApply = false }) {
  const identity = await assertDatabaseIdentity(connection, target, { forApply });
  const problems = await runPrechecks(connection);
  const catalog = await readCatalog(connection);
  const plan = comparePlan(definitions, catalog);
  return {
    identity,
    problems,
    catalog,
    plan,
    fingerprint: planFingerprint(identity, plan.inserts),
  };
}

// --------------------------------------------------------------------------- apply

async function insertReturningId(connection, sql, binds) {
  const result = await connection.execute(sql, { ...binds, id: ID_OUT() });
  return result.outBinds.id[0];
}

/**
 * Inserts the planned records (module → resource → permission) inside the caller's transaction,
 * each with its RBAC_CATALOG_CHANGED audit row (SYSTEM actor, CREATED_BY NULL). Parents that
 * already exist are looked up from the catalogue read under the lock.
 */
export async function applyInserts(
  connection,
  { inserts, catalog, identity, fingerprint, correlationId },
) {
  const moduleIds = new Map(catalog.modules.map((m) => [m.code, m.id]));
  const resourceIds = new Map(
    catalog.resources.map((r) => [
      `${catalog.modules.find((m) => m.id === r.moduleId)?.code}.${r.code}`,
      r.id,
    ]),
  );
  const audit = (target, reasonCode, details) =>
    insertAuditEvent(
      connection,
      buildAuditEvent({
        eventCode: AUDIT_EVENTS.RBAC_CATALOG_CHANGED,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        actorType: ACTOR_TYPES.SYSTEM,
        target,
        reasonCode,
        details: {
          source: SOURCE,
          target: identity.target,
          planFingerprint: fingerprint,
          ...details,
        },
        context: { requestId: correlationId, ipAddress: null, userAgent: USER_AGENT },
      }),
    );

  const created = [];
  for (const insert of inserts.filter((i) => i.kind === 'MODULE')) {
    const id = await insertReturningId(connection, REGISTER_SQL.insertModule, {
      code: insert.code,
      name: insert.name,
      description: insert.description,
      displayOrder: insert.displayOrder,
    });
    moduleIds.set(insert.code, id);
    await audit({ type: 'APP_MODULE', id }, 'MODULE_CREATED', { moduleCode: insert.code });
    created.push(label.module(insert.code));
  }
  for (const insert of inserts.filter((i) => i.kind === 'RESOURCE')) {
    const moduleId = moduleIds.get(insert.moduleCode);
    if (!moduleId)
      throw new RegistrationRefused(`Parent module ${insert.moduleCode} not found under the lock.`);
    const id = await insertReturningId(connection, REGISTER_SQL.insertResource, {
      moduleId,
      code: insert.code,
      name: insert.name,
      description: insert.description,
    });
    resourceIds.set(`${insert.moduleCode}.${insert.code}`, id);
    await audit({ type: 'RESOURCE', id }, 'RESOURCE_CREATED', {
      moduleCode: insert.moduleCode,
      resourceCode: insert.code,
    });
    created.push(label.resource(insert.moduleCode, insert.code));
  }
  for (const insert of inserts.filter((i) => i.kind === 'PERMISSION')) {
    const resourceId = resourceIds.get(`${insert.moduleCode}.${insert.resourceCode}`);
    if (!resourceId)
      throw new RegistrationRefused(
        `Parent resource ${insert.moduleCode}.${insert.resourceCode} not found under the lock.`,
      );
    const id = await insertReturningId(connection, REGISTER_SQL.insertPermission, {
      resourceId,
      actionCode: insert.actionCode,
      description: insert.description,
    });
    const permission = label.permission(insert.moduleCode, insert.resourceCode, insert.actionCode);
    await audit({ type: 'PERMISSION', id }, 'PERMISSION_CREATED', { permission });
    created.push(permission);
  }
  return created;
}

/** After the inserts, before commit: every planned record now matches and is audited once. */
export async function verifyApplied(connection, { definitions, planned, correlationId }) {
  const after = comparePlan(definitions, await readCatalog(connection));
  const problems = [];
  if (after.counts.MISSING !== 0) problems.push(`${after.counts.MISSING} record(s) still missing`);
  if (after.counts.CONFLICT !== 0)
    problems.push(`${after.counts.CONFLICT} conflict(s) after insert`);
  for (const key of planned) {
    if (after.items.find((item) => item.key === key)?.status !== 'MATCH')
      problems.push(`${key} does not match after insert`);
  }
  const [[audited] = []] = await rowsOf(connection, REGISTER_SQL.auditCount, { correlationId });
  if (Number(audited) !== planned.length)
    problems.push(`expected ${planned.length} audit event(s), found ${audited}`);
  return problems;
}

// Error helpers live in a dependency-free module so the CLI entry can use them before anything
// that loads the configuration is imported.
export { describeStartupError, oracleErrorCode } from './safeErrors.js';
