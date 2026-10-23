// Resolves registry external destinations for the browser. The registry holds
// either a literal https URL or { env: 'VITE_EXTERNAL_<NAME>' }; the variable
// is a public build-time value (compiled into the bundle), so it must never
// contain a secret, token or credential. An unresolved or invalid destination
// resolves to null and its entry is hidden (never listed or searchable).
import { validateExternalUrl } from './registry/defineModule.js'

// `import.meta.env` is absent under plain Node, which the native tests use.
const buildEnv = import.meta.env ?? {}

export function resolveExternalHref(href, env = buildEnv) {
  const value = typeof href === 'string' ? href : env?.[href?.env]
  return validateExternalUrl(typeof value === 'string' ? value.trim() : value)
}

// New-tab behaviour for every external destination: no opener access to this
// application and no referrer.
export const EXTERNAL_LINK_TARGET = '_blank'
export const EXTERNAL_LINK_REL = 'noopener noreferrer'
export const EXTERNAL_WINDOW_FEATURES = 'noopener,noreferrer'
