import { AdminPage } from '../components/AdminUi.jsx'
import UserDirectory from '../components/UserDirectory.jsx'

// Choose an account whose direct permission overrides to manage
// (USER_PERMISSION_OVERRIDES:VIEW; the account list needs USER_ACCOUNTS:VIEW).
export default function PermissionOverridesPage() {
  return (
    <AdminPage title="Permission overrides" description="Choose an account to review or change permissions granted or denied directly to it, outside its roles.">
      <UserDirectory rowLink={(user) => `/security/permission-overrides/${user.userId}`} rowAction="Manage overrides" />
    </AdminPage>
  )
}
