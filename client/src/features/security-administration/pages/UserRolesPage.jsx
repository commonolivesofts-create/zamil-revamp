import { AdminPage } from '../components/AdminUi.jsx'
import UserDirectory from '../components/UserDirectory.jsx'

// Choose an account whose role assignments to manage
// (USER_ROLES:VIEW; the account list itself needs USER_ACCOUNTS:VIEW).
export default function UserRolesPage() {
  return (
    <AdminPage title="User roles" description="Choose an account to review its roles and effective access, or to assign and revoke roles.">
      <UserDirectory rowLink={(user) => `/security/user-roles/${user.userId}`} rowAction="Manage roles" />
    </AdminPage>
  )
}
