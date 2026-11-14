
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { NavLink, useLocation } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import ExternalNavigationLink from '@/components/navigation/ExternalNavigationLink.jsx'
import { SidebarFlyout, SidebarSubgroupButton } from './SidebarFlyout.jsx'
import { appConfig } from '@/config/appConfig.js'
import { authorizedNavigation, findAppRoute } from '@/config/appNavigation.js'
import { templateDemosAvailable } from '@/config/authRouting.js'
import { orvexaNavigation } from '@/config/orvexaNavigation.js'
import { getOrvexaRoute, getOrvexaSection } from '@/config/orvexaRoutes.js'
import useAuth from '@/features/auth/useAuth.js'
import usePermissions from '@/features/access/usePermissions.js'
import ContentSkeleton from '@/components/feedback/ContentSkeleton.jsx'
import useNavigationReveal from '@/components/navigation/useNavigationReveal.js'

// -----------------------------------------------------
// Existing internal navigation link
// -----------------------------------------------------
function SidebarLink({
  to,
  icon,
  label,
  nested = false,
  end = true,
  onNavigate,
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `sidebar-domain-link ${nested ? 'is-nested' : ''} ${isActive ? 'active' : ''}`.trim()
      }
      onClick={onNavigate}
    >
      <OrvexaIcon name={icon || 'circle'} />
      <span className="sidebar-domain-link-label">{label}</span>
    </NavLink>
  )
}

// -----------------------------------------------------
// Existing development-preview navigation
// -----------------------------------------------------
function DemoItems({ items = [], onNavigate }) {
  return items.map((item) =>
    item.children?.length ? (
      <div className="sidebar-subgroup" key={item.id}>
        <div className="sidebar-subgroup-label">
          <OrvexaIcon name={item.icon || 'folder-tree'} />
          <span>{item.label}</span>
        </div>

        <div className="sidebar-subgroup-links">
          {item.children.map(
            (child) =>
              getOrvexaRoute(child) && (
                <SidebarLink
                  key={child.id}
                  to={getOrvexaRoute(child)}
                  icon={child.icon}
                  label={child.label}
                  nested
                  onNavigate={onNavigate}
                />
              ),
          )}
        </div>
      </div>
    ) : (
      getOrvexaRoute(item) && (
        <SidebarLink
          key={item.id}
          to={getOrvexaRoute(item)}
          icon={item.icon}
          label={item.label}
          onNavigate={onNavigate}
        />
      )
    ),
  )
}

// -----------------------------------------------------
// Existing standalone links
// -----------------------------------------------------
function StandaloneLink({ item, onNavigate }) {
  const content = (
    <>
      <span className="sidebar-domain-icon">
        <OrvexaIcon name={item.icon || 'circle'} />
      </span>

      <span className="sidebar-domain-label">
        {item.label}
      </span>

      <span
        className="sidebar-domain-chevron sidebar-domain-placeholder"
        aria-hidden="true"
      />
    </>
  )

  if (item.type === 'external') {
    return (
      <ExternalNavigationLink
        href={item.href}
        className="sidebar-domain-toggle sidebar-domain-standalone-link"
        onClick={onNavigate}
      >
        {content}
      </ExternalNavigationLink>
    )
  }

  return (
    <NavLink
      to={item.path}
      end
      className="sidebar-domain-toggle sidebar-domain-standalone-link"
      onClick={onNavigate}
    >
      {content}
    </NavLink>
  )
}

// -----------------------------------------------------
// Existing external navigation links
// -----------------------------------------------------
function ExternalSidebarLink({ item, onNavigate }) {
  return (
    <ExternalNavigationLink
      href={item.href}
      className="zrv-sidebar-subgroup zrv-sidebar-subgroup--link"
      onClick={onNavigate}
    >
      <span className="zrv-sidebar-subgroup__icon">
        <OrvexaIcon name={item.icon || 'circle'} />
      </span>

      <span className="zrv-sidebar-subgroup__label">
        <b>{item.label}</b>
      </span>

      <OrvexaIcon
        name="chevron-right"
        className="zrv-sidebar-subgroup__arrow"
      />
    </ExternalNavigationLink>
  )
}

