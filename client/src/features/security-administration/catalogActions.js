// Adding standard actions to a catalogue resource (Permission Catalog, PERMISSION_CATALOG:MANAGE).
// Pure logic, testable without React: the action options, selection, the catalogue completeness
// check and the sequential creation through the existing single-action API with an accurate
// result for every submitted action. Nothing here grants a permission to a role or user.
import { isOutcomeUnknown } from '../../services/api/apiClient.js'
import { ACTION_CATEGORIES, STANDARD_ACTIONS } from '../../config/registry/actions.js'
import { registeredModules } from '../../config/registry/index.js'

// GET /access-control/catalog returns at most this many joined module/resource/action rows.
export const CATALOG_ROW_LIMIT = 2000

export const ACTION_RESULT = Object.freeze({
  CREATED: 'CREATED',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  EXISTS_INACTIVE: 'EXISTS_INACTIVE',
  CONFLICT_UNVERIFIED: 'CONFLICT_UNVERIFIED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
  NOT_SUBMITTED: 'NOT_SUBMITTED',
})

// Rows the backend query produced for this catalogue: one per action, one per resource without
// actions and one per module without resources. At the limit the response may be truncated.
export function catalogRowCount(catalog) {
  return (catalog ?? []).reduce((total, module) => total + Math.max(1, (module.resources ?? []).reduce(
    (rows, resource) => rows + Math.max(1, (resource.permissions ?? []).length), 0)), 0)
}

export const catalogMayBeIncomplete = (catalog) => catalogRowCount(catalog) >= CATALOG_ROW_LIMIT

/** The resource with its module from a catalogue response, or null. */
export function findCatalogResource(catalog, resourceId) {
  for (const module of catalog ?? []) {
    const resource = (module.resources ?? []).find((item) => item.resourceId === resourceId)
    if (resource) return { module, resource }
  }
  return null
}

/** Existing actions of a resource: code → 'active' | 'inactive'. */
export const existingActions = (resource) =>
  new Map((resource?.permissions ?? []).map((permission) => [permission.actionCode, permission.isActive ? 'active' : 'inactive']))

// Resources defined in the developer-controlled registry (session-only modules have none).
const codeOwned = new Set(registeredModules.flatMap((module) =>
  module.resources.map((resource) => `${module.code}.${resource.code}`)))
export const isCodeOwnedResource = (moduleCode, resourceCode) => codeOwned.has(`${moduleCode}.${resourceCode}`)

/** Every standard action with its state on the resource, filtered by code, name, category or description. */
export function actionOptions(existing, search = '') {
  const term = String(search).trim().toLowerCase()
  return Object.values(STANDARD_ACTIONS)
    .map((action) => ({ ...action, categoryLabel: ACTION_CATEGORIES[action.category], existing: existing.get(action.code) ?? null }))
    .filter((option) => !term ||
      [option.code, option.name, option.categoryLabel, option.description].some((text) => text.toLowerCase().includes(term)))
}

/** Adds or removes one code; existing actions, unknown codes and duplicates are never selected. */
export function toggleAction(selected, code, existing) {
  if (!Object.hasOwn(STANDARD_ACTIONS, code) || existing.has(code)) return selected
  return selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code]
}

/** Default description, e.g. APPROVE on "Sales Budget" → "Approve sales budget". */
export const defaultActionDescription = (code, resourceName) =>
  `${STANDARD_ACTIONS[code].name} ${String(resourceName).toLowerCase()}`

const isPlainConflict = (error) => error?.status === 409 && error.code === 'CONFLICT'

/**
 * Creates the selected actions one at a time with the existing API, never retrying. Results:
 *   CREATED              the server confirmed the creation
 *   ALREADY_EXISTS       409 CONFLICT, and fresh catalogue data shows the action ACTIVE on the resource
 *   EXISTS_INACTIVE      409 CONFLICT, and fresh data shows the action exists but is INACTIVE: it grants
 *                        nothing until an administrator activates it (reported as a problem)
 *   CONFLICT_UNVERIFIED  409 CONFLICT that fresh data could not confirm
 *   FAILED               refused (validation, authorization, session, inactive or missing parent…)
 *   UNKNOWN              no reliable answer (network, timeout, 5xx): may or may not exist
 *   NOT_SUBMITTED        not sent because an earlier request failed or had an unknown outcome
 * Any failure other than a plain conflict stops the sequence. Afterwards the catalogue is read
 * again to verify conflicts (and to show what an unknown request left behind).
 */
