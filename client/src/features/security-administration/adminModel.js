// Pure reshaping of backend data for the security-administration screens.
// Nothing here creates records; it only filters, groups and labels what the
// backend returned.
import { permissionKey } from '../access/permissionContract.js'
import { ACCOUNT_STATUSES, ID_PATTERN } from './securityAdminContract.js'
import { SECURITY_ACTIONS } from './securityActions.js'

export const USER_SORTS = Object.freeze({
  employeeNumber: 'Employee number',
  username: 'Username',
  createdAt: 'Created',
  lastLoginAt: 'Last sign-in',
})
export const PAGE_SIZE = 25

export const isRecordId = (value) => typeof value === 'string' && ID_PATTERN.test(value)

const positiveInteger = (value, fallback, max) => {
  const number = Number.parseInt(value, 10)
  return Number.isInteger(number) && number >= 1 && number <= max && String(number) === String(value) ? number : fallback
}
const booleanFilter = (value) => (value === 'true' || value === 'false' ? value : '')

// User-directory filters from the URL, limited to values the backend accepts.
export function readUserFilters(searchParams) {
  const get = (name) => searchParams.get(name) ?? ''
  const status = get('status')
  const sortBy = get('sortBy')
  return Object.freeze({
    page: positiveInteger(get('page'), 1, 100000),
    search: get('search').trim().slice(0, 100),
    status: ACCOUNT_STATUSES.includes(status) ? status : '',
    mfaEnrolled: booleanFilter(get('mfaEnrolled')),
    locked: booleanFilter(get('locked')),
    sortBy: Object.hasOwn(USER_SORTS, sortBy) ? sortBy : 'employeeNumber',
    sortOrder: get('sortOrder') === 'desc' ? 'desc' : 'asc',
  })
}

// Request parameters for GET /users (empty filters are omitted).
export function userListQuery(filters) {
  return {
    page: filters.page,
    limit: PAGE_SIZE,
    search: filters.search.length >= 2 ? filters.search : undefined,
    status: filters.status || undefined,
    mfaEnrolled: filters.mfaEnrolled || undefined,
    locked: filters.locked || undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  }
}

export function displayName(user) {
  return user?.fullName?.trim() || user?.employee?.fullName?.trim() || user?.username?.trim() || user?.employee?.username?.trim() || null
}

// Every catalogue permission with its key; `grantable` when the module,
// resource and permission are all active (the backend refuses others).
export function flattenCatalog(catalog = []) {
  return catalog.flatMap((module) => module.resources.flatMap((resource) => resource.permissions.map((permission) => Object.freeze({
    permissionId: permission.permissionId,
    moduleCode: module.moduleCode,
    moduleName: module.moduleName,
    resourceCode: resource.resourceCode,
    resourceName: resource.resourceName,
    actionCode: permission.actionCode,
    description: permission.description,
    key: permissionKey({ moduleCode: module.moduleCode, resourceCode: resource.resourceCode, actionCode: permission.actionCode }),
    grantable: module.isActive && resource.isActive && permission.isActive,
  }))))
}

const matches = (term, ...values) => values.some((value) => typeof value === 'string' && value.toLowerCase().includes(term))

// Catalogue tree filtered by a search term (codes and names) and activity.
// A module or resource that matches keeps all its children.
export function filterCatalog(catalog = [], { search = '', includeInactive = true } = {}) {
  const term = search.trim().toLowerCase()
  const active = (item) => includeInactive || item.isActive
  return catalog.filter(active).map((module) => {
    const moduleHit = !term || matches(term, module.moduleCode, module.moduleName)
    const resources = module.resources.filter(active).map((resource) => {
      const resourceHit = moduleHit || matches(term, resource.resourceCode, resource.resourceName)
      const permissions = resource.permissions.filter(active)
        .filter((permission) => resourceHit || matches(term, permission.actionCode, permission.description, `${module.moduleCode}.${resource.resourceCode}:${permission.actionCode}`.toLowerCase()))
      return { ...resource, permissions }
    }).filter((resource) => moduleHit || resource.permissions.length || matches(term, resource.resourceCode, resource.resourceName))
    return { ...module, resources }
  }).filter((module) => !term || module.resources.length || matches(term, module.moduleCode, module.moduleName))
}

// Grantable permissions not in `excludeIds`, matching a search term.
export function grantablePermissions(catalog, { excludeIds = [], search = '' } = {}) {
  const excluded = new Set(excludeIds)
  const term = search.trim().toLowerCase()
  return flattenCatalog(catalog)
    .filter((item) => item.grantable && !excluded.has(item.permissionId))
    .filter((item) => !term || matches(term, item.key.toLowerCase(), item.description, item.moduleName, item.resourceName))
}

export const permissionLabel = (item) => permissionKey(item)

// Account actions this administrator may start, from their effective
// permissions and the account state and classification returned by the
// backend. Nobody changes their own account here, and the protected Super
// Administrator account is refused for everyone, so neither offers actions.
// The backend re-checks every action, including the administrator hierarchy.
export function accountActions(user, { can, selfId }) {
  const manageable = user.userId !== selfId && !user.classification.protectedSuperAdministrator
  const status = user.account.status
  return {
    manageable,
    activate: manageable && can(SECURITY_ACTIONS.USER_ACCOUNTS_ACTIVATE) && status !== 'ACTIVE',
    disable: manageable && can(SECURITY_ACTIONS.USER_ACCOUNTS_DISABLE) && status !== 'DISABLED',
    revokeSessions: manageable && can(SECURITY_ACTIONS.USER_ACCOUNTS_REVOKE_SESSIONS),
    passwordSetup: manageable && can(SECURITY_ACTIONS.USER_ACCOUNTS_CREATE) && status === 'PENDING' && !user.password.set,
    recovery: manageable && can(SECURITY_ACTIONS.ACCOUNT_RECOVERY_ISSUE) && status === 'ACTIVE',
  }
}
