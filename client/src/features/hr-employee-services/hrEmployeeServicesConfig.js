// HR employee services data source. `VITE_HR_EMPLOYEE_SERVICES_DEMO=true`
// selects the in-memory demo adapter (features/hr-employee-services/demo/),
// `false` the shared API client. Unset, development builds use the demo
// adapter and production builds use the API: the owner approved demo data for
// these screens until their backend exists. It is separate from
// VITE_HR_RECRUITMENT_DEMO, so switching recruitment to its real API never
// points these screens at endpoints that do not exist yet. Remove this flag
// together with the demo folder. `import.meta.env` is absent under plain Node.
const env = import.meta.env ?? {}

export function resolveEmployeeServicesDemoMode(values = {}) {
  if (values.VITE_HR_EMPLOYEE_SERVICES_DEMO === 'true') return true
  if (values.VITE_HR_EMPLOYEE_SERVICES_DEMO === 'false') return false
  return values.DEV === true
}

export const hrEmployeeServicesConfig = Object.freeze({
  demo: resolveEmployeeServicesDemoMode(env),
})
