// All authentication endpoints are supplied by the eventual backend deployment.
// No route name or endpoint is inferred from the purchased HTML template.
const raw = import.meta.env
const paths = Object.freeze({
  session: raw.VITE_AUTH_SESSION_PATH?.trim() || '',
  login: raw.VITE_AUTH_LOGIN_PATH?.trim() || '',
  logout: raw.VITE_AUTH_LOGOUT_PATH?.trim() || '',
  recovery: raw.VITE_AUTH_RECOVERY_PATH?.trim() || '',
})

const validPath = (value) => value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[?#]/.test(value)
const configured = Object.values(paths).every((path) => path && validPath(path))
const baseUrl = raw.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || ''

export const authConfig = Object.freeze({
  configured,
  baseUrl,
  paths,
  // Explicit opt-in for UI development ONLY. The production build can never enable it.
  developmentPreview: Boolean(raw.DEV && raw.VITE_AUTH_DEV_PREVIEW === 'true' && !configured),
})
