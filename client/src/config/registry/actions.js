// Standard permission action codes (XX_ZRV_PERMISSIONS.ACTION_CODE vocabulary).
//
// Pure data, shared by the frontend and by future Node.js tooling: no React,
// browser or Vite dependencies. A resource lists the subset of these codes it
// actually supports; listing a code here grants nothing and creates nothing in
// Oracle. Codes satisfy the locked CK_ZRV_PERM_ACTION constraint
// (^[A-Z][A-Z0-9_]*$, at most 40 characters) and are stable once used: never
// rename one. Add a new code only when no existing one describes the operation.

export const ACTION_CATEGORIES = Object.freeze({
  CORE: 'Core and records',
  WORKFLOW: 'Workflow',
  FINANCE: 'Finance',
  MANUFACTURING: 'Manufacturing',
  INVENTORY: 'Inventory',
  REPORTING: 'Reporting and data exchange',
  SECURITY: 'Security and administration',
})

const action = (code, name, category, description) => Object.freeze({ code, name, category, description })

// The first block contains every action used by the existing Security
// Administration catalogue (server/src/modules/access-control/securityCatalog.js).
export const STANDARD_ACTIONS = Object.freeze(Object.fromEntries([
  // Existing codes (in use).
  action('VIEW', 'View', 'CORE', 'Open and read records or pages.'),
  action('CREATE', 'Create', 'CORE', 'Create new records.'),
  action('UPDATE', 'Update', 'CORE', 'Change existing records.'),
  action('ACTIVATE', 'Activate', 'CORE', 'Make an inactive record active.'),
  action('DEACTIVATE', 'Deactivate', 'CORE', 'Make a record inactive without deleting it.'),
  action('DISABLE', 'Disable', 'SECURITY', 'Disable an account or capability.'),
  action('REVOKE_SESSIONS', 'Revoke sessions', 'SECURITY', 'End the active sessions of an account.'),
  action('MANAGE', 'Manage', 'SECURITY', 'Administer a catalogue or configuration as a whole.'),
  action('GRANT', 'Grant', 'SECURITY', 'Grant a permission.'),
  action('REVOKE', 'Revoke', 'SECURITY', 'Revoke a grant or assignment.'),
  action('ASSIGN', 'Assign', 'SECURITY', 'Assign a role or responsibility.'),
  action('ISSUE', 'Issue', 'SECURITY', 'Issue an item: an account link, or stock issued to a consumer.'),
  action('EXPORT', 'Export', 'REPORTING', 'Export data from the application.'),
  // Core and records.
  action('DELETE', 'Delete', 'CORE', 'Permanently remove records where the business allows it.'),
  action('PRINT', 'Print', 'CORE', 'Print documents or records.'),
  // Workflow.
  action('SUBMIT', 'Submit', 'WORKFLOW', 'Submit a document for processing or approval.'),
  action('APPROVE', 'Approve', 'WORKFLOW', 'Approve a submitted document.'),
  action('REJECT', 'Reject', 'WORKFLOW', 'Reject a submitted document.'),
  action('RETURN', 'Return', 'WORKFLOW', 'Return a document to its originator for correction.'),
  action('CANCEL', 'Cancel', 'WORKFLOW', 'Cancel a document or request.'),
  action('CLOSE', 'Close', 'WORKFLOW', 'Close a completed document or period.'),
  action('REOPEN', 'Reopen', 'WORKFLOW', 'Reopen a closed document or period.'),
  action('HOLD', 'Hold', 'WORKFLOW', 'Place a document or order on hold.'),
  action('RELEASE', 'Release', 'WORKFLOW', 'Release a held document or order.'),
  action('COMPLETE', 'Complete', 'WORKFLOW', 'Mark work as complete.'),
  // Finance.
  action('POST', 'Post', 'FINANCE', 'Post a transaction to the ledger.'),
  action('UNPOST', 'Unpost', 'FINANCE', 'Withdraw a posting while its period still allows it.'),
  action('REVERSE', 'Reverse', 'FINANCE', 'Create a reversing transaction.'),
  action('RECONCILE', 'Reconcile', 'FINANCE', 'Reconcile accounts or statements.'),
  action('PAY', 'Pay', 'FINANCE', 'Execute or release a payment.'),
  action('ALLOCATE', 'Allocate', 'FINANCE', 'Allocate amounts, budgets or costs.'),
  // Manufacturing.
  action('SCHEDULE', 'Schedule', 'MANUFACTURING', 'Schedule production or work orders.'),
  action('START', 'Start', 'MANUFACTURING', 'Start an operation or work order.'),
  action('STOP', 'Stop', 'MANUFACTURING', 'Stop an operation or work order.'),
  // Inventory.
  action('RECEIVE', 'Receive', 'INVENTORY', 'Receive goods into stock.'),
  action('TRANSFER', 'Transfer', 'INVENTORY', 'Transfer stock between locations.'),
  action('ADJUST', 'Adjust', 'INVENTORY', 'Adjust stock quantities or values.'),
  action('COUNT', 'Count', 'INVENTORY', 'Record physical stock counts.'),
  // Reporting and data exchange.
  action('RUN', 'Run', 'REPORTING', 'Run a report or process on demand.'),
  action('IMPORT', 'Import', 'REPORTING', 'Import data into the application.'),
  action('UPLOAD', 'Upload', 'REPORTING', 'Upload files or attachments.'),
  action('MANAGE_ATTACHMENTS', 'Manage attachments', 'CORE', 'Upload and remove attachments on a record.'),
  action('DOWNLOAD', 'Download', 'REPORTING', 'Download files or attachments.'),
  // Security and administration.
  action('CONFIGURE', 'Configure', 'SECURITY', 'Change module configuration or settings.'),
  action('AUDIT', 'Audit', 'SECURITY', 'Review audit information.'),
].map((item) => [item.code, item])))

export const isStandardAction = (code) => typeof code === 'string' && Object.hasOwn(STANDARD_ACTIONS, code)
