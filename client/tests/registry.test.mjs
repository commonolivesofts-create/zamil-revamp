// Phase 2A: developer-controlled module/resource registry. The derived
// navigation must stay identical to the pre-registry configuration; definitions
// are validated; external destinations are safe; the example is isolated.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { STANDARD_ACTIONS, isStandardAction } from '../src/config/registry/actions.js'
import { RegistryError, buildRegistry, defineModule, validateExternalUrl } from '../src/config/registry/defineModule.js'
import { NAVIGATION_GROUPS, registeredModules, registry } from '../src/config/registry/index.js'
import { EXAMPLE_GROUPS, EXAMPLE_MODULES } from '../src/config/registry/module-registry.example.js'
import { resolveExternalHref } from '../src/config/externalDestinations.js'
import {
  PERMISSIONS, appRoutes, authorizedNavigation, findAppRoute, implementedRoutes, navigationEntries,
  navigationSections, paletteCommands, resolveNavigationEntries, routeAccess,
} from '../src/config/appNavigation.js'
import { SECURITY_ACTIONS } from '../src/features/security-administration/securityActions.js'
import { SECURITY_MODULE, SECURITY_RESOURCES } from '../../server/src/modules/access-control/securityCatalog.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const plain = (value) => JSON.parse(JSON.stringify(value))
const SA = 'SECURITY_ADMINISTRATION'

// ---------------------------------------------------------------- unchanged navigation

// The exact navigation before the registry (pre-Phase 2A appNavigation.js), in order.
const PRE_REGISTRY_ROUTES = [
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard', section: 'workspace', implemented: true },
  { id: 'pending-worklist', path: '/worklist/pending', label: 'Pending Worklist', icon: 'list-checks', section: 'workspace', implemented: true },
  { id: 'user-accounts', path: '/security/users', label: 'User accounts', icon: 'users', section: 'security', permission: `${SA}.USER_ACCOUNTS:VIEW`, requiresMfa: true, implemented: true },
  { id: 'user-account', path: '/security/users/:userId', label: 'User account', icon: 'user-round', section: 'security', permission: `${SA}.USER_ACCOUNTS:VIEW`, requiresMfa: true, implemented: true, nav: false },
  { id: 'roles', path: '/security/roles', label: 'Roles', icon: 'user-cog', section: 'security', permission: `${SA}.ROLES:VIEW`, requiresMfa: true, implemented: true },
  { id: 'user-roles', path: '/security/user-roles', label: 'User roles', icon: 'user-check', section: 'security', permission: `${SA}.USER_ROLES:VIEW`, alsoRequires: [`${SA}.USER_ACCOUNTS:VIEW`], requiresMfa: true, implemented: true },
  { id: 'user-role-assignments', path: '/security/user-roles/:userId', label: 'User roles', icon: 'user-check', section: 'security', permission: `${SA}.USER_ROLES:VIEW`, requiresMfa: true, implemented: true, nav: false },
  { id: 'role-permissions', path: '/security/role-permissions', label: 'Role permissions', icon: 'key-round', section: 'security', permission: `${SA}.ROLE_PERMISSIONS:VIEW`, alsoRequires: [`${SA}.ROLES:VIEW`], requiresMfa: true, implemented: true },
  { id: 'permission-catalog', path: '/security/permission-catalog', label: 'Permission catalog', icon: 'list-tree', section: 'security', permission: `${SA}.PERMISSION_CATALOG:VIEW`, requiresMfa: true, implemented: true },
  { id: 'permission-overrides', path: '/security/permission-overrides', label: 'Permission overrides', icon: 'shield-half', section: 'security', permission: `${SA}.USER_PERMISSION_OVERRIDES:VIEW`, alsoRequires: [`${SA}.USER_ACCOUNTS:VIEW`], requiresMfa: true, implemented: true },
  { id: 'user-permission-overrides', path: '/security/permission-overrides/:userId', label: 'Permission overrides', icon: 'shield-half', section: 'security', permission: `${SA}.USER_PERMISSION_OVERRIDES:VIEW`, requiresMfa: true, implemented: true, nav: false },
  { id: 'security-audit', path: '/security/audit', label: 'Security audit', icon: 'file-search', section: 'security', permission: `${SA}.SECURITY_AUDIT:VIEW`, requiresMfa: true, implemented: false },
  { id: 'account-password', path: '/account/password', label: 'Password', icon: 'key-round', section: 'account', implemented: true },
  { id: 'account-authenticator', path: '/account/authenticator', label: 'Authenticator app', icon: 'smartphone', section: 'account', implemented: true },
]

