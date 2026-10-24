// Granting several existing permissions to one role (ROLE_PERMISSIONS:GRANT). Pure logic, testable
// without React: the selectable options, the selection, the list-completeness checks and the
// sequential submission through the existing single-grant API
// (PUT /access-control/roles/{roleId}/permissions/{permissionId}). Every grant is its own audited
// backend transaction: a submission is never atomic, and the backend re-checks each one
// (role protection, escalation, inactive role or permission chain).
import { isOutcomeUnknown } from '../../services/api/apiClient.js'
import { grantablePermissions } from './adminModel.js'
import { catalogMayBeIncomplete } from './catalogActions.js'

// GET /access-control/roles/{roleId}/permissions returns at most this many grant rows (active
// and revoked). At the limit, "already granted" cannot be trusted, so granting is refused.
export const ROLE_GRANT_LIST_LIMIT = 1000

export const GRANT_RESULT = Object.freeze({
  GRANTED: 'GRANTED',
  ALREADY_GRANTED: 'ALREADY_GRANTED',
  FAILED: 'FAILED',
  UNKNOWN_OUTCOME: 'UNKNOWN_OUTCOME',
  NOT_SUBMITTED: 'NOT_SUBMITTED',
})

export const grantListMayBeIncomplete = (grants) => (grants ?? []).length >= ROLE_GRANT_LIST_LIMIT

/** Why granting must be refused for this data, or null when the lists can be trusted. */
export function grantDataProblem({ catalog, grants }) {
  if (catalogMayBeIncomplete(catalog)) {
    return 'The permission catalogue reached its display limit, so it may be incomplete. Granting several permissions here is unavailable.'
  }
  if (grantListMayBeIncomplete(grants)) {
    return 'This role has reached the grant-list display limit, so its existing grants cannot be confirmed. Granting here is unavailable.'
  }
  return null
}

/**
 * Grantable catalogue permissions (module, resource and action all active) matching the search,
 * each with the role's grant state: 'granted' (active grant: never selectable), 'revoked'
 * (selectable again: granting reactivates it) or null.
 */
export function grantOptions(catalog, grants, search = '') {
  const state = new Map((grants ?? []).map((grant) => [grant.permissionId, grant.isActive ? 'granted' : 'revoked']))
  return grantablePermissions(catalog, { search }).map((item) => ({ ...item, grantState: state.get(item.permissionId) ?? null }))
}

/**
 * Adds or removes one permission ID. Only grantable permissions the role does not actively hold
 * can be selected; an ID is never selected twice. The selection is independent of the search.
 */
export function toggleGrant(selected, permissionId, { catalog, grants }) {
  if (selected.includes(permissionId)) return selected.filter((id) => id !== permissionId)
  const option = grantOptions(catalog, grants).find((item) => item.permissionId === permissionId)
  if (!option || option.grantState === 'granted') return selected
  return [...selected, permissionId]
}

/** Keeps only selected IDs that are still selectable after the data changed (e.g. a refresh). */
export const validSelection = (selected, data) =>
  selected.filter((id) => grantOptions(data.catalog, data.grants).some((item) => item.permissionId === id && item.grantState !== 'granted'))

/**
 * Grants the selected permissions to `roleId` one at a time, never retrying. Results:
 *   GRANTED          the backend created or reactivated the grant (changed: true)
 *   ALREADY_GRANTED  the backend confirmed the role already held it (changed: false)
 *   FAILED           explicitly refused (authorization, protected role, escalation, inactive
 *                    role or permission, missing permission, session…)
 *   UNKNOWN_OUTCOME  no reliable answer (network, timeout, server error): may or may not exist
 *   NOT_SUBMITTED    not sent because an earlier grant failed or had an unknown outcome
 * The first failure or unknown outcome stops the sequence; earlier results are kept.
 */
export async function grantPermissionsSequentially({ roleId, permissionIds, grant }) {
  const ids = [...new Set(permissionIds)]
  const results = ids.map((permissionId) => ({ permissionId, status: GRANT_RESULT.NOT_SUBMITTED, error: null }))
  for (const result of results) {
    try {
      const response = await grant(roleId, result.permissionId)
      result.status = response?.changed === false ? GRANT_RESULT.ALREADY_GRANTED : GRANT_RESULT.GRANTED
    } catch (error) {
      result.error = error
      result.status = isOutcomeUnknown(error) ? GRANT_RESULT.UNKNOWN_OUTCOME : GRANT_RESULT.FAILED
      break
    }
  }
  return {
    roleId,
    results,
    // Effective permissions may have changed: something was granted, or might have been.
    accessMayHaveChanged: results.some((r) => r.status === GRANT_RESULT.GRANTED || r.status === GRANT_RESULT.UNKNOWN_OUTCOME),
  }
}

const RESULT_TEXT = Object.freeze({
  GRANTED: () => 'granted',
  ALREADY_GRANTED: () => 'already granted; nothing changed',
  FAILED: (result, describe) => `not granted: ${describe(result.error).message}`,
  UNKNOWN_OUTCOME: () => 'outcome unknown: the server did not confirm the result. Check the refreshed grant list before trying again',
  NOT_SUBMITTED: () => 'not submitted (stopped after an earlier problem)',
})

/** Page feedback ({ kind, message, details }) for one submission; `labelOf` maps an ID to its key. */
export function summarizeGrantResults({ results }, { describeFailure, labelOf, roleLabel }) {
  const count = (status) => results.filter((result) => result.status === status).length
  const granted = count(GRANT_RESULT.GRANTED)
  const unchanged = count(GRANT_RESULT.ALREADY_GRANTED)
  const unknown = count(GRANT_RESULT.UNKNOWN_OUTCOME)
  const problems = count(GRANT_RESULT.FAILED) + count(GRANT_RESULT.NOT_SUBMITTED)
  const details = results.map((result) => `${labelOf(result.permissionId)}: ${RESULT_TEXT[result.status](result, describeFailure)}`)
  const kind = unknown ? 'unknown' : problems ? 'error' : 'success'
  const total = results.length
  const message = kind === 'success'
    ? `${granted} ${granted === 1 ? 'permission' : 'permissions'} granted to ${roleLabel}${unchanged ? `; ${unchanged} already held` : ''}.`
    : `Only part of the request completed for ${roleLabel}: ${granted} of ${total} granted${unchanged ? `, ${unchanged} already held` : ''}. Each grant is separate, so the completed ones stay in effect. Review each result below.`
  return { kind, message, details }
}
