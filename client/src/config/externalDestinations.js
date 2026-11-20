// Resolves registry external destinations for the browser. The registry holds
// either a literal https URL (or loopback http for local development) or
// { env: 'VITE_EXTERNAL_<NAME>', path? }; `path` opens a page under that base
// URL (joined relatively, so a base such as https://host/hub/ keeps /hub). The variable
// is a public build-time value (compiled into the bundle), so it must never
// contain a secret, token or credential. An unresolved or invalid destination
// resolves to null and its entry is hidden (never listed or searchable).
import { validateExternalUrl } from './registry/defineModule.js'

// `import.meta.env` is absent under plain Node, which the native tests use.
const buildEnv = import.meta.env ?? {}
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function resolveExternalHref(href, env = buildEnv) {
  const value = typeof href === 'string' ? href : env?.[href?.env]
  let approved = validateExternalUrl(typeof value === 'string' ? value.trim() : value)
  if (approved && href?.path) {
    const base = new URL(approved)
    if (!base.pathname.endsWith('/')) base.pathname += '/'
    base.search = ''
    base.hash = ''
    approved = validateExternalUrl(new URL(href.path.slice(1), base).href)
  }
  if (!approved || typeof window === 'undefined') return approved

  // Local hub destinations use loopback URLs in configuration so they remain
  // safe to validate. When Zamil is opened by LAN IP/hostname, reuse that host
  // for the sibling app links instead of sending the user to their own device.
  const destination = new URL(approved)
  const currentHost = window.location.hostname
  if (
    LOOPBACK_HOSTS.has(destination.hostname.toLowerCase()) &&
    !LOOPBACK_HOSTS.has(currentHost.toLowerCase())
  ) {
    destination.hostname = currentHost
  }
  return destination.href
}

// New-tab behaviour for every external destination: no opener access to this
// application and no referrer.
export const EXTERNAL_LINK_TARGET = '_blank'
export const EXTERNAL_LINK_REL = 'noopener noreferrer'
export const EXTERNAL_WINDOW_FEATURES = 'noopener,noreferrer'
