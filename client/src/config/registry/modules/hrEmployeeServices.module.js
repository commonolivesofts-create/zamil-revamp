// Annual Performance Appraisal still uses the temporary session-only module.
// Transfer Request and Personal Status Change are registered under HR permissions.
// Record pages (`/:id`) are guarded but hidden from the sidebar.
//
// Every entry is switched by VITE_FEATURE_HR_EMPLOYEE_SERVICES: 'true' shows
// the pages, 'false' hides them, unset shows them in development builds only.
// Transfer and appraisal data source is separate from visibility.
import { defineModule } from '../defineModule.js'

const SWITCH = { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' }

export default defineModule({
  code: 'HR_EMPLOYEE_SERVICES',
  name: 'HR employee services',
  rbac: false,
  navigation: [
    { id: 'hr-appraisal', path: '/hr/performance/appraisal', title: 'Performance appraisal', icon: 'star', group: 'human-resources', order: 120, enabledBy: SWITCH },
    { id: 'hr-appraisal-record', path: '/hr/performance/appraisal/:appraisalId', title: 'Performance appraisal', icon: 'star', group: 'human-resources', order: 121, hidden: true, enabledBy: SWITCH },
  ],
})