// HR forms use backend-owned resource permissions; the periodwise report
// remains session-only. All are switched by VITE_FEATURE_HR_RECRUITMENT.
const HR = 'human-resources'
const EMPLOYEE_SERVICES = 'hr-employee-services'
const TALENT_MANAGEMENT = 'hr-talent-management'
const REQ = 'HR.REQUISITIONS'
const INTERVIEW = 'HR.INTERVIEW_ASSESSMENTS'
const OFFER = 'HR.EMPLOYMENT_OFFERS'
const PROBATION = 'HR.PROBATION_EVALUATIONS'
const CONTRACTOR_EMPLOYEES = 'HR.CONTRACTOR_EMPLOYEES'
const PERSONNEL_RECORD_CHANGES = 'HR.PERSONNEL_RECORD_CHANGES'
const TRANSFER_REQUESTS = 'HR.TRANSFER_REQUESTS'
const ARABIC_SALARY_CERTIFICATES = 'HR.SALARY_CERTIFICATES_AR'
const ENGLISH_SALARY_CERTIFICATES = 'HR.SALARY_CERTIFICATES'
const BUSINESS_VISA_LETTERS = 'HR.BUSINESS_VISA_LETTERS'
const TOURIST_VISA_LETTERS = 'HR.TOURIST_VISA_LETTERS'
const WARNING_LETTERS = 'HR.WARNING_LETTERS'
const HR_SWITCH = { env: 'VITE_FEATURE_HR_RECRUITMENT' }
const ES_SWITCH = { env: 'VITE_FEATURE_HR_EMPLOYEE_SERVICES' }
const HR_RECRUITMENT_ROUTES = [
  { id: 'hr-recruitment-dashboard', path: '/hr/recruitment/dashboard', label: 'Recruitment dashboard', icon: 'layout-dashboard', section: HR, subgroup: 'hr-recruitment', permission: `${REQ}:VIEW`, requiresMfa: false, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-requisition', path: '/hr/recruitment/requisition', label: 'Personnel requisition', icon: 'clipboard-list', section: HR, subgroup: 'hr-recruitment', permission: `${REQ}:VIEW`, requiresMfa: false, implemented: true },
  { id: 'hr-requisition-report', path: '/hr/recruitment/requisition/report', label: 'Requisition report', icon: 'chart-column', section: HR, subgroup: 'hr-recruitment', permission: `${REQ}:VIEW`, requiresMfa: false, implemented: true, nav: false },
  { id: 'hr-requisition-record', path: '/hr/recruitment/requisition/:requisitionId', label: 'Personnel requisition', icon: 'clipboard-list', section: HR, subgroup: 'hr-recruitment', permission: `${REQ}:VIEW`, requiresMfa: false, implemented: true, nav: false },
  { id: 'hr-interview', path: '/hr/recruitment/interview', label: 'Interview assessment', icon: 'messages-square', section: HR, subgroup: 'hr-recruitment', permission: `${INTERVIEW}:VIEW`, requiresMfa: false, implemented: true },
  { id: 'hr-interview-report', path: '/hr/recruitment/interview/report', label: 'Assessment report', icon: 'chart-column', section: HR, subgroup: 'hr-recruitment', permission: `${INTERVIEW}:VIEW`, requiresMfa: false, implemented: true, nav: false },
  { id: 'hr-interview-record', path: '/hr/recruitment/interview/:assessmentId', label: 'Interview assessment', icon: 'messages-square', section: HR, subgroup: 'hr-recruitment', permission: `${INTERVIEW}:VIEW`, requiresMfa: false, implemented: true, nav: false },
  { id: 'hr-offer', path: '/hr/recruitment/offer', label: 'Employment offer', icon: 'file-signature', section: HR, subgroup: 'hr-recruitment', permission: `${OFFER}:VIEW`, requiresMfa: false, implemented: true },
  { id: 'hr-offer-report', path: '/hr/recruitment/offer/report', label: 'Offer report', icon: 'chart-column', section: HR, subgroup: 'hr-recruitment', permission: `${OFFER}:VIEW`, requiresMfa: false, implemented: true, nav: false },
  { id: 'hr-offer-record', path: '/hr/recruitment/offer/:offerId', label: 'Employment offer', icon: 'file-signature', section: HR, subgroup: 'hr-recruitment', permission: `${OFFER}:VIEW`, requiresMfa: false, implemented: true, nav: false },
  { id: 'hr-orientation', path: '/hr/recruitment/orientation', label: 'Orientation training', icon: 'calendar-clock', section: HR, subgroup: 'hr-recruitment', permission: 'HR.ORIENTATION_TRAININGS:VIEW', requiresMfa: false, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-orientation-report', path: '/hr/recruitment/orientation/report', label: 'Orientation report', icon: 'chart-column', section: HR, subgroup: 'hr-recruitment', permission: 'HR.ORIENTATION_TRAININGS:VIEW', requiresMfa: false, implemented: false, enabledBy: HR_SWITCH, nav: false },
  { id: 'hr-orientation-record', path: '/hr/recruitment/orientation/:scheduleId', label: 'Orientation training', icon: 'calendar-clock', section: HR, subgroup: 'hr-recruitment', permission: 'HR.ORIENTATION_TRAININGS:VIEW', requiresMfa: false, implemented: false, enabledBy: HR_SWITCH, nav: false },
  { id: 'hr-probation', path: '/hr/recruitment/probation-evaluation', label: 'Probation evaluation', icon: 'clipboard-check', section: HR, subgroup: 'hr-recruitment', permission: `${PROBATION}:VIEW`, requiresMfa: false, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-probation-report', path: '/hr/recruitment/probation-evaluation/report', label: 'Probation evaluation report', icon: 'chart-column', section: HR, subgroup: 'hr-recruitment', permission: `${PROBATION}:VIEW`, requiresMfa: false, implemented: false, enabledBy: HR_SWITCH, nav: false },
  { id: 'hr-probation-record', path: '/hr/recruitment/probation-evaluation/:evaluationId', label: 'Probation evaluation', icon: 'clipboard-check', section: HR, subgroup: 'hr-recruitment', permission: `${PROBATION}:VIEW`, requiresMfa: false, implemented: false, enabledBy: HR_SWITCH, nav: false },
  { id: 'hr-employee-report', path: '/hr/reports/contractor-employees', label: 'Employee report', icon: 'users', section: HR, subgroup: 'hr-reports', permission: `${CONTRACTOR_EMPLOYEES}:VIEW`, requiresMfa: false, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-periodwise-report', path: '/hr/reports/periodwise-employees', label: 'Periodwise employees', icon: 'chart-column', section: HR, subgroup: 'hr-reports', permission: 'HR.PERIODWISE_EMPLOYEES:VIEW', requiresMfa: false, implemented: false, enabledBy: HR_SWITCH },
  { id: 'hr-survey-report', path: '/hr/reports/survey', label: 'Survey report', icon: 'chart-bar', section: HR, subgroup: 'hr-reports', permission: 'HR.SURVEY_REPORTS:VIEW', requiresMfa: false, implemented: false, enabledBy: { env: 'VITE_FEATURE_HR_SURVEY_REPORT' } },
  { id: 'hr-survey-responses', path: '/hr/reports/survey/responses', label: 'Survey responses', icon: 'table', section: HR, subgroup: 'hr-reports', permission: 'HR.SURVEY_REPORTS:VIEW', requiresMfa: false, implemented: false, enabledBy: { env: 'VITE_FEATURE_HR_SURVEY_REPORT' }, nav: false },
  { id: 'hr-record-change', path: '/hr/employee-services/record-change', label: 'Personal status change', icon: 'user-pen', section: HR, subgroup: EMPLOYEE_SERVICES, permission: `${PERSONNEL_RECORD_CHANGES}:VIEW`, requiresMfa: false, implemented: false, enabledBy: ES_SWITCH },
  { id: 'hr-record-change-requests', path: '/hr/employee-services/record-change/requests', label: 'Personal status report', icon: 'layers', section: HR, subgroup: EMPLOYEE_SERVICES, permission: `${PERSONNEL_RECORD_CHANGES}:VIEW`, requiresMfa: false, implemented: false, enabledBy: ES_SWITCH, nav: false },
  { id: 'hr-record-change-record', path: '/hr/employee-services/record-change/:requestId', label: 'Personal status change', icon: 'user-pen', section: HR, subgroup: EMPLOYEE_SERVICES, permission: `${PERSONNEL_RECORD_CHANGES}:VIEW`, requiresMfa: false, implemented: false, enabledBy: ES_SWITCH, nav: false },
  { id: 'hr-transfer', path: '/hr/talent-management/transfer', label: 'Transfer request', icon: 'arrow-left-right', section: HR, subgroup: TALENT_MANAGEMENT, permission: `${TRANSFER_REQUESTS}:VIEW`, requiresMfa: false, implemented: false, enabledBy: ES_SWITCH },
  { id: 'hr-transfer-report', path: '/hr/talent-management/transfer/report', label: 'Transfer report', icon: 'chart-column', section: HR, subgroup: TALENT_MANAGEMENT, permission: `${TRANSFER_REQUESTS}:VIEW`, requiresMfa: false, implemented: false, enabledBy: ES_SWITCH, nav: false },
  { id: 'hr-transfer-record', path: '/hr/talent-management/transfer/:transferId', label: 'Transfer request', icon: 'arrow-left-right', section: HR, subgroup: TALENT_MANAGEMENT, permission: `${TRANSFER_REQUESTS}:VIEW`, requiresMfa: false, implemented: false, enabledBy: ES_SWITCH, nav: false },
]
// Performance appraisal remains in the session-only HR_EMPLOYEE_SERVICES module.
const HR_EMPLOYEE_SERVICES_ROUTES = [
  { id: 'hr-appraisal', path: '/hr/performance/appraisal', label: 'Performance appraisal', icon: 'star', section: HR, subgroup: TALENT_MANAGEMENT, implemented: false, enabledBy: ES_SWITCH },
  { id: 'hr-appraisal-report', path: '/hr/performance/appraisal/report', label: 'Appraisal report', icon: 'chart-column', section: HR, subgroup: TALENT_MANAGEMENT, implemented: false, enabledBy: ES_SWITCH, nav: false },
  { id: 'hr-appraisal-record', path: '/hr/performance/appraisal/:appraisalId', label: 'Performance appraisal', icon: 'star', section: HR, subgroup: TALENT_MANAGEMENT, implemented: false, enabledBy: ES_SWITCH, nav: false },
]
// Sick Leave (1076), Reward Nomination (1113) and Share an Idea (1097): one
// switch each; the report and record pages are reached from the form.
const ES = TALENT_MANAGEMENT
const formRoutes = (id, path, label, icon, resource, env, param, subgroup = ES) => {
  const base = { section: HR, subgroup, permission: `HR.${resource}:VIEW`, requiresMfa: false, implemented: false, enabledBy: { env } }
  return [
    { id, path, label, icon, ...base },
    { id: `${id}-report`, path: `${path}/report`, label: { 'hr-sick-leave': 'Sick leave report', 'hr-reward': 'Reward nominations', 'hr-idea': 'Idea report' }[id], icon: 'chart-column', ...base, nav: false },
    { id: `${id}-record`, path: `${path}/:${param}`, label, icon, ...base, nav: false },
  ]
}
const HR_EMPLOYEE_SERVICES_FORM_ROUTES = [
  ...formRoutes('hr-sick-leave', '/hr/employee-services/sick-leave', 'Sick leave', 'heart-pulse', 'SICK_LEAVE', 'VITE_FEATURE_HR_SICK_LEAVE', 'leaveId', EMPLOYEE_SERVICES),
  ...formRoutes('hr-reward', '/hr/talent-management/reward-nomination', 'Reward nomination', 'trophy', 'EMPLOYEE_OF_THE_MONTH', 'VITE_FEATURE_HR_REWARD_NOMINATION', 'nominationId'),
  ...formRoutes('hr-idea', '/hr/employee-services/ideas', 'Share an idea', 'lightbulb', 'IDEAS', 'VITE_FEATURE_HR_IDEAS', 'ideaId', EMPLOYEE_SERVICES),
]
// Employee Clearance (1063): the HR.EMPLOYEE_CLEARANCE resource, as the backend guards it.
const CLEARANCE = { section: HR, subgroup: ES, permission: 'HR.EMPLOYEE_CLEARANCE:VIEW', requiresMfa: false, implemented: false, enabledBy: { env: 'VITE_FEATURE_HR_EMPLOYEE_CLEARANCE' } }
const HR_EMPLOYEE_CLEARANCE_ROUTES = [
  { id: 'hr-clearance', path: '/hr/talent-management/clearance', label: 'Employee clearance', icon: 'door-open', ...CLEARANCE },
  { id: 'hr-clearance-report', path: '/hr/talent-management/clearance/report', label: 'Employee clearance report', icon: 'chart-column', ...CLEARANCE, nav: false },
  { id: 'hr-clearance-record', path: '/hr/talent-management/clearance/:clearanceId', label: 'Employee clearance', icon: 'door-open', ...CLEARANCE, nav: false },
]
// Project Charter (ZPI.IMS.FM.13): the HR.PROJECT_CHARTERS resource, its own switch.
const CHARTER = { section: HR, subgroup: ES, permission: 'HR.PROJECT_CHARTERS:VIEW', requiresMfa: false, implemented: false, enabledBy: { env: 'VITE_FEATURE_HR_PROJECT_CHARTER' } }
const HR_CHARTER_ROUTES = [
  { id: 'hr-charter', path: '/hr/talent-management/project-charter', label: 'Project charter', icon: 'file-text', ...CHARTER },
  { id: 'hr-charter-report', path: '/hr/talent-management/project-charter/report', label: 'Project charter report', icon: 'chart-column', ...CHARTER, nav: false },
  { id: 'hr-charter-record', path: '/hr/talent-management/project-charter/:charterId', label: 'Project charter', icon: 'file-text', ...CHARTER, nav: false },
]
// Salary Certificate (English and Arabic in one form): the HR.SALARY_CERTIFICATES resource.
const SALARY = { section: HR, subgroup: 'hr-letters', permission: 'HR.SALARY_CERTIFICATES:VIEW', requiresMfa: false, implemented: false, enabledBy: { env: 'VITE_FEATURE_HR_SALARY_CERTIFICATE' } }
const VISA = { section: HR, subgroup: 'hr-letters', permission: 'HR.BUSINESS_VISA_LETTERS:VIEW', requiresMfa: false, implemented: false, enabledBy: { env: 'VITE_FEATURE_HR_BUSINESS_VISA' } }
const VISA_LETTER = { ...VISA, enabledBy: { env: 'VITE_FEATURE_HR_BUSINESS_VISA_LETTER' } }
const TOURIST = { section: HR, subgroup: 'hr-letters', permission: 'HR.TOURIST_VISA_LETTERS:VIEW', requiresMfa: false, implemented: false, enabledBy: { env: 'VITE_FEATURE_HR_TOURIST_VISA' } }
const WARNING = { section: HR, subgroup: 'hr-letters', permission: 'HR.WARNING_LETTERS:VIEW', requiresMfa: false, implemented: false, enabledBy: { env: 'VITE_FEATURE_HR_WARNING_LETTER' } }
const HR_SALARY_CERTIFICATE_ROUTES = [
  { id: 'hr-salary-certificate', path: '/hr/talent-management/salary-certificate', label: 'Salary certificate', icon: 'file-badge', ...SALARY },
  { id: 'hr-salary-certificate-report', path: '/hr/talent-management/salary-certificate/report', label: 'Salary certificate report', icon: 'chart-column', ...SALARY, nav: false },
  { id: 'hr-salary-certificate-record', path: '/hr/talent-management/salary-certificate/:certificateId', label: 'Salary certificate', icon: 'file-badge', ...SALARY, nav: false },
  { id: 'hr-business-visa', path: '/hr/letters/business-visa', label: 'Business visa request', icon: 'plane', ...VISA },
  { id: 'hr-business-visa-report', path: '/hr/letters/business-visa/report', label: 'Business visa report', icon: 'chart-column', ...VISA, nav: false },
  { id: 'hr-business-visa-record', path: '/hr/letters/business-visa/:requestId', label: 'Business visa request', icon: 'plane', ...VISA, nav: false },
  { id: 'hr-business-visa-letter', path: '/hr/letters/business-visa-letter', label: 'Business visa letter', icon: 'file-text', ...VISA_LETTER },
  { id: 'hr-business-visa-letter-report', path: '/hr/letters/business-visa-letter/report', label: 'Business visa letter report', icon: 'chart-column', ...VISA_LETTER, nav: false },
  { id: 'hr-business-visa-letter-record', path: '/hr/letters/business-visa-letter/:letterId', label: 'Business visa letter', icon: 'file-text', ...VISA_LETTER, nav: false },
  { id: 'hr-tourist-visa', path: '/hr/letters/tourist-visa', label: 'Tourist visa letter', icon: 'luggage', ...TOURIST },
  { id: 'hr-tourist-visa-report', path: '/hr/letters/tourist-visa/report', label: 'Tourist visa report', icon: 'chart-column', ...TOURIST, nav: false },
  { id: 'hr-tourist-visa-record', path: '/hr/letters/tourist-visa/:letterId', label: 'Tourist visa letter', icon: 'luggage', ...TOURIST, nav: false },
  { id: 'hr-warning-letter', path: '/hr/letters/warning-letter', label: 'Warning letter', icon: 'triangle-alert', ...WARNING },
  { id: 'hr-warning-letter-report', path: '/hr/letters/warning-letter/report', label: 'Warning letter report', icon: 'chart-column', ...WARNING, nav: false },
  { id: 'hr-warning-letter-record', path: '/hr/letters/warning-letter/:letterId', label: 'Warning letter', icon: 'triangle-alert', ...WARNING, nav: false },
]
// Workflow Manager M1: backend WORKFLOW_MANAGER permissions, no MFA requirement, no switch.
const WF = 'WORKFLOW_MANAGER'
const wf = { section: 'workflow-manager' }
const WORKFLOW_MANAGER_ROUTES = [
  { id: 'workflow-manager', path: '/workflow-manager', label: 'Overview', icon: 'workflow', ...wf, permission: `${WF}.OVERVIEW:VIEW`, requiresMfa: false, implemented: true },
  { id: 'workflow-forms', path: '/workflow-manager/forms', label: 'Form registry', icon: 'file-stack', ...wf, permission: `${WF}.FORM_REGISTRY:VIEW`, requiresMfa: false, implemented: true },
  { id: 'workflow-form-new', path: '/workflow-manager/forms/new', label: 'Register form', icon: 'file-plus', ...wf, permission: `${WF}.FORM_REGISTRY:CREATE`, requiresMfa: false, implemented: true, nav: false },
  { id: 'workflow-form', path: '/workflow-manager/forms/:formId', label: 'Registered form', icon: 'file-text', ...wf, permission: `${WF}.FORM_REGISTRY:VIEW`, requiresMfa: false, implemented: true, nav: false },
  { id: 'workflow-data-sources', path: '/workflow-manager/data-sources', label: 'Data source registry', icon: 'database', ...wf, permission: `${WF}.DATA_SOURCE_REGISTRY:VIEW`, requiresMfa: false, implemented: true },
  // M2-A source mapping: reached from the registry (no sidebar entry); also needs DATA_SOURCE_REGISTRY:VIEW.
  { id: 'workflow-source-versions', path: '/workflow-manager/data-sources/:sourceId/mapping-versions', label: 'Source versions', icon: 'layers', ...wf, permission: `${WF}.SOURCE_MAPPING:VIEW`, alsoRequires: [`${WF}.DATA_SOURCE_REGISTRY:VIEW`], requiresMfa: false, implemented: true, nav: false },
  { id: 'workflow-source-version-new', path: '/workflow-manager/data-sources/:sourceId/mapping-versions/new', label: 'New source version', icon: 'file-plus', ...wf, permission: `${WF}.SOURCE_MAPPING:CREATE`, alsoRequires: [`${WF}.DATA_SOURCE_REGISTRY:VIEW`], requiresMfa: false, implemented: true, nav: false },
  { id: 'workflow-source-version', path: '/workflow-manager/data-sources/:sourceId/mapping-versions/:versionId', label: 'Source version', icon: 'file-text', ...wf, permission: `${WF}.SOURCE_MAPPING:VIEW`, alsoRequires: [`${WF}.DATA_SOURCE_REGISTRY:VIEW`], requiresMfa: false, implemented: true, nav: false },
]
// Group order: workspace, human resources, workflow manager, security, account.
const EXPECTED_ROUTES = [PRE_REGISTRY_ROUTES[0], PRE_REGISTRY_ROUTES[1], ...HR_RECRUITMENT_ROUTES, ...HR_EMPLOYEE_SERVICES_ROUTES, ...HR_EMPLOYEE_SERVICES_FORM_ROUTES, ...HR_EMPLOYEE_CLEARANCE_ROUTES, ...HR_CHARTER_ROUTES, ...HR_SALARY_CERTIFICATE_ROUTES, ...WORKFLOW_MANAGER_ROUTES, ...PRE_REGISTRY_ROUTES.slice(2)]
const withoutSubgroups = (routes) => routes.map(({ subgroup, ...route }) => route)
// External hubs are navigation links only (no route); their address comes from the environment (unset in tests).
const EXTERNAL_HUBS = [
  { id: 'training-hub', type: 'external', href: null, label: 'Training Hub', icon: 'graduation-cap', section: HR, implemented: false },
  { id: 'expense-hub', type: 'external', href: null, label: 'Expense Hub', icon: 'wallet-cards', section: 'finance', implemented: false },
]
const EXPECTED_NAVIGATION = [...EXPECTED_ROUTES.slice(0, -(WORKFLOW_MANAGER_ROUTES.length + PRE_REGISTRY_ROUTES.length - 2)), ...EXTERNAL_HUBS, ...WORKFLOW_MANAGER_ROUTES, ...PRE_REGISTRY_ROUTES.slice(2)]

test('the derived routes, sections and permission names match the active modules', () => {
  assert.deepEqual(withoutSubgroups(plain(appRoutes)), withoutSubgroups(EXPECTED_ROUTES))
  assert.deepEqual(withoutSubgroups(plain(navigationEntries)), withoutSubgroups(EXPECTED_NAVIGATION), 'the external hubs are the only entries without a route')
  assert.deepEqual(
    withoutSubgroups(plain(navigationEntries.filter((route) => route.type !== 'external'))),
    withoutSubgroups(EXPECTED_ROUTES),
    'internal navigation stays unchanged',
  )
  assert.deepEqual(
    plain(navigationEntries.filter((route) => route.type === 'external')).map(({ id, href, implemented }) => ({ id, href, implemented })),
    [
      { id: 'training-hub', href: null, implemented: false },
      { id: 'expense-hub', href: null, implemented: false },
    ],
    'only configured hub links are included, and unresolved links stay hidden',
  )
  for (const [index, route] of withoutSubgroups(appRoutes).entries()) {
    assert.deepEqual(Object.keys(route), Object.keys(withoutSubgroups(EXPECTED_ROUTES)[index]), `${route.id}: same fields, same order`)
  }
  assert.deepEqual(plain(navigationSections), [
    { id: 'workspace', label: 'Workspace', icon: 'layout-dashboard', standalone: true },
    {
      id: HR, label: 'Human resources', icon: 'users-round', subgroups: [
        { id: 'hr-recruitment', label: 'Recruitment', icon: 'user-plus', description: 'From requisition to probation' },
        { id: TALENT_MANAGEMENT, label: 'Talent Management', icon: 'layers', description: 'Transfers, recognition and performance' },
        { id: EMPLOYEE_SERVICES, label: 'Employee Services', icon: 'briefcase-business', description: 'Personal status, leave and ideas' },
        { id: 'hr-letters', label: 'Letters', icon: 'mail', description: 'Salary certificates and letters' },
        { id: 'hr-reports', label: 'Reports', icon: 'chart-column', description: 'HR reports' },
      ],
    },
    { id: 'finance', label: 'Finance', icon: 'wallet-cards' },
    { id: 'workflow-manager', label: 'Workflow Manager', icon: 'workflow' },
    {
      id: 'security', label: 'Security administration', icon: 'shield-check',
      subgroups: [{ id: 'security-admin', label: 'Security administration', icon: 'shield-check', description: 'Accounts, roles and permissions' }],
    },
    {
      id: 'account', label: 'My account', icon: 'user-round',
      subgroups: [{ id: 'account-settings', label: 'My account', icon: 'user-round', description: 'Password and authentication' }],
    },
  ])
  assert.deepEqual(plain(PERMISSIONS), {
    USER_ACCOUNTS_VIEW: `${SA}.USER_ACCOUNTS:VIEW`,
    ROLES_VIEW: `${SA}.ROLES:VIEW`,
    USER_ROLES_VIEW: `${SA}.USER_ROLES:VIEW`,
    ROLE_PERMISSIONS_VIEW: `${SA}.ROLE_PERMISSIONS:VIEW`,
    PERMISSION_CATALOG_VIEW: `${SA}.PERMISSION_CATALOG:VIEW`,
    USER_PERMISSION_OVERRIDES_VIEW: `${SA}.USER_PERMISSION_OVERRIDES:VIEW`,
    SECURITY_AUDIT_VIEW: `${SA}.SECURITY_AUDIT:VIEW`,
  })
  assert.ok(Object.isFrozen(appRoutes) && appRoutes.every(Object.isFrozen))
  assert.deepEqual(registeredModules.map((module) => module.code), ['COMMON', SA, 'HR', 'HR_EMPLOYEE_SERVICES', WF])
  assert.deepEqual(registry.permissions.filter((p) => p.moduleCode === SA).map((p) => p.key), SECURITY_RESOURCES.flatMap((r) => r.actions.map((a) => `${SA}.${r.code}:${a}`)))
  assert.deepEqual(registeredModules.find((module) => module.code === 'COMMON').resources, [])
})

test('every implemented internal route has exactly one React Router entry with the same path, and back', async () => {
  const router = await read('../src/app/router.jsx')
  const routeMatches = [...router.matchAll(/path: '([^']+)', handle: \{ routeId: '([^']+)' \}, element: <([A-Za-z][A-Za-z0-9]*)/g)]
  const routerRoutes = routeMatches
    .filter(([, , , component]) => component !== 'LegacyEmployeeServicesRedirect')
    .map(([, path, id]) => ({ id, path: `/${path}` }))
  const legacyRedirects = routeMatches.filter(([, , , component]) => component === 'LegacyEmployeeServicesRedirect')
  // The source lists every page that is implemented with all feature switches
  // on; the router keeps only this build's implemented pages (implementedOnly).
  const allSwitchesOn = Object.fromEntries(registry.entries.filter((e) => e.enabledBy).map((e) => [e.enabledBy.env, 'true']))
  const switchable = resolveNavigationEntries(registry.entries, allSwitchesOn).filter((r) => r.type !== 'external' && r.implemented)
  assert.deepEqual(
    routerRoutes.map((r) => `${r.id} ${r.path}`).sort(),
    switchable.map((r) => `${r.id} ${r.path}`).sort(),
  )
  assert.ok(implementedRoutes.every((r) => routerRoutes.some((line) => line.id === r.id)))
  assert.equal(legacyRedirects.length, 9, 'legacy Talent Management links redirect to Employee Services')
  assert.match(router, /children: implementedOnly\(\[/)
  assert.ok(!routerRoutes.some((r) => r.id === 'security-audit'), 'unimplemented pages are never routed')
})

test('Security Administration equals the complete backend catalogue: 8 resources, 23 permissions', () => {
  const module = registeredModules.find((item) => item.code === SA)
  assert.equal(module.name, SECURITY_MODULE.name)
  assert.equal(module.description, SECURITY_MODULE.description)
  assert.equal(module.displayOrder, SECURITY_MODULE.displayOrder)
  assert.deepEqual(
    module.resources.map(({ code, name, actions }) => ({ code, name, actions: [...actions] })),
    SECURITY_RESOURCES.map(({ code, name, actions }) => ({ code, name, actions: [...actions] })),
  )
  const backend = SECURITY_RESOURCES.flatMap((r) => r.actions.map((a) => `${SA}.${r.code}:${a}`))
  const registered = registry.permissions.filter((p) => p.moduleCode === SA).map((p) => p.key)
  assert.equal(module.resources.length, 8)
  assert.equal(registered.length, 23)
  assert.deepEqual(registered, backend)
  assert.deepEqual(registered, backend)
  assert.deepEqual(registeredModules.find((item) => item.code === 'COMMON').resources, [], 'the common module adds no permissions')
  for (const [resource, actions] of [
    [REQ, ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_ATTACHMENTS']],
    [INTERVIEW, ['VIEW', 'CREATE', 'UPDATE', 'DELETE']],
    [OFFER, ['VIEW', 'CREATE', 'UPDATE', 'DELETE']],
  ]) {
    assert.deepEqual(
      registry.permissions.filter((permission) => permission.key.startsWith(`${resource}:`)).map((permission) => permission.key),
      actions.map((action) => `${resource}:${action}`),
    )
  }
  assert.deepEqual(
    registry.permissions.filter((permission) => permission.key.startsWith(`${ARABIC_SALARY_CERTIFICATES}:`)).map((permission) => permission.key),
    [
      `${ARABIC_SALARY_CERTIFICATES}:VIEW`,
      `${ARABIC_SALARY_CERTIFICATES}:CREATE`,
      `${ARABIC_SALARY_CERTIFICATES}:UPDATE`,
      `${ARABIC_SALARY_CERTIFICATES}:DELETE`,
    ],
  )
  assert.deepEqual(
    registry.permissions.filter((permission) => permission.key.startsWith(`${ENGLISH_SALARY_CERTIFICATES}:`)).map((permission) => permission.key),
    [
      `${ENGLISH_SALARY_CERTIFICATES}:VIEW`,
      `${ENGLISH_SALARY_CERTIFICATES}:CREATE`,
      `${ENGLISH_SALARY_CERTIFICATES}:UPDATE`,
      `${ENGLISH_SALARY_CERTIFICATES}:DELETE`,
    ],
  )
  assert.deepEqual(
    registry.permissions.filter((permission) => permission.key.startsWith(`${BUSINESS_VISA_LETTERS}:`)).map((permission) => permission.key),
    [
      `${BUSINESS_VISA_LETTERS}:VIEW`,
      `${BUSINESS_VISA_LETTERS}:CREATE`,
      `${BUSINESS_VISA_LETTERS}:UPDATE`,
      `${BUSINESS_VISA_LETTERS}:DELETE`,
    ],
  )
  assert.deepEqual(
    registry.permissions.filter((permission) => permission.key.startsWith(`${TOURIST_VISA_LETTERS}:`)).map((permission) => permission.key),
    [
      `${TOURIST_VISA_LETTERS}:VIEW`,
      `${TOURIST_VISA_LETTERS}:CREATE`,
      `${TOURIST_VISA_LETTERS}:UPDATE`,
      `${TOURIST_VISA_LETTERS}:DELETE`,
    ],
  )
  assert.deepEqual(
    registry.permissions.filter((permission) => permission.key.startsWith(`${WARNING_LETTERS}:`)).map((permission) => permission.key),
    [
      `${WARNING_LETTERS}:VIEW`,
      `${WARNING_LETTERS}:CREATE`,
      `${WARNING_LETTERS}:UPDATE`,
      `${WARNING_LETTERS}:DELETE`,
    ],
  )
  for (const key of Object.values(SECURITY_ACTIONS)) assert.ok(registered.includes(key), `${key} is registered`)
  for (const key of new Set(navigationEntries.flatMap((e) => [e.permission, ...(e.alsoRequires || [])]).filter(Boolean))) {
    assert.ok(registry.permissions.some((permission) => permission.key === key), `navigation uses only registered permissions: ${key}`)
  }
})

test('common links need authentication only; Security Administration keeps permission, alsoRequires and MFA', () => {
  const common = appRoutes.filter((route) => !route.permission && route.implemented).map((route) => route.id)
  assert.deepEqual(common, ['dashboard', 'pending-worklist', 'account-password', 'account-authenticator'])
  for (const access of [{ status: 'loading' }, { status: 'error' }, { status: 'ready', has: () => false }]) {
    for (const id of common) assert.equal(routeAccess(appRoutes.find((r) => r.id === id), access), 'allowed')
    for (const { id } of HR_RECRUITMENT_ROUTES.filter((route) => route.enabledBy)) assert.equal(routeAccess(appRoutes.find((r) => r.id === id), access), 'unavailable', `${id} is switched off`)
  }
  const security = appRoutes.filter((route) => route.section === 'security')
  assert.ok(HR_RECRUITMENT_ROUTES.every((expected) => appRoutes.find((route) => route.id === expected.id)?.permission === expected.permission))
  for (const route of appRoutes.filter((item) => item.section === HR && item.permission && !item.enabledBy)) {
    assert.equal(routeAccess(route, { status: 'loading' }), 'pending')
    assert.equal(routeAccess(route, { status: 'ready', has: () => false }), 'denied')
  }
  assert.ok(security.every((route) => route.requiresMfa === true && route.permission.startsWith(`${SA}.`)))
  const all = { status: 'ready', has: () => true, mfaVerified: false, adminMfaRequired: true }
  assert.ok(security.filter((r) => r.implemented).every((route) => routeAccess(route, all) === 'mfa_required'))
  assert.ok(security.filter((r) => r.implemented).every((route) => routeAccess(route, { ...all, adminMfaRequired: false }) === 'allowed'))
  const userRoles = appRoutes.find((r) => r.id === 'user-roles')
  const withoutAccounts = { status: 'ready', mfaVerified: true, has: (key) => key !== PERMISSIONS.USER_ACCOUNTS_VIEW }
  assert.equal(routeAccess(userRoles, withoutAccounts), 'denied')
  assert.equal(routeAccess(appRoutes.find((r) => r.id === 'security-audit'), { ...all, mfaVerified: true }), 'unavailable')
})

// ---------------------------------------------------------------- external destinations

test('external URLs: absolute https or loopback http with a host name or IP address and no credentials', () => {
  for (const url of [
    'https://reports.example.com/production', 'https://10.20.30.40:8443/portal?plant=1', 'https://[2001:db8::1]/x',
    'http://localhost:7384', 'http://127.0.0.1:7384', 'http://[::1]:7384',
  ]) assert.ok(validateExternalUrl(url), url)
  for (const url of [
    'http://reports.example.com', 'http://localhost.evil.example', 'javascript:alert(1)', 'data:text/html,x', '//reports.example.com',
    'https://user:pass@reports.example.com', 'https://token@reports.example.com', 'https://reports.example.com/a b',
    'https://reports.example.com\\x', '/dashboard', 'ftp://files.example.com', '', null, 42,
  ]) assert.equal(validateExternalUrl(url), null, String(url))
  assert.equal(resolveExternalHref({ env: 'VITE_EXTERNAL_PORTAL' }, { VITE_EXTERNAL_PORTAL: ' https://10.0.0.5/portal ' }), 'https://10.0.0.5/portal')
  assert.equal(resolveExternalHref({ env: 'VITE_EXTERNAL_PORTAL' }, {}), null, 'unresolved')
  assert.equal(resolveExternalHref({ env: 'VITE_EXTERNAL_PORTAL' }, { VITE_EXTERNAL_PORTAL: 'http://10.0.0.5' }), null, 'invalid')
  assert.equal(resolveExternalHref({ env: 'VITE_EXTERNAL_PORTAL' }, { VITE_EXTERNAL_PORTAL: 'http://localhost:7384' }), 'http://localhost:7384/', 'local development link')
})

function moduleWith(navigation, extra = {}) {
  return defineModule({
    code: 'TEST_MODULE', name: 'Test', displayOrder: 1,
    resources: [{ code: 'THINGS', name: 'Things', actions: ['VIEW', 'RUN'], navigation }],
    ...extra,
  })
}
const GROUPS = [{ id: 'g', label: 'Group', icon: 'circle' }]

test('navigation type: missing or internal is a route; only explicit external is external; others fail', () => {
  const built = buildRegistry([moduleWith([
    { id: 'a', path: '/a', title: 'A', icon: 'circle', group: 'g', order: 1 },
    { id: 'b', type: 'internal', path: '/b', title: 'B', icon: 'circle', group: 'g', order: 2 },
    { id: 'c', type: 'external', href: 'https://c.example.com/', title: 'C', icon: 'circle', group: 'g', order: 3 },
  ])], GROUPS)
  assert.deepEqual(built.entries.map((e) => [e.id, e.type ?? 'internal', e.path ?? e.href]), [
    ['a', 'internal', '/a'], ['b', 'internal', '/b'], ['c', 'external', 'https://c.example.com/'],
  ])
  for (const type of ['link', 'EXTERNAL', null, '']) {
    assert.throws(() => moduleWith([{ id: 'x', type, path: '/x', title: 'X', icon: 'circle', group: 'g', order: 1 }]), /unknown navigation type/)
  }
})

test('external entries are permission-filtered, hidden when unresolved and never routed or matched', async () => {
  const built = buildRegistry([moduleWith([
    { id: 'reports', type: 'external', href: 'https://reports.example.com/', title: 'Reports', icon: 'circle', group: 'security', order: 1, requiredAction: 'RUN' },
    { id: 'portal', type: 'external', href: { env: 'VITE_EXTERNAL_TEST_PORTAL' }, title: 'Portal', icon: 'circle', group: 'security', order: 2 },
  ])], NAVIGATION_GROUPS)
  const entries = built.entries.map((entry) => {
    const href = resolveExternalHref(entry.href, {})
    return { ...entry, href, implemented: entry.implemented && href !== null }
  })
  const allowed = { status: 'ready', mfaVerified: true, has: () => true }
  const denied = { status: 'ready', mfaVerified: true, has: (key) => !key.endsWith(':RUN') }
  assert.deepEqual(authorizedNavigation(allowed, entries)[0].items.map((e) => e.id), ['reports'], 'unresolved env hidden')
  assert.deepEqual(authorizedNavigation(denied, entries), [], 'requires its permission')
  assert.deepEqual(paletteCommands(allowed, 'authenticated', entries), [
    { id: 'reports', label: 'Reports', icon: 'circle', href: 'https://reports.example.com/', external: true, group: 'Security administration' },
  ])
  assert.ok(appRoutes.every((route) => route.type !== 'external' && route.path), 'no external entry is an app route')
  assert.equal(findAppRoute('https://reports.example.com/'), null)
  const link = await read('../src/components/navigation/ExternalNavigationLink.jsx')
  assert.match(link, /target=\{EXTERNAL_LINK_TARGET\} rel=\{EXTERNAL_LINK_REL\}/)
  const destinations = await read('../src/config/externalDestinations.js')
  assert.match(destinations, /EXTERNAL_LINK_TARGET = '_blank'/)
  assert.match(destinations, /EXTERNAL_LINK_REL = 'noopener noreferrer'/)
  assert.match(destinations, /EXTERNAL_WINDOW_FEATURES = 'noopener,noreferrer'/)
  const palette = await read('../src/components/layout/CommandPalette.jsx')
  assert.match(palette, /window\.open\(item\.href, EXTERNAL_LINK_TARGET, EXTERNAL_WINDOW_FEATURES\)/)
  for (const file of ['layout/Sidebar.jsx', 'layout/Header.jsx']) {
    assert.match(await read(`../src/components/${file}`), /type === 'external'[\s\S]*ExternalNavigationLink/, file)
  }
})

// ---------------------------------------------------------------- validation

test('definitions are validated: duplicates, unknown actions, references, groups and fields fail', () => {
  const entry = (overrides = {}) => ({ id: 'x', path: '/x', title: 'X', icon: 'circle', group: 'g', order: 1, ...overrides })
  const cases = [
    [() => defineModule({ code: 'bad', name: 'Bad', displayOrder: 1, resources: [] }), /code must match/],
    [() => defineModule({ code: 'M', name: 'M', displayOrder: 1, resources: [{ code: 'R', name: 'R', actions: ['VIEW', 'VIEW'] }] }), /duplicate action/],
    [() => defineModule({ code: 'M', name: 'M', displayOrder: 1, resources: [{ code: 'R', name: 'R', actions: ['FLY'] }] }), /not in the standard action catalogue/],
    [() => defineModule({ code: 'M', name: 'M', displayOrder: 1, resources: [{ code: 'R', name: 'R', actions: ['VIEW'] }, { code: 'R', name: 'R2', actions: ['VIEW'] }] }), /duplicate resource code/],
    [() => defineModule({ code: 'M', name: 'M', displayOrder: 1, resources: [{ code: 'R', name: 'R', actions: ['VIEW'], extra: 1 }] }), /unknown property "extra"/],
    [() => moduleWith([entry({ requiredAction: 'APPROVE' })]), /requiredAction APPROVE is not an action/],
    [() => moduleWith([entry({ href: 'https://x.example.com' })]), /internal entry has a path, not an href/],
    [() => moduleWith([entry({ type: 'external', href: 'https://x.example.com' })]), /external entry has an href, not a path/],
    [() => moduleWith([entry({ path: undefined, type: 'external', href: 'http://x.example.com' })]), /absolute https URL/],
    [() => moduleWith([entry({ path: undefined, type: 'external', href: { env: 'VITE_API_BASE_URL' } })]), /VITE_EXTERNAL_/],
    [() => moduleWith([entry({ path: undefined, type: 'external', href: 'https://x.example.com', hidden: true })]), /cannot be hidden/],
    [() => moduleWith([entry({ path: 'relative' })]), /absolute application route/],
    [() => moduleWith([entry({ enabledBy: { env: 'VITE_API_BASE_URL' } })]), /VITE_FEATURE_/],
    [() => moduleWith([entry({ enabledBy: 'VITE_FEATURE_X' })]), /enabledBy: must be an object/],
    [() => moduleWith([entry({ enabledBy: { env: 'VITE_FEATURE_X', default: true } })]), /unknown property "default"/],
    [() => moduleWith([entry({ path: undefined, type: 'external', href: 'https://x.example.com', enabledBy: { env: 'VITE_FEATURE_X' } })]), /internal entries only/],
    [() => defineModule({ code: 'C', name: 'C', rbac: false, navigation: [entry({ requiredAction: 'VIEW' })] }), /require no permission/],
    [() => buildRegistry([moduleWith([entry(), entry({ path: '/y', order: 2 })])], GROUPS), /duplicate navigation id/],
    [() => buildRegistry([moduleWith([entry(), entry({ id: 'y', order: 2 })])], GROUPS), /duplicate route path/],
    [() => buildRegistry([moduleWith([entry(), entry({ id: 'y', path: '/y' })])], GROUPS), /order 1 is already used/],
    [() => buildRegistry([moduleWith([entry({ group: 'nope' })])], GROUPS), /unknown group/],
    [() => buildRegistry([moduleWith([entry({ alsoRequires: ['OTHER:VIEW'] })])], GROUPS), /not a registered permission/],
    [() => buildRegistry([moduleWith([]), moduleWith([])], GROUPS), /duplicate module code/],
    [() => buildRegistry([{ code: 'RAW', resources: [] }], GROUPS), /defineModule/],
  ]
  for (const [run, message] of cases) assert.throws(run, (error) => error instanceof RegistryError && message.test(error.message), String(message))
  // Cross-module navigation ids and paths are checked across the whole registry.
  assert.throws(() => buildRegistry([...registeredModules, defineModule({
    code: 'OTHER', name: 'Other', displayOrder: 5,
    resources: [{ code: 'R', name: 'R', actions: ['VIEW'], navigation: [{ id: 'roles', path: '/other', title: 'O', icon: 'circle', group: 'security', order: 99 }] }],
  })], NAVIGATION_GROUPS), /duplicate navigation id/)
})

test('the action catalogue keeps every existing code and satisfies the Oracle ACTION_CODE rule', () => {
  const existing = ['VIEW', 'CREATE', 'UPDATE', 'DEACTIVATE', 'ACTIVATE', 'DISABLE', 'REVOKE_SESSIONS', 'MANAGE', 'GRANT', 'REVOKE', 'ASSIGN', 'ISSUE', 'EXPORT']
  for (const code of existing) assert.ok(isStandardAction(code), code)
  for (const [code, item] of Object.entries(STANDARD_ACTIONS)) {
    assert.equal(item.code, code)
    assert.match(code, /^[A-Z][A-Z0-9_]*$/)
    assert.ok(code.length <= 40 && item.name && item.category && item.description)
  }
  assert.equal(isStandardAction('toString'), false)
})

// ---------------------------------------------------------------- example isolation and purity

test('the example is valid on its own but never imported, registered or routed', async () => {
  const example = buildRegistry(EXAMPLE_MODULES, EXAMPLE_GROUPS)
  assert.equal(example.entries.find((e) => e.id === 'example-sales-orders').type, undefined, 'default internal')
  assert.equal(example.entries.find((e) => e.id === 'example-production-dashboard').type, 'external')
  assert.ok(EXAMPLE_MODULES.find((m) => m.code === 'EXAMPLE_PRODUCTION').resources.some((r) => !r.navigation.length))

  const exampleIds = new Set(example.entries.map((e) => e.id))
  const exampleCodes = new Set(EXAMPLE_MODULES.map((m) => m.code))
  assert.ok(!navigationEntries.some((e) => exampleIds.has(e.id) || e.path?.startsWith('/example')))
  assert.ok(!registeredModules.some((m) => exampleCodes.has(m.code)))

  const files = await readdir(new URL('../src/', import.meta.url), { recursive: true })
  for (const file of files.filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.endsWith('module-registry.example.js'))) {
    const source = await read(`../src/${file.replaceAll('\\', '/')}`)
    assert.doesNotMatch(source, /(from|import\()\s*['"][^'"]*module-registry\.example/, `${file} must not import the example`)
  }
})

test('registry definitions are plain JavaScript usable by Node.js tooling (no React, Vite or aliases)', async () => {
  const dir = new URL('../src/config/registry/', import.meta.url)
  const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.js'))
  assert.ok(files.length >= 6)
  for (const file of files) {
    const source = await read(`../src/config/registry/${file.replaceAll('\\', '/')}`)
    assert.doesNotMatch(source, /import\.meta|from ['"](react|react-router|vite)|from ['"]@\//, file)
  }
})
