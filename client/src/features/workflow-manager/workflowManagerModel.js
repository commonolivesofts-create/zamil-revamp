// Framework-free Workflow Manager M1 rules: permission keys, client-side checks
// mirroring the backend Joi schemas (workflowManager.validation.js), list
// filters kept in the URL, request payloads and reason-code wording. The
// backend validates again and its result is authoritative.
import { describeFailure, describeReason } from '../security-administration/adminFeedback.js'

const key = (resource, action) => `WORKFLOW_MANAGER.${resource}:${action}`

export const WORKFLOW_ACTIONS = Object.freeze({
  OVERVIEW_VIEW: key('OVERVIEW', 'VIEW'),
  FORMS_VIEW: key('FORM_REGISTRY', 'VIEW'),
  FORMS_CREATE: key('FORM_REGISTRY', 'CREATE'),
  FORMS_UPDATE: key('FORM_REGISTRY', 'UPDATE'),
  FORMS_ACTIVATE: key('FORM_REGISTRY', 'ACTIVATE'),
  FORMS_DEACTIVATE: key('FORM_REGISTRY', 'DEACTIVATE'),
  SOURCES_VIEW: key('DATA_SOURCE_REGISTRY', 'VIEW'),
  SOURCES_CREATE: key('DATA_SOURCE_REGISTRY', 'CREATE'),
  SOURCES_UPDATE: key('DATA_SOURCE_REGISTRY', 'UPDATE'),
  SOURCES_ACTIVATE: key('DATA_SOURCE_REGISTRY', 'ACTIVATE'),
  SOURCES_DEACTIVATE: key('DATA_SOURCE_REGISTRY', 'DEACTIVATE'),
  MAPPING_VIEW: key('SOURCE_MAPPING', 'VIEW'),
  MAPPING_CREATE: key('SOURCE_MAPPING', 'CREATE'),
  MAPPING_UPDATE: key('SOURCE_MAPPING', 'UPDATE'),
  MAPPING_DELETE: key('SOURCE_MAPPING', 'DELETE'),
})

export const PATHS = Object.freeze({
  overview: '/workflow-manager',
  forms: '/workflow-manager/forms',
  newForm: '/workflow-manager/forms/new',
  form: (formId) => `/workflow-manager/forms/${formId}`,
  sources: '/workflow-manager/data-sources',
  sourceVersions: (sourceId) => `/workflow-manager/data-sources/${sourceId}/mapping-versions`,
  newSourceVersion: (sourceId) => `/workflow-manager/data-sources/${sourceId}/mapping-versions/new`,
  sourceVersion: (sourceId, versionId) => `/workflow-manager/data-sources/${sourceId}/mapping-versions/${versionId}`,
})

