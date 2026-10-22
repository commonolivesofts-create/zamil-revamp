// Only public frontend configuration belongs here. Never store API secrets in VITE_* values.
// `import.meta.env` is absent under plain Node, which the native tests use.
const env = import.meta.env ?? {}

// Official product identity (owner decision, release V 2.1.0). The machine-readable version is kept
// equal to package.json `version` (checked by tests/branding.test.mjs). Show `displayVersion` only
// in the approved low-emphasis places (login footer, sidebar footer), never appended to the name.
// Technical identifiers (repository `zamil-revamp`, cookies, API paths) are not product branding.
const APP_VERSION = '2.1.0'

export const appConfig = Object.freeze({
  name: env.VITE_APP_NAME?.trim() || 'Zamil Digitalization',
  version: APP_VERSION,
  displayVersion: `V ${APP_VERSION}`,
})
