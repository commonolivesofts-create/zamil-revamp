// Validation and derivation for the developer-controlled module registry.
//
// Pure JavaScript, shared by the frontend and by future Node.js tooling (no
// React, browser or Vite dependencies; relative imports only). Every problem is
// a RegistryError thrown when the registry is imported, so a malformed
// definition fails the tests and the build instead of producing navigation.
//
// A module definition (see module-registry.example.js):
//   RBAC module   { code, name, description?, displayOrder, resources: [resource] }
//   session-only  { code, name, rbac: false, navigation: [entry] }  (no permissions;
//                 never registered in Oracle)
//   resource      { code, name, description?, actions: [standard codes], navigation?: [entry] }
//   entry         { id, title, icon, group, order, type?, path | href, requiredAction?,
//                   alsoRequires?, requiresMfa?, hidden?, implemented? }
// `type` is optional: missing or 'internal' is a React route (`path`); only
// 'external' is an external destination (`href`); anything else is rejected.
import { isStandardAction } from './actions.js'

const CODE = /^[A-Z][A-Z0-9_]*$/
const ENTRY_ID = /^[a-z][a-z0-9-]*$/
const SEGMENT = '(?::[A-Za-z][A-Za-z0-9]*|[a-z0-9][a-z0-9-]*)'
const ROUTE_PATH = new RegExp(`^/(?:${SEGMENT}(?:/${SEGMENT})*)?$`)
// Only these public build-time variables can supply an external URL, so an
// entry can never read another configuration value.
const EXTERNAL_ENV_NAME = /^VITE_EXTERNAL_[A-Z0-9_]+$/
const PERMISSION_REF = /^(?:([A-Z][A-Z0-9_]*)\.)?([A-Z][A-Z0-9_]*):([A-Z][A-Z0-9_]*)$/
// Locked XX_ZRV_* column lengths.
const MAX = Object.freeze({ module: 60, resource: 80, action: 40, name: 120, description: 500, url: 2048 })
const NAVIGATION_TYPES = Object.freeze(['internal', 'external'])

export class RegistryError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RegistryError'
  }
}

const fail = (where, message) => {
  throw new RegistryError(`${where}: ${message}`)
}

function assertObject(where, value, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(where, 'must be an object')
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) fail(where, `unknown property "${key}"`)
  }
}

function assertCode(where, value, max) {
  if (typeof value !== 'string' || !CODE.test(value) || value.length > max) {
    fail(where, `code must match ^[A-Z][A-Z0-9_]*$ with at most ${max} characters`)
  }
}

function assertText(where, value, max, { optional = false } = {}) {
  if (optional && value === undefined) return
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max) {
    fail(where, `must be non-blank trimmed text of at most ${max} characters`)
  }
}

function assertBoolean(where, value) {
  if (value !== undefined && typeof value !== 'boolean') fail(where, 'must be true or false')
}

function assertArray(where, value, { optional = false, nonEmpty = false } = {}) {
  if (optional && value === undefined) return []
  if (!Array.isArray(value)) fail(where, 'must be an array')
  if (nonEmpty && !value.length) fail(where, 'must not be empty')
  return value
}

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item)
    Object.freeze(value)
  }
  return value
}

/**
 * Returns the normalized URL for an approved external destination, or null.
 * Only absolute https URLs with a host name or IP address are accepted; URLs
 * with credentials, whitespace, control characters or backslashes are refused.
 */
export function validateExternalUrl(value) {
  if (typeof value !== 'string' || !value || value.length > MAX.url) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f\\]/.test(value)) return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
  return url.href
}

function normalizeHref(where, href) {
  if (typeof href === 'string') {
    if (!validateExternalUrl(href)) fail(where, 'href must be an absolute https URL without credentials')
    return href
  }
  assertObject(where, href, ['env'])
  if (typeof href.env !== 'string' || !EXTERNAL_ENV_NAME.test(href.env)) {
    fail(where, 'href.env must name a VITE_EXTERNAL_* variable')
  }
  return { env: href.env }
}

const ENTRY_KEYS = [
  'id', 'title', 'icon', 'group', 'order', 'type', 'path', 'href', 'requiredAction', 'alsoRequires',
  'requiresMfa', 'hidden', 'implemented',
]

