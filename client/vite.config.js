import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Same-origin development API: the browser only talks to the Vite origin.
// changeOrigin stays false so the backend sees the browser's Host and its
// Origin check (Origin must equal the API's own origin) passes without CORS or
// an allowlist entry. Use http://localhost, where browsers accept the backend's
// Secure __Host- cookies.
// The target is the backend's development listener address (HTTP_HOST defaults
// to 127.0.0.1). `localhost` resolves to ::1 first on Windows, so the proxy
// would depend on the IPv6-to-IPv4 connection fallback for every request.
export const apiProxy = Object.freeze({
  '/api': {
    target:
      process.env.APP_ENV?.trim().toLowerCase() === 'test'
        ? 'http://127.0.0.1:7381'
        : 'http://127.0.0.1:3000',
    changeOrigin: false,
  },
})

// TrainingHub's API for the Talent Management dashboard, on this origin so the
// browser sends the Zamil session TrainingHub signs in from (POST /auth/sso).
// Read-only: only GET and that sign-in reach TrainingHub; anything else is a
// 404 here. A deployed gateway must forward /training-hub-api/* to
// TrainingHub's /api/v1/* the same way (see hr-talent-management/README.md).
export const TRAINING_HUB_PROXY_PATH = '/training-hub-api'
export function trainingHubProxy(target = 'http://127.0.0.1:7383') {
  return {
    [TRAINING_HUB_PROXY_PATH]: {
      target,
      changeOrigin: false,
      rewrite: (path) => path.replace(/^\/training-hub-api/, '/api/v1'),
      bypass: (req) =>
        req.method === 'GET' ||
        (req.method === 'POST' && req.url?.split('?')[0] === `${TRAINING_HUB_PROXY_PATH}/auth/sso`)
          ? undefined
          : false,
    },
  }
}

// The development origin is http://localhost:7382 (the backend's
// AUTH_FRONTEND_BASE_URL e-mail links point here). strictPort fails instead of
// silently moving to another port, which would break those links.
export const DEV_PORT = 7382

export function resolveAppEnv({ processEnv, clientEnv, serverEnv }) {
  return String(
    processEnv.APP_ENV ??
      processEnv.app_env ??
      clientEnv.APP_ENV ??
      clientEnv.app_env ??
      serverEnv.APP_ENV ??
      serverEnv.app_env ??
      'development',
  )
    .trim()
    .toLowerCase()
}

function configureEnvironment(config, { mode }) {
  const env = loadEnv(mode, process.cwd(), '')
  const serverEnv = loadEnv(mode, fileURLToPath(new URL('../server', import.meta.url)), '')
  const appEnv = resolveAppEnv({ processEnv: process.env, clientEnv: env, serverEnv })
  // TRAINING_HUB_API_ORIGIN (client/.env, not exposed to the browser) overrides
  // where TrainingHub's API listens; it defaults to its local port 7383.
  const hubProxy = trainingHubProxy(
    process.env.TRAINING_HUB_API_ORIGIN?.trim() ||
      env.TRAINING_HUB_API_ORIGIN?.trim() ||
      'http://127.0.0.1:7383',
  )
  config.server.proxy = { ...config.server.proxy, ...hubProxy }
  config.preview.proxy = { ...config.preview.proxy, ...hubProxy }
  if (appEnv === 'test') {
    config.server.host = '0.0.0.0'
    config.server.port = 7382
    config.server.proxy = {
      '/api': { target: 'http://127.0.0.1:7381', changeOrigin: false },
      ...hubProxy,
    }
    config.preview.host = '0.0.0.0'
    config.preview.port = 7382
    config.preview.proxy = {
      '/api': { target: 'http://127.0.0.1:7381', changeOrigin: false },
      ...hubProxy,
    }
  } else if (appEnv === 'development') {
    config.server.host = '127.0.0.1'
    config.server.port = 7382
    config.server.proxy = {
      '/api': { target: 'http://127.0.0.1:7381', changeOrigin: false },
      ...hubProxy,
    }
    config.preview.host = '127.0.0.1'
    config.preview.port = 7382
    config.preview.proxy = {
      '/api': { target: 'http://127.0.0.1:7381', changeOrigin: false },
      ...hubProxy,
    }
  } else if (appEnv === '') {
    config.server.host = '127.0.0.1'
    config.server.port = 5199
    config.preview.host = '127.0.0.1'
    config.preview.port = 5199
  }
  return config
}

export default defineConfig((context) =>
  configureEnvironment(
    {
      plugins: [react()],
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
      },
      server: {
        port: DEV_PORT,
        strictPort: true,
        proxy: apiProxy,
      },
      // `npm run preview` serves the production build with the same same-origin API.
      preview: {
        port: DEV_PORT,
        strictPort: true,
        proxy: apiProxy,
      },
    },
    context,
  ),
)
