// Transfer and performance appraisal use the in-memory adapter while those
// backends are pending. Personal Status Change uses its live API regardless
// of this switch. `import.meta.env` is absent under plain Node.
const env = import.meta.env ?? {}

export function resolveEmployeeServicesDemoMode(values = {}) {
  if (values.VITE_HR_EMPLOYEE_SERVICES_DEMO === 'true') return true
  if (values.VITE_HR_EMPLOYEE_SERVICES_DEMO === 'false') return false
  return values.DEV === true
}

export const hrEmployeeServicesConfig = Object.freeze({
  demo: resolveEmployeeServicesDemoMode(env),
})
