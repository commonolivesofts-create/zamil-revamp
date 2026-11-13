
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  Link,
  Outlet,
  useLocation,
} from 'react-router'

import Sidebar from '@/components/layout/Sidebar.jsx'
import Header from '@/components/layout/Header.jsx'
import LayoutCustomizer from '@/components/layout/LayoutCustomizer.jsx'
import CommandPalette from '@/components/layout/CommandPalette.jsx'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'

import useOrvexaLayout from '@/hooks/useOrvexaLayout.js'
import useAuth from '@/features/auth/useAuth.js'
import RouteLoading from '@/components/feedback/RouteLoading.jsx'

import {
  NavigationRevealProvider,
} from '@/components/navigation/NavigationRevealContext.jsx'

import '@/styles/workspace.css'

export default function AdminLayout() {
  const location = useLocation()

  const { status, password } = useAuth()

  const preferences = useOrvexaLayout()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [notice, setNotice] = useState(null)

  const noticeTimer = useRef(null)
  const mobileWasOpen = useRef(false)

  // -------------------------------------------------------
  // Dashboard HR Shortcut -> Sidebar Reveal
  // -------------------------------------------------------
  //
  // The dashboard sends a registered navigation route ID.
  // This callback expands the existing navigation interface.
  //
  // The Sidebar component is responsible for:
  // - resolving the authorized navigation item
  // - expanding its parent section
  // - opening its subgroup flyout
  // - highlighting the requested form
  //
  // No routing, RBAC, or business logic is changed here.
  const handleNavigationReveal = useCallback(() => {
    if (
      typeof window === 'undefined'
    ) {
      return
    }

    const mobile =
      window.matchMedia('(max-width: 1023px)').matches

    if (mobile) {
      // Reuse the existing mobile sidebar drawer.
      setMobileOpen(true)
    }
  }, [])

  // -------------------------------------------------------
  // Existing unavailable-action notification
  // -------------------------------------------------------
  const unavailable = (label) => {
    if (noticeTimer.current) {
      window.clearTimeout(noticeTimer.current)
    }

    setNotice(
      label.startsWith('Sign out failed')
        ? label
        : `${label} is not available.`,
    )

    noticeTimer.current = window.setTimeout(
      () => setNotice(null),
      4000,
    )

    setMobileOpen(false)
  }

  // -------------------------------------------------------
  // Existing application shell lifecycle
  // -------------------------------------------------------
  useEffect(() => {
    document.body.dataset.appShell = 'true'

    return () => {
      delete document.body.dataset.appShell

      if (noticeTimer.current) {
        window.clearTimeout(noticeTimer.current)
      }
    }
  }, [])

  // -------------------------------------------------------
  // Existing page metadata
  // -------------------------------------------------------
  useEffect(() => {
    document.body.dataset.activePage =
      location.pathname.split('/').pop()

    return () => {
      delete document.body.dataset.activePage
    }
  }, [location.pathname])

  // -------------------------------------------------------
  // Existing mobile sidebar focus management
  // -------------------------------------------------------
  useEffect(() => {
    if (mobileOpen) {
      mobileWasOpen.current = true

      document
        .getElementById('mobile-close')
        ?.focus()
    } else if (mobileWasOpen.current) {
      mobileWasOpen.current = false

      if (
        document.activeElement?.closest('#sidebar') ||
        document.activeElement === document.body
      ) {
        document
          .getElementById('mobile-menu')
          ?.focus()
      }
    }
  }, [mobileOpen])

  // -------------------------------------------------------
  // Existing body scroll locking
  // -------------------------------------------------------
  useEffect(() => {
    document.documentElement.classList.toggle(
      'mobile-sidebar-open',
      mobileOpen,
    )

    document.body.classList.toggle(
      'overflow-hidden',
      mobileOpen || settingsOpen || commandOpen,
    )

    return () => {
      document.documentElement.classList.remove(
        'mobile-sidebar-open',
      )

      document.body.classList.remove(
        'overflow-hidden',
      )
    }
  }, [
    mobileOpen,
    settingsOpen,
    commandOpen,
  ])

  // -------------------------------------------------------
  // Existing keyboard and responsive behavior
  // -------------------------------------------------------
  useEffect(() => {
    function onKeyDown(event) {
      const key = event.key.toLowerCase()

      // Ctrl/Cmd + K opens the authorized command palette.
      if (
        (event.ctrlKey || event.metaKey) &&
        key === 'k'
      ) {
        event.preventDefault()

        setCommandOpen((current) => !current)
        setSettingsOpen(false)

        return
      }

      // Preserve focus trapping in the mobile sidebar.
      if (
        event.key === 'Tab' &&
        mobileOpen &&
        window.innerWidth < 1024
      ) {
        const sidebar =
          document.getElementById('sidebar')

        const focusable = Array.from(
          sidebar?.querySelectorAll(
            'a[href],button:not([disabled])',
          ) || [],
        ).filter(
          (node) => node.getClientRects().length > 0,
        )

        if (focusable.length) {
          const first = focusable[0]
          const last = focusable[focusable.length - 1]

          if (
            event.shiftKey &&
            document.activeElement === first
          ) {
            event.preventDefault()
            last.focus()
          } else if (
            !event.shiftKey &&
            document.activeElement === last
          ) {
            event.preventDefault()
            first.focus()
          }
        }
      }

      // Preserve existing Escape key behavior.
      if (event.key === 'Escape') {
        if (commandOpen) {
          setCommandOpen(false)

          document
            .getElementById('command-trigger')
            ?.focus()
        } else if (settingsOpen) {
          setSettingsOpen(false)

          document
            .getElementById('layout-settings-trigger')
            ?.focus()
        } else if (mobileOpen) {
          setMobileOpen(false)

          document
            .getElementById('mobile-menu')
            ?.focus()
        }
      }
    }

    function onResize() {
      if (window.innerWidth >= 1024) {
        setMobileOpen(false)
      }
    }

    document.addEventListener(
      'keydown',
      onKeyDown,
    )

    window.addEventListener(
      'resize',
      onResize,
    )

    return () => {
      document.removeEventListener(
        'keydown',
        onKeyDown,
      )

      window.removeEventListener(
        'resize',
        onResize,
      )
    }
  }, [
    commandOpen,
    settingsOpen,
    mobileOpen,
  ])

  // -------------------------------------------------------
  // Application layout
  // -------------------------------------------------------
  return (
    <NavigationRevealProvider
      onReveal={handleNavigationReveal}
    >
      <>
        {/* Accessibility: skip to main content */}
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black transition focus:translate-y-0"
        >
          Skip to content
        </a>

        {/* Existing Sidebar */}
        <Sidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        {/* Existing main application area */}
        <div
          id="app-main"
          className="min-h-screen transition-[padding] duration-300 lg:pl-72"
        >
          <Header
            onMobileOpen={() => setMobileOpen(true)}
            mobileOpen={mobileOpen}
            sidebarMode={preferences.sidebarMode}
            setSidebarMode={preferences.setSidebarMode}
            theme={preferences.theme}
            setTheme={preferences.setTheme}
            onOpenSettings={() => {
              setSettingsOpen(true)
              setCommandOpen(false)
            }}
            onOpenCommand={() => {
              setCommandOpen(true)
              setSettingsOpen(false)
            }}
            onUnavailable={unavailable}
          />

          {/* Password expiry notification */}
          {status === 'authenticated' &&
            password?.expired &&
            location.pathname !==
              '/account/password' && (
              <div
                role="status"
                className="border-b px-4 py-2 text-center text-xs"
                style={{
                  borderColor: 'var(--line)',
                  background: 'var(--surface-2)',
                  color: 'var(--amber-text)',
                }}
              >
                Your password has expired.{' '}
                <Link
                  to="/account/password"
                  style={{
                    color: 'var(--primary-text)',
                    fontWeight: 700,
                  }}
                >
                  Change it now
                </Link>{' '}
                to keep signing in.
              </div>
            )}

          {/* Existing development preview notice */}
          {status === 'preview' && (
            <div
              role="status"
              className="border-b px-4 py-2 text-center text-xs"
              style={{
                borderColor: 'var(--line)',
                background: 'var(--surface-2)',
                color: 'var(--amber-text)',
              }}
            >
              Development preview — not authenticated.
              This mode is unavailable in production builds.
            </div>
          )}

          {/* Existing route content */}
          <main
            id="main-content"
            className="px-3 py-5 sm:px-5 lg:px-6"
            tabIndex={-1}
          >
            <Suspense
              key={location.pathname}
              fallback={<RouteLoading />}
            >
              <Outlet />
            </Suspense>
          </main>
        </div>

        {/* Existing command palette */}
        {commandOpen && (
          <CommandPalette
            open
            onClose={() => {
              setCommandOpen(false)

              document
                .getElementById('command-trigger')
                ?.focus()
            }}
          />
        )}

        {/* Existing layout customizer */}
        <LayoutCustomizer
          open={settingsOpen}
          onClose={() => {
            setSettingsOpen(false)

            document
              .getElementById(
                'layout-settings-trigger',
              )
              ?.focus()
          }}
          sidebarMode={preferences.sidebarMode}
          setSidebarMode={preferences.setSidebarMode}
          sidebarTone={preferences.sidebarTone}
          setSidebarTone={preferences.setSidebarTone}
          accentTheme={preferences.accentTheme}
          setAccentTheme={preferences.setAccentTheme}
          density={preferences.density}
          setDensity={preferences.setDensity}
          motion={preferences.motion}
          setMotion={preferences.setMotion}
        />

        {/* Existing notification area */}
        <div
          id="toast-region"
          className="pointer-events-none fixed bottom-4 right-4 z-[110] flex w-[min(340px,calc(100vw-24px))] flex-col gap-2"
          role="status"
          aria-live="polite"
        >
          {notice && (
            <div className="pointer-events-auto glass-panel flex items-center gap-3 rounded-2xl px-4 py-3">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background:
                    'color-mix(in srgb,var(--primary) 14%,transparent)',
                  color: 'var(--primary-text)',
                }}
              >
                <OrvexaIcon
                  name="info"
                  className="size-4"
                />
              </span>

              <span className="min-w-0 flex-1 text-xs font-bold">
                {notice}
              </span>

              <button
                type="button"
                className="icon-button !size-7"
                aria-label="Dismiss notification"
                onClick={() => setNotice(null)}
              >
                <OrvexaIcon
                  name="x"
                  className="size-3.5"
                />
              </button>
            </div>
          )}
        </div>
      </>
    </NavigationRevealProvider>
  )
}
