// Theme preference (UI-UX §2: follows the OS, user can override). One store for the whole app,
// so the user menu, command palette and toggle stay in sync. index.html mirrors resolveTheme().
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'eh-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

function applyTheme(pref: ThemePreference): void {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

let current: ThemePreference = readPreference();
const listeners = new Set<() => void>();

window.matchMedia?.(DARK_QUERY).addEventListener?.('change', () => {
  if (current === 'system') applyTheme('system');
});

export function setThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Private mode / blocked storage: the choice still applies for this visit.
  }
  current = pref;
  applyTheme(pref);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, () => current);
  return { preference, setPreference: setThemePreference };
}
