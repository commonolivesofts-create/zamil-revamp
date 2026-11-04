// Mirrors the existing REQUISITIONS.REQUISITIONS permission resource used by
// the backend's /api/v1/hr/requisitions routes.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'REQUISITIONS',
  name: 'Personal Requisitions',
  displayOrder: 0,
  resources: [{
    code: 'REQUISITIONS',
    name: 'Personal Requisitions',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_ATTACHMENTS'],
    navigation: [
      // The recruitment dashboard opens with requisition access; each panel also needs its own report page.
      { id: 'hr-recruitment-dashboard', path: '/hr/recruitment/dashboard', title: 'Recruitment dashboard', icon: 'layout-dashboard', group: 'human-resources', subgroup: 'hr-recruitment', order: 5, enabledBy: { env: 'VITE_FEATURE_HR_RECRUITMENT' } },
      { id: 'hr-requisition', path: '/hr/recruitment/requisition', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', subgroup: 'hr-recruitment', order: 10 },
      { id: 'hr-requisition-report', path: '/hr/recruitment/requisition/report', title: 'Requisition report', icon: 'chart-column', group: 'human-resources', subgroup: 'hr-recruitment', order: 11, hidden: true },
      { id: 'hr-requisition-record', path: '/hr/recruitment/requisition/:requisitionId', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', subgroup: 'hr-recruitment', order: 12, hidden: true },
    ],
  }],
})