// -----------------------------------------------------
// Existing collapsible navigation section
// -----------------------------------------------------
function CollapsibleSection({
  section,
  isOpen,
  panelOpen = isOpen,
  isActive,
  onToggle,
  children,
}) {
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
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse' && !isOpen && ['security', 'account'].includes(section.id)) {
            onToggle(event.currentTarget)
          }
        }}
        onClick={(event) => {
          if (event.nativeEvent.pointerType === 'mouse' && isOpen && ['security', 'account'].includes(section.id)) return
          onToggle(event.currentTarget)
        }}
      >
        <span className="sidebar-domain-icon">
          <OrvexaIcon name={section.icon || 'circle'} />
        </span>

        <span className="sidebar-domain-label">
          {section.label}
        </span>

        <OrvexaIcon
          name="chevron-down"
          className="sidebar-domain-chevron"
        />
      </button>

      <div
        id={`sidebar-panel-${section.id}`}
        className="sidebar-domain-panel"
        hidden={!panelOpen}
      >
        {children}
      </div>
    </section>
  )
}

// -----------------------------------------------------
// Existing authorized section items
// -----------------------------------------------------
function SectionItems({
  section,
  currentRoute,
  flyout,
  onFlyout,
  onNavigate,
}) {
  const direct = section.items.filter(
    (item) => !item.subgroup,
  )

  const groups = (section.subgroups ?? [])
    .map((subgroup) => ({
      subgroup,
      items: section.items.filter(
        (item) => item.subgroup === subgroup.id,
      ),
    }))
    .filter((group) => group.items.length)

  return (
    <>
      {direct.map((item) =>
        item.type === 'external' ? (
          <ExternalSidebarLink
            key={item.id}
            item={item}
            onNavigate={onNavigate}
          />
        ) : (
          <SidebarLink
            key={item.id}
            to={item.path}
            icon={item.icon}
            label={item.label}
            end={false}
            onNavigate={onNavigate}
          />
        ),
      )}

      {groups.map(({ subgroup, items }) => (
        <SidebarSubgroupButton
          key={subgroup.id}
          subgroup={subgroup}
          items={items}
          current={
            currentRoute?.subgroup === subgroup.id
              ? items.find(
                  (item) => item.id === currentRoute.id,
                ) ?? currentRoute
              : null
          }
          open={flyout?.subgroupId === subgroup.id}
          onToggle={(anchor) =>
            onFlyout(
              flyout?.subgroupId === subgroup.id
                ? null
                : {
                    subgroupId: subgroup.id,
                    anchor,
                  },
            )
          }
        />
      ))}
    </>
  )
}

// -----------------------------------------------------
// Responsive breakpoint helper
// -----------------------------------------------------
function isMobileViewport() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 1023px)').matches
  )
}

