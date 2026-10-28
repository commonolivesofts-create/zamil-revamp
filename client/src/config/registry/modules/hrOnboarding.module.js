// HR onboarding: Orientation Schedule (form 1101) and Probation Evaluation
// (form 1064), steps 4 and 5 of the recruitment flow, plus the Periodwise
// Employees report. They run on owner-approved demo data until their backend
// exists, so they are session-only (rbac: false): no permission codes are
// agreed yet. Record pages (`/:id`) are guarded but hidden from the sidebar.
//
// Every entry is switched by VITE_FEATURE_HR_RECRUITMENT: 'true' shows the
// pages, 'false' hides them, unset shows them in development builds only.
// The data source (demo or API) is a separate switch, VITE_HR_RECRUITMENT_DEMO.
import { defineModule } from '../defineModule.js'

const HR_SWITCH = { env: 'VITE_FEATURE_HR_RECRUITMENT' }

export default defineModule({
  code: 'HR_ONBOARDING',
  name: 'HR onboarding',
  rbac: false,
  navigation: [
    { id: 'hr-orientation', path: '/hr/recruitment/orientation', title: 'Orientation schedule', icon: 'calendar-clock', group: 'human-resources', order: 40, enabledBy: HR_SWITCH },
    { id: 'hr-orientation-record', path: '/hr/recruitment/orientation/:scheduleId', title: 'Orientation schedule', icon: 'calendar-clock', group: 'human-resources', order: 41, hidden: true, enabledBy: HR_SWITCH },
    { id: 'hr-probation', path: '/hr/recruitment/probation-evaluation', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', order: 50, enabledBy: HR_SWITCH },
    { id: 'hr-probation-record', path: '/hr/recruitment/probation-evaluation/:evaluationId', title: 'Probation evaluation', icon: 'clipboard-check', group: 'human-resources', order: 51, hidden: true, enabledBy: HR_SWITCH },
    // Report, outside the recruitment flow.
    { id: 'hr-periodwise-employees', path: '/hr/reports/periodwise-employees', title: 'Periodwise employees', icon: 'chart-column', group: 'human-resources', order: 90, enabledBy: HR_SWITCH },
  ],
})
