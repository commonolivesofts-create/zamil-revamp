// Framework-free rules of the business-first Workflow Manager screens (Smart Mapping UX, see
// docs/workflow-manager/SMART-FORM-DATA-AND-SELF-SERVICE-UX-SPEC.md): readable names and kinds
// for database columns, truthful readiness of forms and data sources from real API data, the
// record identifier recommendation (only identifiers the database verifiably enforces) and
// plain-language explanations of validation results. Nothing here changes what is validated or
// saved: the server's rules and codes stay authoritative and remain visible to technical users.
import { previewEnforcement } from './sourceMappingModel.js'

// --- Readable names ---------------------------------------------------------------------------

const WORDS = Object.freeze({
  ID: 'ID',
  NO: 'number',
  NUM: 'number',
  NBR: 'number',
  QTY: 'quantity',
  AMT: 'amount',
  EMP: 'employee',
  DEPT: 'department',
  ORG: 'organization',
  DESC: 'description',
  DT: 'date',
  REQ: 'request',
  MGR: 'manager',
  STS: 'status',
  CMNT: 'comment',
  REF: 'reference',
  UOM: 'unit of measure',
})

/**
 * Suggested readable name of a database column ("REQUEST_DATE" → "Request date",
 * "EMP_NO" → "Employee number"). Display only — never stored, never used to match data.
 */
