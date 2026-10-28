// HR recruitment data source. `VITE_HR_RECRUITMENT_DEMO=true` selects the
// in-memory demo adapter (features/hr-recruitment/demo/), `false` the shared
// API client. Unset, development builds use the demo adapter and production
// builds use the API: the owner approved demo data for this feature until its
// backend exists. Remove this flag together with the demo folder.
// `import.meta.env` is absent under plain Node, which the native tests use.
const env = import.meta.env ?? {}

export function resolveDemoMode(values = {}) {
  if (values.VITE_HR_RECRUITMENT_DEMO === 'true') return true
  if (values.VITE_HR_RECRUITMENT_DEMO === 'false') return false
  return values.DEV === true
}

export const hrRecruitmentConfig = Object.freeze({
  demo: resolveDemoMode(env),
})
