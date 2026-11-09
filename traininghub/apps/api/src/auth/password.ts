import { createHash } from 'node:crypto';
import { compare, hash } from 'bcryptjs';

export const hashPassword = (password: string, cost: number) => hash(password, cost);
export const verifyPassword = (password: string, passwordHash: string) => compare(password, passwordHash);

let dummy: Promise<string> | undefined;
/** Same work as a real check, so unknown users cannot be told apart by timing. */
export async function burnPasswordCheck(password: string, cost: number) {
  dummy ??= hash('not-a-real-password', cost);
  await compare(password, await dummy);
}
/** Short fingerprint of the stored hash, carried in the session: a new password signs out other sessions. */
export const passwordFingerprint = (passwordHash: string | null) =>
  createHash('sha256')
    .update(passwordHash ?? 'none')
    .digest('hex')
    .slice(0, 16);
