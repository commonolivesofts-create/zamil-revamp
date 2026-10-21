// Public frontend configuration only. Nothing in VITE_* is a server secret.
// The backend has no CORS support by design: the API is served on the same origin
// (Vite dev proxy locally, a gateway or reverse proxy when deployed), so the
// default base is the same-origin /api/v1 prefix.
// `import.meta.env` is absent under plain Node, which the native tests use.
const env = import.meta.env ?? {}
const rawBaseUrl = env.VITE_API_BASE_URL?.trim() || '/api/v1'

export const apiConfig = Object.freeze({
  baseUrl: rawBaseUrl === '/' ? '/' : rawBaseUrl.replace(/\/+$/, ''),
  timeoutMs: 15000,
})
