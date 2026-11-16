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

// ------------------------------------------------------------------- source mapping (M2-A)
// /data-sources/:sourceId/dictionary and /mapping-versions*. Canonical configurations,
// evidence and findings are read strictly: anything unexpected rejects the whole response.

export const DATA_CLASSES = Object.freeze(['PUBLIC', 'INTERNAL', 'PERSONAL', 'SENSITIVE'])
export const ASSURANCE_BASES = Object.freeze(['GENERATED_ALWAYS_IDENTITY', 'GENERATED_BY_DEFAULT_IDENTITY', 'APPLICATION_GENERATED', 'OWNER_ATTESTED'])
export const ENFORCEMENTS = Object.freeze(['DATABASE_ENFORCED', 'DECLARED'])
const INTEGRITY = Object.freeze(['VERIFIED', 'MISMATCH', 'UNREADABLE'])
const SHA256 = /^[0-9a-f]{64}$/

const optional = (reader) => (value) => (value === null || value === undefined ? null : reader(value))
const optionalCount = optional(count)
const integer = (value) => {
  check(Number.isInteger(value))
  return value
}
const sha = (value) => {
  check(typeof value === 'string' && SHA256.test(value))
  return value
}
const identityKind = optional(oneOf(['ALWAYS', 'BY DEFAULT']))
const strings = (value) => list(value, string)

export function readFinding(item) {
  check(isObject(item))
  return Object.freeze({ severity: oneOf(['ERROR', 'WARNING'])(item.severity), code: string(item.code), path: string(item.path), message: string(item.message) })
}

export function readBlocker(item) {
  check(isObject(item))
  return Object.freeze({ code: string(item.code), path: string(item.path) })
}

function readMappingSource(item) {
  check(isObject(item))
  return Object.freeze({
    sourceId: id(item.sourceId),
    sourceCode: string(item.sourceCode),
    sourceName: text(item.sourceName),
    sourceKind: oneOf(SOURCE_KINDS)(item.sourceKind),
    ownerName: text(item.ownerName),
    objectName: text(item.objectName),
    handlerCode: text(item.handlerCode),
    isActive: bool(item.isActive),
    rowVersion: optionalCount(item.rowVersion),
  })
}

const readColumnFacts = (item) => ({
  name: string(item.name),
  oracleType: string(item.oracleType),
  dataLength: optionalCount(item.dataLength),
  charLength: optionalCount(item.charLength),
  precision: optionalCount(item.precision),
  scale: optional(integer)(item.scale),
  nullable: bool(item.nullable),
  identity: identityKind(item.identity),
})

function readLiveColumn(item) {
  check(isObject(item))
  return Object.freeze({ ...readColumnFacts(item), supported: bool(item.supported), keyEligible: bool(item.keyEligible) })
}

function readSnapshot(s) {
  check(isObject(s))
  return Object.freeze({
    objectType: oneOf(['TABLE', 'VIEW'])(s.objectType),
    status: string(s.status),
    capturedAt: instant(s.capturedAt),
    columnsSha256: sha(s.columnsSha256),
    columns: list(s.columns, readLiveColumn),
    constraints: list(s.constraints, (c) => {
      check(isObject(c))
      return Object.freeze({ name: string(c.name), type: oneOf(['P', 'U'])(c.type), status: string(c.status), validated: text(c.validated), columns: strings(c.columns) })
    }),
    uniqueIndexes: list(s.uniqueIndexes, (i) => {
      check(isObject(i))
      return Object.freeze({ name: string(i.name), status: string(i.status), functionBased: bool(i.functionBased), columns: strings(i.columns) })
    }),
  })
}

function readHandlerContract(h) {
  check(isObject(h))
  return Object.freeze({ code: string(h.code), name: text(h.name), contractVersion: count(h.contractVersion), fields: list(h.fields, readLiveColumn) })
}

export function readSourceDictionary(data) {
  check(isObject(data))
  return Object.freeze({
    source: readMappingSource(data.source),
    available: bool(data.available),
    snapshot: optional(readSnapshot)(data.snapshot),
    handler: optional(readHandlerContract)(data.handler),
    findings: list(data.findings, readFinding),
  })
}

const readAssurance = optional((value) => {
  check(isObject(value))
  return Object.freeze({
    basis: oneOf(ASSURANCE_BASES)(value.basis),
    evidenceRef: string(value.evidenceRef),
    rationale: string(value.rationale),
    attestedBy: string(value.attestedBy),
    attestedAt: instant(value.attestedAt),
  })
})

