import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import ExternalNavigationLink from '@/components/navigation/ExternalNavigationLink.jsx'
import { appConfig } from '@/config/appConfig.js'
import { authorizedNavigation } from '@/config/appNavigation.js'
import useAuth from '@/features/auth/useAuth.js'
import usePermissions from '@/features/access/usePermissions.js'
import { displayName as profileName, initialsOf, resolveProfile } from '@/features/dashboard/dashboardExperience.js'

// No notification service exists yet, so the header shows no notifications.
// There is no language selector: the interface is only available in English.
// The profile menu lists only the implemented account pages from the shared
// navigation configuration.

function Dropdown({ id, menu, openMenu, toggleMenu, label, className = '', buttonClassName = 'icon-button', icon, children }) {
  const isOpen = openMenu === menu
  return (
    <div className={`dropdown relative ${className} ${isOpen ? 'is-open' : ''}`.trim()} data-orvexa-dropdown>
      <button
        id={id || `${menu}-trigger`}
        className={`dropdown-trigger ${buttonClassName}`}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls={`${menu}-panel`}
        aria-label={label}
        onClick={() => toggleMenu(isOpen ? null : menu)}
      >
        {icon}
      </button>
      {children}
    </div>
  )
}

export default function Header({ mobileOpen, onMobileOpen, sidebarMode, setSidebarMode, theme, setTheme, onOpenSettings, onOpenCommand, onUnavailable }) {
  const { user, status, signOut } = useAuth()
  const access = usePermissions()
  const profile = resolveProfile(user, status)
  const displayName = profileName(profile)
  const displayEmail = profile.email || (status === 'preview' ? 'Design preview' : '')
  const accountRole = [profile.jobTitle, profile.department].filter(Boolean).join(' · ') || 'Signed-in employee'
  const initials = initialsOf(displayName)
  const employeeNumber = profile.employeeNumber || null
  const accountLinks = authorizedNavigation(access).find((section) => section.id === 'account')?.items || []
  const [signOutPending, setSignOutPending] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)
  const dropdownRegion = useRef(null)

  useEffect(() => {
    const outsideClick = (event) => {
      if (dropdownRegion.current && !dropdownRegion.current.contains(event.target)) setOpenMenu(null)
    }
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      const openDropdown = dropdownRegion.current?.querySelector('.dropdown.is-open')
      if (openDropdown) {
        setOpenMenu(null)
        openDropdown.querySelector('.dropdown-trigger')?.focus()
      }
    }
    document.addEventListener('pointerdown', outsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', outsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const handleSignOut = async () => {
    if (signOutPending || status !== 'authenticated') return
    setSignOutPending(true)
    try {
      await signOut()
      setOpenMenu(null)
    } catch {
      onUnavailable('Sign out failed. Please retry')
    } finally {
      setSignOutPending(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b px-3 backdrop-blur-2xl sm:px-5 lg:px-6" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb,var(--bg) 82%,transparent)' }}>
      <div className="flex h-[72px] items-center gap-2">
        <button type="button" id="mobile-menu" className="icon-button lg:hidden" aria-label="Open navigation" aria-controls="sidebar" aria-expanded={mobileOpen} onClick={onMobileOpen}>
          <OrvexaIcon name="menu" className="size-[18px]" />
        </button>
        <button
          type="button" id="sidebar-toggle" className="icon-button hidden lg:inline-flex"
          aria-label={sidebarMode === 'full' ? 'Use icon sidebar' : 'Use full sidebar'}
          title={sidebarMode === 'full' ? 'Use icon sidebar' : 'Use full sidebar'}
          onClick={() => setSidebarMode(sidebarMode === 'full' ? 'icon' : 'full')}
        >
          <OrvexaIcon name={sidebarMode === 'full' ? 'panel-left-close' : 'panel-left-open'} className="size-[18px]" />
        </button>
        <button
          type="button" id="command-trigger"
          aria-haspopup="dialog" onClick={onOpenCommand}
          className="ml-0 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 text-left transition hover:-translate-y-0.5 md:max-w-lg"
          style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb,var(--surface-solid) 76%,transparent)', color: 'var(--muted)' }}
        >
          <OrvexaIcon name="search" className="size-4 shrink-0" />
          <span className="truncate text-[13px]">Search {appConfig.name} pages...</span>
          <span className="ml-auto hidden rounded-md border px-1.5 py-0.5 text-[12px] font-black sm:inline-flex" style={{ borderColor: 'var(--line)' }}>⌘ K</span>
        </button>
        <div className="ml-auto flex items-center gap-1.5 topbar-tools" ref={dropdownRegion}>
          <button id="layout-settings-trigger" type="button" className="icon-button" aria-controls="layout-settings-panel" aria-label="Layout settings" title="Layout settings" onClick={() => { setOpenMenu(null); onOpenSettings() }}>
            <OrvexaIcon name="settings-2" className="size-[18px]" />
          </button>
          <button id="theme-toggle" type="button" className="icon-button" aria-label="Toggle light or dark mode" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <OrvexaIcon name={theme === 'dark' ? 'sun' : 'moon'} className="size-[18px]" />
          </button>
          <Dropdown
            menu="profile" openMenu={openMenu} toggleMenu={setOpenMenu} label="Profile menu"
            className="profile-dropdown" buttonClassName="header-profile-trigger"
            icon={<>
              <span className="header-profile-avatar" aria-hidden="true">{initials}</span>
              <span className="header-profile-copy"><b>{displayName}</b><small>{accountRole}</small></span>
            </>}
          >
            <div id="profile-panel" className="dropdown-panel profile-panel right-0 top-[calc(100%+10px)]" aria-label="Profile menu">
              <div className="profile-panel-head"><span className="profile-panel-avatar">{initials}</span><span><b>{displayName}</b><small>{displayEmail}</small></span></div>
              {(employeeNumber || status === 'preview') && (
                <div className="profile-workspace"><span><b>{status === 'preview' ? 'Development preview only' : `Employee ${employeeNumber}`}</b>{user?.department && <small>{user.department}</small>}</span></div>
              )}
              {accountLinks.length > 0 && (
                <nav className="profile-menu-links" aria-label="Account">
                  {accountLinks.map((item) => item.type === 'external' ? (
                    <ExternalNavigationLink key={item.id} className="topbar-profile-link" href={item.href} onClick={() => setOpenMenu(null)}>
                      <span><OrvexaIcon name={item.icon} /></span><b>{item.label}</b><OrvexaIcon name="chevron-right" />
                    </ExternalNavigationLink>
                  ) : (
                    <Link key={item.id} className="topbar-profile-link" to={item.path} onClick={() => setOpenMenu(null)}>
                      <span><OrvexaIcon name={item.icon} /></span><b>{item.label}</b><OrvexaIcon name="chevron-right" />
                    </Link>
                  ))}
                </nav>
              )}
              <div className="profile-panel-footer">
                <button type="button" className="topbar-profile-link is-danger w-full" onClick={handleSignOut} disabled={status !== 'authenticated' || signOutPending} title={status === 'preview' ? 'Preview mode has no authenticated session' : undefined}>
                  <span><OrvexaIcon name="log-out" /></span><b>{signOutPending ? 'Signing out…' : 'Sign out'}</b><OrvexaIcon name="arrow-right" />
                </button>
              </div>
            </div>
          </Dropdown>
        </div>
      </div>
    </header>
  )
}
