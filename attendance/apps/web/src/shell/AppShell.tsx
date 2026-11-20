// Application layout (mirrors client/src/layouts/AdminLayout.jsx): skip link, sidebar, header,
// lazily loaded route content.
import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ContentSkeleton } from '../components/Feedback';
import { useLayoutPreferences } from '../lib/useLayoutPreferences';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const location = useLocation();
  const preferences = useLayoutPreferences();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.dataset.appShell = 'true';
    return () => {
      delete document.body.dataset.appShell;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('mobile-sidebar-open', mobileOpen);
    document.body.classList.toggle('overflow-hidden', mobileOpen);
    if (mobileOpen) document.getElementById('mobile-close')?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    const onResize = () => window.innerWidth >= 1024 && setMobileOpen(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const closeMobile = () => {
    setMobileOpen(false);
    document.getElementById('mobile-menu')?.focus();
  };

  return (
    <>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black transition focus:translate-y-0"
      >
        Skip to content
      </a>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />
      <div id="app-main" className="min-h-screen transition-[padding] duration-300 lg:pl-72">
        <Header
          mobileOpen={mobileOpen}
          onMobileOpen={() => setMobileOpen(true)}
          sidebarMode={preferences.sidebarMode}
          setSidebarMode={preferences.setSidebarMode}
          theme={preferences.theme}
          setTheme={preferences.setTheme}
        />
        <main id="main-content" className="px-3 py-5 sm:px-5 lg:px-6" tabIndex={-1}>
          <Suspense key={location.pathname} fallback={<ContentSkeleton label="Loading page" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </>
  );
}
