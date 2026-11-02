// Data source of Reward Nomination (1113), Share an Idea (1097) and Sick Leave
// (1076). Each form has its own demo switch, separate from its visibility
// switch (VITE_FEATURE_HR_REWARD_NOMINATION / _IDEAS / _SICK_LEAVE in the
// registry). Their backends exist, so the API is the default: the in-memory
// demo adapter is used only when the form's switch is 'true' in a development
// build. A production build always uses the API. `import.meta.env` is absent
// under plain Node, which the native tests use.
const env = import.meta.env ?? {}

export const FORM_DEMO_SWITCHES = Object.freeze({
  reward: 'VITE_HR_REWARD_NOMINATION_DEMO',
  idea: 'VITE_HR_IDEAS_DEMO',
  sickLeave: 'VITE_HR_SICK_LEAVE_DEMO',
})

export function resolveFormDemo(name, values = {}) {
  return values[FORM_DEMO_SWITCHES[name]] === 'true' && values.DEV === true
}

export const employeeServicesFormsConfig = Object.freeze({
  demo: Object.freeze(Object.fromEntries(Object.keys(FORM_DEMO_SWITCHES).map((name) => [name, resolveFormDemo(name, env)]))),
})
