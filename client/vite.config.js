import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Same-origin development API: the browser only talks to the Vite origin.
// changeOrigin stays false so the backend sees the browser's Host and its
// Origin check (Origin must equal the API's own origin) passes without CORS or
// an allowlist entry. Use http://localhost, where browsers accept the backend's
// Secure __Host- cookies.
export const apiProxy = Object.freeze({
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: false,
  },
})

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: apiProxy,
  },
})
