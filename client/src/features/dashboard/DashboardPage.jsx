import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { authorizedNavigation } from '@/config/appNavigation.js'
import useAuth from '@/features/auth/useAuth.js'
import usePermissions from '@/features/access/usePermissions.js'
import ProfileAvatar from '@/components/profile/ProfileAvatar.jsx'
import { Dialog } from '@/features/security-administration/components/AdminUi.jsx'
import HomeView from '@/features/dashboard/components/HomeView.jsx'
import ModuleAtlas from '@/features/dashboard/components/ModuleAtlas.jsx'
import {
  displayName,
  profileRows,
  resolveProfile,
} from '@/features/dashboard/dashboardExperience.js'
import {
  useRevealOnScroll,
  useScrollProgress,
  shouldReduceMotion,
} from '@/features/dashboard/useDashboardMotion.js'
import '@/styles/dashboard-workspace.css'

// The shell owns the sidebar, header, command palette and layout customizer.
// This page is the workspace canvas: the home overview and the Module Atlas.
// Workflow screens (credit notes, HR forms, approvals, analytics, activity and
// settings) are intentionally deferred; their dashboard buttons are visual
// placeholders until those screens are rebuilt.
const RIPPLE_TARGETS = '.gateway-action, .quick-form, .domain-card, .book-leaf-open'

function ProfileDialogBody({ profile }) {
  return (
    <div className="zrv-ws-profile-card">
      <div className="zrv-ws-profile-identity">
        <ProfileAvatar profile={profile} className="zrv-ws-profile-avatar" />
        <span>
          <strong>{displayName(profile)}</strong>
          <small>{[profile?.jobTitle, profile?.department].filter(Boolean).join(' · ') || 'Signed-in employee'}</small>
        </span>
      </div>
      {profile?.isPreview && (
        <p className="zrv-ws-preview-note">
          Illustrative preview identity. These values are not an authenticated account
          record; sign in to see your own employee details.
        </p>
      )}
      <dl className="zrv-ws-profile-grid">
        {profileRows(profile).map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd className={field.value === 'Not recorded on this account' ? 'is-empty' : undefined}>
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="zrv-ws-profile-note">Read-only details from the signed-in employee record.</p>
    </div>
  )
}

export default function DashboardPage() {
  const { user, status } = useAuth()
  const access = usePermissions()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'atlas' ? 'atlas' : 'home'
  const atlasDomain = view === 'atlas' ? searchParams.get('domain') ?? '' : ''
  const profile = useMemo(() => resolveProfile(user, status), [user, status])
  const pages = useMemo(
    () => authorizedNavigation(access).flatMap((section) =>
      section.items.map((page) => ({ ...page, sectionLabel: section.label }))),
    [access],
  )

  const rootRef = useRef(null)
  const motionEnabled = useRevealOnScroll(rootRef, view)
  const progressRef = useScrollProgress(motionEnabled, view)

  const [profileOpen, setProfileOpen] = useState(false)
  const lastViewRef = useRef(view)

  const openProfile = useCallback(() => setProfileOpen(true), [])
  const closeProfile = useCallback(() => setProfileOpen(false), [])

  // Only the home canvas and the Module Atlas exist for now. Any dashboard
  // button that used to open a deferred workflow is deliberately inert.
  const navigateView = useCallback((nextView, options = {}) => {
    const normalized = nextView === 'atlas' ? 'atlas' : nextView === 'home' ? 'home' : null
    if (!normalized) return
    const params = new URLSearchParams()
    if (normalized === 'atlas') {
      params.set('view', 'atlas')
      if (options.domain) params.set('domain', options.domain)
    }
    setSearchParams(params, { replace: false })
  }, [setSearchParams])

  const openPage = useCallback((page) => {
    if (!page) return
    if (page.type === 'external') {
      window.open(page.href, '_blank', 'noopener,noreferrer')
      return
    }
    navigate(page.path)
  }, [navigate])

  // View changes are client-side, so restore the top of the page and move focus
  // to the new title. This keeps keyboard and screen-reader users in context.
  useEffect(() => {
    if (lastViewRef.current === view) return undefined
    lastViewRef.current = view
    window.scrollTo({ top: 0, behavior: 'auto' })
    const frame = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector('[data-zrv-view-title]')
        ?.focus?.({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  const spawnRipple = useCallback((event) => {
    if (shouldReduceMotion()) return
    const target = event.target.closest?.(RIPPLE_TARGETS)
    if (!target) return
    const bounds = target.getBoundingClientRect()
    const ripple = document.createElement('span')
    ripple.className = 'click-energy'
    ripple.style.left = `${event.clientX - bounds.left}px`
    ripple.style.top = `${event.clientY - bounds.top}px`
    target.appendChild(ripple)
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
  }, [])

  const content = view === 'atlas' ? (
    <ModuleAtlas
      initialDomain={atlasDomain}
      onBack={() => navigateView('home')}
    />
  ) : (
    <HomeView
      profile={profile}
      pages={pages}
      accessStatus={access.status}
      onOpenProfile={openProfile}
      onNavigate={navigateView}
      onOpenPage={openPage}
    />
  )

  return (
    <div className="zrv-ws" ref={rootRef} onPointerDown={spawnRipple}>
      <div className="scroll-indicator" ref={progressRef} aria-hidden="true" />
      <div className={`scene${view === 'atlas' ? ' atlas-no-enter' : ''}`} key={`${view}-${view === 'atlas' ? atlasDomain : ''}`}>{content}</div>

      {profileOpen && (
        <Dialog
          title="Employee profile"
          description="The identity this workspace uses for you."
          onClose={closeProfile}
        >
          <ProfileDialogBody profile={profile} />
          <div className="zrv-dialog__actions">
            <button className="btn ghost" type="button" onClick={closeProfile} data-autofocus>
              Close
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
