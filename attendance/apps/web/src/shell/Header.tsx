// Top bar. Markup and classes mirror client/src/components/layout/Header.jsx (icon buttons,
// theme toggle, profile dropdown) so the Orvexa topbar CSS renders it identically.
import { useEffect, useRef, useState } from 'react';
import { OrvexaIcon } from '../components/OrvexaIcon';
import { useMe, useSignOut } from '../app/session';
import type { SidebarMode, Theme } from '../lib/useLayoutPreferences';
import { zamilHomeUrl } from '../lib/zamil-login';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';

function Avatar({ name, className }: { name: string; className: string }) {
  return (
    <span className={`zrv-profile-avatar ${className}`} aria-hidden="true">
      <span className="zrv-profile-avatar-initials">{initialsOf(name)}</span>
    </span>
  );
}

export function Header({
  mobileOpen,
  onMobileOpen,
  sidebarMode,
  setSidebarMode,
  theme,
  setTheme,
}: {
  mobileOpen: boolean;
  onMobileOpen: () => void;
  sidebarMode: SidebarMode;
  setSidebarMode: (mode: SidebarMode) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  const me = useMe();
  const { signOut, pending } = useSignOut();
  const [profileOpen, setProfileOpen] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const roleLabel =
    [me.jobTitle, me.department].filter(Boolean).join(' · ') || 'Signed-in employee';

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (region.current && !region.current.contains(event.target as Node)) setProfileOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && profileOpen) {
        setProfileOpen(false);
        document.getElementById('profile-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [profileOpen]);

  return (
    <header
      className="sticky top-0 z-30 border-b px-3 backdrop-blur-2xl sm:px-5 lg:px-6"
      style={{
        borderColor: 'var(--line)',
        background: 'color-mix(in srgb,var(--bg) 82%,transparent)',
      }}
    >
      <div className="flex h-[72px] items-center gap-2">
        <button
          type="button"
          id="mobile-menu"
          className="icon-button lg:hidden"
          aria-label="Open navigation"
          aria-controls="sidebar"
          aria-expanded={mobileOpen}
          onClick={onMobileOpen}
        >
          <OrvexaIcon name="menu" className="size-[18px]" />
        </button>
        <button
          type="button"
          id="sidebar-toggle"
          className="icon-button hidden lg:inline-flex"
          aria-label={sidebarMode === 'full' ? 'Use icon sidebar' : 'Use full sidebar'}
          title={sidebarMode === 'full' ? 'Use icon sidebar' : 'Use full sidebar'}
          onClick={() => setSidebarMode(sidebarMode === 'full' ? 'icon' : 'full')}
        >
          <OrvexaIcon
            name={sidebarMode === 'full' ? 'panel-left-close' : 'panel-left-open'}
            className="size-[18px]"
          />
        </button>
        <a
          href={zamilHomeUrl()}
          className="ml-0 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 text-left transition hover:-translate-y-0.5 md:max-w-lg"
          style={{
            borderColor: 'var(--line)',
            background: 'color-mix(in srgb,var(--surface-solid) 76%,transparent)',
            color: 'var(--muted)',
          }}
        >
          <OrvexaIcon name="arrow-left" className="size-4 shrink-0" />
          <span className="truncate text-[13px]">Back to Zamil Digitalization</span>
        </a>
        <div className="ml-auto flex items-center gap-1.5 topbar-tools" ref={region}>
          <button
            id="theme-toggle"
            type="button"
            className="icon-button"
            aria-label="Toggle light or dark mode"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <OrvexaIcon name={theme === 'dark' ? 'sun' : 'moon'} className="size-[18px]" />
          </button>
          <div
            className={`dropdown relative profile-dropdown ${profileOpen ? 'is-open' : ''}`.trim()}
            data-orvexa-dropdown
          >
            <button
              id="profile-trigger"
              className="dropdown-trigger header-profile-trigger"
              type="button"
              aria-expanded={profileOpen}
              aria-haspopup="true"
              aria-controls="profile-panel"
              aria-label="Profile menu"
              onClick={() => setProfileOpen((open) => !open)}
            >
              <Avatar name={me.fullName} className="header-profile-avatar" />
              <span className="header-profile-copy">
                <b>{me.fullName}</b>
                <small>{roleLabel}</small>
              </span>
            </button>
            <div
              id="profile-panel"
              className="dropdown-panel profile-panel right-0 top-[calc(100%+10px)]"
              aria-label="Profile menu"
            >
              <div className="profile-panel-head">
                <Avatar name={me.fullName} className="profile-panel-avatar" />
                <span>
                  <b>{me.fullName}</b>
                  <small>{me.email ?? ''}</small>
                </span>
              </div>
              <div className="profile-workspace">
                <span>
                  <b>Employee {me.employeeNumber}</b>
                  {me.department && <small>{me.department}</small>}
                </span>
              </div>
              <div className="profile-panel-footer">
                <button
                  type="button"
                  className="topbar-profile-link is-danger w-full"
                  onClick={() => void signOut()}
                  disabled={pending}
                >
                  <span>
                    <OrvexaIcon name="log-out" />
                  </span>
                  <b>{pending ? 'Signing out…' : 'Sign out'}</b>
                  <OrvexaIcon name="arrow-right" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
