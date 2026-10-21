// Validators for the security-administration API (server/docs/openapi/openapi.yaml:
// /api/v1/users and /api/v1/access-control). Only documented fields are kept,
// identifiers stay decimal strings, and a response that does not match is
// rejected as a whole rather than guessed at. The backend never returns
// password hashes, MFA secrets or action tokens; nothing here would keep them.
import { ApiError } from '../../services/api/apiClient.js'
import { readPermission } from '../access/permissionContract.js'

export const ID_PATTERN = /^[1-9][0-9]{0,18}$/
export const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/
export const ACCOUNT_STATUSES = Object.freeze(['PENDING', 'ACTIVE', 'DISABLED'])
export const OVERRIDE_EFFECTS = Object.freeze(['ALLOW', 'DENY'])
export const RECOVERY_PURPOSES = Object.freeze(['PASSWORD_RESET', 'MFA_RECOVERY'])

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
const code = (value) => {
  check(typeof value === 'string' && CODE_PATTERN.test(value))
  return value
}
const bool = (value) => {
  check(typeof value === 'boolean')
  return value
}
const count = (value) => {
  check(Number.isInteger(value) && value >= 0)
  return value
}
// Text from Oracle (employee master, names, descriptions): string or null.
const text = (value) => {
  check(value === null || value === undefined || typeof value === 'string')
  return value ?? null
}
// Instants are serialised as ISO 8601 strings, or null.
const instant = (value) => {
  check(value === null || value === undefined || (typeof value === 'string' && !Number.isNaN(Date.parse(value))))
  return value ?? null
}
const oneOf = (allowed) => (value) => {
  check(allowed.includes(value))
  return value
}
const status = oneOf(ACCOUNT_STATUSES)
const list = (value, reader) => {
  check(Array.isArray(value))
  return Object.freeze(value.map(reader))
}

function readPagination(pagination) {
  check(isObject(pagination))
  return pagination
}

// --------------------------------------------------------------- user accounts

export function readUserListItem(item) {
  check(isObject(item))
  return Object.freeze({
    userId: id(item.userId),
    employeeNumber: text(item.employeeNumber),
    username: text(item.username),
    fullName: text(item.fullName),
    department: text(item.department),
    jobTitle: text(item.jobTitle),
    accountStatus: status(item.accountStatus),
    locked: bool(item.locked),
    mfaEnrolled: bool(item.mfaEnrolled),
    lastLoginAt: instant(item.lastLoginAt),
    createdAt: instant(item.createdAt),
  })
}

// `result` is the shared API client's { data, pagination }.
export function readPage(result, reader) {
  return Object.freeze({ items: list(result?.data, reader), pagination: readPagination(result?.pagination) })
}

export function readCandidate(item) {
  check(isObject(item) && typeof item.employeeNumber === 'string' && item.employeeNumber)
  check(item.userId === null || (typeof item.userId === 'string' && ID_PATTERN.test(item.userId)))
  check(item.accountStatus === null || ACCOUNT_STATUSES.includes(item.accountStatus))
  return Object.freeze({
    employeeNumber: item.employeeNumber,
    username: text(item.username),
    fullName: text(item.fullName),
    department: text(item.department),
    jobTitle: text(item.jobTitle),
    userId: item.userId,
    accountStatus: item.accountStatus,
    provisionable: bool(item.provisionable),
    ineligibilityReason: text(item.ineligibilityReason),
  })
}

function readSession(session) {
  check(isObject(session))
  return Object.freeze({
    sessionId: id(session.sessionId),
    createdAt: instant(session.createdAt),
    lastActivityAt: instant(session.lastActivityAt),
    expiresAt: instant(session.expiresAt),
    mfaVerified: bool(session.mfaVerified),
    ipAddress: text(session.ipAddress),
    userAgent: text(session.userAgent),
  })
}

export function readUserRole(role) {
  check(isObject(role))
  return Object.freeze({
    roleId: id(role.roleId),
    roleCode: code(role.roleCode),
    roleName: text(role.roleName),
    roleActive: bool(role.roleActive),
    isActive: bool(role.isActive),
    expiresAt: instant(role.expiresAt),
    effective: bool(role.effective),
    createdAt: instant(role.createdAt),
    updatedAt: instant(role.updatedAt),
  })
}

