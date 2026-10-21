// Framework-free effective-permission state, bound to React by
// PermissionProvider through useSyncExternalStore. Kept outside React so the
// race handling is testable with the Node-native test runner.
//
// Statuses: idle | loading | ready | error. Only `ready` grants anything, and
// only for the user (`subjectId`) whose permissions were loaded: default deny
// while unresolved, failed, signed out or in the development preview.
// The store follows the authentication state through sync(): an authenticated
// user loads their permissions; any other state (guest, loading, MFA pending,
// error, preview) clears them. A late response from a superseded request, a
// previous user or a cleared state is never applied.
// Permissions are held in memory only and are never persisted.
import { ApiError } from '../../services/api/apiClient.js'
import { permissionKey } from './permissionContract.js'

const NO_PERMISSIONS = Object.freeze([])
const denyAll = () => false

function accessState(status, fields = {}) {
  return Object.freeze({
    status, subjectId: null, mfaVerified: false, permissions: NO_PERMISSIONS, errorCode: null, has: denyAll, ...fields,
  })
}

function readyState(subjectId, { mfaVerified, permissions }) {
  const keys = new Set(permissions.map(permissionKey))
  return accessState('ready', { subjectId, mfaVerified, permissions, has: (key) => keys.has(key) })
}

const IDLE = accessState('idle')

const authenticatedSubject = ({ status, user } = {}) =>
  status === 'authenticated' && typeof user?.id === 'string' ? user.id : null

// The permission state the UI may use for the current authentication state.
// Permissions loaded for any other identity, or before this session became
// authenticated, are never exposed, even for the render before sync() runs.
export function resolveAccess(snapshot, auth) {
  const subjectId = authenticatedSubject(auth)
  if (!subjectId) return IDLE
  if (snapshot?.subjectId !== subjectId || snapshot.status === 'idle') return accessState('loading', { subjectId })
  return snapshot
}

export function createPermissionStore({ service }) {
  let snapshot = accessState('idle')
  const listeners = new Set()
  // Each load or clear starts a new revision; only the current one may apply.
  let revision = 0
  let active = null

  function set(next) {
    snapshot = next
    for (const listener of listeners) listener()
  }

  function invalidate() {
    revision += 1
    active?.abort()
    active = null
    return revision
  }

  function clear() {
    invalidate()
    if (snapshot.status !== 'idle') set(accessState('idle'))
  }

  async function load(subjectId) {
    const current = invalidate()
    const controller = new AbortController()
    active = controller
    const isCurrent = () => current === revision && !controller.signal.aborted
    set(accessState('loading', { subjectId }))
    try {
      const result = await service.getMyPermissions({ signal: controller.signal })
      if (!isCurrent()) return
      // Permissions for another identity (a session changed underneath this
      // request) are never associated with the signed-in user.
      if (result.userId !== subjectId) {
        throw new ApiError('Your access permissions could not be verified.', { code: 'IDENTITY_MISMATCH' })
      }
      set(readyState(subjectId, result))
    } catch (error) {
      if (!isCurrent()) return
      set(accessState('error', { subjectId, errorCode: typeof error?.code === 'string' ? error.code : 'API_ERROR' }))
    } finally {
      if (active === controller) active = null
    }
  }

  // Called with the authentication snapshot whenever it changes.
  function sync(auth) {
    const subjectId = authenticatedSubject(auth)
    if (!subjectId) return clear()
    if (snapshot.subjectId === subjectId && snapshot.status !== 'idle') return undefined
    return load(subjectId)
  }

  // Manual retry after a failure, or a refresh after an administrator changed
  // this user's access. Never starts a duplicate request.
  function reload() {
    if (!snapshot.subjectId || snapshot.status === 'loading') return undefined
    return load(snapshot.subjectId)
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    sync,
    reload,
    clear,
  })
}
