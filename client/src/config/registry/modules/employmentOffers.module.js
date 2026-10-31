// Mirrors the EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS resource used by the backend.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'EMPLOYMENT_OFFERS',
  name: 'Employment Offers',
  displayOrder: 0,
  resources: [{
    code: 'EMPLOYMENT_OFFERS',
    name: 'Employment Offers',
    actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
    navigation: [
      { id: 'hr-offer', path: '/hr/recruitment/offer', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 30 },
      { id: 'hr-offer-record', path: '/hr/recruitment/offer/:offerId', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 31, hidden: true },
    ],
  }],
})