function normalizeEntry(where, entry, resource) {
  assertObject(where, entry, ENTRY_KEYS)
  if (typeof entry.id !== 'string' || !ENTRY_ID.test(entry.id)) fail(where, 'id must be lower-case kebab-case')
  const at = `${where} "${entry.id}"`
  assertText(`${at} title`, entry.title, MAX.name)
  if (typeof entry.icon !== 'string' || !entry.icon.trim()) fail(at, 'icon is required')
  if (typeof entry.group !== 'string' || !entry.group) fail(at, 'group is required')
  if (!Number.isInteger(entry.order) || entry.order < 0) fail(at, 'order must be a non-negative integer')
  // Missing type means internal; only an explicit 'external' is external.
  const type = entry.type === undefined ? 'internal' : entry.type
  if (!NAVIGATION_TYPES.includes(type)) fail(at, `unknown navigation type "${String(entry.type)}"`)
  for (const key of ['requiresMfa', 'hidden', 'implemented']) assertBoolean(`${at} ${key}`, entry[key])

  const normalized = {
    id: entry.id, type, title: entry.title, icon: entry.icon, group: entry.group, order: entry.order,
    requiresMfa: entry.requiresMfa === true, hidden: entry.hidden === true, implemented: entry.implemented !== false,
  }
  if (type === 'internal') {
    if (entry.href !== undefined) fail(at, 'an internal entry has a path, not an href')
    if (typeof entry.path !== 'string' || !ROUTE_PATH.test(entry.path)) {
      fail(at, 'path must be an absolute application route such as /area/page or /area/page/:id')
    }
    normalized.path = entry.path
  } else {
    if (entry.path !== undefined) fail(at, 'an external entry has an href, not a path')
    if (entry.hidden === true) fail(at, 'an external entry cannot be hidden; omit it instead')
    normalized.href = normalizeHref(`${at} href`, entry.href)
  }

  if (resource) {
    const requiredAction = entry.requiredAction ?? 'VIEW'
    if (!resource.actions.includes(requiredAction)) {
      fail(at, `requiredAction ${requiredAction} is not an action of resource ${resource.code}`)
    }
    normalized.requiredAction = requiredAction
    normalized.alsoRequires = assertArray(`${at} alsoRequires`, entry.alsoRequires, { optional: true }).map((ref) => {
      if (typeof ref !== 'string' || !PERMISSION_REF.test(ref)) fail(at, `invalid alsoRequires reference ${String(ref)}`)
      return ref
    })
  } else if (entry.requiredAction !== undefined || entry.alsoRequires !== undefined) {
    fail(at, 'session-only entries require no permission (no requiredAction or alsoRequires)')
  } else {
    normalized.alsoRequires = []
  }
  return normalized
}

/** Validates one module definition and returns its normalized, frozen form. */
export function defineModule(definition) {
  assertObject('module', definition, ['code', 'name', 'description', 'displayOrder', 'rbac', 'resources', 'navigation'])
  assertCode('module code', definition.code, MAX.module)
  const where = `module ${definition.code}`
  assertText(`${where} name`, definition.name, MAX.name)
  assertText(`${where} description`, definition.description, MAX.description, { optional: true })
  assertBoolean(`${where} rbac`, definition.rbac)
  const rbac = definition.rbac !== false

  if (!rbac) {
    if (definition.resources !== undefined || definition.displayOrder !== undefined) {
      fail(where, 'a session-only module (rbac: false) has no resources or displayOrder')
    }
    const navigation = assertArray(`${where} navigation`, definition.navigation, { nonEmpty: true })
      .map((entry) => normalizeEntry(`${where} navigation`, entry, null))
    return deepFreeze({ code: definition.code, name: definition.name, rbac, resources: [], navigation })
  }

  if (definition.navigation !== undefined) fail(where, 'navigation belongs to a resource in an RBAC module')
  if (!Number.isInteger(definition.displayOrder) || definition.displayOrder < 0) {
    fail(where, 'displayOrder must be a non-negative integer')
  }
  const resourceCodes = new Set()
  const resources = assertArray(`${where} resources`, definition.resources, { nonEmpty: true }).map((resource) => {
    assertObject(`${where} resource`, resource, ['code', 'name', 'description', 'actions', 'navigation'])
    assertCode(`${where} resource code`, resource.code, MAX.resource)
    const at = `${where}.${resource.code}`
    if (resourceCodes.has(resource.code)) fail(at, 'duplicate resource code')
    resourceCodes.add(resource.code)
    assertText(`${at} name`, resource.name, MAX.name)
    assertText(`${at} description`, resource.description, MAX.description, { optional: true })
    const actions = assertArray(`${at} actions`, resource.actions, { nonEmpty: true })
    for (const code of actions) {
      assertCode(`${at} action`, code, MAX.action)
      if (!isStandardAction(code)) fail(at, `action ${code} is not in the standard action catalogue`)
    }
    if (new Set(actions).size !== actions.length) fail(at, 'duplicate action code')
    const normalized = {
      code: resource.code, name: resource.name, ...(resource.description && { description: resource.description }),
      actions: [...actions],
    }
    normalized.navigation = assertArray(`${at} navigation`, resource.navigation, { optional: true })
      .map((entry) => normalizeEntry(`${at} navigation`, entry, normalized))
    return normalized
  })
  return deepFreeze({
    code: definition.code, name: definition.name,
    ...(definition.description && { description: definition.description }),
    displayOrder: definition.displayOrder, rbac, resources,
  })
}