const CONTROL_CHARACTERS = /\p{Cc}/u
const CODE = /^[A-Z][A-Z0-9_]*$/
const ORACLE_IDENTIFIER = /^[A-Z][A-Z0-9_$#]*$/
const SEGMENT = '(?::[A-Za-z][A-Za-z0-9]*|[a-z0-9][a-z0-9-]*)'
const DETAIL_ROUTE = new RegExp(`^/${SEGMENT}(?:/${SEGMENT})*$`)

// --- Field checks (null = valid) --------------------------------------------------------

export function checkCode(value, max, label) {
  const code = String(value ?? '').trim()
  if (!code) return `${label} is required.`
  if (code.length > max) return `${label} must be at most ${max} characters.`
  if (!CODE.test(code)) return `${label} must use upper-case letters, digits and underscores, starting with a letter.`
  return null
}

export function checkText(value, max, label, { required = false } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return required ? `${label} is required.` : null
  if (text.length > max) return `${label} must be at most ${max} characters.`
  if (CONTROL_CHARACTERS.test(text)) return `${label} contains characters that are not allowed.`
  return null
}

export function checkDetailRoute(value) {
  const route = String(value ?? '').trim()
  if (!route) return null
  if (route.length > 500) return 'The detail route must be at most 500 characters.'
  if (!DETAIL_ROUTE.test(route)) {
    return 'Enter an application route such as /hr/employee-services/sick-leave/:leaveId (lower-case segments, :parameters, no web address).'
  }
  return null
}

export function checkIdentifier(value, label) {
  const name = String(value ?? '').trim().toUpperCase()
  if (!name) return `${label} is required.`
  if (name.length > 128 || !ORACLE_IDENTIFIER.test(name)) return `${label} must be an Oracle name: letters, digits, _, $ or #, starting with a letter.`
  return null
}

const optional = (value) => String(value ?? '').trim() || null

// --- Forms --------------------------------------------------------------------------------

export const emptyForm = () => ({ formCode: '', formName: '', moduleCode: '', detailRoute: '', description: '' })

export const formDraft = (form) => ({
  formCode: form.formCode,
  formName: form.formName,
  moduleCode: form.moduleCode,
  detailRoute: form.detailRoute ?? '',
  description: form.description ?? '',
})

// { errors, payload } for create (with formCode) or update.
export function validateForm(draft, { create }) {
  const errors = {
    formCode: create ? checkCode(draft.formCode, 80, 'Form code') : null,
    formName: checkText(draft.formName, 200, 'Form name', { required: true }),
    moduleCode: draft.moduleCode ? null : 'Select the module that owns the form.',
    detailRoute: checkDetailRoute(draft.detailRoute),
    description: checkText(draft.description, 1000, 'Description'),
  }
  const payload = {
    ...(create && { formCode: String(draft.formCode).trim() }),
    formName: String(draft.formName).trim(),
    moduleCode: draft.moduleCode,
    detailRoute: optional(draft.detailRoute),
    description: optional(draft.description),
  }
  return { errors, valid: !Object.values(errors).some(Boolean), payload }
}

// --- Data sources -------------------------------------------------------------------------

export const emptySource = () => ({ sourceCode: '', sourceName: '', sourceKind: 'TABLE', ownerName: '', objectName: '', handlerCode: '' })

export const sourceDraft = (source) => ({
  sourceCode: source.sourceCode,
  sourceName: source.sourceName,
  sourceKind: source.sourceKind,
  ownerName: source.ownerName ?? '',
  objectName: source.objectName ?? '',
  handlerCode: source.handlerCode ?? '',
})

export function validateSource(draft, { create }) {
  const handler = draft.sourceKind === 'HANDLER'
  const errors = {
    sourceCode: create ? checkCode(draft.sourceCode, 80, 'Source code') : null,
    sourceName: checkText(draft.sourceName, 200, 'Source name', { required: true }),
    sourceKind: ['TABLE', 'VIEW', 'HANDLER'].includes(draft.sourceKind) ? null : 'Select a source kind.',
    ownerName: handler ? null : checkIdentifier(draft.ownerName, 'Owner'),
    objectName: handler ? null : checkIdentifier(draft.objectName, 'Object name'),
    handlerCode: handler ? checkCode(draft.handlerCode, 128, 'Handler') : null,
  }
  const payload = {
    ...(create && { sourceCode: String(draft.sourceCode).trim() }),
    sourceName: String(draft.sourceName).trim(),
    sourceKind: draft.sourceKind,
    ...(handler
      ? { handlerCode: draft.handlerCode }
      : { ownerName: String(draft.ownerName).trim().toUpperCase(), objectName: String(draft.objectName).trim().toUpperCase() }),
  }
  return { errors, valid: !Object.values(errors).some(Boolean), payload }
}

export const sameSourceIdentity = (source, draft) =>
  source.sourceKind === draft.sourceKind &&
  (source.ownerName ?? '') === String(draft.ownerName ?? '').trim().toUpperCase() &&
  (source.objectName ?? '') === String(draft.objectName ?? '').trim().toUpperCase() &&
  (source.handlerCode ?? '') === (draft.sourceKind === 'HANDLER' ? draft.handlerCode : '')

// --- List filters in the URL ----------------------------------------------------------------

const FORM_SORTS = Object.freeze({ FORM_CODE: 'Form code', FORM_NAME: 'Form name', MODULE_CODE: 'Module', UPDATED_AT: 'Last updated' })
const SOURCE_SORTS = Object.freeze({ SOURCE_CODE: 'Source code', SOURCE_NAME: 'Source name', SOURCE_KIND: 'Kind', UPDATED_AT: 'Last updated' })
export { FORM_SORTS, SOURCE_SORTS }

const positiveInt = (value, fallback) => {
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= 100000 ? number : fallback
}
const pick = (value, allowed, fallback = '') => (allowed.includes(value) ? value : fallback)

export const FORM_FILTER_DEFAULTS = Object.freeze({ page: 1, search: '', moduleCode: '', status: '', sortBy: 'FORM_CODE', sortDir: 'asc' })
export const SOURCE_FILTER_DEFAULTS = Object.freeze({ page: 1, search: '', sourceKind: '', status: '', sortBy: 'SOURCE_CODE', sortDir: 'asc' })

export function readFormFilters(params) {
  return {
    page: positiveInt(params.get('page'), 1),
    search: String(params.get('search') ?? '').slice(0, 100),
    moduleCode: CODE.test(params.get('moduleCode') ?? '') ? params.get('moduleCode') : '',
    status: pick(params.get('status'), ['ACTIVE', 'INACTIVE']),
    sortBy: pick(params.get('sortBy'), Object.keys(FORM_SORTS), 'FORM_CODE'),
    sortDir: pick(params.get('sortDir'), ['asc', 'desc'], 'asc'),
  }
}

export function readSourceFilters(params) {
  return {
    page: positiveInt(params.get('page'), 1),
    search: String(params.get('search') ?? '').slice(0, 100),
    sourceKind: pick(params.get('sourceKind'), ['TABLE', 'VIEW', 'HANDLER']),
    status: pick(params.get('status'), ['ACTIVE', 'INACTIVE']),
    sortBy: pick(params.get('sortBy'), Object.keys(SOURCE_SORTS), 'SOURCE_CODE'),
    sortDir: pick(params.get('sortDir'), ['asc', 'desc'], 'asc'),
  }
}

// Non-default values only, so the URL stays short and shareable.
export function filterParams(filters, defaults) {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(filters)) {
    if (value !== '' && value !== defaults[name]) params.set(name, String(value))
  }
  return params
}

