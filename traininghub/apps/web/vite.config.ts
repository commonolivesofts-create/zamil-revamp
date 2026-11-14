import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vite';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
// Ports come from the shared root .env (parsed by hand so NODE_ENV there cannot leak into the build).
const env: Record<string, string | undefined> = existsSync(path.join(repoRoot, '.env'))
  ? parseEnv(readFileSync(path.join(repoRoot, '.env'), 'utf8'))
  : {};
const apiPort = Number(env.API_PORT || 7383);
const webPort = Number(env.WEB_PORT || 7384);
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
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
          if (/[\\/]lucide-react[\\/]/.test(id)) return 'icons';
          return 'vendor';
        },
      },
    },
  },
});