// -----------------------------------------------------
// Main Sidebar
// -----------------------------------------------------
export default function Sidebar({
  mobileOpen,
  onMobileClose,
}) {
  const [isMobile, setIsMobile] = useState(
    isMobileViewport,
  )

  // Update mobile state only when the media query changes.
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return undefined
    }

    const media = window.matchMedia(
      '(max-width: 1023px)',
    )

    const onChange = (event) => {
      setIsMobile(event.matches)
    }

    media.addEventListener('change', onChange)

    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [])

  const { status } = useAuth()
  const access = usePermissions()
  const { pathname } = useLocation()

  // Shared dashboard-to-sidebar navigation.
  const {
    revealRequest,
    clearNavigationReveal,
  } = useNavigationReveal()

  // Store the last completed request object, not just a serial
  // number. This also supports new requests after clearing.
  const processedReveal = useRef(null)

  // Authorized navigation remains the source of truth.
  const sections = authorizedNavigation(access)

  const demoSections = templateDemosAvailable(status) ? orvexaNavigation.filter(
        (section) => section.items?.length,
      )
    : []

  const currentRoute = findAppRoute(pathname)

  const activeDomain =
    currentRoute?.section ||
    (demoSections.length
      ? getOrvexaSection(pathname)
      : null)

  // Existing section state.
  const [selection, setSelection] = useState({
    pathname: '',
    domain: null,
  })

  const openDomain =
    selection.pathname === pathname
      ? selection.domain
      : activeDomain

  // Existing flyout state.
  const [flyoutState, setFlyoutState] = useState(null)
  const flyoutAnchor = useRef(null)

  const flyout =
    flyoutState?.pathname === pathname &&
    (!isMobile || mobileOpen)
      ? flyoutState
      : null

  const flyoutSection =
    flyout
      ? sections.find((section) =>
          section.subgroups?.some(
            (item) => item.id === flyout.subgroupId,
          ),
        )
      : null

  const flyoutItems =
    flyoutSection?.items.filter(
      (item) => item.subgroup === flyout.subgroupId,
    ) ?? []

  // ---------------------------------------------------
  // Existing flyout controls
  // ---------------------------------------------------
  const openFlyout = (value) => {
    clearNavigationReveal()

    flyoutAnchor.current = value?.anchor ?? null

    setFlyoutState(
      value
        ? {
            ...value,
            pathname,
          }
        : null,
    )
  }

  const closeFlyout = useCallback(
    (refocus) => {
      const anchor = flyoutAnchor.current

      setFlyoutState(null)
      clearNavigationReveal()

      if (refocus && anchor) {
        requestAnimationFrame(() => {
          if (anchor.isConnected) {
            anchor.focus()
          }
        })
      }
    },
    [clearNavigationReveal],
  )

  const navigate = () => {
    setFlyoutState(null)
    clearNavigationReveal()
    onMobileClose?.()
  }

  const toggleDomain = (sectionId) => {
    clearNavigationReveal()

    setSelection({
      pathname,
      domain:
        openDomain === sectionId
          ? ''
          : sectionId,
    })

    setFlyoutState(null)
  }

  // ---------------------------------------------------
  // Dashboard navigation reveal effect
  // ---------------------------------------------------
  //
  // 1. Validate the route against authorized navigation.
  // 2. Expand the corresponding registered section.
  // 3. Find the registered subgroup button.
  // 4. Open the existing SidebarFlyout.
  // 5. SidebarFlyout highlights revealedRouteId.
  //
  // No hardcoded HR paths, duplicate form lists, or
  // changes to active route behavior.
  useEffect(() => {
    if (
      !revealRequest ||
      processedReveal.current === revealRequest
    ) {
      return undefined
    }

    const { routeId } = revealRequest

    const targetSection = sections.find((section) =>
      section.items.some(
        (item) =>
          item.id === routeId &&
          item.type !== 'external' &&
          item.path &&
          item.nav !== false &&
          item.implemented !== false,
      ),
    )

    const target = targetSection?.items.find(
      (item) => item.id === routeId,
    )

    // Unauthorized or unavailable navigation target.
    if (!target) {
      if (access.status === 'loading') {
        return undefined
      }

      // Schedule clearing outside the synchronous effect.
      const clearFrame = window.requestAnimationFrame(() => {
        processedReveal.current = revealRequest
        clearNavigationReveal()
      })

      return () => window.cancelAnimationFrame(clearFrame)
    }

    // AdminLayout opens the existing mobile drawer.
    if (isMobile && !mobileOpen) {
      return undefined
    }

    let openFrame = null

    // Schedule React state changes outside the effect.
    const expandFrame = window.requestAnimationFrame(() => {
      setSelection({
        pathname,
        domain: targetSection.id,
      })

      setFlyoutState(null)

      // Wait for React to render the expanded section.
      openFrame = window.requestAnimationFrame(() => {
        const sidebar = document.getElementById(
          'sidebar',
        )

        if (!sidebar) return

        const sectionNode = Array.from(
          sidebar.querySelectorAll(
            '[data-sidebar-domain]',
          ),
        ).find(
          (node) =>
            node.getAttribute('data-sidebar-domain') ===
            targetSection.id,
        )

        if (!sectionNode) {
          processedReveal.current = revealRequest
          clearNavigationReveal()
          return
        }

        // Registered direct-section link.
        if (!target.subgroup) {
          const link = Array.from(
            sectionNode.querySelectorAll('a[href]'),
          ).find(
            (node) =>
              node.getAttribute('href') === target.path,
          )

          link?.scrollIntoView?.({
            block: 'nearest',
            behavior: 'auto',
          })

          link?.focus?.({
            preventScroll: true,
          })

          processedReveal.current = revealRequest
          clearNavigationReveal()
          return
        }

        // Locate the existing subgroup button by its
        // registered flyout ID.
        const anchor = Array.from(
          sectionNode.querySelectorAll(
            '.zrv-sidebar-subgroup[aria-controls]',
          ),
        ).find(
          (node) =>
            node.getAttribute('aria-controls') ===
            `sidebar-flyout-${target.subgroup}`,
        )

        if (!anchor) {
          processedReveal.current = revealRequest
          clearNavigationReveal()
          return
        }

        anchor.scrollIntoView?.({
          block: 'nearest',
          behavior: 'auto',
        })

        // Open the existing flyout.
        flyoutAnchor.current = anchor
        processedReveal.current = revealRequest

        setFlyoutState({
          pathname,
          subgroupId: target.subgroup,
          anchor,
        })
      })
    })

    // Cancel pending frames if the request, route, or
    // authorization changes before reveal completes.
    return () => {
      window.cancelAnimationFrame(expandFrame)

      if (openFrame !== null) {
        window.cancelAnimationFrame(openFrame)
      }
    }
  }, [
    revealRequest,
    pathname,
    sections,
    access.status,
    isMobile,
    mobileOpen,
    clearNavigationReveal,
  ])

  // ---------------------------------------------------
  // Sidebar UI
  // ---------------------------------------------------
  return (
    <>
      {/* Existing mobile backdrop */}
      <div
        id="mobile-backdrop"
        className={`fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden ${
          mobileOpen ? '' : 'hidden'
        }`}
        aria-hidden="true"
        onClick={() => {
          clearNavigationReveal()
          onMobileClose?.()
        }}
      />

      {/* Existing sidebar */}
      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r transition-[width,transform] duration-300 lg:translate-x-0 ${
          mobileOpen ? 'mobile-open' : ''
        }${flyoutItems.length ? ' has-flyout' : ''}`}
        aria-label="Primary navigation"
        onPointerLeave={(event) => {
          if (isMobile || event.pointerType !== 'mouse') return

          closeFlyout(false)
          setSelection({ pathname, domain: '' })

          const focused = document.activeElement
          if (focused && event.currentTarget.contains(focused)) {
            focused.blur()
          }
        }}
        aria-hidden={isMobile && !mobileOpen}
        role={
          isMobile && mobileOpen
            ? 'dialog'
            : undefined
        }
        aria-modal={
          isMobile && mobileOpen
            ? 'true'
            : undefined
        }
        inert={isMobile && !mobileOpen}
        style={{
          background:
            'color-mix(in srgb,var(--surface-solid) 95%,transparent)',
          borderColor: 'var(--line)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Existing brand and mobile close button */}
        <div
          className="flex h-[72px] shrink-0 items-center justify-between border-b px-5"
          style={{
            borderColor: 'var(--line)',
          }}
        >
          <NavLink
            id="sidebar-brand"
            to="/dashboard"
            className="flex min-w-0 items-center gap-3"
            aria-label={`${appConfig.name} home`}
            onClick={navigate}
          >
            <span className="brand-mark">
              <OrvexaIcon
                name="building-2"
                className="size-4"
              />
            </span>

            <span
              id="sidebar-brand-copy"
              className="min-w-0"
            >
              <span className="font-display block text-[18px] font-bold tracking-[-0.045em]">
                {appConfig.name}
              </span>

              <span
                className="block truncate text-[12px] font-bold uppercase tracking-[0.16em]"
                style={{
                  color: 'var(--muted)',
                }}
              >
                Enterprise workspace
              </span>
            </span>
          </NavLink>

          <button
            type="button"
            id="mobile-close"
            className="icon-button lg:hidden"
            aria-label="Close navigation"
            onClick={() => {
              clearNavigationReveal()
              onMobileClose?.()
            }}
          >
            <OrvexaIcon
              name="x"
              className="size-4"
            />
          </button>
        </div>

        {/* Existing authorized navigation */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3">
          <nav
            id="primary-navigation"
            aria-label={`${appConfig.name} pages`}
          >
            {sections.map((section) =>
              section.standalone ? (
                section.items.map((item) => (
                  <section
                    key={item.id}
                    data-sidebar-domain={item.id}
                    className={`sidebar-domain sidebar-domain-standalone ${
                      pathname === item.path
                        ? 'is-active'
                        : ''
                    }`.trim()}
                  >
                    <StandaloneLink
                      item={item}
                      onNavigate={navigate}
                    />
                  </section>
                ))
              ) : section.id === 'human-resources' ? (
                <CollapsibleSection
                  key={section.id}
                  section={section}
                  isOpen={openDomain === section.id}
                  panelOpen={openDomain === section.id}
                  isActive={activeDomain === section.id}
                  onToggle={() => toggleDomain(section.id)}
                >
                  <SectionItems
                    section={section}
                    currentRoute={currentRoute}
                    flyout={flyout}
                    onFlyout={openFlyout}
                    onNavigate={navigate}
                  />
                </CollapsibleSection>
              ) : (
                <CollapsibleSection
                  key={section.id}
                  section={section}
                  isOpen={
                    section.id === 'security'
                      ? flyout?.subgroupId ===
                        'security-admin'
                      : section.id === 'account'
                        ? flyout?.subgroupId ===
                          'account-settings'
                        : openDomain === section.id
                  }
                  panelOpen={
                    !['security', 'account'].includes(
                      section.id,
                    ) &&
                    openDomain === section.id
                  }
                  isActive={
                    activeDomain === section.id
                  }
                  onToggle={(anchor) => {
                    if (
                      section.id === 'security' ||
                      section.id === 'account'
                    ) {
                      const subgroupId =
                        section.id === 'security'
                          ? 'security-admin'
                          : 'account-settings'

                      openFlyout(
                        flyout?.subgroupId === subgroupId
                          ? null
                          : {
                              subgroupId,
                              anchor,
                            },
                      )

                      return
                    }

                    toggleDomain(section.id)
                  }}
                >
                  <SectionItems
                    section={section}
                    currentRoute={currentRoute}
                    flyout={flyout}
                    onFlyout={openFlyout}
                    onNavigate={navigate}
                  />
                </CollapsibleSection>
              ),
            )}

            {/* Existing permission loading state */}
            {access.status === 'loading' && (
              <div className="zrv-sidebar-access">
                <ContentSkeleton
                  label="Loading navigation"
                />
              </div>
            )}

            {/* Existing permission error state */}
            {access.status === 'error' && (
              <div
                className="zrv-sidebar-access"
                role="alert"
              >
                <span>
                  Your access could not be loaded.
                </span>

                <button
                  type="button"
                  onClick={access.reload}
                >
                  Retry
                </button>
              </div>
            )}
          </nav>

          {/* Existing development-preview navigation */}
          {demoSections.length > 0 && (
            <nav
              aria-label="Template demos (development preview only)"
              className="zrv-sidebar-demos"
            >
              <p className="zrv-sidebar-heading">
                Template demos · preview only
              </p>

              {demoSections.map((section) => (
                <CollapsibleSection
                  key={section.id}
                  section={section}
                  isOpen={
                    openDomain === section.id
                  }
                  isActive={
                    activeDomain === section.id
                  }
                  onToggle={() =>
                    toggleDomain(section.id)
                  }
                >
                  <DemoItems
                    items={section.items}
                    onNavigate={navigate}
                  />
                </CollapsibleSection>
              ))}
            </nav>
          )}
        </div>

        {/* Existing flyout + new highlighted route */}
        {flyoutItems.length > 0 && flyout && (
          <SidebarFlyout
            key={flyout.subgroupId}
            subgroup={flyoutSection.subgroups.find(
              (item) =>
                item.id === flyout.subgroupId,
            )}
            items={flyoutItems}
            anchor={flyout.anchor}
            mobile={isMobile}
            onClose={closeFlyout}
            onNavigate={navigate}
            revealedRouteId={
              flyoutItems.some(
                (item) =>
                  item.id === revealRequest?.routeId,
              )
                ? revealRequest.routeId
                : null
            }
          />
        )}

        {/* Existing application version */}
        <p className="zrv-sidebar-version" title="Application version">{appConfig.displayVersion}</p>
      </aside>
    </>
  )
}