const readObservation = optional((value) => {
  check(isObject(value))
  return Object.freeze({
    rowCount: count(value.rowCount),
    nullKeyRows: count(value.nullKeyRows),
    duplicateKeyGroups: count(value.duplicateKeyGroups),
    observedAt: instant(value.observedAt),
  })
})

const readEnforcedBy = optional((value) => {
  check(isObject(value))
  return Object.freeze({ kind: string(value.kind), name: string(value.name) })
})

const readConfigDictionary = optional((value) => {
  check(isObject(value))
  return Object.freeze({ objectType: string(value.objectType), status: string(value.status), capturedAt: instant(value.capturedAt), columnsSha256: sha(value.columnsSha256) })
})

export const readSourceConfig = optional((value) => {
  check(isObject(value) && value.schema === 'zrv.wf.source/1' && isObject(value.source))
  return Object.freeze({
    schema: value.schema,
    source: Object.freeze({
      sourceCode: string(value.source.sourceCode),
      kind: oneOf(SOURCE_KINDS)(value.source.kind),
      owner: text(value.source.owner),
      object: text(value.source.object),
      handlerCode: text(value.source.handlerCode),
    }),
    dictionary: readConfigDictionary(value.dictionary),
    columns: list(value.columns, (c) => {
      check(isObject(c))
      return Object.freeze({ ...readColumnFacts(c), exposed: bool(c.exposed), dataClass: oneOf(DATA_CLASSES)(c.dataClass) })
    }),
    keyCandidates: list(value.keyCandidates, (k) => {
      check(isObject(k))
      return Object.freeze({
        code: string(k.code),
        columns: strings(k.columns),
        enforcement: oneOf(ENFORCEMENTS)(k.enforcement),
        enforcedBy: readEnforcedBy(k.enforcedBy),
        assurance: readAssurance(k.assurance),
        observation: readObservation(k.observation),
      })
    }),
  })
})

export function readSourceMappingVersion(item) {
  check(isObject(item))
  const version = {
    sourceVersionId: id(item.sourceVersionId),
    sourceId: id(item.sourceId),
    versionNo: count(item.versionNo),
    lifecycleState: oneOf(LIFECYCLE_STATES)(item.lifecycleState),
    isDefault: bool(item.isDefault),
    configSha256: sha(item.configSha256),
    schemaVersion: count(item.schemaVersion),
    validatedAt: instant(item.validatedAt),
    validatedBy: optionalId(item.validatedBy),
    publishedAt: instant(item.publishedAt),
    createdAt: instant(item.createdAt),
    createdBy: optionalId(item.createdBy),
    updatedAt: instant(item.updatedAt),
    updatedBy: optionalId(item.updatedBy),
    rowVersion: count(item.rowVersion),
    editable: bool(item.editable),
  }
  // Only a DRAFT is ever editable; anything else is a contract violation.
  check(version.editable === (version.lifecycleState === 'DRAFT'))
  return Object.freeze(version)
}

const readValidation = optional((value) => {
  check(isObject(value))
  return Object.freeze({
    valid: bool(value.valid),
    findings: list(value.findings, readFinding),
    publicationBlockers: list(value.publicationBlockers, readBlocker),
  })
})

export function readSourceMappingDetail(data) {
  check(isObject(data) && isObject(data.version))
  const v = data.version
  return Object.freeze({
    source: readMappingSource(data.source),
    version: Object.freeze({
      ...readSourceMappingVersion(v),
      createdByName: text(v.createdByName),
      updatedByName: text(v.updatedByName),
      validatedByName: text(v.validatedByName),
      configIntegrity: oneOf(INTEGRITY)(v.configIntegrity),
      config: readSourceConfig(v.config),
      publicationBlockers: list(v.publicationBlockers, readBlocker),
    }),
    validation: readValidation(data.validation),
  })
}

export function readSourceMappingDrift(data) {
  check(isObject(data))
  return Object.freeze({
    sourceVersionId: id(data.sourceVersionId),
    versionNo: count(data.versionNo),
    lifecycleState: oneOf(LIFECYCLE_STATES)(data.lifecycleState),
    configIntegrity: oneOf(INTEGRITY)(data.configIntegrity),
    checkedAt: instant(data.checkedAt),
    drifted: bool(data.drifted),
    current: readConfigDictionary(data.current),
    findings: list(data.findings, readFinding),
  })
}

export function readSourceMappingDeleted(data) {
  check(isObject(data) && data.deleted === true)
  return Object.freeze({ sourceId: id(data.sourceId), sourceVersionId: id(data.sourceVersionId), deleted: true })
}
