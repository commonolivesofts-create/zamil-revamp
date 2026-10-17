import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { orvexaNavigation } from '@/config/orvexaNavigation.js'
import { getOrvexaRoute, getOrvexaSection } from '@/config/orvexaRoutes.js'

function DemoLink({ item, nested = false, onNavigate }) {
  const to = getOrvexaRoute(item)
  if (!to) return null
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) => `sidebar-domain-link ${nested ? 'is-nested' : ''} ${isActive ? 'active' : ''}`.trim()}
      onClick={onNavigate}
    >
      <OrvexaIcon name={item.icon || 'circle'} />
      <span className="sidebar-domain-link-label">{item.label}</span>
    </NavLink>
  )
}

function SidebarItems({ items = [], onNavigate }) {
  return items.map((item) => item.children?.length ? (
    <div className="sidebar-subgroup" key={item.id}>
      <div className="sidebar-subgroup-label">
        <OrvexaIcon name={item.icon || 'folder-tree'} />
        <span>{item.label}</span>
      </div>
      <div className="sidebar-subgroup-links">
        {item.children.map((child) => (
          <DemoLink key={child.id} item={child} nested onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  ) : (
    <DemoLink key={item.id} item={item} onNavigate={onNavigate} />
  ))
}

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

  const { pathname } = useLocation()
  const activeDomain = getOrvexaSection(pathname)
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
          <NavLink id="sidebar-brand" to="/dashboard" className="flex min-w-0 items-center gap-3" aria-label="Orvexa home" onClick={onMobileClose}>
            <span className="brand-mark">
              <OrvexaIcon name="sparkles" className="size-4" />
              <span className="brand-live" />
            </span>
            <span id="sidebar-brand-copy" className="min-w-0">
              <span className="font-display block text-[18px] font-bold tracking-[-0.045em]">Orvexa</span>
              <span className="block truncate text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>Artificial Intelligence OS</span>
            </span>
          </NavLink>
          <button type="button" id="mobile-close" className="icon-button lg:hidden" aria-label="Close navigation" onClick={onMobileClose}>
            <OrvexaIcon name="x" className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3">
          <nav id="primary-navigation" aria-label="Orvexa pages">
            {orvexaNavigation.map((section) => {
              const standalone = Boolean(section.href)
              const isOpen = openDomain === section.id
              const isActive = activeDomain === section.id || (standalone && pathname === '/dashboard')
              return (
                <section
                  className={`sidebar-domain ${standalone ? 'sidebar-domain-standalone' : ''} ${isActive ? 'is-active' : ''} ${isOpen ? 'is-open' : ''}`.trim()}
                  data-sidebar-domain={section.id}
                  key={section.id}
                >
                  {standalone ? (
                    <NavLink
                      to="/dashboard"
                      end
                      className="sidebar-domain-toggle sidebar-domain-standalone-link"
                      onClick={onMobileClose}
                    >
                      <span className="sidebar-domain-icon"><OrvexaIcon name={section.icon || 'layout-dashboard'} /></span>
                      <span className="sidebar-domain-label">{section.label}</span>
                      <span className="sidebar-domain-chevron sidebar-domain-placeholder" aria-hidden="true" />
                    </NavLink>
                  ) : (
                    <>
                      <button
                        className="sidebar-domain-toggle"
                        type="button"
                        aria-label={section.label}
                        aria-expanded={isOpen}
                        aria-controls={`sidebar-panel-${section.id}`}
                        onClick={() => toggleDomain(section.id)}
                      >
                        <span className="sidebar-domain-icon"><OrvexaIcon name={section.icon || 'circle'} /></span>
                        <span className="sidebar-domain-label">{section.label}</span>
                        <OrvexaIcon name="chevron-down" className="sidebar-domain-chevron" />
                      </button>
                      <div id={`sidebar-panel-${section.id}`} className="sidebar-domain-panel" hidden={!isOpen}>
                        <SidebarItems items={section.items} onNavigate={onMobileClose} />
                      </div>
                    </>
                  )}
                </section>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
