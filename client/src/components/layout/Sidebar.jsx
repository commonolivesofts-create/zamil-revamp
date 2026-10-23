import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import ExternalNavigationLink from '@/components/navigation/ExternalNavigationLink.jsx'
import { appConfig } from '@/config/appConfig.js'
import { authorizedNavigation, findAppRoute } from '@/config/appNavigation.js'
import { templateDemosAvailable } from '@/config/authRouting.js'
import { orvexaNavigation } from '@/config/orvexaNavigation.js'
import { getOrvexaRoute, getOrvexaSection } from '@/config/orvexaRoutes.js'
import useAuth from '@/features/auth/useAuth.js'
import usePermissions from '@/features/access/usePermissions.js'

// `end={false}` keeps a list page highlighted on its detail pages.
function SidebarLink({ to, icon, label, nested = false, end = true, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `sidebar-domain-link ${nested ? 'is-nested' : ''} ${isActive ? 'active' : ''}`.trim()}
      onClick={onNavigate}
    >
      <OrvexaIcon name={icon || 'circle'} />
      <span className="sidebar-domain-link-label">{label}</span>
    </NavLink>
  )
}

function DemoItems({ items = [], onNavigate }) {
  return items.map((item) => item.children?.length ? (
    <div className="sidebar-subgroup" key={item.id}>
      <div className="sidebar-subgroup-label">
        <OrvexaIcon name={item.icon || 'folder-tree'} />
        <span>{item.label}</span>
      </div>
      <div className="sidebar-subgroup-links">
        {item.children.map((child) => getOrvexaRoute(child) && (
          <SidebarLink key={child.id} to={getOrvexaRoute(child)} icon={child.icon} label={child.label} nested onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  ) : getOrvexaRoute(item) && (
    <SidebarLink key={item.id} to={getOrvexaRoute(item)} icon={item.icon} label={item.label} onNavigate={onNavigate} />
  ))
}

function StandaloneLink({ item, onNavigate }) {
  const content = (
    <>
      <span className="sidebar-domain-icon"><OrvexaIcon name={item.icon || 'circle'} /></span>
      <span className="sidebar-domain-label">{item.label}</span>
      <span className="sidebar-domain-chevron sidebar-domain-placeholder" aria-hidden="true" />
    </>
  )
  if (item.type === 'external') {
    return <ExternalNavigationLink href={item.href} className="sidebar-domain-toggle sidebar-domain-standalone-link" onClick={onNavigate}>{content}</ExternalNavigationLink>
  }
  return (
    <NavLink to={item.path} end className="sidebar-domain-toggle sidebar-domain-standalone-link" onClick={onNavigate}>
      {content}
    </NavLink>
  )
}

// A registry external destination inside a section (new tab, never "active").
function ExternalSidebarLink({ item, onNavigate }) {
  return (
    <ExternalNavigationLink href={item.href} className="sidebar-domain-link" onClick={onNavigate}>
      <OrvexaIcon name={item.icon || 'circle'} />
      <span className="sidebar-domain-link-label">{item.label}</span>
    </ExternalNavigationLink>
  )
}

function CollapsibleSection({ section, isOpen, isActive, onToggle, children }) {
  return (
    <section
      className={`sidebar-domain ${isActive ? 'is-active' : ''} ${isOpen ? 'is-open' : ''}`.trim()}
      data-sidebar-domain={section.id}
    >
      <button
        className="sidebar-domain-toggle"
        type="button"
        aria-label={section.label}
        aria-expanded={isOpen}
        aria-controls={`sidebar-panel-${section.id}`}
        onClick={onToggle}
      >
        <span className="sidebar-domain-icon"><OrvexaIcon name={section.icon || 'circle'} /></span>
        <span className="sidebar-domain-label">{section.label}</span>
        <OrvexaIcon name="chevron-down" className="sidebar-domain-chevron" />
      </button>
      <div id={`sidebar-panel-${section.id}`} className="sidebar-domain-panel" hidden={!isOpen}>
        {children}
      </div>
    </section>
  )
}

// Only implemented pages the signed-in user may open are listed, from the same
// configuration the route guard and command palette use. Template demo domains
// appear only in the development preview, below the application navigation.
export default function Sidebar({ mobileOpen, onMobileClose }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia('(max-width: 1023px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const { status } = useAuth()
  const access = usePermissions()
  const sections = authorizedNavigation(access)
  const demoSections = templateDemosAvailable(status) ? orvexaNavigation.filter((section) => section.items?.length) : []

  const { pathname } = useLocation()
  const activeDomain = findAppRoute(pathname)?.section || (demoSections.length ? getOrvexaSection(pathname) : null)
  // A menu selection only applies to the route where it was made. Navigating
  // with browser history automatically expands the newly active menu group.
  const [selection, setSelection] = useState({ pathname: '', domain: null })
  const openDomain = selection.pathname === pathname ? selection.domain : activeDomain

  const toggleDomain = (sectionId) => {
    setSelection({ pathname, domain: openDomain === sectionId ? '' : sectionId })
  }

  return (
    <>
      <div
        id="mobile-backdrop"
        className={`fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden ${mobileOpen ? '' : 'hidden'}`}
        aria-hidden="true"
        onClick={onMobileClose}
      />
      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r transition-[width,transform] duration-300 lg:translate-x-0 ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Primary navigation"
        aria-hidden={isMobile && !mobileOpen}
        role={isMobile && mobileOpen ? 'dialog' : undefined}
        aria-modal={isMobile && mobileOpen ? 'true' : undefined}
        inert={isMobile && !mobileOpen}
        style={{ background: 'color-mix(in srgb,var(--surface-solid) 95%,transparent)', borderColor: 'var(--line)', backdropFilter: 'blur(24px)' }}
      >
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b px-5" style={{ borderColor: 'var(--line)' }}>
          <NavLink id="sidebar-brand" to="/dashboard" className="flex min-w-0 items-center gap-3" aria-label={`${appConfig.name} home`} onClick={onMobileClose}>
            <span className="brand-mark">
              <OrvexaIcon name="building-2" className="size-4" />
            </span>
            <span id="sidebar-brand-copy" className="min-w-0">
              <span className="font-display block text-[18px] font-bold tracking-[-0.045em]">{appConfig.name}</span>
              <span className="block truncate text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>Enterprise workspace</span>
            </span>
          </NavLink>
          <button type="button" id="mobile-close" className="icon-button lg:hidden" aria-label="Close navigation" onClick={onMobileClose}>
            <OrvexaIcon name="x" className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3">
          <nav id="primary-navigation" aria-label={`${appConfig.name} pages`}>
            {sections.map((section) => section.standalone ? section.items.map((item) => (
              <section
                className={`sidebar-domain sidebar-domain-standalone ${pathname === item.path ? 'is-active' : ''}`.trim()}
                data-sidebar-domain={item.id}
                key={item.id}
              >
                <StandaloneLink item={item} onNavigate={onMobileClose} />
              </section>
            )) : (
              <CollapsibleSection
                key={section.id}
                section={section}
                isOpen={openDomain === section.id}
                isActive={activeDomain === section.id}
                onToggle={() => toggleDomain(section.id)}
              >
                {section.items.map((item) => item.type === 'external' ? (
                  <ExternalSidebarLink key={item.id} item={item} onNavigate={onMobileClose} />
                ) : (
                  <SidebarLink key={item.id} to={item.path} icon={item.icon} label={item.label} end={false} onNavigate={onMobileClose} />
                ))}
              </CollapsibleSection>
            ))}
            {access.status === 'loading' && (
              <p className="zrv-sidebar-access" role="status">Loading your access…</p>
            )}
            {access.status === 'error' && (
              <div className="zrv-sidebar-access" role="alert">
                <span>Your access could not be loaded.</span>
                <button type="button" onClick={access.reload}>Retry</button>
              </div>
            )}
          </nav>
          {demoSections.length > 0 && (
            <nav aria-label="Template demos (development preview only)" className="zrv-sidebar-demos">
              <p className="zrv-sidebar-heading">Template demos · preview only</p>
              {demoSections.map((section) => (
                <CollapsibleSection
                  key={section.id}
                  section={section}
                  isOpen={openDomain === section.id}
                  isActive={activeDomain === section.id}
                  onToggle={() => toggleDomain(section.id)}
                >
                  <DemoItems items={section.items} onNavigate={onMobileClose} />
                </CollapsibleSection>
              ))}
            </nav>
          )}
        </div>
        {/* Release label: low-emphasis footer text, not a navigation item. */}
        <p className="zrv-sidebar-version" title="Application version">{appConfig.displayVersion}</p>
      </aside>
    </>
  )
}
