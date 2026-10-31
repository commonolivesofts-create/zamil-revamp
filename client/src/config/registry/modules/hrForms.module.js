// Mirrors the HR permission resources used by the probation and orientation APIs.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'HR',
  name: 'Human Resources',
  displayOrder: 0,
  resources: [{
    code: 'TRANSFER_REQUESTS',
    name: 'Transfer Request Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-transfer', path: '/hr/employee-services/transfer', title: 'Transfer request', icon: 'arrow-left-right', group: 'human-resources', order: 110, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
      { id: 'hr-transfer-report', path: '/hr/employee-services/transfer/report', title: 'Transfer report', icon: 'chart-column', group: 'human-resources', order: 111, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
      { id: 'hr-transfer-record', path: '/hr/employee-services/transfer/:transferId', title: 'Transfer request', icon: 'arrow-left-right', group: 'human-resources', order: 112, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
    ],
  }, {
    code: 'PERSONNEL_RECORD_CHANGES',
    name: 'Personal Status Change Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-record-change', path: '/hr/employee-services/record-change', title: 'Personal status change', icon: 'user-pen', group: 'human-resources', order: 100, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
      { id: 'hr-record-change-requests', path: '/hr/employee-services/record-change/requests', title: 'Personal status report', icon: 'layers', group: 'human-resources', order: 101, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
      { id: 'hr-record-change-record', path: '/hr/employee-services/record-change/:requestId', title: 'Personal status change', icon: 'user-pen', group: 'human-resources', order: 102, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' } },
    ],
  }, {
    code: 'CONTRACTOR_EMPLOYEES',
    name: 'Employee report',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-employee-report', path: '/hr/reports/contractor-employees', title: 'Employee report', icon: 'users', group: 'human-resources', order: 80, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }, {
    code: 'PERIODWISE_EMPLOYEES',
    name: 'Periodwise Employees',
    // Read-only report: GET /hr/reports/periodwise-employees (and its departments lookup).
    actions: ['VIEW'],
    navigation: [
      { id: 'hr-periodwise-report', path: '/hr/reports/periodwise-employees', title: 'Periodwise employees', icon: 'chart-column', group: 'human-resources', order: 81, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }, {
    code: 'PROBATION_EVALUATIONS',
    name: 'Probation Evaluation Form',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-probation', path: '/hr/recruitment/probation-evaluation', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', order: 50, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-probation-record', path: '/hr/recruitment/probation-evaluation/:evaluationId', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', order: 51, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }, {
    code: 'ORIENTATION_TRAININGS',
    name: 'Orientation Training Form',
    // MANAGE_LINES guards DELETE /hr/orientation-trainings/:id/lines/:lineId.
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_LINES'],
    navigation: [
      { id: 'hr-orientation', path: '/hr/recruitment/orientation', title: 'Orientation training', icon: 'calendar-clock', group: 'human-resources', order: 40, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-orientation-record', path: '/hr/recruitment/orientation/:scheduleId', title: 'Orientation training', icon: 'calendar-clock', group: 'human-resources', order: 41, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }],
})
