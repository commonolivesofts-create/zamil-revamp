import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'

import { AdminPage } from '../components/AdminUi.jsx'
import UserDirectory from '../components/UserDirectory.jsx'

import { securityAdminService } from '../securityAdminService.js'
import { useResource } from '../useAdminData.js'

import '@/styles/security-user-roles.css'

// ======================================================
// USER ROLES — SUMMARY CARD CONFIGURATION
// ======================================================

// Statistics are loaded from the existing User Accounts API.

const SUMMARY_CARDS = [
  {
    id: 'total',
    label: 'Total accounts',
    icon: 'users-round',
    tone: 'green',
  },
  {
    id: 'active',
    label: 'Active accounts',
    icon: 'circle-check',
    tone: 'green',
  },
  {
    id: 'enrolled',
    label: 'Authenticator enrolled',
    icon: 'shield-check',
    tone: 'green',
  },
  {
    id: 'locked',
    label: 'Locked accounts',
    icon: 'lock-keyhole',
    tone: 'amber',
  },
]

// ======================================================
// READ TOTAL COUNTS FROM API
// ======================================================

// Do not use items.length because results may be paginated.

function readTotal(result) {
  const total = result?.pagination?.total

  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) {
    throw new Error('The accounts API did not return a valid total count.')
  }

  return total
}

// ======================================================
// LOAD ACCOUNT STATISTICS
// ======================================================

// Fetch only one record per API request.
// Total counts come from pagination metadata.

async function loadRoleStatistics(signal) {
  const base = {
    page: 1,
    limit: 1,
  }

  const [total, active, enrolled, locked] = await Promise.all([
    securityAdminService.listUsers(base, { signal }),

    securityAdminService.listUsers(
      {
        ...base,
        status: 'ACTIVE',
      },
      { signal },
    ),

    securityAdminService.listUsers(
      {
        ...base,
        mfaEnrolled: 'true',
      },
      { signal },
    ),

    securityAdminService.listUsers(
      {
        ...base,
        locked: 'true',
      },
      { signal },
    ),
  ])

  return {
    total: readTotal(total),
    active: readTotal(active),
    enrolled: readTotal(enrolled),
    locked: readTotal(locked),
  }
}

// ======================================================
// CALCULATE PERCENTAGES
// ======================================================

function calculatePercentage(value, total) {
  if (!total || !Number.isFinite(value)) {
    return '0.0%'
  }

  return `${((value / total) * 100).toFixed(1)}%`
}

// ======================================================
// ACCOUNT SUMMARY CARD
// ======================================================

function RoleSummaryCard({ label, icon, value, percentage, tone, loading }) {
  return (
    <article className={`zrv-user-role-stat zrv-user-role-stat--${tone}`} aria-label={label}>
      <div className="zrv-user-role-stat__content">
        {/* Card icon */}

        <span className="zrv-user-role-stat__icon" aria-hidden="true">
          <OrvexaIcon name={icon} />
        </span>

        {/* Card information */}

        <div className="zrv-user-role-stat__details">
          <h2 className="zrv-user-role-stat__label">{label}</h2>

          <div className="zrv-user-role-stat__values">
            <strong className="zrv-user-role-stat__number">{loading ? '—' : value}</strong>

            {!loading && percentage !== null && (
              <span className="zrv-user-role-stat__percentage">{percentage}</span>
            )}
          </div>
        </div>
      </div>

      {/* Decorative bottom wave */}

      <svg
        className="zrv-user-role-stat__art"
        viewBox="0 0 180 54"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M0 48 L35 45 L65 40 L98 43 L128 25 L150 32 L180 10 L180 54 L0 54 Z"
          fill="currentColor"
        />
      </svg>
    </article>
  )
}

// ======================================================
// MAIN USER ROLES PAGE
// ======================================================

export default function UserRolesPage() {
  // Existing statistics resource.

  const statistics = useResource('user-roles:account-statistics', loadRoleStatistics)

  const loading = statistics.status === 'loading'

  const data = statistics.status === 'ready' ? statistics.data : null

  // Existing summary values.

  const summaryValues = {
    total: data?.total ?? 0,
    active: data?.active ?? 0,
    enrolled: data?.enrolled ?? 0,
    locked: data?.locked ?? 0,
  }

  return (
    <div className="zrv-user-roles-page">
      <AdminPage
        eyebrow="Security Administration"
        title="User roles"
        description="Choose an account to review its roles and effective access, or to assign and revoke roles."
      >
        {/* ======================================
            FOUR ACCOUNT SUMMARY CARDS
           ====================================== */}

        <section className="zrv-user-roles-summary" aria-label="Account statistics">
          <div className="zrv-user-roles-summary__grid">
            {SUMMARY_CARDS.map((card) => {
              const value = summaryValues[card.id]

              const percentage =
                card.id === 'total' ? null : calculatePercentage(value, summaryValues.total)

              return (
                <RoleSummaryCard
                  key={card.id}
                  label={card.label}
                  icon={card.icon}
                  tone={card.tone}
                  value={value}
                  percentage={percentage}
                  loading={loading || !data}
                />
              )
            })}
          </div>

          {/* Statistics error */}

          {statistics.status === 'error' && (
            <div className="zrv-user-roles-summary__error" role="alert">
              <span>Account statistics could not be loaded.</span>

              <button type="button" className="btn-secondary" onClick={statistics.reload}>
                Retry
              </button>
            </div>
          )}
        </section>

        {/* ======================================
            EXISTING EMPLOYEE DIRECTORY
           ====================================== */}

        <div className="zrv-user-roles-directory">
          <UserDirectory
            rowLink={(user) => `/security/user-roles/${user.userId}`}
            rowAction="Manage roles"
            compactReportTable
          />
        </div>
      </AdminPage>
    </div>
  )
}
