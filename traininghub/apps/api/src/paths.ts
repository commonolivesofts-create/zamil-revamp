import path from 'node:path';

/** Repository root (traininghub/). Relative paths in .env resolve against it. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
export const fromRepoRoot = (p: string) => path.resolve(REPO_ROOT, p);
