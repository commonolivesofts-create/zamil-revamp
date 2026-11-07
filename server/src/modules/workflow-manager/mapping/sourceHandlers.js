import { isOracleIdentifier } from './identifiers.js';
import { describeOracleType, FAMILIES } from './typeCompatibility.js';

const HANDLER_CODE = /^[A-Z][A-Z0-9_]{0,127}$/;

/*
 * Form-owned source handlers (G3-approved contract, M2-0). A HANDLER data source names server code
 * owned by a business form module that declares its record fields instead of a dictionary object.
 * Handlers are registered ONLY through integrations/index.js (explicit, reviewed list; nothing
 * registers itself on import). M2-0 validates and describes handlers; it never invokes handler
 * functions — record reads and status writes belong to later, separately authorized packages.
 *
 * Contract (version 1):
 *   { code, name, description?, contractVersion: 1,
 *     fields: [{ name, oracleType, charLength?, precision?, scale?, nullable }] }
 */
export const SOURCE_HANDLER_CONTRACT_VERSION = 1;

export class SourceHandlerRegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceHandlerRegistryError';
  }
}

const fail = (message) => {
  throw new SourceHandlerRegistryError(message);
};

function normalizeHandler(handler, index) {
  const at = `source handler #${index}`;
  if (!handler || typeof handler !== 'object') fail(`${at} must be an object`);
  const code = handler.code;
  // Same shape as M1's handlerCode (XX_ZRV_WF_DATA_SOURCES.HANDLER_CODE VARCHAR2(128)).
  if (typeof code !== 'string' || !HANDLER_CODE.test(code)) {
    fail(`${at}: code must match ^[A-Z][A-Z0-9_]*$ (at most 128 characters)`);
  }
  if (typeof handler.name !== 'string' || !handler.name.trim() || handler.name.length > 200) {
    fail(`${code}: name is required (at most 200 characters)`);
  }
  if (handler.contractVersion !== SOURCE_HANDLER_CONTRACT_VERSION) {
    fail(`${code}: contractVersion must be ${SOURCE_HANDLER_CONTRACT_VERSION}`);
  }
  if (!Array.isArray(handler.fields) || !handler.fields.length)
    fail(`${code}: fields are required`);
  const names = new Set();
  const fields = handler.fields.map((field) => {
    if (!isOracleIdentifier(field?.name)) fail(`${code}: field names must be Oracle-style names`);
    if (names.has(field.name)) fail(`${code}: field ${field.name} is declared twice`);
    names.add(field.name);
    if (describeOracleType(field).family === FAMILIES.UNSUPPORTED) {
      fail(`${code}: field ${field.name} has an unsupported type`);
    }
    if (typeof field.nullable !== 'boolean') fail(`${code}: field ${field.name} needs nullable`);
    return Object.freeze({
      name: field.name,
      oracleType: field.oracleType,
      charLength: field.charLength ?? null,
      precision: field.precision ?? null,
      scale: field.scale ?? null,
      nullable: field.nullable,
      identity: null,
    });
  });
  return Object.freeze({
    code,
    name: handler.name,
    description: handler.description ?? null,
    contractVersion: handler.contractVersion,
    fields: Object.freeze(fields),
  });
}

/** Validated, frozen registry; invalid or duplicate handlers fail at startup. */
export function createSourceHandlerRegistry(handlers = []) {
  if (!Array.isArray(handlers)) fail('Source handlers must be an array');
  const byCode = new Map();
  handlers.forEach((handler, index) => {
    const normalized = normalizeHandler(handler, index);
    if (byCode.has(normalized.code)) fail(`Source handler ${normalized.code} is registered twice`);
    byCode.set(normalized.code, normalized);
  });
  const sorted = [...byCode.values()].sort((a, b) => (a.code < b.code ? -1 : 1));
  // M1-compatible descriptor shape: `{ code, name, description }`.
  const descriptors = Object.freeze(
    sorted.map((h) => Object.freeze({ code: h.code, name: h.name, description: h.description })),
  );
  return Object.freeze({
    has: (code) => byCode.has(code),
    contract: (code) => byCode.get(code) ?? null,
    descriptors: () => descriptors,
  });
}
