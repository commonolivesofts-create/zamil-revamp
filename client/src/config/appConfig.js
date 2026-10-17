// Only public frontend configuration belongs here. Never store API secrets in VITE_* values.
export const appConfig = Object.freeze({
  name: import.meta.env.VITE_APP_NAME?.trim() || 'Zamil Revamp',
})
