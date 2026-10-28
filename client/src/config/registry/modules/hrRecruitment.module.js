// Employment Offer remains session-only while its API integration is in
// progress. Requisition and Interview Assessment use their backend catalogues.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'HR_RECRUITMENT',
  name: 'HR recruitment',
  rbac: false,
  navigation: [
    { id: 'hr-offer', path: '/hr/recruitment/offer', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 30 },
    { id: 'hr-offer-record', path: '/hr/recruitment/offer/:offerId', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 31, hidden: true },
  ],
})
