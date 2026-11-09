import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));

export const APP_VERSION: string = (
  JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
).version;