export const permissionKey = (moduleCode, resourceCode, actionCode) => `${moduleCode}.${resourceCode}:${actionCode}`

/**
 * Cross-module validation and the derived data every consumer uses:
 *   permissions  every MODULE.RESOURCE:ACTION of the RBAC modules (Oracle catalogue shape)
 *   entries      navigation entries in display order (group order, then entry order),
 *                with their effective permission, alsoRequires and flags resolved
 */
export function buildRegistry(modules, groups) {
  assertArray('registry modules', modules, { nonEmpty: true })
  const groupIndex = new Map(groups.map((group, index) => [group.id, index]))
  const moduleCodes = new Set()
  const permissions = []
  const permissionSet = new Set()
  for (const module of modules) {
    if (!module || !Object.isFrozen(module) || !Array.isArray(module.resources)) {
      fail('registry', 'every module must be created with defineModule()')
    }
    if (moduleCodes.has(module.code)) fail(`module ${module.code}`, 'duplicate module code')
    moduleCodes.add(module.code)
    for (const resource of module.resources) {
      for (const actionCode of resource.actions) {
        const key = permissionKey(module.code, resource.code, actionCode)
        permissions.push(Object.freeze({ moduleCode: module.code, resourceCode: resource.code, actionCode, key }))
        permissionSet.add(key)
      }
    }
  }

  const ids = new Set()
  const paths = new Set()
  const slots = new Set()
  const entries = []
  const addEntry = (module, resource, entry) => {
    const at = `navigation "${entry.id}"`
    if (ids.has(entry.id)) fail(at, 'duplicate navigation id')
    ids.add(entry.id)
    if (!groupIndex.has(entry.group)) fail(at, `unknown group "${entry.group}"`)
    const slot = `${entry.group}#${entry.order}`
    if (slots.has(slot)) fail(at, `order ${entry.order} is already used in group ${entry.group}`)
    slots.add(slot)
    if (entry.type === 'internal') {
      if (paths.has(entry.path)) fail(at, `duplicate route path ${entry.path}`)
      paths.add(entry.path)
    }
    const permission = resource ? permissionKey(module.code, resource.code, entry.requiredAction) : null
    const alsoRequires = entry.alsoRequires.map((ref) => {
      const [, moduleCode = module.code, resourceCode, actionCode] = PERMISSION_REF.exec(ref)
      const key = permissionKey(moduleCode, resourceCode, actionCode)
      if (!permissionSet.has(key)) fail(at, `alsoRequires ${key} is not a registered permission`)
      return key
    })
    // The established route shape (config/appNavigation.js consumers rely on it):
    // optional fields are present only when they apply.
    const route = {
      id: entry.id,
      ...(entry.type === 'internal' ? { path: entry.path } : { type: 'external', href: entry.href }),
      label: entry.title,
      icon: entry.icon,
      section: entry.group,
      ...(permission && { permission }),
      ...(alsoRequires.length && { alsoRequires }),
      // Explicit on every permission-guarded entry; on session-only entries only when true.
      ...((permission || entry.requiresMfa) && { requiresMfa: entry.requiresMfa }),
      implemented: entry.implemented,
      ...(entry.hidden && { nav: false }),
    }
    entries.push({ route, sort: [groupIndex.get(entry.group), entry.order] })
  }
  for (const module of modules) {
    for (const entry of module.navigation ?? []) addEntry(module, null, entry)
    for (const resource of module.resources) {
      for (const entry of resource.navigation) addEntry(module, resource, entry)
    }
  }
  entries.sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1])

  return deepFreeze({
    modules: [...modules],
    permissions,
    entries: entries.map((item) => item.route),
  })
}
