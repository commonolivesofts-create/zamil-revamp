// Theme and sidebar mode, stored under the same keys as the main Zamil client
// (client/src/hooks/useOrvexaLayout.js) and applied to <html> the same way.
// public/theme-init.js applies all saved preferences before first paint.
import { useEffect, useState } from 'react';

const KEYS = { theme: 'orvexa-theme-v16', mode: 'orvexa-sidebar-mode' } as const;

export type Theme = 'light' | 'dark';
export type SidebarMode = 'icon' | 'full';

function read<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private browsing): the preference still works for this session.
  }
}

export function useLayoutPreferences() {
  const [theme, setTheme] = useState<Theme>(() => read(KEYS.theme, 'light', ['light', 'dark']));
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() =>
    read(KEYS.mode, 'icon', ['icon', 'full']),
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.sidebarMode = sidebarMode;
    persist(KEYS.theme, theme);
    persist(KEYS.mode, sidebarMode);
  }, [theme, sidebarMode]);

  return { theme, setTheme, sidebarMode, setSidebarMode };
}
