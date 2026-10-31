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
      { id: 'hr-requisition', path: '/hr/recruitment/requisition', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', order: 10 },
      { id: 'hr-requisition-record', path: '/hr/recruitment/requisition/:requisitionId', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', order: 11, hidden: true },
    ],
  }],
})
