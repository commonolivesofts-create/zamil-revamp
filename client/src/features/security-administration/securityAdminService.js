// Security-administration endpoints over the single shared API client.
// Every request uses the HttpOnly session; state-changing requests carry the
// memory-held session CSRF token (the client's default). A 401 invalidates the
// signed-in session through the client's unauthorized event. Unsafe requests
// are never retried automatically.
// Relative imports keep this module loadable by the Node-native tests.
import { ApiError, apiClient } from '../../services/api/apiClient.js'
import {
  ID_PATTERN, readCandidate, readCatalog, readCatalogActivation, readCatalogCreated, readEffectivePermissions,
  readGrantChange, readOverride, readOverrideRevoked, readOverrideSet, readPage, readRole, readRoleAssigned,
  readRolePermission, readRoleUnassigned, readSessionRevoked, readSessionsRevoked, readTokenIssued,
  readUserChange, readUserDetail, readUserListItem, readUserRole,
} from './securityAdminContract.js'

const list = (data, reader) => {
  if (!Array.isArray(data)) throw new ApiError('The server returned an unexpected response.', { code: 'INVALID_RESPONSE' })
  return Object.freeze(data.map(reader))
}

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

// GET /access-control/roles returns at most 100 roles per page and has no search.
export const ROLE_PAGE_LIMIT = 100
const MAX_ROLE_PAGES = 50

