import path from 'node:path';

/** Repository root (expensehub/). Relative paths in .env resolve against it. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

export function fromRepoRoot(relativeOrAbsolute: string): string {
  return path.resolve(REPO_ROOT, relativeOrAbsolute);
}