export function readUserDetail(data) {
  check(isObject(data) && isObject(data.account) && isObject(data.password) && isObject(data.mfa) &&
    isObject(data.eligibility) && isObject(data.classification) && isObject(data.activation))
  check(data.employee === null || isObject(data.employee))
  const { account, password, mfa, employee, eligibility, classification, activation } = data
  check(Number.isInteger(account.failedLoginAttempts) || account.failedLoginAttempts === null)
  check(password.expired === null || typeof password.expired === 'boolean')
  return Object.freeze({
    userId: id(data.userId),
    employeeNumber: text(data.employeeNumber),
    account: Object.freeze({
      status: status(account.status),
      locked: bool(account.locked),
      lockedUntil: instant(account.lockedUntil),
      failedLoginAttempts: account.failedLoginAttempts,
      lastFailedLoginAt: instant(account.lastFailedLoginAt),
      lastLoginAt: instant(account.lastLoginAt),
      createdAt: instant(account.createdAt),
      updatedAt: instant(account.updatedAt),
    }),
    password: Object.freeze({
      set: bool(password.set),
      changedAt: instant(password.changedAt),
      expiresAt: instant(password.expiresAt),
      expired: password.expired,
    }),
    mfa: Object.freeze({ enrolled: bool(mfa.enrolled), enrolledAt: instant(mfa.enrolledAt) }),
    employee: employee && Object.freeze({
      username: text(employee.username),
      fullName: text(employee.fullName),
      email: text(employee.email),
      jobTitle: text(employee.jobTitle),
      department: text(employee.department),
      currentEmployeeFlag: text(employee.currentEmployeeFlag),
      terminationStatus: text(employee.terminationStatus),
    }),
    eligibility: Object.freeze({ eligible: bool(eligibility.eligible), reason: text(eligibility.reason) }),
    classification: Object.freeze({
      protectedSuperAdministrator: bool(classification.protectedSuperAdministrator),
      privilegedRoleMember: bool(classification.privilegedRoleMember),
      securityAdministration: bool(classification.securityAdministration),
      mfaRequired: bool(classification.mfaRequired),
    }),
    activation: Object.freeze({
      ready: bool(activation.ready),
      unmetPrerequisites: list(activation.unmetPrerequisites, text),
    }),
    roles: list(data.roles, readUserRole),
    activeSessions: list(data.activeSessions, readSession),
  })
}

// Disable also reports { changed, sessionsRevoked }; activate reports { changed }.
export function readUserChange(data) {
  const user = readUserDetail(data)
  check(data.changed === undefined || typeof data.changed === 'boolean')
  check(data.sessionsRevoked === undefined || Number.isInteger(data.sessionsRevoked))
  return Object.freeze({ user, changed: data.changed ?? true, sessionsRevoked: data.sessionsRevoked ?? null })
}

export function readSessionsRevoked(data) {
  check(isObject(data))
  return Object.freeze({ userId: id(data.userId), sessionsRevoked: count(data.sessionsRevoked) })
}

export function readSessionRevoked(data) {
  check(isObject(data) && data.revoked === true)
  return Object.freeze({ userId: id(data.userId), sessionId: id(data.sessionId), changed: bool(data.changed) })
}

// Password-setup and recovery links go only to the delivery channel: the
// response confirms delivery and never contains the token.
export function readTokenIssued(data) {
  check(isObject(data) && data.delivered === true)
  check(['PASSWORD_SETUP', ...RECOVERY_PURPOSES].includes(data.actionType))
  return Object.freeze({
    userId: id(data.userId),
    actionType: data.actionType,
    expiresAt: instant(data.expiresAt),
    delivered: true,
    authorizedBySuperAdministrator: bool(data.authorizedBySuperAdministrator),
  })
}

// ----------------------------------------------------------------------- roles

