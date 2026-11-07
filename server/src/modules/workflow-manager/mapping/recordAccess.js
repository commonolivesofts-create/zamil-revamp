import { parsePermission } from '../../access-control/authorization.service.js';
import { CODE } from './identifiers.js';

/*
 * Form-owned record-access contract (G3-approved, M2-0). The authoritative answer to "may this
 * actor see this business record?" belongs to the business form's own module, implementing that
 * form's existing visibility rules. Workflow Manager never answers it itself:
 *
 *   - A Workflow Manager permission alone NEVER grants access to a business record.
 *   - No registered provider for a form → access is unavailable (NO_RECORD_ACCESS_PROVIDER).
 *     There is no generic fallback (no "RBAC + same organization" shortcut) and no administrator
 *     bypass.
 *   - Mapping configuration can only ADD requirements (additional permissions, all of which must
 *     be held); it cannot name, replace, skip or weaken the provider.
 *   - Any provider error, timeout, malformed answer or contract-version mismatch is DENY.
 *   - Cross-organization access is possible only when the provider itself allows it under its
 *     own approved policy and says so (`crossOrganization: true`); it is never granted here.
 * Providers are registered ONLY through integrations/index.js (explicit, reviewed list).
 *
 * Provider contract (version 1):
 *   { formCode, contractVersion: 1,
 *     canView({ actor: { userId, sessionId }, recordKey: { json, sha256, value }, purpose,
 *               connection }) → Promise<{ decision: 'ALLOW'|'DENY', basis, crossOrganization,
 *                                         contractVersion }> }
 */
export const RECORD_ACCESS_CONTRACT_VERSION = 1;
export const ACCESS_PURPOSES = Object.freeze(['MAPPING_PREVIEW']);
export const PROVIDER_TIMEOUT_MS = 5000;

export class RecordAccessRegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecordAccessRegistryError';
  }
}

// Registry → (formCode → provider). Providers are reachable only from this module.
const PROVIDERS = new WeakMap();

/** Validated, frozen registry; invalid or duplicate providers fail at startup. */
export function createRecordAccessRegistry(providers = []) {
  if (!Array.isArray(providers)) throw new RecordAccessRegistryError('Providers must be an array');
  const byForm = new Map();
  providers.forEach((provider, index) => {
    if (!provider || typeof provider !== 'object') {
      throw new RecordAccessRegistryError(`Record access provider #${index} must be an object`);
    }
    if (!CODE.test(provider.formCode ?? '')) {
      throw new RecordAccessRegistryError(`Record access provider #${index}: invalid formCode`);
    }
    if (provider.contractVersion !== RECORD_ACCESS_CONTRACT_VERSION) {
      throw new RecordAccessRegistryError(
        `${provider.formCode}: contractVersion must be ${RECORD_ACCESS_CONTRACT_VERSION}`,
      );
    }
    if (typeof provider.canView !== 'function') {
      throw new RecordAccessRegistryError(`${provider.formCode}: canView must be a function`);
    }
    if (byForm.has(provider.formCode)) {
      throw new RecordAccessRegistryError(`${provider.formCode} has two record access providers`);
    }
    byForm.set(provider.formCode, Object.freeze({ ...provider }));
  });
  // Deliberately no provider getter: the only way to use a provider is authorizeRecordAccess().
  const registry = Object.freeze({ has: (formCode) => byForm.has(formCode) });
  PROVIDERS.set(registry, byForm);
  return registry;
}

const BASIS = /^[A-Z][A-Z0-9_]{0,59}$/;
const decision = (allowed, basis, extra = {}) =>
  Object.freeze({
    decision: allowed ? 'ALLOW' : 'DENY',
    basis,
    crossOrganization: false,
    ...extra,
  });

function readProviderAnswer(answer) {
  if (!answer || typeof answer !== 'object') return null;
  if (answer.contractVersion !== RECORD_ACCESS_CONTRACT_VERSION) return null;
  if (answer.decision !== 'ALLOW' && answer.decision !== 'DENY') return null;
  if (typeof answer.basis !== 'string' || !BASIS.test(answer.basis)) return null;
  if (typeof answer.crossOrganization !== 'boolean') return null;
  return answer;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Authoritative record-level decision. ALLOW requires: a known purpose, an authenticated actor,
 * a canonical record key, every required permission held (Workflow Manager permission plus the
 * mapping's additional permissions), a registered provider, and the provider's valid ALLOW.
 * Everything else is DENY with a basis code. Never throws for a provider failure.
 */
export async function authorizeRecordAccess({
  registry,
  formCode,
  actor,
  recordKey,
  purpose,
  connection,
  requiredPermissions = [],
  holds,
  timeoutMs = PROVIDER_TIMEOUT_MS,
}) {
  if (!ACCESS_PURPOSES.includes(purpose)) return decision(false, 'PURPOSE_NOT_ALLOWED');
  if (!actor?.userId) return decision(false, 'ACTOR_REQUIRED');
  if (typeof recordKey?.sha256 !== 'string' || typeof recordKey?.json !== 'string') {
    return decision(false, 'RECORD_KEY_REQUIRED');
  }
  const provider = PROVIDERS.get(registry)?.get(formCode);
  if (!provider) return decision(false, 'NO_RECORD_ACCESS_PROVIDER');

  let permissions;
  try {
    permissions = requiredPermissions.map((key) => {
      const [resource, action] = String(key).split(':');
      return parsePermission(resource, action);
    });
  } catch {
    return decision(false, 'PERMISSION_INVALID');
  }
  if (typeof holds !== 'function') return decision(false, 'PERMISSION_CHECK_UNAVAILABLE');
  for (const permission of permissions) {
    let held;
    try {
      held = (await holds(actor.userId, permission)) === true;
    } catch {
      return decision(false, 'PERMISSION_CHECK_FAILED');
    }
    if (!held) return decision(false, 'PERMISSION_MISSING');
  }

  let answer;
  try {
    answer = await withTimeout(
      Promise.resolve().then(() =>
        provider.canView(
          Object.freeze({
            actor: Object.freeze({ userId: actor.userId, sessionId: actor.sessionId ?? null }),
            recordKey: Object.freeze({
              json: recordKey.json,
              sha256: recordKey.sha256,
              value: recordKey.value,
            }),
            purpose,
            connection,
          }),
        ),
      ),
      timeoutMs,
    );
  } catch (error) {
    return decision(false, error?.code === 'TIMEOUT' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR');
  }
  const valid = readProviderAnswer(answer);
  if (!valid) return decision(false, 'PROVIDER_INVALID_RESPONSE');
  if (valid.decision !== 'ALLOW') return decision(false, valid.basis);
  return decision(true, valid.basis, { crossOrganization: valid.crossOrganization });
}
