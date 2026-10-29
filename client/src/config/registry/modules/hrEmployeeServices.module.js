// HR employee services: Personnel Record Change (form 1110) with its list of
// change requests, Transfer Request (ZPI.TCN.FM.01) with its report, and the
// annual Performance Appraisal. They run on owner-approved demo data until
// their backend exists, so they are session-only (rbac: false): no permission
// codes are agreed yet. Record pages (`/:id`) are guarded but hidden from the
// sidebar. Not part of the recruitment flow.
//
// Every entry is switched by VITE_FEATURE_HR_EMPLOYEE_SERVICES: 'true' shows
// the pages, 'false' hides them, unset shows them in development builds only.
// The data source (demo or API) is a separate switch,
// VITE_HR_EMPLOYEE_SERVICES_DEMO.
import { defineModule } from '../defineModule.js'

const SWITCH = { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' }

export default defineModule({
  code: 'HR_EMPLOYEE_SERVICES',
  name: 'HR employee services',
  rbac: false,
  navigation: [
    { id: 'hr-record-change', path: '/hr/employee-services/record-change', title: 'Personnel record change', icon: 'user-pen', group: 'human-resources', order: 100, enabledBy: SWITCH },
    { id: 'hr-record-change-requests', path: '/hr/employee-services/record-change/requests', title: 'Change requests', icon: 'layers', group: 'human-resources', order: 101, enabledBy: SWITCH },
    { id: 'hr-record-change-record', path: '/hr/employee-services/record-change/:requestId', title: 'Personnel record change', icon: 'user-pen', group: 'human-resources', order: 102, hidden: true, enabledBy: SWITCH },
    { id: 'hr-transfer', path: '/hr/employee-services/transfer', title: 'Transfer request', icon: 'arrow-left-right', group: 'human-resources', order: 110, enabledBy: SWITCH },
    { id: 'hr-transfer-report', path: '/hr/employee-services/transfer/report', title: 'Transfer report', icon: 'chart-column', group: 'human-resources', order: 111, enabledBy: SWITCH },
    { id: 'hr-transfer-record', path: '/hr/employee-services/transfer/:transferId', title: 'Transfer request', icon: 'arrow-left-right', group: 'human-resources', order: 112, hidden: true, enabledBy: SWITCH },
    { id: 'hr-appraisal', path: '/hr/performance/appraisal', title: 'Performance appraisal', icon: 'star', group: 'human-resources', order: 120, enabledBy: SWITCH },
    { id: 'hr-appraisal-record', path: '/hr/performance/appraisal/:appraisalId', title: 'Performance appraisal', icon: 'star', group: 'human-resources', order: 121, hidden: true, enabledBy: SWITCH },
  ],
})
