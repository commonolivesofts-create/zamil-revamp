import { useEffect, useRef, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { orvexaAsset } from '@/config/orvexaAssets.js'
import { orvexaLanguages } from '@/hooks/useOrvexaLayout.js'
import useAuth from '@/features/auth/useAuth.js'

const originalNotifications = [
  { id: 'latency', icon: 'triangle-alert', tone: 'is-danger', title: 'Provider latency threshold', description: 'Voice route crossed P95 policy', age: '2m ago', label: 'Alerts & Incidents' },
  { id: 'approvals', icon: 'user-check', tone: 'is-warn', title: '3 approvals waiting', description: 'High-impact AI actions require review', age: '6m ago', label: 'Human Review' },
  { id: 'savings', icon: 'circle-dollar-sign', tone: 'is-good', title: 'Routing savings increased', description: 'Cache + fallback saved $428 this cycle', age: '18m ago', label: 'AI Cost & Budgets' },
]

const originalAccountLinks = [
  ['Profile & account', 'user-round'],
  ['Security & sessions', 'shield-check'],
  ['Settings', 'settings-2'],
  ['Billing & credits', 'credit-card'],
]

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

export default function Header({ mobileOpen, onMobileOpen, sidebarMode, setSidebarMode, theme, setTheme, language, setLanguage, onOpenSettings, onOpenCommand, onUnavailable }) {
  const { user, status, signOut } = useAuth()
  const displayName = status === 'preview' ? 'Developer preview' : (typeof user?.name === 'string' && user.name.trim()) || (typeof user?.email === 'string' && user.email.trim()) || 'Administrator'
  const displayEmail = status === 'preview' ? 'Not authenticated' : typeof user?.email === 'string' ? user.email : ''
  const accountRole = status === 'preview' ? 'Layout preview' : typeof user?.role === 'string' ? user.role : 'Administrator'
  const initials = displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  const [signOutPending, setSignOutPending] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)
  const [notificationsRead, setNotificationsRead] = useState(false)
  const dropdownRegion = useRef(null)
  const currentLanguage = orvexaLanguages[language]

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

  const unavailable = (label) => {
    setOpenMenu(null)
    onUnavailable(label)
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
          <span className="truncate text-[13px]">Search Orvexa, ask AI, or run a command...</span>
          <span className="ml-auto hidden rounded-md border px-1.5 py-0.5 text-[12px] font-black sm:inline-flex" style={{ borderColor: 'var(--line)' }}>⌘ K</span>
        </button>
        <div className="ml-auto flex items-center gap-1.5 topbar-tools" ref={dropdownRegion}>
          <Dropdown
            id="notification-trigger" menu="notifications" openMenu={openMenu} toggleMenu={setOpenMenu} label="Notifications"
            buttonClassName="icon-button relative" icon={<>
              <OrvexaIcon name="bell" className="size-[18px]" />
              {!notificationsRead && <span id="notification-dot" className="absolute right-2 top-2 size-2 rounded-full border-2" style={{ background: 'var(--danger)', borderColor: 'var(--bg)' }} />}
            </>}
          >
            <div id="notifications-panel" className="dropdown-panel notification-panel right-0 top-[calc(100%+10px)]" aria-label="Notifications">
              <div className="notification-panel-head">
                <div><p>Notifications</p><span><b id="notification-count">{notificationsRead ? 0 : originalNotifications.length}</b> need attention</span></div>
                <button className="topbar-text-action" type="button" onClick={() => setNotificationsRead(true)}>Mark all read</button>
              </div>
              <div className="notification-list">
                {originalNotifications.map((item) => (
                  <a key={item.id} href="#" className="topbar-notification" onClick={(event) => { event.preventDefault(); unavailable(item.label) }}>
                    <span className={`topbar-notification-icon ${item.tone}`}><OrvexaIcon name={item.icon} /></span>
                    <span className="topbar-notification-copy"><b>{item.title}</b><small>{item.description}</small><time>{item.age}</time></span>
                    {!notificationsRead && <i className="notification-unread" />}
                  </a>
                ))}
              </div>
              <a className="topbar-panel-footer" href="#" onClick={(event) => { event.preventDefault(); unavailable('Notification center') }}>
                View notification center <OrvexaIcon name="arrow-right" />
              </a>
            </div>
          </Dropdown>
          <Dropdown
            menu="language" openMenu={openMenu} toggleMenu={setOpenMenu} label="Choose language"
            className="hidden sm:block" buttonClassName="icon-button topbar-language-trigger"
            icon={<span id="language-flag" className="topbar-current-flag"><img alt={`${currentLanguage.label} flag`} src={orvexaAsset(`images/flags/${currentLanguage.flag}.svg`)} /></span>}
          >
            <div id="language-panel" className="dropdown-panel language-panel right-0 top-[calc(100%+10px)]" aria-label="Language">
              <div className="language-panel-head"><span>Language</span><small>Interface locale</small></div>
              {Object.entries(orvexaLanguages).map(([key, config]) => (
                <button key={key} type="button" className="language-option" data-language-option={key} aria-pressed={language === key} onClick={() => { setLanguage(key); setOpenMenu(null) }}>
                  <span className="language-flag"><img alt="" src={orvexaAsset(`images/flags/${config.flag}.svg`)} /></span>
                  <span className="language-copy"><b>{config.label}</b></span>
                  <OrvexaIcon name="check" className="language-check" />
                </button>
              ))}
            </div>
          </Dropdown>
          <button id="layout-settings-trigger" type="button" className="icon-button" aria-controls="layout-settings-panel" aria-label="Layout settings" title="Layout settings" onClick={() => { setOpenMenu(null); onOpenSettings() }}>
            <OrvexaIcon name="settings-2" className="size-[18px]" />
          </button>
          <button id="theme-toggle" type="button" className="icon-button" aria-label="Toggle light or dark mode" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <OrvexaIcon name={theme === 'dark' ? 'sun' : 'moon'} className="size-[18px]" />
          </button>
          <Dropdown
            menu="profile" openMenu={openMenu} toggleMenu={setOpenMenu} label="Profile menu"
            className="profile-dropdown" buttonClassName="topbar-profile-trigger"
            icon={<>
              <span className="topbar-avatar">{initials}</span>
              <span className="topbar-profile-copy"><b>{displayName}</b><small>{accountRole}</small></span>
              <OrvexaIcon name="chevron-down" className="topbar-profile-chevron" />
            </>}
          >
            <div id="profile-panel" className="dropdown-panel profile-panel right-0 top-[calc(100%+10px)]" aria-label="Profile menu">
              <div className="profile-panel-head"><span className="profile-panel-avatar">{initials}</span><span><b>{displayName}</b><small>{displayEmail}</small></span></div>
              <div className="profile-workspace"><span className="status-dot" /><span><b>{typeof user?.workspace?.name === 'string' ? user.workspace.name : 'Workspace'}</b><small>{status === 'preview' ? 'Development preview only' : 'Enterprise workspace'}</small></span></div>
              <nav className="profile-menu-links" aria-label="Account">
                {originalAccountLinks.map(([label, icon]) => (
                  <a key={label} className="topbar-profile-link" href="#" onClick={(event) => { event.preventDefault(); unavailable(label) }}>
                    <span><OrvexaIcon name={icon} /></span><b>{label}</b><OrvexaIcon name="chevron-right" />
                  </a>
                ))}
              </nav>
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
