// HR recruitment: Personnel Requisition (form 1060), Interview Assessment
// (form 1061) and Employment Offer (form 1062), one guided flow.
//
// Session-only for now (rbac: false): the owner approved the permission codes
// in features/hr-recruitment/hrRecruitmentActions.js, but they are not yet
// registered in Oracle, so these pages need a signed-in session and no
// business permission. When the backend and the catalogue rows exist, turn this
// into an RBAC module with the resources PERSONNEL_REQUISITIONS,
// INTERVIEW_ASSESSMENTS and EMPLOYMENT_OFFERS (see the feature README).
// Record pages (`/:id`) are guarded but hidden from the sidebar.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'HR_RECRUITMENT',
  name: 'HR recruitment',
  rbac: false,
  navigation: [
    { id: 'hr-requisition', path: '/hr/recruitment/requisition', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', order: 10 },
    { id: 'hr-requisition-record', path: '/hr/recruitment/requisition/:requisitionId', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', order: 11, hidden: true },
    { id: 'hr-interview', path: '/hr/recruitment/interview', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', order: 20 },
    { id: 'hr-interview-record', path: '/hr/recruitment/interview/:assessmentId', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', order: 21, hidden: true },
    { id: 'hr-offer', path: '/hr/recruitment/offer', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 30 },
    { id: 'hr-offer-record', path: '/hr/recruitment/offer/:offerId', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 31, hidden: true },
  ],
})
