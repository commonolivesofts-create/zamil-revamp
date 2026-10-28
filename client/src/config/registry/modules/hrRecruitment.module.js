// HR recruitment: Personnel Requisition (form 1060), Interview Assessment
// (form 1061), Employment Offer (form 1062), Orientation Schedule (form 1101)
// and Probation Evaluation (form 1064), one guided flow; plus the Periodwise
// Employees report.
//
// Session-only for now (rbac: false): the owner approved the permission codes
// in features/hr-recruitment/hrRecruitmentActions.js, but they are not yet
// registered in Oracle, so these pages need a signed-in session and no
// business permission. When the backend and the catalogue rows exist, turn this
// into an RBAC module with the resources PERSONNEL_REQUISITIONS,
// INTERVIEW_ASSESSMENTS and EMPLOYMENT_OFFERS (see the feature README).
// Record pages (`/:id`) are guarded but hidden from the sidebar.
//
// Every entry is switched by VITE_FEATURE_HR_RECRUITMENT: 'true' shows the
// pages, 'false' hides them, unset shows them in development builds only.
// The data source (demo or API) is a separate switch, VITE_HR_RECRUITMENT_DEMO.
import { defineModule } from '../defineModule.js'

const HR_SWITCH = { env: 'VITE_FEATURE_HR_RECRUITMENT' }

export default defineModule({
  code: 'HR_RECRUITMENT',
  name: 'HR recruitment',
  rbac: false,
  navigation: [
    { id: 'hr-requisition', path: '/hr/recruitment/requisition', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', order: 10, enabledBy: HR_SWITCH },
    { id: 'hr-requisition-record', path: '/hr/recruitment/requisition/:requisitionId', title: 'Personnel requisition', icon: 'clipboard-list', group: 'human-resources', order: 11, hidden: true, enabledBy: HR_SWITCH },
    { id: 'hr-interview', path: '/hr/recruitment/interview', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', order: 20, enabledBy: HR_SWITCH },
    { id: 'hr-interview-record', path: '/hr/recruitment/interview/:assessmentId', title: 'Interview assessment', icon: 'messages-square', group: 'human-resources', order: 21, hidden: true, enabledBy: HR_SWITCH },
    { id: 'hr-offer', path: '/hr/recruitment/offer', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 30, enabledBy: HR_SWITCH },
    { id: 'hr-offer-record', path: '/hr/recruitment/offer/:offerId', title: 'Employment offer', icon: 'file-signature', group: 'human-resources', order: 31, hidden: true, enabledBy: HR_SWITCH },
    { id: 'hr-orientation', path: '/hr/recruitment/orientation', title: 'Orientation schedule', icon: 'calendar-clock', group: 'human-resources', order: 40, enabledBy: HR_SWITCH },
    { id: 'hr-orientation-record', path: '/hr/recruitment/orientation/:scheduleId', title: 'Orientation schedule', icon: 'calendar-clock', group: 'human-resources', order: 41, hidden: true, enabledBy: HR_SWITCH },
    { id: 'hr-probation', path: '/hr/recruitment/probation-evaluation', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', order: 50, enabledBy: HR_SWITCH },
    { id: 'hr-probation-record', path: '/hr/recruitment/probation-evaluation/:evaluationId', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', order: 51, hidden: true, enabledBy: HR_SWITCH },
    // Report, outside the recruitment flow.
    { id: 'hr-periodwise-employees', path: '/hr/reports/periodwise-employees', title: 'Periodwise employees', icon: 'chart-column', group: 'human-resources', order: 90, enabledBy: HR_SWITCH },
  ],
})
