// Mirrors the HR permission resources used by the probation and orientation APIs.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'HR',
  name: 'Human Resources',
  description: 'Human resources workflows.',
  displayOrder: 23,
  resources: [{
    code: 'CONTRACTOR_EMPLOYEES',
    name: 'Employee Report',
    description: 'Read contractor employee records and report filters.',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-employee-report', path: '/hr/reports/periodwise-employees', title: 'Employee report', icon: 'users', group: 'human-resources', order: 80, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }, {
    code: 'PROBATION_EVALUATIONS',
    name: 'Probation Evaluations',
    description: 'Probation evaluation records.',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-probation', path: '/hr/recruitment/probation-evaluation', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', order: 50, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-probation-record', path: '/hr/recruitment/probation-evaluation/:evaluationId', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', order: 51, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }, {
    code: 'ORIENTATION_TRAININGS',
    name: 'Orientation Trainings',
    description: 'New employee orientation training records and lines.',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-orientation', path: '/hr/recruitment/orientation', title: 'Orientation training', icon: 'calendar-clock', group: 'human-resources', order: 40, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-orientation-record', path: '/hr/recruitment/orientation/:scheduleId', title: 'Orientation training', icon: 'calendar-clock', group: 'human-resources', order: 41, hidden: true, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
    ],
  }],
})