export function createSecurityAdminService({ client }) {
  const users = (userId) => `/users/${segment(userId)}`
  const access = (path) => `/access-control${path}`

  async function listRoles({ page, limit } = {}, { signal } = {}) {
    const result = await client.get(access('/roles'), { params: query({ page, limit }), signal })
    return readPage(result, readRole)
  }

  return Object.freeze({
    // --- User accounts (USER_ACCOUNTS) -------------------------------------------------
    async listUsers({ page, limit, search, status, mfaEnrolled, locked, sortBy, sortOrder } = {}, { signal } = {}) {
      const result = await client.get('/users', { params: query({ page, limit, search, status, mfaEnrolled, locked, sortBy, sortOrder }), signal })
      return readPage(result, readUserListItem)
    },
    // Employee-master search for provisioning (USER_ACCOUNTS:CREATE).
    async listCandidates({ page, limit, search, hasAccount } = {}, { signal } = {}) {
      const result = await client.get('/users/candidates', { params: query({ page, limit, search, hasAccount }), signal })
      return readPage(result, readCandidate)
    },
    async getUser(userId, { signal } = {}) {
      const { data } = await client.get(users(userId), { signal })
      return readUserDetail(data)
    },
    async provisionUser(employeeNumber) {
      const { data } = await client.post('/users', { employeeNumber })
      return readUserDetail(data)
    },
    async activateUser(userId) {
      const { data } = await client.post(`${users(userId)}/activate`, {})
      return readUserChange(data)
    },
    async disableUser(userId) {
      const { data } = await client.post(`${users(userId)}/disable`, {})
      return readUserChange(data)
    },
    async revokeUserSessions(userId) {
      const { data } = await client.delete(`${users(userId)}/sessions`)
      return readSessionsRevoked(data)
    },
    async revokeUserSession(userId, sessionId) {
      const { data } = await client.delete(`${users(userId)}/sessions/${segment(sessionId)}`)
      return readSessionRevoked(data)
    },
    // The operator re-enters the target employee number (explicit authorization).
    async issuePasswordSetup(userId, { confirmEmployeeNumber }) {
      const { data } = await client.post(`${users(userId)}/password-setup`, { confirmEmployeeNumber })
      return readTokenIssued(data)
    },
    // ACCOUNT_RECOVERY:ISSUE. The backend enforces the administrator hierarchy.
    async issueRecovery(userId, { purpose, confirmEmployeeNumber }) {
      const { data } = await client.post(`${users(userId)}/recovery`, { purpose, confirmEmployeeNumber })
      return readTokenIssued(data)
    },

    // --- Roles (ROLES) -------------------------------------------------------------------
    listRoles,
    // Every role for a selector, page by page. Choices are never cut off
    // silently: `complete` is false only if the safety bound
    // (MAX_ROLE_PAGES × 100 roles) was reached first.
    async listAllRoles({ signal } = {}) {
      const items = []
      for (let page = 1; page <= MAX_ROLE_PAGES; page += 1) {
        const result = await listRoles({ page, limit: ROLE_PAGE_LIMIT }, { signal })
        items.push(...result.items)
        if (!result.pagination.hasNextPage) return Object.freeze({ items: Object.freeze(items), complete: true })
      }
      return Object.freeze({ items: Object.freeze(items), complete: false })
    },
    async createRole({ roleCode, roleName, description }) {
      const { data } = await client.post(access('/roles'), { roleCode, roleName, description: description || null })
      return readRole(data)
    },
    async updateRole(roleId, changes) {
      const { data } = await client.patch(access(`/roles/${segment(roleId)}`), changes)
      return readRole(data)
    },
    async activateRole(roleId) {
      const { data } = await client.post(access(`/roles/${segment(roleId)}/activate`), {})
      return readRole(data)
    },
    async deactivateRole(roleId) {
      const { data } = await client.post(access(`/roles/${segment(roleId)}/deactivate`), {})
      return readRole(data)
    },

    // --- Permission catalogue (PERMISSION_CATALOG) -------------------------------------------
    async getCatalog({ signal } = {}) {
      const { data } = await client.get(access('/catalog'), { signal })
      return readCatalog(data)
    },
    async createModule({ moduleCode, moduleName, description, displayOrder }) {
      const body = { moduleCode, moduleName, description: description || null }
      if (Number.isInteger(displayOrder)) body.displayOrder = displayOrder
      const { data } = await client.post(access('/modules'), body)
      return readCatalogCreated(data, 'moduleId')
    },
    async createResource(moduleId, { resourceCode, resourceName, description }) {
      const { data } = await client.post(access(`/modules/${segment(moduleId)}/resources`), { resourceCode, resourceName, description: description || null })
      return readCatalogCreated(data, 'resourceId')
    },
    async createPermission(resourceId, { actionCode, description }) {
      const { data } = await client.post(access(`/resources/${segment(resourceId)}/permissions`), { actionCode, description: description || null })
      return readCatalogCreated(data, 'permissionId')
    },
    // entity: 'module' | 'resource' | 'permission'
    async setCatalogActive(entity, entityId, isActive) {
      const paths = { module: 'modules', resource: 'resources', permission: 'permissions' }
      if (!paths[entity] || typeof isActive !== 'boolean') throw new ApiError('The catalogue change is invalid.', { code: 'INVALID_REQUEST' })
      const { data } = await client.patch(access(`/${paths[entity]}/${segment(entityId)}`), { isActive })
      return readCatalogActivation(data, `${entity}Id`)
    },

    // --- Role permissions (ROLE_PERMISSIONS) -------------------------------------------------
    async listRolePermissions(roleId, { signal } = {}) {
      const { data } = await client.get(access(`/roles/${segment(roleId)}/permissions`), { signal })
      return list(data, readRolePermission)
    },
    async grantRolePermission(roleId, permissionId) {
      const { data } = await client.put(access(`/roles/${segment(roleId)}/permissions/${segment(permissionId)}`), {})
      return readGrantChange(data)
    },
    async revokeRolePermission(roleId, permissionId) {
      const { data } = await client.delete(access(`/roles/${segment(roleId)}/permissions/${segment(permissionId)}`))
      return readGrantChange(data)
    },

    // --- User roles (USER_ROLES) ---------------------------------------------------------------
    async listUserRoles(userId, { signal } = {}) {
      const { data } = await client.get(access(`/users/${segment(userId)}/roles`), { signal })
      return list(data, readUserRole)
    },
    async assignUserRole(userId, roleId, { expiresAt = null } = {}) {
      const body = expiresAt ? { expiresAt } : {}
      const { data } = await client.put(access(`/users/${segment(userId)}/roles/${segment(roleId)}`), body)
      return readRoleAssigned(data)
    },
    async unassignUserRole(userId, roleId) {
      const { data } = await client.delete(access(`/users/${segment(userId)}/roles/${segment(roleId)}`))
      return readRoleUnassigned(data)
    },
    async getUserEffectivePermissions(userId, { signal } = {}) {
      const { data } = await client.get(access(`/users/${segment(userId)}/effective-permissions`), { signal })
      return readEffectivePermissions(data)
    },

    // --- Direct overrides (USER_PERMISSION_OVERRIDES) -------------------------------------------
    async listUserOverrides(userId, { signal } = {}) {
      const { data } = await client.get(access(`/users/${segment(userId)}/overrides`), { signal })
      return list(data, readOverride)
    },
    async setUserOverride(userId, permissionId, { effect, justification, expiresAt = null }) {
      const body = { effect, justification }
      if (expiresAt) body.expiresAt = expiresAt
      const { data } = await client.put(access(`/users/${segment(userId)}/overrides/${segment(permissionId)}`), body)
      return readOverrideSet(data)
    },
    async revokeUserOverride(userId, permissionId) {
      const { data } = await client.delete(access(`/users/${segment(userId)}/overrides/${segment(permissionId)}`))
      return readOverrideRevoked(data)
    },
  })
}

export const securityAdminService = createSecurityAdminService({ client: apiClient })
