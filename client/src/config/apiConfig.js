// Public frontend configuration only. Nothing in VITE_* is a server secret.
// Keep the configured backend base path independent from authentication route names.
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || ''

export const apiConfig = Object.freeze({
  baseUrl: rawBaseUrl.replace(/\/+$/, ''),
  configured: Boolean(rawBaseUrl),
  timeoutMs: 15000,
})
