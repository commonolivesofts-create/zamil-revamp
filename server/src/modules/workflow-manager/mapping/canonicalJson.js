import { createHash } from 'node:crypto';
import { compareCodePoints } from './findings.js';

/*
 * Canonical JSON — the single serialization behind every Workflow Manager fingerprint
 * (CONFIG_SHA256 of source/form versions, and later workflow versions and record keys).
 *
 *   - UTF-8; object keys sorted by Unicode code point; no insignificant whitespace.
 *   - Values: null, booleans, well-formed strings (kept exactly as given), arrays and plain objects.
 *   - Numbers: safe integers only. Decimals and large integers must travel as strings so no value
 *     ever passes through floating point; -0, NaN, Infinity and unsafe integers are rejected.
 *   - undefined, functions, symbols, bigint, Dates, Maps, class instances, sparse arrays and lone
 *     surrogates are REJECTED, never silently dropped or coerced.
 * The output is valid for Oracle `IS JSON STRICT WITH UNIQUE KEYS`. Hashes are computed only here,
 * on the server; a client-supplied fingerprint is never trusted.
 */
export const MAX_DEPTH = 64;

export class CanonicalJsonError extends Error {
  constructor(path, reason) {
    super(`Value at ${path} cannot be canonicalized: ${reason}`);
    this.name = 'CanonicalJsonError';
    this.code = 'CANONICAL_JSON_INVALID';
    this.path = path;
    this.reason = reason;
  }
}

const isPlainObject = (value) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

function serialize(value, path, depth) {
  if (depth > MAX_DEPTH) throw new CanonicalJsonError(path, `nesting deeper than ${MAX_DEPTH}`);
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      if (!value.isWellFormed()) throw new CanonicalJsonError(path, 'string is not well-formed');
      return JSON.stringify(value);
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new CanonicalJsonError(
          path,
          'only safe integers are allowed; send decimals as strings',
        );
      }
      if (Object.is(value, -0)) throw new CanonicalJsonError(path, 'negative zero is not allowed');
      return String(value);
    case 'object':
      break;
    default:
      throw new CanonicalJsonError(path, `type ${typeof value} is not allowed`);
  }
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i += 1) {
      if (!Object.hasOwn(value, i)) throw new CanonicalJsonError(`${path}[${i}]`, 'sparse array');
      parts.push(serialize(value[i], `${path}[${i}]`, depth + 1));
    }
    return `[${parts.join(',')}]`;
  }
  if (!isPlainObject(value)) throw new CanonicalJsonError(path, 'only plain objects are allowed');
  if (Object.getOwnPropertySymbols(value).length) {
    throw new CanonicalJsonError(path, 'symbol keys are not allowed');
  }
  const keys = Object.keys(value).sort(compareCodePoints);
  const parts = keys.map((key) => {
    if (!key.isWellFormed()) throw new CanonicalJsonError(path, 'property name is not well-formed');
    return `${JSON.stringify(key)}:${serialize(value[key], `${path}.${key}`, depth + 1)}`;
  });
  return `{${parts.join(',')}}`;
}

/** Canonical JSON text of a value; throws CanonicalJsonError for anything not allowed. */
export function canonicalize(value) {
  return serialize(value, '$', 0);
}

export const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** `{ json, sha256, bytes }` of a value — the stored payload and its server-side fingerprint. */
export function fingerprint(value) {
  const json = canonicalize(value);
  return Object.freeze({ json, sha256: sha256Hex(json), bytes: Buffer.byteLength(json, 'utf8') });
}
