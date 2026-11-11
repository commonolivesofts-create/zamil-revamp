import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vite';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

/**
 * Ports come from the shared root .env. Parsed by hand on purpose: Vite's loadEnv() would also
 * pick up NODE_ENV=development from that file and turn a production build into a dev build.
 * Nothing from .env reaches the browser bundle.
 */
function rootEnv(): Record<string, string | undefined> {
  const file = path.join(repoRoot, '.env');
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
}

const env = rootEnv();
const apiPort = Number(env.API_PORT || 7385);
const webPort = Number(env.WEB_PORT || 7386);
const appEnv = (process.env.APP_ENV ?? env.APP_ENV ?? 'development').trim().toLowerCase();
const host = appEnv === 'test' ? '0.0.0.0' : '127.0.0.1';
const proxy = { '/api': { target: `http://127.0.0.1:${apiPort}` } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_ZAMIL_LOGIN_URL': JSON.stringify(
      process.env.VITE_ZAMIL_LOGIN_URL ?? env.VITE_ZAMIL_LOGIN_URL ?? '',
    ),
  },
  server: { host, port: webPort, strictPort: true, proxy },
  preview: { host, port: webPort, strictPort: true, proxy },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: app releases don't invalidate the browser cache for these.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
          if (/[\\/](@radix-ui|cmdk|sonner)[\\/]/.test(id)) return 'ui';
          if (/[\\/](@tanstack|zod|react-hook-form|@hookform|i18next|react-i18next)[\\/]/.test(id))
            return 'data';
          if (/[\\/]lucide-react[\\/]/.test(id)) return 'icons';
          return 'vendor';
        },
      },
    },
  },
});
