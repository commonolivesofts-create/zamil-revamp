
import { useState } from 'react'
import '@/styles/security-user-accounts.css'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { SECURITY_ACTIONS } from '../securityActions.js'
import { useAdminAction } from '../useAdminData.js'
import { Feedback } from '../components/AdminUi.jsx'
import UserDirectory from '../components/UserDirectory.jsx'
import ProvisionAccountDialog from '../components/ProvisionAccountDialog.jsx'

export default function UserAccountsPage() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const action = useAdminAction()
  const [provisioning, setProvisioning] = useState(false)

  const provisionAction = can(SECURITY_ACTIONS.USER_ACCOUNTS_CREATE) ? (
    <button
      type="button"
      className="btn-primary zrv-ua-provision zrv-ua-white-text"
      onClick={() => {
        action.setFeedback(null)
        setProvisioning(true)
      }}
    >
      <OrvexaIcon name="plus" className="size-4" />
      Provision account
    </button>
  ) : null

  return (
    <div className="zrv-admin zrv-ua-page">
      {!provisioning && (
        <Feedback
          feedback={action.feedback}
          onDismiss={() => action.setFeedback(null)}
        />
      )}

      <UserDirectory
        dashboard
        provisionAction={provisionAction}
        rowLink={(user) => `/security/users/${user.userId}`}
      />

      {provisioning && (
        <ProvisionAccountDialog
          action={action}
          onClose={() => setProvisioning(false)}
          onProvisioned={(user) => {
            setProvisioning(false)
            navigate(`/security/users/${user.userId}`, {
              state: { provisioned: true },
            })
          }}
        />
      )}
    </div>
  )
}
