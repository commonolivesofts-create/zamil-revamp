// Content and pure helpers for the design-preview workspace dashboard.
//
// Everything here is either a visible dashboard section or an explicitly
// labelled catalogue preview. Deferred workflow screens and their form data
// have been removed; the dashboard keeps only the home canvas and Module Atlas.

export const ZAMIL_LOGO_SRC = `${import.meta.env?.BASE_URL ?? '/'}zamil-logo.png`

export const PREVIEW_PROFILE = Object.freeze({
  fullName: 'Zaid Sayyed',
  employeeNumber: '2172',
  username: 'ZAID.SAYYED',
  email: 'patel.hussain@olivesofts.com',
  jobTitle: 'IT supervisor',
  department: 'IT Department',
})

export const PROFILE_FIELDS = Object.freeze([
  { key: 'fullName', label: 'Full name' },
  { key: 'employeeNumber', label: 'Employee number' },
  { key: 'username', label: 'Username' },
  { key: 'email', label: 'Email' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'department', label: 'Department' },
])

const text = (value) => (typeof value === 'string' ? value.trim() : '')

export function resolveProfile(user, status) {
  if (status === 'preview') return { ...PREVIEW_PROFILE, isPreview: true }
  return {
    fullName: text(user?.fullName) || text(user?.username) || 'Your workspace',
    employeeNumber: text(user?.employeeNumber),
    username: text(user?.username),
    email: text(user?.email),
    jobTitle: text(user?.jobTitle),
    department: text(user?.department),
    isPreview: false,
  }
}

export function profileRows(profile) {
  return PROFILE_FIELDS.map((field) => ({
    ...field,
    value: profile?.[field.key] || 'Not recorded on this account',
  }))
}

