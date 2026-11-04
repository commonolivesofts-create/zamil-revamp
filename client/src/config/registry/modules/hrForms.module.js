// Recruitment resources share the backend-owned HR permission module.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'HR',
  name: 'Human Resources',
  displayOrder: 0,
  resources: [{
    code: 'REQUISITIONS',
    name: 'Personal Requisitions',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_ATTACHMENTS'],
    navigation: [
      { id: 'hr-recruitment-dashboard', path: '/hr/recruitment/dashboard', title: 'Recruitment dashboard', icon: 'layout-dashboard', group: 'human-resources', subgroup: 'hr-recruitment', order: 9, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-requisition', path: '/hr/recruitment/requisition', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', subgroup: 'hr-recruitment', order: 10 },
      { id: 'hr-requisition-report', path: '/hr/recruitment/requisition/report', title: 'Requisition report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-recruitment', order: 11, hidden: true },
      { id: 'hr-requisition-record', path: '/hr/recruitment/requisition/:requisitionId', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', subgroup: 'hr-recruitment', order: 12, hidden: true },
    ],
  }, {
    code: 'INTERVIEW_ASSESSMENTS',
    name: 'Interview Assessments',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-interview', path: '/hr/recruitment/interview', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', subgroup: 'hr-recruitment', order: 20 },
      { id: 'hr-interview-report', path: '/hr/recruitment/interview/report', title: 'Assessment report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-recruitment', order: 21, hidden: true },
      { id: 'hr-interview-record', path: '/hr/recruitment/interview/:assessmentId', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', subgroup: 'hr-recruitment', order: 22, hidden: true },
    ],
  }, {
    code: 'EMPLOYMENT_OFFERS',
    name: 'Employment Offers',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-offer', path: '/hr/recruitment/offer', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', subgroup: 'hr-recruitment', order: 30 },
      { id: 'hr-offer-report', path: '/hr/recruitment/offer/report', title: 'Offer report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-recruitment', order: 31, hidden: true },
      { id: 'hr-offer-record', path: '/hr/recruitment/offer/:offerId', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', subgroup: 'hr-recruitment', order: 32, hidden: true },
    ],
  }, {
    code: 'TRANSFER_REQUESTS',
    name: 'Transfer Request Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-transfer', path: '/hr/employee-services/transfer', title: 'Transfer request', icon: 'arrow-left-right', group: 'human-resources', subgroup: 'hr-employee-services', order: 110, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
      { id: 'hr-transfer-report', path: '/hr/employee-services/transfer/report', title: 'Transfer report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-employee-services', order: 111, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
      { id: 'hr-transfer-record', path: '/hr/employee-services/transfer/:transferId', title: 'Transfer request', icon: 'arrow-left-right', group: 'human-resources', subgroup: 'hr-employee-services', order: 112, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
    ],
  }, {
    code: 'PERSONNEL_RECORD_CHANGES',
    name: 'Personal Status Change Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-record-change', path: '/hr/employee-services/record-change', title: 'Personal status change', icon: 'user-pen', group: 'human-resources', subgroup: 'hr-employee-services', order: 100, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
      { id: 'hr-record-change-requests', path: '/hr/employee-services/record-change/requests', title: 'Personal status report', icon: 'layers', group: 'human-resources', subgroup: 'hr-employee-services', order: 101, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
      { id: 'hr-record-change-record', path: '/hr/employee-services/record-change/:requestId', title: 'Personal status change', icon: 'user-pen', group: 'human-resources', subgroup: 'hr-employee-services', order: 102, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
    ],
  }, {
    code: 'CONTRACTOR_EMPLOYEES',
    name: 'Employee report',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-employee-report', path: '/hr/reports/contractor-employees', title: 'Employee report', icon: 'users', group: 'human-resources', subgroup: 'hr-reports', order: 80, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }, {
    code: 'PERIODWISE_EMPLOYEES',
    name: 'Periodwise Employees',
    // Read-only report: GET /hr/reports/periodwise-employees (and its departments lookup).
    actions: ['VIEW'],
    navigation: [
      { id: 'hr-periodwise-report', path: '/hr/reports/periodwise-employees', title: 'Periodwise employees', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-reports', order: 81, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }, {
    code: 'PROBATION_EVALUATIONS',
    name: 'Probation Evaluation Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-probation', path: '/hr/recruitment/probation-evaluation', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', subgroup: 'hr-recruitment', order: 50, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-probation-report', path: '/hr/recruitment/probation-evaluation/report', title: 'Probation evaluation report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-recruitment', order: 51, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-probation-record', path: '/hr/recruitment/probation-evaluation/:evaluationId', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', subgroup: 'hr-recruitment', order: 52, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }, {
    code: 'ORIENTATION_TRAININGS',
    name: 'Orientation Training Form',
    // MANAGE_LINES guards DELETE /hr/orientation-trainings/:id/lines/:lineId.
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_LINES'],
    navigation: [
      { id: 'hr-orientation', path: '/hr/recruitment/orientation', title: 'Orientation training', icon: 'calendar-clock', group: 'human-resources', subgroup: 'hr-recruitment', order: 40, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-orientation-report', path: '/hr/recruitment/orientation/report', title: 'Orientation report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-recruitment', order: 41, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-orientation-record', path: '/hr/recruitment/orientation/:scheduleId', title: 'Orientation training', icon: 'calendar-clock', group: 'human-resources', subgroup: 'hr-recruitment', order: 42, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }, {
    // Form 1076: /api/v1/hr/sick-leave (MANAGE_ATTACHMENTS guards the attachment routes).
    code: 'SICK_LEAVE',
    name: 'Sick Leave Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_ATTACHMENTS'],
    navigation: [
      { id: 'hr-sick-leave', path: '/hr/employee-services/sick-leave', title: 'Sick leave', icon: 'heart-pulse', group: 'human-resources', subgroup: 'hr-employee-services', order: 130, enabledBy: { env: 'VITE_FEATURE_HR_SICK_LEAVE' } },
      { id: 'hr-sick-leave-report', path: '/hr/employee-services/sick-leave/report', title: 'Sick leave report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-employee-services', order: 131, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_SICK_LEAVE' } },
      { id: 'hr-sick-leave-record', path: '/hr/employee-services/sick-leave/:leaveId', title: 'Sick leave', icon: 'heart-pulse', group: 'human-resources', subgroup: 'hr-employee-services', order: 132, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_SICK_LEAVE' } },
    ],
  }, {
    // Form 1113 (Employee of the Month): /api/v1/hr/employee-of-the-month.
    code: 'EMPLOYEE_OF_THE_MONTH',
    name: 'Employee Reward Nomination Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-reward', path: '/hr/employee-services/reward-nomination', title: 'Reward nomination', icon: 'trophy', group: 'human-resources', subgroup: 'hr-employee-services', order: 140, enabledBy: { env: 'VITE_FEATURE_HR_REWARD_NOMINATION' } },
      { id: 'hr-reward-report', path: '/hr/employee-services/reward-nomination/report', title: 'Reward nominations', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-employee-services', order: 141, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_REWARD_NOMINATION' } },
      { id: 'hr-reward-record', path: '/hr/employee-services/reward-nomination/:nominationId', title: 'Reward nomination', icon: 'trophy', group: 'human-resources', subgroup: 'hr-employee-services', order: 142, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_REWARD_NOMINATION' } },
    ],
  }, {
    // Form 1097: /api/v1/ideas (feasibility uses UPDATE; MANAGE_ATTACHMENTS guards the attachment routes).
    code: 'IDEAS',
    name: 'Idea Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_ATTACHMENTS'],
    navigation: [
      { id: 'hr-idea', path: '/hr/employee-services/ideas', title: 'Share an idea', icon: 'lightbulb', group: 'human-resources', subgroup: 'hr-employee-services', order: 150, enabledBy: { env: 'VITE_FEATURE_HR_IDEAS' } },
      { id: 'hr-idea-report', path: '/hr/employee-services/ideas/report', title: 'Idea report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-employee-services', order: 151, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_IDEAS' } },
      { id: 'hr-idea-record', path: '/hr/employee-services/ideas/:ideaId', title: 'Share an idea', icon: 'lightbulb', group: 'human-resources', subgroup: 'hr-employee-services', order: 152, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_IDEAS' } },
    ],
  }, {
    // Form 1063: /api/v1/hr/employee-clearance. The backend's VIEW_ALL (every employee instead of
    // self and direct reports) is checked by the server only; no page depends on it.
    code: 'EMPLOYEE_CLEARANCE',
    name: 'Employee Clearance Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-clearance', path: '/hr/employee-services/clearance', title: 'Employee clearance', icon: 'door-open', group: 'human-resources', subgroup: 'hr-employee-services', order: 160, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_CLEARANCE' } },
      { id: 'hr-clearance-report', path: '/hr/employee-services/clearance/report', title: 'Employee clearance report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-employee-services', order: 161, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_CLEARANCE' } },
      { id: 'hr-clearance-record', path: '/hr/employee-services/clearance/:clearanceId', title: 'Employee clearance', icon: 'door-open', group: 'human-resources', subgroup: 'hr-employee-services', order: 162, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_CLEARANCE' } },
    ],
  }, {
    // ZPI.IMS.FM.13: /api/v1/projects/charters.
    code: 'PROJECT_CHARTERS',
    name: 'Project Charter Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-charter', path: '/hr/employee-services/project-charter', title: 'Project charter', icon: 'file-text', group: 'human-resources', subgroup: 'hr-employee-services', order: 170, enabledBy: { env: 'VITE_FEATURE_HR_PROJECT_CHARTER' } },
      { id: 'hr-charter-report', path: '/hr/employee-services/project-charter/report', title: 'Project charter report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-employee-services', order: 171, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_PROJECT_CHARTER' } },
      { id: 'hr-charter-record', path: '/hr/employee-services/project-charter/:charterId', title: 'Project charter', icon: 'file-text', group: 'human-resources', subgroup: 'hr-employee-services', order: 172, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_PROJECT_CHARTER' } },
    ],
  }, {
    // Employee survey reports: /api/v1/survey (DELETE guards removing a response; no page uses it yet).
    code: 'SURVEY_REPORTS',
    name: 'Employee Survey Reports',
    actions: ['VIEW', 'DELETE'],
    navigation: [
      { id: 'hr-survey-report', path: '/hr/reports/survey', title: 'Survey report', icon: 'chart-bar', group: 'human-resources', subgroup: 'hr-reports', order: 82, enabledBy: { env: 'VITE_FEATURE_HR_SURVEY_REPORT' } },
      { id: 'hr-survey-responses', path: '/hr/reports/survey/responses', title: 'Survey responses', icon: 'table', group: 'human-resources', subgroup: 'hr-reports', order: 83, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_SURVEY_REPORT' } },
    ],
  }, {
    code: 'SALARY_CERTIFICATES_AR',
    name: 'Arabic Salary Certificates',
    description: 'View and manage Arabic salary certificates.',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [],
  }, {
    code: 'SALARY_CERTIFICATES',
    name: 'English Salary Certificates',
    description: 'View and manage English salary certificates.',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [],
  }, {
    code: 'BUSINESS_VISA_LETTERS',
    name: 'Business Visiting Visa Letters',
    description: 'View and manage business visiting visa letters.',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [],
  }, {
    code: 'TOURIST_VISA_LETTERS',
    name: 'Tourist Visa Letters',
    description: 'View and manage tourist visa letters.',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [],
  }, {
    code: 'WARNING_LETTERS',
    name: 'Warning Letters',
    description: 'View and manage warning letters.',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [],
  }],
})
