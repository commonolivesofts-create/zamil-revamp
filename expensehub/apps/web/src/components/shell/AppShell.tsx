// UI-UX §3 app shell: sidebar / rail + top bar + content; bottom tabs on mobile.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, ScrollRestoration } from 'react-router';
import { BottomTabs } from './BottomTabs';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const { t } = useTranslation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="eh-shell min-h-dvh bg-canvas text-ink md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-input focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        {t('app.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main
          id="main"
          tabIndex={-1}
          className="eh-main w-full min-w-0 flex-1 pb-28 pt-5 outline-none md:pb-16"
        >
          <Outlet />
        </main>
      </div>
      <BottomTabs />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ScrollRestoration />
    </div>
  );
}
