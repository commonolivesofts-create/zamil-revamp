import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import useAuth from '@/features/auth/useAuth.js'
import { PermissionContext } from './PermissionContext.js'
import { permissionService } from './permissionService.js'
import { createPermissionStore, resolveAccess } from './permissionStore.js'

// Follows the authentication state without changing it. Race handling
// (revisions, aborts, stale or foreign responses) lives in permissionStore.js.
export default function PermissionProvider({ children }) {
  const { status, user } = useAuth()
  const [store] = useState(() => createPermissionStore({ service: permissionService }))
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)

  useEffect(() => {
    void store.sync({ status, user })
  }, [store, status, user])

  // Cleanup aborts any request and clears permissions (React Strict Mode safe:
  // the re-run sync effect loads them again).
  useEffect(() => () => store.clear(), [store])

  const value = useMemo(() => {
    const access = resolveAccess(snapshot, { status, user })
    return Object.freeze({
      status: access.status,
      mfaVerified: access.mfaVerified,
      permissions: access.permissions,
      errorCode: access.errorCode,
      has: access.has,
      can: (key) => access.status === 'ready' && access.has(key) === true,
      reload: store.reload,
    })
  }, [snapshot, status, user, store])

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>
}
