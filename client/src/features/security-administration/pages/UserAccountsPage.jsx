import { useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { SECURITY_ACTIONS } from '../securityActions.js'
import { useAdminAction } from '../useAdminData.js'
import { AdminPage, Feedback } from '../components/AdminUi.jsx'
import UserDirectory from '../components/UserDirectory.jsx'
import ProvisionAccountDialog from '../components/ProvisionAccountDialog.jsx'

export default function UserAccountsPage() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const action = useAdminAction()
  const [provisioning, setProvisioning] = useState(false)

  return (
    <AdminPage
      title="User accounts"
      description="Application accounts of employees. Open an account to review its status, sessions and security, and to manage it."
      actions={can(SECURITY_ACTIONS.USER_ACCOUNTS_CREATE) && (
        <button type="button" className="btn-primary" onClick={() => { action.setFeedback(null); setProvisioning(true) }}>
          <OrvexaIcon name="user-plus" className="size-4" /> Provision account
        </button>
      )}
    >
      {!provisioning && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}
      <UserDirectory rowLink={(user) => `/security/users/${user.userId}`} />
      {provisioning && (
        <ProvisionAccountDialog
          action={action}
          onClose={() => setProvisioning(false)}
          onProvisioned={(user) => {
            setProvisioning(false)
            navigate(`/security/users/${user.userId}`, { state: { provisioned: true } })
          }}
        />
      )}
    </AdminPage>
  )
}
