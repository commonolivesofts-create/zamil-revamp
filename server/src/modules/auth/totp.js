import { createHmac, timingSafeEqual } from 'node:crypto';
import { MFA_POLICY } from './auth.policy.js';

// RFC 4648 base32 (no padding), the secret encoding used by authenticator apps.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** RFC 4226 HOTP value for one counter (time step), zero-padded to `digits`. */
export function hotp(secret, counter, digits = MFA_POLICY.digits) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(MFA_POLICY.algorithm.toLowerCase(), secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** TOTP time step for an instant (milliseconds since the epoch). */
export const timeStep = (nowMs) => Math.floor(nowMs / 1000 / MFA_POLICY.periodSeconds);

const codesEqual = (a, b) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a submitted code against the steps within the allowed drift of `nowMs`.
 *
 * @param {Buffer} secret
 * @param {string} code six digits (validated by Joi)
 * @param {number} nowMs database clock
 * @param {number | null} lastUsedStep XX_ZRV_USERS.MFA_LAST_USED_STEP
 * @returns {{ status: 'MATCH', step: number } | { status: 'REPLAY' | 'INVALID' }}
 */
export function verifyTotp(secret, code, nowMs, lastUsedStep) {
  const current = timeStep(nowMs);
  let replay = false;
  let accepted = null;

  // Every candidate is computed, so timing does not reveal which step matched.
  for (
    let drift = -MFA_POLICY.allowedDriftSteps;
    drift <= MFA_POLICY.allowedDriftSteps;
    drift += 1
  ) {
    const step = current + drift;
    if (!codesEqual(hotp(secret, step), code)) continue;
    if (lastUsedStep !== null && step <= lastUsedStep) replay = true;
    else accepted = Math.max(accepted ?? step, step);
  }

  if (accepted !== null) return { status: 'MATCH', step: accepted };
  return { status: replay ? 'REPLAY' : 'INVALID' };
}

/** otpauth:// provisioning URI (Key Uri Format) for authenticator apps. */
export function otpauthUri({ issuer, accountName, secret }) {
  // Issuer and account name are encoded separately around a literal colon, so authenticator apps
  // can tell them apart (an encoded %3A is shown by some apps as part of the account name).
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: MFA_POLICY.algorithm,
    digits: String(MFA_POLICY.digits),
    period: String(MFA_POLICY.periodSeconds),
  });
  return `otpauth://totp/${label}?${params}`;
}
