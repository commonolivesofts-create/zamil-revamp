// Route paths of the HR employee services screens (see the registry module
// hrEmployeeServices.module.js and the router).
export const ES_PATHS = Object.freeze({
  recordChange: '/hr/employee-services/record-change',
  recordChangeRequests: '/hr/employee-services/record-change/requests',
  transfer: '/hr/talent-management/transfer',
  transferReport: '/hr/talent-management/transfer/report',
  appraisal: '/hr/performance/appraisal',
  appraisalReport: '/hr/performance/appraisal/report',
})

// Reward Nomination (1113), Share an Idea (1097) and Sick Leave (1076): the
// form, its report and (with an id) one record (hrForms.module.js).
export const FORM_PATHS = Object.freeze({
  reward: '/hr/talent-management/reward-nomination',
  rewardReport: '/hr/talent-management/reward-nomination/report',
  idea: '/hr/employee-services/ideas',
  ideaReport: '/hr/employee-services/ideas/report',
  sickLeave: '/hr/employee-services/sick-leave',
  sickLeaveReport: '/hr/employee-services/sick-leave/report',
})

// Employee Clearance (1063): the form, its report and (with an id) one record
// (hrForms.module.js).
export const CLEARANCE_PATHS = Object.freeze({
  form: '/hr/talent-management/clearance',
  report: '/hr/talent-management/clearance/report',
})

// Project Charter (ZPI.IMS.FM.13): the form, its report and (with an id) one
// record; the Survey report (graphical) and its responses (textual). Both in
// hrForms.module.js.
export const CHARTER_PATHS = Object.freeze({
  form: '/hr/talent-management/project-charter',
  report: '/hr/talent-management/project-charter/report',
})
export const SURVEY_PATHS = Object.freeze({
  report: '/hr/reports/survey',
  responses: '/hr/reports/survey/responses',
})

// Salary Certificate (English and Arabic in one form): the form, its report and
// (with a language-prefixed id, e.g. "en-12") one record (hrForms.module.js).
export const SALARY_CERTIFICATE_PATHS = Object.freeze({
  form: '/hr/talent-management/salary-certificate',
  report: '/hr/talent-management/salary-certificate/report',
})

export const BUSINESS_VISA_PATHS = Object.freeze({
  form: '/hr/letters/business-visa',
  report: '/hr/letters/business-visa/report',
})

// Sidebar: Human resources → Letters.
export const LETTERS_BREADCRUMB = Object.freeze(['Human resources', 'Letters'])

export const WARNING_LETTER_PATHS = Object.freeze({
  form: '/hr/letters/warning-letter',
  report: '/hr/letters/warning-letter/report',
})

export const TOURIST_VISA_PATHS = Object.freeze({
  form: '/hr/letters/tourist-visa',
  report: '/hr/letters/tourist-visa/report',
})

export const BUSINESS_VISA_LETTER_PATHS = Object.freeze({
  form: '/hr/letters/business-visa-letter',
  report: '/hr/letters/business-visa-letter/report',
})