export function readRole(role) {
  check(isObject(role))
  return Object.freeze({
    roleId: id(role.roleId),
    roleCode: code(role.roleCode),
    roleName: text(role.roleName),
    description: text(role.description),
    isActive: bool(role.isActive),
    createdAt: instant(role.createdAt),
    updatedAt: instant(role.updatedAt),
  })
}

export function readRolePermission(grant) {
  check(isObject(grant))
  return Object.freeze({
    permissionId: id(grant.permissionId),
    moduleCode: code(grant.moduleCode),
    resourceCode: code(grant.resourceCode),
    actionCode: code(grant.actionCode),
    isActive: bool(grant.isActive),
    createdAt: instant(grant.createdAt),
    updatedAt: instant(grant.updatedAt),
  })
}

export function readGrantChange(data) {
  check(isObject(data) && typeof data.granted === 'boolean')
  return Object.freeze({ roleId: id(data.roleId), permissionId: id(data.permissionId), granted: data.granted, changed: bool(data.changed) })
}

export function readRoleAssigned(data) {
  check(isObject(data) && data.assigned === true)
  return Object.freeze({ userId: id(data.userId), roleId: id(data.roleId), expiresAt: instant(data.expiresAt) })
}

export function readRoleUnassigned(data) {
  check(isObject(data) && data.assigned === false)
  return Object.freeze({ userId: id(data.userId), roleId: id(data.roleId), changed: bool(data.changed) })
}

// ------------------------------------------------------------------- catalogue

function readCatalogPermission(permission) {
  check(isObject(permission))
  return Object.freeze({
    permissionId: id(permission.permissionId),
    actionCode: code(permission.actionCode),
    description: text(permission.description),
    isActive: bool(permission.isActive),
  })
}

function readCatalogResource(resource) {
  check(isObject(resource))
  return Object.freeze({
    resourceId: id(resource.resourceId),
    resourceCode: code(resource.resourceCode),
    resourceName: text(resource.resourceName),
    isActive: bool(resource.isActive),
    permissions: list(resource.permissions, readCatalogPermission),
  })
}

function readCatalogModule(module) {
  check(isObject(module))
  check(module.displayOrder === null || module.displayOrder === undefined || Number.isInteger(module.displayOrder))
  return Object.freeze({
    moduleId: id(module.moduleId),
    moduleCode: code(module.moduleCode),
    moduleName: text(module.moduleName),
    displayOrder: module.displayOrder ?? null,
    isActive: bool(module.isActive),
    resources: list(module.resources, readCatalogResource),
  })
}

export const readCatalog = (data) => list(data, readCatalogModule)

export function readCatalogCreated(data, idField) {
  check(isObject(data))
  return Object.freeze({ id: id(data[idField]) })
}

export function readCatalogActivation(data, idField) {
  check(isObject(data))
  return Object.freeze({ id: id(data[idField]), isActive: bool(data.isActive), changed: bool(data.changed) })
}

// ------------------------------------------------- overrides and effective access

export function readOverride(override) {
  check(isObject(override))
  return Object.freeze({
    permissionId: id(override.permissionId),
    moduleCode: code(override.moduleCode),
    resourceCode: code(override.resourceCode),
    actionCode: code(override.actionCode),
    effect: oneOf(OVERRIDE_EFFECTS)(override.effect),
    justification: text(override.justification),
    isActive: bool(override.isActive),
    expiresAt: instant(override.expiresAt),
    createdAt: instant(override.createdAt),
    updatedAt: instant(override.updatedAt),
  })
}

export function readOverrideSet(data) {
  check(isObject(data) && data.isActive === true)
  return Object.freeze({ userId: id(data.userId), permissionId: id(data.permissionId), effect: oneOf(OVERRIDE_EFFECTS)(data.effect) })
}

export function readOverrideRevoked(data) {
  check(isObject(data) && data.isActive === false)
  return Object.freeze({ userId: id(data.userId), permissionId: id(data.permissionId), changed: bool(data.changed) })
}

export function readEffectivePermissions(data) {
  check(Array.isArray(data))
  return Object.freeze(data.map((entry) => {
    check(isObject(entry))
    return Object.freeze({ permissionId: id(entry.permissionId), ...readPermission(entry) })
  }))
}
