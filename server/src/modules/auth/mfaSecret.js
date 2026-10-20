import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { MFA_POLICY } from './auth.policy.js';

/*
 * Protection of TOTP secrets with a key held outside Oracle (AUTH_MFA_ENCRYPTION_KEY).
 *
 * Independent keys are derived from the configured master key with HKDF-SHA256 (a third, for
 * authenticator replacement candidates, is described at replacementSecret):
 *   - an AES-256-GCM key for XX_ZRV_USERS.MFA_TOTP_SECRET_ENCRYPTED, with the USER_ID as
 *     additional authenticated data, so a ciphertext copied to another account does not decrypt;
 *   - an HMAC key that derives the candidate secret of a pending enrollment from the user and the
 *     MFA challenge row. The locked schema cannot persist an unconfirmed secret (CK_ZRV_USERS_MFA),
 *     so the candidate is re-derived on confirmation instead of being stored or sent back.
 *
 * Stored format (≈ 90 characters, within VARCHAR2(1024)): v1.<keyId>.<iv>.<ciphertext>.<tag>
 */
const FORMAT_VERSION = 'v1';
const HKDF_SALT = 'zamil-revamp-mfa';

const b64 = (buffer) => buffer.toString('base64url');

export class MfaSecretUnreadable extends Error {}

export function createMfaKeyring({ encryptionKey, keyId }) {
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) {
    throw new Error('MFA encryption key must be 32 bytes');
  }
  const derive = (info) => Buffer.from(hkdfSync('sha256', encryptionKey, HKDF_SALT, info, 32));
  const encryptionSubkey = derive('zr-totp-secret-encryption-v1');
  const enrollmentSubkey = derive('zr-totp-enrollment-derivation-v1');
  const replacementSubkey = derive('zr-totp-replacement-derivation-v1');
  const aad = (userId) => Buffer.from(`zr-totp-secret|${FORMAT_VERSION}|${userId}`);

  return {
    /** Encrypts a TOTP secret for one account. */
    encrypt(userId, secret) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encryptionSubkey, iv);
      cipher.setAAD(aad(userId));
      const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
      return [FORMAT_VERSION, keyId, b64(iv), b64(ciphertext), b64(cipher.getAuthTag())].join('.');
    },

    /** Decrypts a stored secret; throws MfaSecretUnreadable on any format, key or integrity error. */
    decrypt(userId, stored) {
      const parts = typeof stored === 'string' ? stored.split('.') : [];
      if (parts.length !== 5 || parts[0] !== FORMAT_VERSION || parts[1] !== keyId) {
        throw new MfaSecretUnreadable('Unsupported MFA secret format or key');
      }
      try {
        const [, , iv, ciphertext, tag] = parts.map((part) => Buffer.from(part, 'base64url'));
        const decipher = createDecipheriv('aes-256-gcm', encryptionSubkey, iv);
        decipher.setAAD(aad(userId));
        decipher.setAuthTag(tag);
        const secret = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        if (secret.length !== MFA_POLICY.secretBytes) throw new Error('Unexpected secret length');
        return secret;
      } catch {
        throw new MfaSecretUnreadable('MFA secret could not be decrypted');
      }
    },

    /** Candidate secret for an enrollment within one MFA challenge (deterministic per challenge). */
    enrollmentSecret(userId, challengeSessionId) {
      return createHmac('sha256', enrollmentSubkey)
        .update(`zr-totp-enrollment|${userId}|${challengeSessionId}`)
        .digest()
        .subarray(0, MFA_POLICY.secretBytes);
    },

    /**
     * Candidate secret for replacing the enrolled authenticator, derived under a separate HKDF
     * purpose from enrollment. Bound to the user, the MFA-verified session and the currently stored
     * ciphertext, so it changes with every new sign-in and after any change of the stored secret.
     */
    replacementSecret(userId, sessionId, currentEncryptedSecret) {
      const current = createHash('sha256').update(String(currentEncryptedSecret)).digest('hex');
      return createHmac('sha256', replacementSubkey)
        .update(`zr-totp-replacement|${userId}|${sessionId}|${current}`)
        .digest()
        .subarray(0, MFA_POLICY.secretBytes);
    },
  };
}
