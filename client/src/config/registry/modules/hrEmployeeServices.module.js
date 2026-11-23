// Annual Performance Appraisal and the Talent Management dashboard still use
// the temporary session-only module.
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
    // Talent Management overview: each area's figures appear only when the
    // user may open that area (TalentDashboardPage.jsx).
    {
      id: 'hr-talent-dashboard',
      path: '/hr/talent-management/dashboard',
      title: 'Talent dashboard',
      icon: 'layout-dashboard',
      group: 'human-resources',
      subgroup: 'hr-talent-management',
      order: 115,
      enabledBy: SWITCH,
    },
    {
      id: 'hr-appraisal',
      path: '/hr/performance/appraisal',
      title: 'Performance appraisal',
      icon: 'star',
      group: 'human-resources',
      subgroup: 'hr-talent-management',
      order: 120,
      enabledBy: SWITCH,
    },
    {
      id: 'hr-appraisal-report',
      path: '/hr/performance/appraisal/report',
      title: 'Appraisal report',
      icon: 'chart-column',
      group: 'human-resources',
      subgroup: 'hr-talent-management',
      order: 121,
      hidden: true,
      enabledBy: SWITCH,
    },
    {
      id: 'hr-appraisal-record',
      path: '/hr/performance/appraisal/:appraisalId',
      title: 'Performance appraisal',
      icon: 'star',
      group: 'human-resources',
      subgroup: 'hr-talent-management',
      order: 122,
      hidden: true,
      enabledBy: SWITCH,
    },
  ],
})