export function readableName(name) {
  const parts = String(name ?? '')
    .split(/[_$#]+/)
    .filter(Boolean)
    .map((part) => WORDS[part.toUpperCase()] ?? part.toLowerCase())
  if (!parts.length) return String(name ?? '')
  const text = parts.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** What kind of information a column holds, in plain words. */
export function kindOf(column) {
  const type = String(column?.oracleType ?? '')
  if (/^N?(VAR)?CHAR2?$/.test(type) || type === 'VARCHAR') {
    return column.charLength ? `Text (up to ${column.charLength} characters)` : 'Text'
  }
  if (type === 'NUMBER' || type === 'FLOAT') {
    if (column.scale === 0) return 'Whole number'
    if (Number.isInteger(column.scale) && column.scale > 0) {
      return `Number with ${column.scale} decimal${column.scale === 1 ? '' : 's'}`
    }
    return 'Number'
  }
  if (type === 'DATE') return 'Date (and time)'
  if (/^TIMESTAMP\(\d\) WITH TIME ZONE$/.test(type)) return 'Date and time with time zone'
  if (/^TIMESTAMP/.test(type)) return 'Date and time'
  if (/CLOB$/.test(type)) return 'Long text'
  if (type === 'RAW') return 'Coded value'
  return 'Not usable by workflows'
}

// --- Privacy ------------------------------------------------------------------------------------

export const PRIVACY_LABELS = Object.freeze({
  PUBLIC: 'Public — anyone involved in the request',
  INTERNAL: 'Internal — company staff',
  PERSONAL: 'Personal — identifies a person',
  SENSITIVE: 'Highly confidential',
})

export const PRIVACY_SHORT = Object.freeze({
  PUBLIC: 'Public',
  INTERNAL: 'Internal',
  PERSONAL: 'Personal',
  SENSITIVE: 'Confidential',
})

// --- Readiness (truthful states from real data only) --------------------------------------------

/**
 * Readiness of a registered form's business data. A form is "Ready" only when it is active and a
 * form data profile (mapping version) has been published as its default; versions in any other
 * state are "In setup". Workflow configuration itself is a later package (M3) and is never
 * reported as available here.
 */
export function formReadiness(form) {
  if (!form.isActive) {
    return {
      state: 'INACTIVE',
      label: 'Inactive',
      tone: 'neutral',
      detail: 'The form is deactivated and cannot be used for new workflows.',
    }
  }
  if (form.defaultVersionNo !== null && form.defaultVersionNo !== undefined) {
    return {
      state: 'READY',
      label: 'Data ready',
      tone: 'good',
      detail: `Business data approved (version ${form.defaultVersionNo}).`,
    }
  }
  if (form.versionCount > 0) {
    return {
      state: 'IN_SETUP',
      label: 'Data in setup',
      tone: 'warn',
      detail: 'Its business data is being prepared and is not approved yet.',
    }
  }
  return {
    state: 'NOT_STARTED',
    label: 'Not onboarded',
    tone: 'neutral',
    detail: 'Its business data has not been prepared yet (one-time onboarding).',
  }
}

/** Readiness of a data source's approved field list (source versions). */
export function sourceReadiness(source) {
  if (!source.isActive) {
    return { state: 'INACTIVE', label: 'Inactive', tone: 'neutral' }
  }
  if (source.defaultVersionNo !== null && source.defaultVersionNo !== undefined) {
    return { state: 'READY', label: `Ready · version ${source.defaultVersionNo}`, tone: 'good' }
  }
  if (source.versionCount > 0) return { state: 'IN_SETUP', label: 'In setup', tone: 'warn' }
  return { state: 'NOT_STARTED', label: 'Not set up', tone: 'neutral' }
}

export const SOURCE_KIND_LABELS = Object.freeze({
  TABLE: 'Database table',
  VIEW: 'Database view',
  HANDLER: 'Server integration',
})

// --- Record identifier recommendation -----------------------------------------------------------

const RECOMMENDED_CODE = 'RECORD_ID'

/**
 * The identifier the database itself guarantees to be unique: an enforced primary key, otherwise
 * the narrowest enforced unique constraint or index over NOT NULL columns. Never a guess from a
 * column name; null when the database enforces none (then technical onboarding decides).
 */
export function recommendIdentifier(snapshot, columns = []) {
  if (!snapshot) return null
  const usable = new Set(
    columns.filter((column) => !column.missing && column.keyEligible).map((column) => column.name),
  )
  const candidates = [
    ...snapshot.constraints
      .filter((c) => c.type === 'P')
      .map((c) => ({ columns: c.columns, kind: 'PRIMARY_KEY', name: c.name })),
    ...snapshot.constraints
      .filter((c) => c.type === 'U')
      .map((c) => ({ columns: c.columns, kind: 'UNIQUE', name: c.name })),
    ...snapshot.uniqueIndexes.map((i) => ({ columns: i.columns, kind: 'UNIQUE', name: i.name })),
  ].filter(
    (candidate) =>
      candidate.columns.length > 0 &&
      candidate.columns.every((name) => usable.has(name)) &&
      previewEnforcement(candidate.columns, snapshot).enforcement === 'DATABASE_ENFORCED',
  )
  if (!candidates.length) return null
  const primary = candidates.find((candidate) => candidate.kind === 'PRIMARY_KEY')
  const best = primary ?? [...candidates].sort((a, b) => a.columns.length - b.columns.length)[0]
  return Object.freeze({ ...best, columns: [...best.columns] })
}

/** A key code for the recommended identifier that is not used yet ("RECORD_ID", "RECORD_ID_2"…). */
export function identifierCode(keys) {
  const used = new Set(keys.map((key) => key.code))
  if (!used.has(RECOMMENDED_CODE)) return RECOMMENDED_CODE
  let n = 2
  while (used.has(`${RECOMMENDED_CODE}_${n}`)) n += 1
  return `${RECOMMENDED_CODE}_${n}`
}

/** Whether a key candidate uses exactly the given columns (in any order). */
export const sameColumns = (a, b) => a.length === b.length && a.every((name) => b.includes(name))

// --- Plain-language validation results ----------------------------------------------------------

const EXPLAIN = Object.freeze({
  SCHEMA_INVALID: [
    'Some information could not be read.',
    'Reload the page and try again. If it keeps happening, contact the system administrator.',
  ],
  COLUMN_NOT_FOUND: [
    'A selected piece of information no longer exists in the data source.',
    'Remove it from your selection, then save again.',
  ],
  COLUMN_NOT_IN_SOURCE: [
    'A selected piece of information no longer exists in the data source.',
    'Remove it from your selection, then save again.',
  ],
  COLUMN_TYPE_UNSUPPORTED: [
    'This information cannot be shown to forms (for example files or binary data).',
    'Unselect it, or keep it for checks only (technical options).',
  ],
  KEY_COLUMN_NOT_EXPOSED: [
    'The record identifier uses information that is not selected.',
    'Select that information in step 1, or choose another identifier.',
  ],
  KEY_COLUMN_NOT_FOUND: [
    'The record identifier uses information the data source no longer has.',
    'Choose another identifier in step 2.',
  ],
  KEY_COLUMN_INVALID: [
    'The record identifier uses information that cannot identify a record (for example long text).',
    'Choose another identifier in step 2.',
  ],
  KEY_COLUMN_NULLABLE: [
    'The record identifier may be empty for some records.',
    'Choose an identifier that is always filled in, or ask a data specialist to review it.',
  ],
  KEY_COLUMN_DUPLICATE: [
    'The record identifier lists the same information twice.',
    'Remove the duplicate in the technical options of step 2.',
  ],
  KEY_COLUMNS_REQUIRED: [
    'A record identifier has no information selected.',
    'Choose at least one piece of information for it, or remove it.',
  ],
  KEY_CODE_INVALID: [
    'An identifier name is not valid.',
    'Use upper-case letters, digits and underscores (technical options of step 2).',
  ],
  KEY_NOT_MINIMAL: [
    'The record identifier contains more information than needed.',
    'Use the recommended identifier, or remove the extra parts.',
  ],
  KEY_ASSURANCE_REQUIRED: [
    'The database does not guarantee this identifier is unique.',
    'A data specialist must document why it is unique (technical onboarding in step 2).',
  ],
  KEY_ASSURANCE_INCOMPLETE: [
    'The documentation for an unverified identifier is incomplete.',
    'Complete the basis, evidence and rationale in technical onboarding (step 2).',
  ],
  KEY_ASSURANCE_BASIS_INVALID: [
    'The documented reason for an identifier is not valid.',
    'Choose one of the listed reasons in technical onboarding (step 2).',
  ],
  KEY_ASSURANCE_INCONSISTENT: [
    'The documented reason does not match the data source.',
    'Review the reason in technical onboarding (step 2).',
  ],
  KEY_NOT_DATABASE_ENFORCED: [
    'The database does not guarantee this identifier is unique.',
    'It stays provisional and must be approved before it can be used.',
  ],
  KEY_DUPLICATES_OBSERVED: [
    'Some records currently share the same identifier value.',
    'This identifier cannot be trusted. Choose another one or ask the data owner to correct the data.',
  ],
  KEY_NULLS_OBSERVED: [
    'Some records currently have an empty identifier.',
    'Choose another identifier or ask the data owner to correct the data.',
  ],
  KEY_UNIQUENESS_NOT_OBSERVED: [
    'Uniqueness of the identifier could not be checked right now.',
    'It stays provisional. Try re-checking later.',
  ],
  KEY_UNIQUENESS_NOT_OBSERVABLE: [
    'Uniqueness of the identifier cannot be checked for this data source.',
    'It stays provisional until a data specialist approves it.',
  ],
  KEY_OBSERVATION_MISMATCH: [
    'The uniqueness check did not match the identifier.',
    'Re-check the version. If it persists, contact the system administrator.',
  ],
  OBJECT_NOT_FOUND: [
    'The data source can no longer be found in the database.',
    'Ask the system administrator to check the data source registration.',
  ],
  OBJECT_INVALID: [
    'The data source is currently broken in the database.',
    'Ask the system administrator to repair it, then re-check.',
  ],
  OBJECT_NOT_ALLOWED: [
    'This data source is not on the approved list.',
    'Ask the system administrator to review the data source registration.',
  ],
  OBJECT_TYPE_MISMATCH: [
    'The data source changed its kind in the database.',
    'Ask the system administrator to review the data source registration.',
  ],
  SOURCE_HANDLER_NOT_REGISTERED: [
    'The server integration for this data source is not available.',
    'Ask the system administrator to check the server integration.',
  ],
  SOURCE_INACTIVE: [
    'The data source is deactivated.',
    'Drafts can be saved, but the data cannot be approved until it is activated again.',
  ],
  CONFIG_TOO_LARGE: [
    'Too much information is selected.',
    'Unselect information that workflows do not need.',
  ],
  CONFIG_FINGERPRINT_MISMATCH: [
    'The saved version does not match its integrity check.',
    'It was left unchanged. Start a new draft from a verified version or contact the system administrator.',
  ],
  CONFIG_UNREADABLE: ['The saved version cannot be read.', 'Contact the system administrator.'],
  COLUMN_CHANGED: [
    'Selected information changed in the data source since this version was saved.',
    'Review the selection and save a new draft so the change is checked.',
  ],
  COLUMN_MISSING: [
    'Selected information was removed from the data source.',
    'Start a new draft without it.',
  ],
  OBJECT_TYPE_CHANGED: [
    'The data source changed its kind in the database.',
    'Ask the system administrator to review the data source registration.',
  ],
  KEY_ENFORCEMENT_LOST: [
    'The database no longer guarantees the record identifier is unique.',
    'Start a new draft and review the record identifier.',
  ],
  KEY_ENFORCEMENT_CHANGED: [
    'The way the database protects the record identifier changed.',
    'Re-check the version to refresh the evidence.',
  ],
  DICTIONARY_FINGERPRINT_CHANGED: [
    'The data source structure changed since this version was checked.',
    'Re-check the version.',
  ],
  HANDLER_CONTRACT_CHANGED: [
    'The server integration changed since this version was checked.',
    'Re-check the version.',
  ],
})

/**
 * { what, fix } for a validation finding or publication blocker code. Unknown codes keep the
 * server's own message so nothing is hidden or reworded incorrectly.
 */
export function explainFinding(finding) {
  const known = EXPLAIN[finding?.code]
  if (known) return { what: known[0], fix: known[1] }
  return { what: finding?.message || finding?.code || 'Unknown problem.', fix: null }
}
