import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { appConfig } from '@/config/appConfig.js'
import { authorizedNavigation } from '@/config/appNavigation.js'
import useAuth from '@/features/auth/useAuth.js'
import usePermissions from '@/features/access/usePermissions.js'
import { formatDateTime, groupPermissions } from '@/features/dashboard/dashboardModel.js'
import '@/styles/workspace.css'

// ZRV-FE-005: the dashboard shows only real information: the backend profile,
// session state and effective permissions of the signed-in user. No business
// metrics API exists yet, so no metrics are shown. The template's sample
// dashboard (and its chart library) was removed in Stage 4; the development
// preview shows this same page, without a user or permissions.

const SECURITY_MODULE = 'SECURITY_ADMINISTRATION'

function Card({ icon, title, description, className = '', children }) {
  const id = `zrv-card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <section className={`zrv-card ${className}`.trim()} aria-labelledby={id}>
      <div className="zrv-card__head">
        <span className="zrv-card__icon"><OrvexaIcon name={icon} /></span>
        <span>
          <h2 id={id}>{title}</h2>
          {description && <p>{description}</p>}
        </span>
      </div>
      {children}
    </section>
  )
}

function Detail({ label, value }) {
  return (
    <div className="zrv-dl__row">
      <dt>{label}</dt>
      <dd className={value ? undefined : 'is-empty'}>{value || 'Not recorded'}</dd>
    </div>
  )
}

function AccessSummary({ access }) {
  if (access.status === 'error') {
    return (
      <div className="zrv-card__state" role="alert">
        <p>Your permissions could not be loaded. Pages that need a permission stay hidden until they are.</p>
        <button type="button" className="zrv-button" onClick={access.reload}>Retry</button>
      </div>
    )
  }
  // `idle`: no authenticated session (the development preview), so nothing is loaded.
  if (access.status === 'idle') {
    return <p className="zrv-card__state" role="status">No authenticated session: permissions are not loaded.</p>
  }
  if (access.status !== 'ready') {
    return <p className="zrv-card__state" role="status">Loading your permissions…</p>
  }
  if (!access.permissions.length) {
    return (
      <p className="zrv-card__state" role="status">
        No application permissions are assigned to your account yet. Your administrator can grant access when you need it.
      </p>
    )
  }
  const modules = groupPermissions(access.permissions)
  const needsMfa = !access.mfaVerified && access.permissions.some((permission) => permission.moduleCode === SECURITY_MODULE)
  return (
    <>
      <div className="zrv-access-summary">
        <p role="status">
          <b>{access.permissions.length}</b> effective {access.permissions.length === 1 ? 'permission' : 'permissions'} in <b>{modules.length}</b> {modules.length === 1 ? 'module' : 'modules'}
        </p>
        <button type="button" className="zrv-button" onClick={access.reload}>Refresh</button>
      </div>
      {needsMfa && (
        <p className="zrv-card__note">
          Security administration also requires a sign-in verified with your authenticator app. Those permissions apply after you sign in with verification.
        </p>
      )}
      <div className="zrv-access-modules">
        {modules.map((module) => (
          <section key={module.moduleCode} className="zrv-access-module" aria-label={module.label}>
            <h3>{module.label}</h3>
            <ul>
              {module.resources.map((resource) => (
                <li key={resource.resourceCode}>
                  <span className="zrv-access-resource">{resource.label}</span>
                  <span className="zrv-chips">
                    {resource.actions.map((action) => (
                      <span key={action.actionCode} className="zrv-chip" title={action.viaRole ? 'Granted through a role' : 'Granted directly to your account'}>
                        {action.actionCode}{!action.viaRole && action.viaOverride && <small> · direct</small>}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

function WorkspaceDashboard() {
  const { user, session, password } = useAuth()
  const access = usePermissions()
  const name = user?.fullName?.trim() || user?.username?.trim() || ''
  const role = [user?.jobTitle?.trim(), user?.department?.trim()].filter(Boolean).join(' · ')
  const pages = authorizedNavigation(access).flatMap((section) => section.items).filter((item) => item.id !== 'dashboard')
  const idleMinutes = Number.isInteger(session?.idleTimeoutSeconds) ? Math.round(session.idleTimeoutSeconds / 60) : null
  const passwordExpiry = formatDateTime(password?.expiresAt, { dateOnly: true })

  return (
    <div className="zrv-dash">
      <header className="zrv-dash__hero">
        <p className="zrv-dash__eyebrow">{appConfig.name}</p>
        <h1>{name ? `Welcome, ${name}` : 'Welcome'}</h1>
        {role && <p className="zrv-dash__lead">{role}</p>}
      </header>

      <div className="zrv-dash__grid">
        <Card icon="id-card" title="Your profile" description="From your employee record">
          <dl className="zrv-dl">
            <Detail label="Employee number" value={user?.employeeNumber} />
            <Detail label="Username" value={user?.username} />
            <Detail label="Email" value={user?.email} />
            <Detail label="Job title" value={user?.jobTitle} />
            <Detail label="Department" value={user?.department} />
          </dl>
        </Card>

        <Card icon="shield-check" title="Sign-in and security" description="This session">
          <dl className="zrv-dl">
            <Detail label="Verification" value={session ? (session.mfaVerified ? 'Verified with authenticator app' : 'Password only') : null} />
            <Detail label="Session ends" value={formatDateTime(session?.expiresAt)} />
            <Detail label="Idle sign-out" value={idleMinutes ? `After ${idleMinutes} ${idleMinutes === 1 ? 'minute' : 'minutes'} of inactivity` : null} />
            <Detail label="Password" value={password?.expired ? 'Expired — change it now' : passwordExpiry ? `Expires ${passwordExpiry}` : password ? 'No expiry date' : null} />
          </dl>
        </Card>

        <Card icon="key-round" title="Your access" description="Effective permissions resolved by the server" className="zrv-card--wide">
          <AccessSummary access={access} />
        </Card>

        <Card icon="compass" title="Available pages" description="Pages your account can open" className="zrv-card--wide">
          {pages.length ? (
            <ul className="zrv-dash__links">
              {pages.map((page) => (
                <li key={page.id}>
                  <Link to={page.path}>
                    <OrvexaIcon name={page.icon} />
                    <span>{page.label}</span>
                    <OrvexaIcon name="chevron-right" className="zrv-dash__chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zrv-card__state">No additional pages are available to your account.</p>
          )}
          <p className="zrv-card__note">Business modules will appear here when they are released and assigned to your account.</p>
        </Card>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return <WorkspaceDashboard />
}
