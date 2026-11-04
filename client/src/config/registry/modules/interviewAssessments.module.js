// Mirrors the INTERVIEW_ASSESSMENTS.INTERVIEW_ASSESSMENTS resource used by
// the backend interview assessment routes.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'INTERVIEW_ASSESSMENTS',
  name: 'Interview Assessments',
  displayOrder: 20,
  resources: [{
    code: 'INTERVIEW_ASSESSMENTS',
    name: 'Interview Assessments',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-interview', path: '/hr/recruitment/interview', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', subgroup: 'hr-recruitment', order: 20 },
      { id: 'hr-interview-report', path: '/hr/recruitment/interview/report', title: 'Assessment report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-recruitment', order: 21, hidden: true },
      { id: 'hr-interview-record', path: '/hr/recruitment/interview/:assessmentId', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', subgroup: 'hr-recruitment', order: 22, hidden: true },
    ],
  }],
})
