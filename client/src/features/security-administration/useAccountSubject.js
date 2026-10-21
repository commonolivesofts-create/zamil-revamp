import usePermissions from '@/features/access/usePermissions.js'
import useAuth from '@/features/auth/useAuth.js'
import { displayName } from './adminModel.js'
import { SECURITY_ACTIONS } from './securityActions.js'
import { securityAdminService } from './securityAdminService.js'
import { useResource } from './useAdminData.js'

// The account managed on a per-user page. Its name is read from
// GET /users/{userId} only when the administrator may view accounts; otherwise
// the page identifies it by its account ID. `isSelf`: the signed-in user's own
// account, which nobody may change through these pages.
export default function useAccountSubject(userId) {
  const { can } = usePermissions()
  const { user: me } = useAuth()
  const canView = can(SECURITY_ACTIONS.USER_ACCOUNTS_VIEW)
  const detail = useResource(userId && canView ? `user:${userId}` : null, (signal) => securityAdminService.getUser(userId, { signal }))
  const name = detail.data ? displayName(detail.data) || `Employee ${detail.data.employeeNumber}` : null
  return {
    label: name || `Account ${userId}`,
    employeeNumber: detail.data?.employeeNumber ?? null,
    canViewAccount: canView,
    isSelf: Boolean(me?.id && me.id === userId),
  }
}