export const PAGE_SIZE = 20

// --- Wording --------------------------------------------------------------------------------

const REASONS = Object.freeze({
  SOURCE_OWNER_NOT_ALLOWED: 'This schema owner is not on the approved source allowlist.',
  SOURCE_OBJECT_PROTECTED: 'Application security, session, permission and workflow tables can never be workflow sources.',
  SOURCE_OBJECT_NOT_FOUND: 'No table or view with this owner and name exists in the database.',
  SOURCE_OBJECT_TYPE_MISMATCH: 'The object exists, but it is not of the selected kind (table or view).',
  SOURCE_OBJECT_INVALID: 'The object exists but is not VALID in the database; it cannot be registered until it compiles.',
  SOURCE_HANDLER_NOT_ALLOWED: 'This handler is not registered on the server.',
})

const CONFLICTS = Object.freeze({
  STALE_RECORD: 'Someone else changed this record after you opened it. Reload to see the current values, then apply your change again.',
  FORM_CODE_EXISTS: 'A form with this code is already registered. Choose another code or open the existing form.',
  SOURCE_CODE_EXISTS: 'A data source with this code is already registered. Choose another code.',
  SOURCE_IDENTITY_LOCKED: 'This source already has versions, so its kind and object can no longer change. Register a new data source instead.',
  SOURCE_BUSY: 'Another change to this data source is in progress. Wait a moment, reload and try again.',
  SOURCE_VERSION_NOT_DRAFT: 'This version is no longer a draft, so it is read-only. Clone it to start a new draft.',
  SOURCE_IDENTITY_CHANGED: 'The data source object changed while your mapping was being validated. Reload and check the mapping again.',
  SOURCE_VERSION_CONFLICT: 'Another version was created at the same moment. Reload the version list and try again.',
  SOURCE_VERSION_REFERENCED: 'A form mapping uses this source version, so it cannot be deleted.',
  SOURCE_VERSION_DEPENDENCY_UNVERIFIED: 'The references to this version cannot be verified safely, so it was not deleted. Ask the system owner to check the form mappings.',
  SOURCE_VERSION_IMMUTABLE: 'The database refused the change because the version is no longer a draft. Reload to see its current state.',
  SOURCE_VERSION_UNREADABLE: 'The stored configuration of this version cannot be verified, so it cannot be cloned.',
  SOURCE_OBJECT_UNAVAILABLE: 'The registered table or view cannot be inspected in the database right now (missing, invalid or no longer allowed).',
  SOURCE_VERSION_REVALIDATION_FAILED: 'The draft no longer validates against the live source. It was left unchanged; see the findings below.',
})

// Conflicts that mean "reload before trying again" (the editor keeps unsaved input).
export const RELOAD_CONFLICTS = Object.freeze(['STALE_RECORD', 'SOURCE_BUSY', 'SOURCE_VERSION_NOT_DRAFT', 'SOURCE_IDENTITY_CHANGED', 'SOURCE_VERSION_CONFLICT', 'SOURCE_VERSION_IMMUTABLE'])

// describeFailure() plus the Workflow Manager reason and conflict codes.
export function describeWorkflowFailure(error) {
  const failure = describeFailure(error)
  if (CONFLICTS[error?.code]) return { ...failure, message: CONFLICTS[error.code], stale: RELOAD_CONFLICTS.includes(error.code) }
  // Findings of an invalid source mapping are shown by the validation panel, not as a list here.
  if (error?.code === 'SOURCE_MAPPING_INVALID') return { ...failure, details: [] }
  const details = (error?.details || []).map((item) => REASONS[item.message] || describeReason(item.message) || item.message)
  return { ...failure, details }
}

// Field errors from a 400 response, keyed by field, for inline display.
export function fieldErrorsFrom(error) {
  if (error?.status !== 400 || !Array.isArray(error.details) || error.code === 'SOURCE_MAPPING_INVALID') return {}
  return Object.fromEntries(error.details.map((item) => [item.field, REASONS[item.message] || item.message]))
}

export const LIFECYCLE_TONES = Object.freeze({ DRAFT: 'neutral', REVIEW: 'warn', APPROVED: 'warn', PUBLISHED: 'good', RETIRED: 'neutral' })

export const sourceObjectLabel = (source) =>
  source.sourceKind === 'HANDLER' ? source.handlerCode : `${source.ownerName}.${source.objectName}`
