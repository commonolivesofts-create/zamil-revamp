import { useContext } from 'react'
import { PermissionContext } from './PermissionContext.js'

// { status, mfaVerified, adminMfaRequired, permissions, errorCode, has, can, reload }.
// `can(key)` is true only for a loaded effective permission of the signed-in user.
export default function usePermissions() {
  const context = useContext(PermissionContext)
  if (!context) throw new Error('usePermissions requires a PermissionProvider.')
  return context
}
