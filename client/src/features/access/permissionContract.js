// Validator for GET /access-control/me/permissions (server/docs/openapi/openapi.yaml:
// MyPermissions, EffectivePermission). The backend has already resolved role
// grants, ALLOW overrides and DENY overrides; the frontend never recomputes them.
// A response that does not match is rejected as a whole, so a malformed entry
// can never grant access.
import { ApiError } from '../../services/api/apiClient.js'

const ID_PATTERN = /^[1-9][0-9]{0,18}$/
// Backend code columns: module 60, resource 80, action 40 characters.
const MODULE_CODE = /^[A-Z][A-Z0-9_]{0,59}$/
const RESOURCE_CODE = /^[A-Z][A-Z0-9_]{0,79}$/
const ACTION_CODE = /^[A-Z][A-Z0-9_]{0,39}$/
// The backend bounds the list to 1,000 entries.
const MAX_PERMISSIONS = 1000

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function invalid() {
  return new ApiError('Your access permissions could not be verified.', { code: 'INVALID_RESPONSE' })
}

// The permission identity used everywhere in the frontend:
// `MODULE_CODE.RESOURCE_CODE:ACTION_CODE`, as in the backend's authorize() keys.
export const permissionKey = ({ moduleCode, resourceCode, actionCode }) => `${moduleCode}.${resourceCode}:${actionCode}`

function readPermission(entry) {
  if (!isObject(entry) || typeof entry.moduleCode !== 'string' || !MODULE_CODE.test(entry.moduleCode) ||
    typeof entry.resourceCode !== 'string' || !RESOURCE_CODE.test(entry.resourceCode) ||
    typeof entry.actionCode !== 'string' || !ACTION_CODE.test(entry.actionCode) ||
    typeof entry.viaRole !== 'boolean' || typeof entry.viaOverride !== 'boolean') {
    throw invalid()
  }
  return Object.freeze({
    moduleCode: entry.moduleCode,
    resourceCode: entry.resourceCode,
    actionCode: entry.actionCode,
    viaRole: entry.viaRole,
    viaOverride: entry.viaOverride,
  })
}

// Returns { userId, mfaVerified, permissions }. Duplicate keys are kept once.
export function readMyPermissions(data) {
  if (!isObject(data) || typeof data.userId !== 'string' || !ID_PATTERN.test(data.userId) ||
    typeof data.mfaVerified !== 'boolean' || !Array.isArray(data.permissions) ||
    data.permissions.length > MAX_PERMISSIONS) {
    throw invalid()
  }
  const unique = new Map()
  for (const entry of data.permissions) {
    const permission = readPermission(entry)
    const key = permissionKey(permission)
    if (!unique.has(key)) unique.set(key, permission)
  }
  return Object.freeze({
    userId: data.userId,
    mfaVerified: data.mfaVerified,
    permissions: Object.freeze([...unique.values()]),
  })
}
