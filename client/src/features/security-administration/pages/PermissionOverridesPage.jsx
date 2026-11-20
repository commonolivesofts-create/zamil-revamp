
import '@/styles/security-permission-overrides.css'

import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'

import { AdminPage } from '../components/AdminUi.jsx'
import UserDirectory from '../components/UserDirectory.jsx'

import { securityAdminService } from '../securityAdminService.js'
import { useResource } from '../useAdminData.js'

// Existing account API filters are reused.
// All statistics represent system-wide account counts
// when the server provides pagination totals.

const SUMMARY_CARDS = [
  {
    id: 'total',
    title: 'Total Accounts',
    icon: 'users-round',
    color: 'green',
  },
  {
    id: 'active',
    title: 'Active Accounts',
    icon: 'circle-check',
    color: 'green',
  },
  {
    id: 'enrolled',
    title: 'Authenticator Enrolled',
    icon: 'shield-check',
    color: 'green',
  },
  {
    id: 'locked',
    title: 'Locked Accounts',
    icon: 'lock-keyhole',
    color: 'amber',
  },
]

function readCount(result) {
  const raw = result?.pagination?.total

  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : NaN

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      'Account API did not return a valid total count.'
    )
  }

  return value
}

async function loadAccountStatistics(signal) {
  const base = {
    page: 1,
    limit: 1,
  }

  const [total, active, enrolled, locked] =
    await Promise.all([
      securityAdminService.listUsers(
        base,
        { signal }
      ),

      securityAdminService.listUsers(
        {
          ...base,
          status: 'ACTIVE',
        },
        { signal }
      ),

      securityAdminService.listUsers(
        {
          ...base,
          mfaEnrolled: 'true',
        },
        { signal }
      ),

      securityAdminService.listUsers(
        {
          ...base,
          locked: 'true',
        },
        { signal }
      ),
    ])

  return {
    total: readCount(total),
    active: readCount(active),
    enrolled: readCount(enrolled),
    locked: readCount(locked),
  }
}

function percentage(value, total) {
  if (!total) {
    return '0.0%'
  }

  return `${((value / total) * 100).toFixed(1)}%`
}

function SummaryCard({
  title,
  icon,
  value,
  percentageValue,
  color,
}) {
  return (
    <article
      className={`zrv-po-stat zrv-po-stat--${color}`}
    >
      <div className="zrv-po-stat__content">
        <span
          className="zrv-po-stat__icon"
          aria-hidden="true"
        >
          <OrvexaIcon name={icon} />
        </span>

        <div className="zrv-po-stat__details">
          <h2 className="zrv-po-stat__title">
            {title}
          </h2>

          <div className="zrv-po-stat__values">
            <strong className="zrv-po-stat__number">
              {value}
            </strong>

            {percentageValue !== null && (
              <span className="zrv-po-stat__percentage">
                {percentageValue}
              </span>
            )}
          </div>
        </div>
      </div>

      <svg
        className="zrv-po-stat__wave"
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

export default function PermissionOverridesPage() {
  const statistics = useResource(
    'permission-overrides:account-statistics',
    loadAccountStatistics
  )

  const data =
    statistics.status === 'ready'
      ? statistics.data
      : null

  const values = {
    total: data?.total ?? null,
    active: data?.active ?? null,
    enrolled: data?.enrolled ?? null,
    locked: data?.locked ?? null,
  }

  return (
    <div className="zrv-permission-overrides-page">
      <AdminPage
        eyebrow="Security Administration"
        title="Permission overrides"
        description="Choose an account to review or change permissions granted or denied directly to it, outside its roles."
      >
        {/* FOUR ACCOUNT SUMMARY CARDS */}

        <section
          className="zrv-po-summary"
          aria-label="Account statistics"
        >
          <div className="zrv-po-summary__grid">
            {SUMMARY_CARDS.map((card) => {
              const value = values[card.id]

              const percentageValue =
                card.id === 'total' ||
                value === null ||
                values.total === null
                  ? null
                  : percentage(
                      value,
                      values.total
                    )

              return (
                <SummaryCard
                  key={card.id}
                  title={card.title}
                  icon={card.icon}
                  color={card.color}
                  value={
                    value === null
                      ? '—'
                      : value.toLocaleString()
                  }
                  percentageValue={percentageValue}
                />
              )
            })}
          </div>

          {statistics.status === 'error' && (
            <div
              className="zrv-po-summary__error"
              role="alert"
            >
              <span>
                Account statistics could not be loaded.
              </span>

              <button
                type="button"
                className="btn-secondary"
                onClick={statistics.reload}
              >
                Retry
              </button>
            </div>
          )}
        </section>

        {/* EXISTING USER DIRECTORY */}

        <section
          className="zrv-po-directory"
          aria-label="Manage account permission overrides"
        >
          <UserDirectory
            rowLink={(user) =>
              `/security/permission-overrides/${user.userId}`
            }
            rowAction="Manage overrides"
            compactReportTable
            searchPlaceholder="Search by Employee Number, Username, or Name..."
          />
        </section>
      </AdminPage>
    </div>
  )
}
