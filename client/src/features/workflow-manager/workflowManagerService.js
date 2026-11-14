// Workflow Manager M1 endpoints over the single shared API client. Every
// request uses the HttpOnly session; state-changing requests carry the
// memory-held session CSRF token (the client's default). Unsafe requests are
// never retried automatically.
// Relative imports keep this module loadable by the Node-native tests.
import { ApiError, apiClient } from '../../services/api/apiClient.js'
import {
  ID_PATTERN, readForm, readFormVersion, readList, readModuleOption, readOverview, readPage, readSource,
  readSourceObject, readSourcePolicy, readSourceVersion,
  readSourceDictionary, readSourceMappingDeleted, readSourceMappingDetail, readSourceMappingDrift, readSourceMappingVersion,
} from './workflowManagerContract.js'

const BASE = '/workflow-manager'

// Path identifiers are Oracle NUMBER(19,0) values kept as decimal strings.
function segment(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new ApiError('The selected record is invalid.', { code: 'INVALID_ID' })
  }
  return value
}

// Only defined values are sent; empty strings mean "no filter".
function query(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function rowVersionBody(rowVersion) {
  if (!Number.isInteger(rowVersion) || rowVersion < 1) {
    throw new ApiError('The record version is invalid. Reload and try again.', { code: 'INVALID_REQUEST' })
  }
  return { rowVersion }
}

export function createWorkflowManagerService({ client }) {
  const forms = (formId) => `${BASE}/forms/${segment(formId)}`
  const sources = (sourceId) => `${BASE}/data-sources/${segment(sourceId)}`
  const mappings = (sourceId) => `${sources(sourceId)}/mapping-versions`
  const mapping = (sourceId, versionId) => `${mappings(sourceId)}/${segment(versionId)}`

  return Object.freeze({
    async getOverview({ signal } = {}) {
      const { data } = await client.get(`${BASE}/overview`, { signal })
      return readOverview(data)
    },

    // --- Form Registry (FORM_REGISTRY) -----------------------------------------------------
    async listForms({ page, pageSize, search, moduleCode, status, sortBy, sortDir } = {}, { signal } = {}) {
      const result = await client.get(`${BASE}/forms`, { params: query({ page, pageSize, search, moduleCode, status, sortBy, sortDir }), signal })
      return readPage(result, readForm)
    },
    async getForm(formId, { signal } = {}) {
      const { data } = await client.get(forms(formId), { signal })
      return readForm(data)
    },
    async listFormVersions(formId, { signal } = {}) {
      const { data } = await client.get(`${forms(formId)}/versions`, { signal })
      return readList(data, readFormVersion)
    },
    async createForm({ formCode, formName, moduleCode, detailRoute, description }) {
      const { data } = await client.post(`${BASE}/forms`, { formCode, formName, moduleCode, detailRoute, description })
      return readForm(data)
    },
    async updateForm(formId, { formName, moduleCode, detailRoute, description, rowVersion }) {
      const { data } = await client.put(forms(formId), { formName, moduleCode, detailRoute, description, ...rowVersionBody(rowVersion) })
      return readForm(data)
    },
    async setFormActive(formId, isActive, rowVersion) {
      const { data } = await client.post(`${forms(formId)}/${isActive ? 'activate' : 'deactivate'}`, rowVersionBody(rowVersion))
      return readForm(data)
    },
    async listModules({ signal } = {}) {
      const { data } = await client.get(`${BASE}/lookups/modules`, { signal })
      return readList(data, readModuleOption)
    },

    // --- Data Source Registry (DATA_SOURCE_REGISTRY) -----------------------------------------
    async listSources({ page, pageSize, search, sourceKind, status, sortBy, sortDir } = {}, { signal } = {}) {
      const result = await client.get(`${BASE}/data-sources`, { params: query({ page, pageSize, search, sourceKind, status, sortBy, sortDir }), signal })
      return readPage(result, readSource)
    },
    async getSource(sourceId, { signal } = {}) {
      const { data } = await client.get(sources(sourceId), { signal })
      return readSource(data)
    },
    async listSourceVersions(sourceId, { signal } = {}) {
      const { data } = await client.get(`${sources(sourceId)}/versions`, { signal })
      return readList(data, readSourceVersion)
    },
    async createSource(input) {
      const { data } = await client.post(`${BASE}/data-sources`, input)
      return readSource(data)
    },
    async updateSource(sourceId, { rowVersion, ...input }) {
      const { data } = await client.put(sources(sourceId), { ...input, ...rowVersionBody(rowVersion) })
      return readSource(data)
    },
    async setSourceActive(sourceId, isActive, rowVersion) {
      const { data } = await client.post(`${sources(sourceId)}/${isActive ? 'activate' : 'deactivate'}`, rowVersionBody(rowVersion))
      return readSource(data)
    },
    async getSourcePolicy({ signal } = {}) {
      const { data } = await client.get(`${BASE}/lookups/source-policy`, { signal })
      return readSourcePolicy(data)
    },
    async listSourceObjects({ objectType, search }, { signal } = {}) {
      const { data } = await client.get(`${BASE}/lookups/source-objects`, { params: query({ objectType, search }), signal })
      return readList(data, readSourceObject)
    },

    // --- Source mapping (SOURCE_MAPPING, M2-A) -------------------------------------------------
    // The server derives every fact; only author choices are sent: columns { name, exposed,
    // dataClass } and keyCandidates { code, columns, assurance }.
    async getSourceDictionary(sourceId, { signal } = {}) {
      const { data } = await client.get(`${sources(sourceId)}/dictionary`, { signal })
      return readSourceDictionary(data)
    },
    async listSourceMappingVersions(sourceId, { page, pageSize } = {}, { signal } = {}) {
      const result = await client.get(mappings(sourceId), { params: query({ page, pageSize }), signal })
      return readPage(result, readSourceMappingVersion)
    },
    async getSourceMappingVersion(sourceId, versionId, { signal } = {}) {
      const { data } = await client.get(mapping(sourceId, versionId), { signal })
      return readSourceMappingDetail(data)
    },
    async createSourceMappingVersion(sourceId, draft) {
      const { data } = await client.post(mappings(sourceId), { draft: draftBody(draft) })
      return readSourceMappingDetail(data)
    },
    async updateSourceMappingVersion(sourceId, versionId, { rowVersion, draft }) {
      const { data } = await client.put(mapping(sourceId, versionId), { ...rowVersionBody(rowVersion), draft: draftBody(draft) })
      return readSourceMappingDetail(data)
    },
    async revalidateSourceMappingVersion(sourceId, versionId, rowVersion) {
      const { data } = await client.post(`${mapping(sourceId, versionId)}/revalidate`, rowVersionBody(rowVersion))
      return readSourceMappingDetail(data)
    },
    async getSourceMappingDrift(sourceId, versionId, { signal } = {}) {
      const { data } = await client.get(`${mapping(sourceId, versionId)}/drift`, { signal })
      return readSourceMappingDrift(data)
    },
    async cloneSourceMappingVersion(sourceId, versionId) {
      const { data } = await client.post(`${mapping(sourceId, versionId)}/clone`, {})
      return readSourceMappingDetail(data)
    },
    async deleteSourceMappingVersion(sourceId, versionId, rowVersion) {
      const { data } = await client.delete(mapping(sourceId, versionId), { body: rowVersionBody(rowVersion) })
      return readSourceMappingDeleted(data)
    },
  })
}

// Exactly the documented author fields, in a fixed shape (no server-owned values).
function draftBody(draft) {
  if (!draft || !Array.isArray(draft.columns) || !Array.isArray(draft.keyCandidates)) {
    throw new ApiError('The source mapping is incomplete.', { code: 'INVALID_REQUEST' })
  }
  return {
    columns: draft.columns.map(({ name, exposed, dataClass }) => ({ name, exposed, dataClass })),
    keyCandidates: draft.keyCandidates.map(({ code, columns, assurance }) => ({
      code,
      columns: [...columns],
      assurance: assurance ? { basis: assurance.basis, evidenceRef: assurance.evidenceRef, rationale: assurance.rationale } : null,
    })),
  }
}

export const workflowManagerService = createWorkflowManagerService({ client: apiClient })
