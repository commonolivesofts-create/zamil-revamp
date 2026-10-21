import { useState } from 'react'
import { fieldProps } from '../adminForms.js'
import { formatInstant } from '../adminFeedback.js'
import { displayName } from '../adminModel.js'
import { securityAdminService } from '../securityAdminService.js'
import { ConfirmDialog, Field } from './AdminUi.jsx'

const PURPOSES = Object.freeze({
  PASSWORD_RESET: { label: 'Password reset', applies: (user) => user.password.set, unavailable: 'The account has no password yet.' },
  MFA_RECOVERY: { label: 'Authenticator recovery', applies: (user) => user.mfa.enrolled, unavailable: 'The account has no authenticator enrolled.' },
})

// Administrator-issued e-mail links (docs/07 §5):
//   mode "setup"    — password-setup link for a pending account (USER_ACCOUNTS:CREATE);
//   mode "recovery" — password-reset or authenticator-recovery link
//                     (ACCOUNT_RECOVERY:ISSUE).
// The backend enforces the administrator hierarchy (administrator accounts only
// by the Super Administrator with a recent authenticator verification; the
// Super Administrator's own account only through verified self-service) and
// sends the single-use link to the employee's registered e-mail. The link
// token is never returned to, shown in or stored by this application.
// The operator re-enters the employee number as the backend's explicit authorization.
export default function AccountLinkDialog({ mode, user, action, onClose, onIssued }) {
  const recovery = mode === 'recovery'
  const purposes = Object.entries(PURPOSES)
  const [purpose, setPurpose] = useState(() => purposes.find(([, item]) => item.applies(user))?.[0] ?? null)
  const [confirmation, setConfirmation] = useState('')
  const matches = confirmation.trim() === user.employeeNumber
  const name = displayName(user) || `employee ${user.employeeNumber}`

  const issue = async () => {
    if (!matches || (recovery && !purpose)) return
    const confirmEmployeeNumber = confirmation.trim()
    const outcome = await action.run(
      () => recovery
        ? securityAdminService.issueRecovery(user.userId, { purpose, confirmEmployeeNumber })
        : securityAdminService.issuePasswordSetup(user.userId, { confirmEmployeeNumber }),
      {
        success: (result) => [
          `${recovery ? PURPOSES[result.actionType]?.label ?? 'Recovery' : 'Password setup'} link sent to ${name}'s registered e-mail address.`,
          result.expiresAt ? `It expires ${formatInstant(result.expiresAt)}.` : '',
          result.authorizedBySuperAdministrator ? 'Authorized by you as Super Administrator.' : '',
        ].filter(Boolean).join(' '),
      },
    )
    onIssued(outcome)
  }

  return (
    <ConfirmDialog
      title={recovery ? 'Send an account recovery link' : 'Send a password setup link'}
      description={recovery
        ? `A single-use link is e-mailed to ${name}. Completing it signs the employee out of every session.`
        : `A single-use link is e-mailed to ${name} to choose a password. The account stays pending until it is activated.`}
      confirmLabel="Send link"
      pending={action.pending}
      feedback={action.feedback}
      onConfirm={issue}
      onClose={onClose}
      confirmDisabled={!matches || (recovery && !purpose)}
    >
      {recovery && (
        <fieldset className="zrv-admin-choices">
          <legend>Recovery type</legend>
          {purposes.map(([value, item]) => {
            const applies = item.applies(user)
            return (
              <label key={value} htmlFor={`purpose-${value}`} className={`zrv-admin-choice ${applies ? '' : 'is-disabled'}`.trim()}>
                <input id={`purpose-${value}`} type="radio" name="recovery-purpose" value={value} checked={purpose === value} disabled={!applies || action.pending} onChange={() => setPurpose(value)} />
                <span><b>{item.label}</b>{!applies && <small className="zrv-admin-sub">{item.unavailable}</small>}</span>
              </label>
            )
          })}
        </fieldset>
      )}
      <Field id="link-confirm" label={`Type the employee number (${user.employeeNumber}) to confirm`}>
        <input {...fieldProps('link-confirm')} data-autofocus className="ux-input" autoComplete="off" spellCheck={false} maxLength={30} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={action.pending} />
      </Field>
    </ConfirmDialog>
  )
}
