// Implements: TRD §5 local accounts — bcrypt (cost 12), reset tokens stored only as hashes.
import { createHash, randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';

export function hashPassword(password: string, cost: number): Promise<string> {
  return hash(password, cost);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

let dummyHash: Promise<string> | undefined;

/** Same work as a real check, so unknown users cannot be told apart by timing. */
export async function burnPasswordCheck(password: string, cost: number): Promise<void> {
  dummyHash ??= hash('not-a-real-password', cost);
  await compare(password, await dummyHash);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** A one-time link token; only its SHA-256 goes to the database. */
export function newResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256(token) };
}

/**
 * Short fingerprint of the stored hash, carried in the session. Changing the password
 * changes it, which signs out every other session.
 */
export function passwordFingerprint(passwordHash: string | null): string {
  return sha256(passwordHash ?? '').slice(0, 16);
}
