// Primary navigation. Markup and classes mirror client/src/components/layout/Sidebar.jsx
// (sidebar-domain sections, hover-expand in icon mode, mobile drawer) so the Orvexa sidebar CSS
// renders it identically.
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { OrvexaIcon } from '../components/OrvexaIcon';
import { BUILT_PAGES, NAVIGATION, sectionOf, type NavSection } from '../app/navigation';

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;

function Section({
  section,
  open,
  active,
  onToggle,
  onNavigate,
}: {
  section: NavSection;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    <section
      className={`sidebar-domain ${active ? 'is-active' : ''} ${open ? 'is-open' : ''}`.trim()}
      data-sidebar-domain={section.id}
    >
      <button
        className="sidebar-domain-toggle"
        type="button"
        aria-label={section.label}
        aria-expanded={open}
        aria-controls={`sidebar-panel-${section.id}`}
        onClick={onToggle}
      >
        <span className="sidebar-domain-icon">
          <OrvexaIcon name={section.icon} />
        </span>
        <span className="sidebar-domain-label">{section.label}</span>
        <OrvexaIcon name="chevron-down" className="sidebar-domain-chevron" />
      </button>
      <div id={`sidebar-panel-${section.id}`} className="sidebar-domain-panel" hidden={!open}>
        {section.items.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end
            className={({ isActive }) => `sidebar-domain-link ${isActive ? 'active' : ''}`.trim()}
            aria-label={BUILT_PAGES.has(item.id) ? item.label : `${item.label} (planned)`}
            title={
              BUILT_PAGES.has(item.id)
                ? item.label
                : `${item.label} · planned for phase ${item.phase}`
            }
            onClick={onNavigate}
          >
            <OrvexaIcon name={item.icon} />
            <span className="sidebar-domain-link-label">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </section>
  );
}

export function Sidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const { pathname } = useLocation();
  const activeSection = sectionOf(pathname)?.id;
  const [openSection, setOpenSection] = useState<string | undefined>(activeSection ?? 'main');
  const [hoverOpen, setHoverOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const hoverTimer = useRef<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // The backdrop is decorative and pointer-only; keyboard users close the drawer with its
  // close button or Escape.
  useEffect(() => {
    const backdrop = backdropRef.current;
    backdrop?.addEventListener('click', onMobileClose);
    return () => backdrop?.removeEventListener('click', onMobileClose);
  }, [onMobileClose]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (activeSection) setOpenSection(activeSection);
  }, [activeSection]);

  const sections = NAVIGATION;

  const navigate = () => {
    setHoverOpen(false);
    onMobileClose();
  };

  // Mobile drawer: Escape closes it and Tab stays inside while it is open.
  useEffect(() => {
    const aside = asideRef.current;
    if (!aside || !isMobile || !mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onMobileClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...aside.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ].filter((node) => node.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    aside.addEventListener('keydown', onKeyDown);
    return () => aside.removeEventListener('keydown', onKeyDown);
  }, [isMobile, mobileOpen, onMobileClose]);

  return (
    <>
      <div
        ref={backdropRef}
        id="mobile-backdrop"
        className={`fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden ${mobileOpen ? '' : 'hidden'}`}
        aria-hidden="true"
      />
      <aside
        ref={asideRef}
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r transition-[width,transform] duration-300 lg:translate-x-0 ${
          mobileOpen ? 'mobile-open' : ''
        }${hoverOpen ? ' is-hover-open' : ''}`}
        aria-label="Primary navigation"
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse') return;
          if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
          setHoverOpen(true);
        }}
        onPointerLeave={(event) => {
          if (isMobile || event.pointerType !== 'mouse') return;
          hoverTimer.current = window.setTimeout(() => setHoverOpen(false), 180);
        }}
        aria-hidden={isMobile && !mobileOpen ? true : undefined}
        role={isMobile && mobileOpen ? 'dialog' : undefined}
        aria-modal={isMobile && mobileOpen ? true : undefined}
        inert={isMobile && !mobileOpen}
        style={{
          background: 'color-mix(in srgb,var(--surface-solid) 95%,transparent)',
          borderColor: 'var(--line)',
          backdropFilter: 'blur(24px)',
        }}
      >
        <div
          className="flex h-[72px] shrink-0 items-center justify-between border-b px-5"
          style={{ borderColor: 'var(--line)' }}
        >
          <NavLink
            id="sidebar-brand"
            to="/"
            className="flex min-w-0 items-center gap-3"
            aria-label="Attendance System home"
            onClick={navigate}
          >
            <span className="brand-mark">
              <OrvexaIcon name="calendar-clock" className="size-4" />
            </span>
            <span id="sidebar-brand-copy" className="min-w-0">
              <span className="font-display block text-[18px] font-bold tracking-[-0.045em]">
                Attendance
              </span>
              <span
                className="block truncate text-[12px] font-bold uppercase tracking-[0.16em]"
                style={{ color: 'var(--muted)' }}
              >
                Zamil Digitalization
              </span>
            </span>
          </NavLink>
          <button
            type="button"
            id="mobile-close"
            className="icon-button lg:hidden"
            aria-label="Close navigation"
            onClick={onMobileClose}
          >
            <OrvexaIcon name="x" className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3">
          <nav id="primary-navigation" aria-label="Attendance pages">
            {sections.map((section) => (
              <Section
                key={section.id}
                section={section}
                open={openSection === section.id}
                active={activeSection === section.id}
                onToggle={() =>
                  setOpenSection((current) => (current === section.id ? undefined : section.id))
                }
                onNavigate={navigate}
              />
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
