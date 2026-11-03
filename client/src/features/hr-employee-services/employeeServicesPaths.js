// Route paths of the HR employee services screens (see the registry module
// hrEmployeeServices.module.js and the router).
export const ES_PATHS = Object.freeze({
  recordChange: '/hr/employee-services/record-change',
  recordChangeRequests: '/hr/employee-services/record-change/requests',
  transfer: '/hr/employee-services/transfer',
  transferReport: '/hr/employee-services/transfer/report',
  appraisal: '/hr/performance/appraisal',
})

// Reward Nomination (1113), Share an Idea (1097) and Sick Leave (1076): the
// form, its report and (with an id) one record (hrForms.module.js).
export const FORM_PATHS = Object.freeze({
  reward: '/hr/employee-services/reward-nomination',
  rewardReport: '/hr/employee-services/reward-nomination/report',
  idea: '/hr/employee-services/ideas',
  ideaReport: '/hr/employee-services/ideas/report',
  sickLeave: '/hr/employee-services/sick-leave',
  sickLeaveReport: '/hr/employee-services/sick-leave/report',
})
