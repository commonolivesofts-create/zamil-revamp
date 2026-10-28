// Interview Assessment and Employment Offer remain session-only while their
// API integrations are in progress. Personnel Requisition has its own RBAC
// module matching the existing backend catalogue.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'HR_RECRUITMENT',
  name: 'HR recruitment',
  rbac: false,
  navigation: [
    { id: 'hr-interview', path: '/hr/recruitment/interview', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', order: 20 },
    { id: 'hr-interview-record', path: '/hr/recruitment/interview/:assessmentId', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', order: 21, hidden: true },
    { id: 'hr-offer', path: '/hr/recruitment/offer', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 30 },
    { id: 'hr-offer-record', path: '/hr/recruitment/offer/:offerId', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 31, hidden: true },
  ],
})
