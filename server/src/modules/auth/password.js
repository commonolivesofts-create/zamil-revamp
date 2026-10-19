import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ARGON2_POLICY, PASSWORD_POLICY } from './auth.policy.js';

const argon2Async = promisify(argon2);

/*
 * Argon2id hashes are stored in the standard PHC string format used by the reference
 * implementation, the `argon2` npm package and PHP password_hash():
 *
 *   $argon2id$v=19$m=<KiB>,t=<passes>,p=<lanes>$<salt>$<hash>
 *
 * salt and hash are standard Base64 without padding. Node's built-in crypto.argon2 produces only
 * the raw tag, so encoding and parsing live here. The format is at most ~100 characters, within
 * XX_ZRV_USERS.PASSWORD_HASH VARCHAR2(255 CHAR).
 */

const ARGON2_VERSION = 19;

// Stored parameters drive verification cost, so they are bounded to prevent a malformed or
// hostile hash from exhausting memory or CPU. Values outside these bounds fail closed.
const VERIFY_LIMITS = Object.freeze({
  memoryKiB: { min: 8, max: 262144 },
  passes: { min: 1, max: 16 },
  parallelism: { min: 1, max: 16 },
  saltBytes: { min: 8, max: 64 },
  hashBytes: { min: 16, max: 64 },
});

const PHC_PATTERN =
  /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const encodeB64 = (buffer) => buffer.toString('base64').replace(/=+$/, '');

function within(value, { min, max }) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Parses a stored PHC string; returns `null` for anything that is not a supported Argon2id hash. */
export function parseArgon2idHash(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 255) return null;

  const match = PHC_PATTERN.exec(encoded);
  if (!match) return null;

  const [, version, memory, passes, parallelism, saltB64, hashB64] = match;
  const parsed = {
    version: Number(version),
    memoryKiB: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    salt: Buffer.from(saltB64, 'base64'),
    hash: Buffer.from(hashB64, 'base64'),
  };

  if (parsed.version !== ARGON2_VERSION) return null;
  if (!within(parsed.memoryKiB, VERIFY_LIMITS.memoryKiB)) return null;
  if (!within(parsed.passes, VERIFY_LIMITS.passes)) return null;
  if (!within(parsed.parallelism, VERIFY_LIMITS.parallelism)) return null;
  if (!within(parsed.salt.length, VERIFY_LIMITS.saltBytes)) return null;
  if (!within(parsed.hash.length, VERIFY_LIMITS.hashBytes)) return null;
  // Argon2 requires at least 8 KiB of memory per lane.
  if (parsed.memoryKiB < 8 * parsed.parallelism) return null;

  return parsed;
}

function derive(password, { salt, memoryKiB, passes, parallelism, tagLength }) {
  return argon2Async('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    memory: memoryKiB,
    passes,
    parallelism,
    tagLength,
  });
}

/** True when the cost meets the approved minimum (Decision 05); stronger values are allowed. */
export function meetsMinimumCost({ memoryKiB, passes, parallelism, salt, hash }) {
  return (
    memoryKiB >= ARGON2_POLICY.minMemoryKiB &&
    passes >= ARGON2_POLICY.minPasses &&
    parallelism >= ARGON2_POLICY.minParallelism &&
    (salt === undefined || salt.length >= ARGON2_POLICY.saltBytes) &&
    (hash === undefined || hash.length >= ARGON2_POLICY.hashBytes)
  );
}

/**
 * Creates an Argon2id PHC hash with a fresh 16-byte random salt and a 32-byte tag, refusing any
 * cost below the approved minimum. Future callers that replace a stored hash (password setup,
 * change, reset or rehash) must never use a lower cost than the existing hash, and must set
 * PASSWORD_CHANGED_AT whenever the password itself changes.
 *
 * @param {string} password
 * @param {{ memoryKiB: number, passes: number, parallelism: number }} cost
 */
export async function hashPassword(password, cost) {
  if (!meetsMinimumCost(cost)) throw new Error('Argon2id cost is below the approved minimum');

  const salt = randomBytes(ARGON2_POLICY.saltBytes);
  const hash = await derive(password, { ...cost, salt, tagLength: ARGON2_POLICY.hashBytes });

  return (
    `$argon2id$v=${ARGON2_VERSION}$m=${cost.memoryKiB},t=${cost.passes},p=${cost.parallelism}` +
    `$${encodeB64(salt)}$${encodeB64(hash)}`
  );
}

/**
 * Verifies a password against a stored hash.
 *
 * @returns {Promise<'MATCH' | 'MISMATCH' | 'UNREADABLE' | 'BELOW_MINIMUM'>} `UNREADABLE` means the
 *   stored value is not a supported Argon2id hash; `BELOW_MINIMUM` means it is weaker than the
 *   approved minimum. Both are failed authentications and the password is not checked.
 */
export async function verifyPassword(password, encoded) {
  const parsed = parseArgon2idHash(encoded);
  if (!parsed) return 'UNREADABLE';
  if (!meetsMinimumCost(parsed)) return 'BELOW_MINIMUM';

  const candidate = await derive(password, { ...parsed, tagLength: parsed.hash.length });
  return timingSafeEqual(candidate, parsed.hash) ? 'MATCH' : 'MISMATCH';
}

const UPPERCASE = /\p{Lu}/u;
const LOWERCASE = /\p{Ll}/u;
const DIGIT = /\p{Nd}/u;
// Anything that is not a letter or number, including spaces and punctuation.
const SPECIAL = /[^\p{L}\p{N}]/u;

/**
 * Checks a new password against the locked complexity policy. Returns the list of unmet rule
 * codes (empty when compliant). Lengths are counted in Unicode code points.
 */
export function checkPasswordPolicy(password) {
  const failures = [];
  const length = typeof password === 'string' ? [...password].length : 0;

  if (length < PASSWORD_POLICY.minLength) failures.push('MIN_LENGTH');
  if (length > PASSWORD_POLICY.maxLength) failures.push('MAX_LENGTH');
  if (!UPPERCASE.test(password ?? '')) failures.push('UPPERCASE');
  if (!LOWERCASE.test(password ?? '')) failures.push('LOWERCASE');
  if (!DIGIT.test(password ?? '')) failures.push('DIGIT');
  if (!SPECIAL.test(password ?? '')) failures.push('SPECIAL_CHARACTER');

  return failures;
}
