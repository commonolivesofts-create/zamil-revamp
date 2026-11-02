// Validators for the Workflow Manager M1 API (server/docs/openapi/openapi.yaml:
// /api/v1/workflow-manager). Only documented fields are kept, identifiers stay
// decimal strings, and a response that does not match is rejected as a whole
// rather than guessed at.
import { ApiError } from '../../services/api/apiClient.js'

export const ID_PATTERN = /^[1-9][0-9]{0,18}$/
export const SOURCE_KINDS = Object.freeze(['TABLE', 'VIEW', 'HANDLER'])
export const LIFECYCLE_STATES = Object.freeze(['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED'])

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function invalidResponse() {
  return new ApiError('The server returned an unexpected response.', { code: 'INVALID_RESPONSE' })
}

function check(condition) {
  if (!condition) throw invalidResponse()
}

const id = (value) => {
  check(typeof value === 'string' && ID_PATTERN.test(value))
  return value
}
const optionalId = (value) => (value === null || value === undefined ? null : id(value))
const string = (value) => {
  check(typeof value === 'string')
  return value
}
const text = (value) => {
  check(value === null || value === undefined || typeof value === 'string')
  return value ?? null
}
const bool = (value) => {
  check(typeof value === 'boolean')
  return value
}
const count = (value) => {
  check(Number.isInteger(value) && value >= 0)
  return value
}
const instant = (value) => {
  check(value === null || value === undefined || (typeof value === 'string' && !Number.isNaN(Date.parse(value))))
  return value ?? null
}
const oneOf = (allowed) => (value) => {
  check(allowed.includes(value))
  return value
}
const list = (value, reader) => {
  check(Array.isArray(value))
  return Object.freeze(value.map(reader))
}

const audit = (item) => ({
  rowVersion: count(item.rowVersion),
  createdAt: instant(item.createdAt),
  createdBy: optionalId(item.createdBy),
  createdByName: text(item.createdByName),
  updatedAt: instant(item.updatedAt),
  updatedBy: optionalId(item.updatedBy),
  updatedByName: text(item.updatedByName),
})

export function readForm(item) {
  check(isObject(item))
  return Object.freeze({
    formId: id(item.formId),
    formCode: string(item.formCode),
    formName: string(item.formName),
    moduleCode: string(item.moduleCode),
    moduleName: text(item.moduleName),
    detailRoute: text(item.detailRoute),
    description: text(item.description),
    isActive: bool(item.isActive),
    versionCount: count(item.versionCount),
    ...audit(item),
  })
}

export function readSource(item) {
  check(isObject(item))
  return Object.freeze({
    sourceId: id(item.sourceId),
    sourceCode: string(item.sourceCode),
    sourceName: string(item.sourceName),
    sourceKind: oneOf(SOURCE_KINDS)(item.sourceKind),
    ownerName: text(item.ownerName),
    objectName: text(item.objectName),
    handlerCode: text(item.handlerCode),
    isActive: bool(item.isActive),
    versionCount: count(item.versionCount),
    ...audit(item),
  })
}

const versionFields = (item) => ({
  versionNo: count(item.versionNo),
  lifecycleState: oneOf(LIFECYCLE_STATES)(item.lifecycleState),
  isDefault: bool(item.isDefault),
  configSha256: string(item.configSha256),
  schemaVersion: count(item.schemaVersion),
  publishedAt: instant(item.publishedAt),
  createdAt: instant(item.createdAt),
  updatedAt: instant(item.updatedAt),
})

export function readFormVersion(item) {
  check(isObject(item) && isObject(item.headerSource))
  return Object.freeze({
    formVersionId: id(item.formVersionId),
    ...versionFields(item),
    headerSource: Object.freeze({
      sourceVersionId: id(item.headerSource.sourceVersionId),
      versionNo: count(item.headerSource.versionNo),
      sourceId: id(item.headerSource.sourceId),
      sourceCode: string(item.headerSource.sourceCode),
    }),
  })
}

export function readSourceVersion(item) {
  check(isObject(item))
  return Object.freeze({
    sourceVersionId: id(item.sourceVersionId),
    ...versionFields(item),
    validatedAt: instant(item.validatedAt),
  })
}

export function readModuleOption(item) {
  check(isObject(item))
  return Object.freeze({ moduleCode: string(item.moduleCode), moduleName: text(item.moduleName) })
}

export function readSourceObject(item) {
  check(isObject(item))
  return Object.freeze({
    ownerName: string(item.ownerName),
    objectName: string(item.objectName),
    objectType: oneOf(['TABLE', 'VIEW'])(item.objectType),
  })
}

export function readSourcePolicy(data) {
  check(isObject(data))
  return Object.freeze({
    sourceKinds: list(data.sourceKinds, oneOf(SOURCE_KINDS)),
    allowedOwners: list(data.allowedOwners, string),
    protectedObjectPrefixes: list(data.protectedObjectPrefixes, string),
    handlers: list(data.handlers, (handler) => {
      check(isObject(handler))
      return Object.freeze({ code: string(handler.code), name: string(handler.name), description: text(handler.description) })
    }),
  })
}

const readCount = (value) => {
  check(isObject(value))
  return Object.freeze({ total: count(value.total), active: count(value.active) })
}

export function readOverview(data) {
  check(isObject(data))
  let dataSources = null
  if (data.dataSources !== null) {
    check(isObject(data.dataSources) && isObject(data.dataSources.byKind))
    dataSources = Object.freeze({
      ...readCount(data.dataSources),
      byKind: Object.freeze(Object.fromEntries(SOURCE_KINDS.map((kind) => [kind, readCount(data.dataSources.byKind[kind])]))),
    })
  }
  return Object.freeze({ forms: data.forms === null ? null : readCount(data.forms), dataSources })
}

export function readPage(result, reader) {
  check(isObject(result?.pagination))
  return Object.freeze({ items: list(result.data, reader), pagination: result.pagination })
}

export const readList = list