export function initialsOf(value) {
  const words = text(value).split(/\s+/).filter(Boolean)
  if (!words.length) return 'ZW'
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

export function displayName(profile) {
  return text(profile?.fullName) || text(profile?.username) || 'Your workspace'
}

export function formatDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

// ---------------------------------------------------------------------------
// The five-page folio

export const BOOK_PAGES = Object.freeze([
  {
    id: 'people',
    name: 'People',
    subtitle: 'Four HR forms',
    icon: 'users',
    description: 'People operations · four demo form shortcuts',
    action: 'Open onboarding',
    body: {
      kind: 'people',
      rows: [
        { label: 'Onboarding', icon: 'users' },
        { label: 'Leave request', icon: 'clock' },
        { label: 'Attendance', icon: 'check' },
        { label: 'Payroll query', icon: 'wallet' },
      ],
    },
  },
  {
    id: 'finance',
    name: 'Finance',
    subtitle: 'Credit note',
    icon: 'file-text',
    description: 'Ready-to-use finance workflow · demo records',
    action: 'Create credit note',
    body: {
      kind: 'finance',
      number: 'CN / 2026',
      rows: [
        { label: 'Invoice number', value: '12602886' },
        { label: 'Customer', value: 'National Paints' },
        { label: 'Next step', value: 'Prepare note →' },
      ],
    },
  },
  {
    id: 'approvals',
    name: 'Approvals',
    subtitle: 'Items to review',
    icon: 'check',
    description: 'Decision-focused queue · illustrative activity',
    action: 'Review queue',
    body: {
      kind: 'approvals',
      rows: [
        { label: 'Credit note review', team: 'Finance' },
        { label: 'Supplier requests', team: 'Purchasing' },
        { label: 'Policy sign-off', team: 'Compliance' },
      ],
    },
  },
  {
    id: 'insights',
    name: 'Insights',
    subtitle: 'Operational pulse',
    icon: 'chart-column',
    description: 'Explore activity across business workflows',
    action: 'Open insights',
    body: {
      kind: 'insights',
      metric: '86.4%',
      caption: 'demo completion',
      bars: [32, 51, 44, 65, 53, 80, 72, 91],
    },
  },
  {
    id: 'explore',
    name: 'Explore',
    subtitle: 'All business spaces',
    icon: 'compass',
    description: 'One entry point to the business-module atlas',
    action: 'Explore modules',
    view: 'atlas',
    body: {
      kind: 'explore',
      tags: [
        { label: 'Finance', icon: 'wallet' },
        { label: 'People', icon: 'users' },
        { label: 'Operations', icon: 'layers' },
        { label: 'Procurement', icon: 'folder' },
      ],
    },
  },
])

// ---------------------------------------------------------------------------
// Quick links

export const QUICK_DEFINITIONS = Object.freeze({
  HR: {
    icon: 'users',
    sub: 'People operations, in one place.',
    forms: [
      { name: 'Onboarding', desc: 'Start a new employee', icon: 'users' },
      { name: 'Leave Request', desc: 'Plan time away', icon: 'clock' },
      { name: 'Attendance', desc: 'Correct a time entry', icon: 'check' },
      { name: 'Payroll Query', desc: 'Ask about a payslip', icon: 'wallet' },
    ],
  },
  Finance: {
    icon: 'wallet',
    sub: 'Money flows, without detours.',
    forms: [
      { name: 'Credit Note', desc: 'Create, adjust and review', icon: 'file-text' },
      { name: 'Accounts Payable', desc: 'Catalog preview', icon: 'wallet' },
      { name: 'Bank Reconciliation', desc: 'Catalog preview', icon: 'chart-column' },
      { name: 'Budgets', desc: 'Catalog preview', icon: 'layers' },
    ],
  },
  Supply: {
    icon: 'layers',
    sub: 'From request to receipt.',
    forms: [
      { name: 'Purchase Requests', desc: 'Catalog preview', icon: 'file-text' },
      { name: 'Purchase Orders', desc: 'Catalog preview', icon: 'layers' },
      { name: 'Vendor Directory', desc: 'Catalog preview', icon: 'users' },
      { name: 'Sourcing', desc: 'Catalog preview', icon: 'search' },
    ],
  },
  Projects: {
    icon: 'layout-grid',
    sub: 'Momentum you can see.',
    forms: [
      { name: 'Project Portfolio', desc: 'Catalog preview', icon: 'layers' },
      { name: 'Milestones', desc: 'Catalog preview', icon: 'check' },
      { name: 'Sprint Board', desc: 'Catalog preview', icon: 'layout-grid' },
      { name: 'Project Timesheets', desc: 'Catalog preview', icon: 'clock' },
    ],
  },
})

export const QUICK_CATEGORY_IDS = Object.freeze(Object.keys(QUICK_DEFINITIONS))

// ---------------------------------------------------------------------------
// Catalogue: twelve domains, eighteen topics each.

export const DOMAIN_DEFINITIONS = Object.freeze([
  { name: 'Finance', icon: 'wallet' },
  { name: 'People', icon: 'users' },
  { name: 'Operations', icon: 'layers' },
  { name: 'Procurement', icon: 'folder' },
  { name: 'Sales', icon: 'chart-column' },
  { name: 'Projects', icon: 'layout-grid' },
  { name: 'Compliance', icon: 'check' },
  { name: 'Inventory', icon: 'folder' },
  { name: 'Service', icon: 'zap' },
  { name: 'IT & Access', icon: 'settings' },
  { name: 'Analytics', icon: 'chart-column' },
  { name: 'Administration', icon: 'settings' },
])

export const MODULE_TOPICS = Object.freeze({
  Finance: ['Credit Note', 'Debit Note', 'Invoices', 'Accounts Payable', 'Accounts Receivable', 'GL Entries', 'Bank Reconciliation', 'Expense Claims', 'Budgets', 'Cash Management', 'Tax Register', 'Cost Centers', 'Payments', 'Treasury', 'Asset Ledger', 'Finance Reports', 'Journal Review', 'Receipts'],
  People: ['Employee Directory', 'Leave Requests', 'Payroll', 'Hiring', 'Attendance', 'Onboarding', 'Offboarding', 'Benefits', 'Shifts', 'Reviews', 'Training', 'Org Chart', 'Timesheets', 'Contractors', 'Grievances', 'Reimbursements', 'Policies', 'People Reports'],
  Operations: ['Tasks', 'Work Orders', 'Checklists', 'Schedules', 'Facilities', 'Dispatch', 'Route Planning', 'Capacity', 'Quality Checks', 'Maintenance', 'SLA Tracking', 'Incident Log', 'Vendor Visits', 'Resource Bookings', 'Handover', 'Service Levels', 'Audits', 'Daily Logs'],
  Procurement: ['Purchase Requests', 'Purchase Orders', 'Vendor Directory', 'RFQs', 'Bid Comparison', 'Supplier Scorecards', 'Contracts', 'Purchase Returns', 'Spend Analysis', 'Approval Chains', 'Receipts', 'Catalogs', 'Price Lists', 'Inward Register', 'Purchase Analytics', 'Vendor Invoices', 'Sourcing', 'Requisitions'],
  Sales: ['Leads', 'Opportunities', 'Accounts', 'Quotes', 'Orders', 'Forecasts', 'Pipeline', 'Discount Requests', 'Targets', 'Territories', 'Customer Visits', 'Deals', 'Sales Reports', 'Renewals', 'Sales Returns', 'Collections', 'Price Books', 'Sales Campaigns'],
  Projects: ['Project Portfolio', 'Roadmaps', 'Milestones', 'Assignments', 'Risks', 'Issues', 'Gantt', 'Sprint Board', 'Project Timesheets', 'Resource Plans', 'Budgets', 'Dependencies', 'Project Reports', 'Retrospectives', 'Change Requests', 'Approvals', 'Project Files', 'Project Intake'],
  Compliance: ['Policy Register', 'Risk Register', 'Audit Calendar', 'Control Testing', 'Evidence Vault', 'Regulatory Updates', 'Nonconformities', 'Incident Reviews', 'Compliance Cases', 'Certifications', 'Approvals', 'Legal Holds', 'Document Reviews', 'KYC Checks', 'Access Reviews', 'Training Records', 'Corrective Actions', 'Compliance Reports'],
  Inventory: ['Products', 'Stock Levels', 'Stock Transfers', 'Warehouse Map', 'Cycle Counts', 'Goods Receipt', 'Goods Issue', 'Returns', 'Reorder Rules', 'Suppliers', 'Lots & Batches', 'Serial Numbers', 'Stock Ledger', 'Stock Valuation', 'Warehouse Tasks', 'Bin Locations', 'Inventory Reports', 'Adjustments'],
  Service: ['Support Tickets', 'Queues', 'Escalations', 'Knowledge Base', 'Field Visits', 'Service Catalog', 'Response Templates', 'SLA Breaches', 'Service Analytics', 'Case Notes', 'Help Desk', 'Feedback', 'Chat History', 'Service Teams', 'Workload', 'Service Reviews', 'Resolved Cases', 'Customer Satisfaction'],
  'IT & Access': ['User Access', 'Permission Sets', 'SSO Settings', 'API Keys', 'Audit Trail', 'Integrations', 'Webhooks', 'System Health', 'Asset Inventory', 'Patch Status', 'Backups', 'Environment Config', 'Session Logs', 'Access Requests', 'Change History', 'Devices', 'Incident Response', 'IT Reports'],
  Analytics: ['Executive Pulse', 'Finance Insights', 'HR Insights', 'Operations Insights', 'Custom Reports', 'Dashboard Builder', 'KPI Library', 'Data Sources', 'Scheduled Reports', 'Business Forecasts', 'Trend Explorer', 'Data Quality', 'Performance Reports', 'Exports', 'Cohorts', 'Data Studio', 'Anomaly Review', 'Metrics Catalog'],
  Administration: ['Company Settings', 'Branches', 'Divisions', 'Roles', 'Teams', 'Currencies', 'Holidays', 'Workflows', 'Notifications', 'Templates', 'Data Import', 'Data Export', 'Translations', 'Themes', 'System Preferences', 'Audit Settings', 'Support Center', 'Subscription'],
})

const DOMAIN_ICON = new Map(DOMAIN_DEFINITIONS.map((domain) => [domain.name, domain.icon]))

export const MODULES = Object.freeze(
  DOMAIN_DEFINITIONS.flatMap(({ name: domain }) =>
    MODULE_TOPICS[domain].map((name, index) => ({
      id: `${domain}-${index}`,
      name,
      domain,
      icon: DOMAIN_ICON.get(domain) ?? 'folder',
    })),
  ),
)

export const MODULES_PER_PAGE = 32

export function filterModules({ domain = 'all', query = '' } = {}) {
  const needle = text(query).toLowerCase()
  return MODULES.filter((module) => {
    if (domain !== 'all' && module.domain !== domain) return false
    if (!needle) return true
    return `${module.name} ${module.domain}`.toLowerCase().includes(needle)
  })
}

// ---------------------------------------------------------------------------
// Home content

export const BUSINESS_SPACES = Object.freeze([
  { name: 'Finance', icon: 'wallet', description: 'Credit notes, budgets, treasury' },
  { name: 'People', icon: 'users', description: 'Teams, leave, payroll' },
  { name: 'Operations', icon: 'layers', description: 'Daily workflows' },
  { name: 'Procurement', icon: 'folder', description: 'Purchase-to-pay' },
  { name: 'Sales', icon: 'chart-column', description: 'Revenue workflows' },
  { name: 'Projects', icon: 'layout-grid', description: 'Milestones and delivery' },
])

export const ATTENTION_ITEMS = Object.freeze([
  { label: 'Credit note review', team: 'Finance', count: '03' },
  { label: 'Purchase requests', team: 'Procurement', count: '07' },
  { label: 'Policy sign-off', team: 'Compliance', count: '2 new' },
])

export const WORKFLOW_BARS = Object.freeze([36, 53, 41, 65, 56, 79, 72, 94, 84])

export const FOOTER_COUNTS = Object.freeze({
  modules: MODULES.length,
  views: 1,
})