export async function createActionsSequentially({ resourceId, resourceName, codes, customDescription = null, createPermission, loadCatalog }) {
  const results = codes.map((code) => ({ code, status: ACTION_RESULT.NOT_SUBMITTED, error: null }))
  let stopped = null
  for (const result of results) {
    const description = codes.length === 1 && customDescription ? customDescription : defaultActionDescription(result.code, resourceName)
    try {
      await createPermission(resourceId, { actionCode: result.code, description })
      result.status = ACTION_RESULT.CREATED
    } catch (error) {
      result.error = error
      if (isPlainConflict(error)) {
        result.status = ACTION_RESULT.CONFLICT_UNVERIFIED
        continue
      }
      result.status = isOutcomeUnknown(error) ? ACTION_RESULT.UNKNOWN : ACTION_RESULT.FAILED
      stopped = result
      break
    }
  }

  let refreshed = null
  try {
    const catalog = await loadCatalog()
    if (!catalogMayBeIncomplete(catalog)) refreshed = findCatalogResource(catalog, resourceId)
  } catch {
    refreshed = null
  }
  const present = refreshed ? existingActions(refreshed.resource) : null
  for (const result of results) {
    const state = present ? (present.get(result.code) ?? 'absent') : null
    if (result.status === ACTION_RESULT.CONFLICT_UNVERIFIED && state === 'active') result.status = ACTION_RESULT.ALREADY_EXISTS
    if (result.status === ACTION_RESULT.CONFLICT_UNVERIFIED && state === 'inactive') result.status = ACTION_RESULT.EXISTS_INACTIVE
    // 'active' | 'inactive' | 'absent', or null when the refreshed catalogue could not be used.
    if (result.status === ACTION_RESULT.UNKNOWN) result.stateAfterRefresh = state
  }
  return { results, stopped, verified: present !== null }
}

const RESULT_TEXT = Object.freeze({
  CREATED: () => 'created',
  ALREADY_EXISTS: () => 'already exists and is active (confirmed in the refreshed catalogue)',
  EXISTS_INACTIVE: () => 'already exists but is INACTIVE: it grants nothing until an authorized administrator activates it',
  CONFLICT_UNVERIFIED: () => 'reported as already existing, but the refreshed catalogue could not confirm it',
  FAILED: (result, describe) => `not added: ${describe(result.error).message}`,
  UNKNOWN: (result) => `outcome unknown: the server did not confirm the result${{
    active: '; the action is now in the catalogue (active)',
    inactive: '; the action is now in the catalogue but INACTIVE',
    absent: '; the action is not in the refreshed catalogue',
  }[result.stateAfterRefresh] ?? ''}. Check before trying again`,
  NOT_SUBMITTED: () => 'not submitted (stopped after an earlier problem)',
})

/** Page feedback ({ kind, message, details }) for the results of one submission. */
export function summarizeActionResults({ results }, describeFailure, target) {
  const count = (status) => results.filter((result) => result.status === status).length
  const created = count(ACTION_RESULT.CREATED)
  const details = results.map((result) => `${result.code}: ${RESULT_TEXT[result.status](result, describeFailure)}`)
  const unknown = count(ACTION_RESULT.UNKNOWN)
  const problems = count(ACTION_RESULT.FAILED) + count(ACTION_RESULT.CONFLICT_UNVERIFIED) + count(ACTION_RESULT.EXISTS_INACTIVE) +
    count(ACTION_RESULT.NOT_SUBMITTED)
  const kind = unknown ? 'unknown' : problems ? 'error' : 'success'
  const message = kind === 'success'
    ? `${created} ${created === 1 ? 'action' : 'actions'} added to ${target}${count(ACTION_RESULT.ALREADY_EXISTS) ? '; some already existed and are active' : ''}. No role was granted these permissions.`
    : `${created} of ${results.length} ${results.length === 1 ? 'action was' : 'actions were'} added to ${target}. Review each result below.`
  return { kind, message, details }
}
