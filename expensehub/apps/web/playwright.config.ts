import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Smoke tests (TRD §12). First run: `npx playwright install chromium`.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // One dev API serves every worker; beyond 4 the journeys (many sign-ins each) starve it.
  workers: 4,
  reporter: 'list',
  use: { baseURL: 'http://localhost:7386', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    cwd: path.resolve(import.meta.dirname, '..', '..'),
    // Through the Vite proxy: ready only when the web AND the API are up (the API can start
    // slower, e.g. while a previous run still releases its port).
    url: 'http://localhost:7386/api/v1/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
