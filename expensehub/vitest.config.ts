import { defineConfig } from 'vitest/config';

// One `npm test` runs every workspace; each project has its own vitest.config.ts.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
