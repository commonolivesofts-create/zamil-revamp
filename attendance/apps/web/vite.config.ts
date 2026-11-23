import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vite';

const appRoot = path.resolve(import.meta.dirname, '..', '..');
/** The main Zamil client: its stylesheets are imported directly (single source of truth). */
const zamilClientSrc = path.resolve(appRoot, '..', 'client', 'src');

/**
 * Ports come from the attendance .env. Parsed by hand on purpose: Vite's loadEnv() would also
 * pick up NODE_ENV and turn a production build into a dev build. Nothing from .env reaches the
 * browser bundle except VITE_ZAMIL_LOGIN_URL.
 */
function rootEnv(): Record<string, string | undefined> {
  const file = path.join(appRoot, '.env');
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
}

const env = rootEnv();
const apiPort = Number(env.API_PORT || 7387);
const webPort = Number(env.WEB_PORT || 7388);
const appEnv = (process.env.APP_ENV ?? env.APP_ENV ?? 'development').trim().toLowerCase();
const host = appEnv === 'test' ? '0.0.0.0' : '127.0.0.1';
const proxy = { '/api': { target: `http://127.0.0.1:${apiPort}` } };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@zamil': zamilClientSrc,
    },
  },
  define: {
    'import.meta.env.VITE_ZAMIL_LOGIN_URL': JSON.stringify(
      process.env.VITE_ZAMIL_LOGIN_URL ?? env.VITE_ZAMIL_LOGIN_URL ?? '',
    ),
  },
  server: {
    host,
    port: webPort,
    strictPort: true,
    proxy,
    fs: { allow: [appRoot, zamilClientSrc] },
  },
  preview: { host, port: webPort, strictPort: true, proxy },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
          if (/[\\/](@tanstack|zod)[\\/]/.test(id)) return 'data';
          return undefined;
        },
      },
    },
  },
});
