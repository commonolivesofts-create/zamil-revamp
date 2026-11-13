import { useCallback, useEffect, useState } from 'react'

const KEYS = {
  theme: 'orvexa-theme-v16',
  mode: 'orvexa-sidebar-mode',
  tone: 'orvexa-sidebar-tone',
  density: 'orvexa-density-v16',
  motion: 'orvexa-motion-v1',
  accent: 'zamil-orvexa-accent-v1',
}

// The interface exists only in English. The template's language selector only
// changed the document language and direction (Arabic switched the layout to
// right-to-left) without translating anything, so it was removed; any stored
// choice from it is discarded.
const RETIRED_KEYS = ['orvexa-language-v14', 'orvexa-direction-v16']

function readPreference(key, fallback, allowed) {
  try {
    const candidate = localStorage.getItem(KEYS[key])
    return allowed.includes(candidate) ? candidate : fallback
  } catch {
    return fallback
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(KEYS[key], value)
  } catch {
    // Storage can be unavailable (e.g. private browsing); state still works.
  }
}

export default function useOrvexaLayout() {
  const [theme, setThemeState] = useState(() => readPreference('theme', 'light', ['light', 'dark']))
  const [sidebarMode, setSidebarModeState] = useState(() => readPreference('mode', 'icon', ['icon', 'full']))
  const [sidebarTone, setSidebarToneState] = useState(() => readPreference('tone', 'pearl', ['pearl', 'warm', 'dark']))
  const [density, setDensityState] = useState(() => readPreference('density', 'comfortable', ['comfortable', 'compact']))
  const [motion, setMotionState] = useState(() => readPreference('motion', 'standard', ['standard', 'reduced']))
  const [accentTheme, setAccentThemeState] = useState(() => readPreference('accent', 'green', ['green', 'yellow']))

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.dataset.sidebarMode = sidebarMode
    root.dataset.sidebarTone = sidebarTone
    root.dataset.density = density
    root.dataset.motion = motion
    root.dataset.accentTheme = accentTheme
    persist('theme', theme)
    persist('mode', sidebarMode)
    persist('tone', sidebarTone)
    persist('density', density)
    persist('motion', motion)
    persist('accent', accentTheme)
  }, [theme, sidebarMode, sidebarTone, density, motion, accentTheme])

  useEffect(() => {
    document.documentElement.lang = 'en'
    document.documentElement.dir = 'ltr'
    try {
      for (const key of RETIRED_KEYS) localStorage.removeItem(key)
    } catch {
      // Storage can be unavailable; nothing was stored then.
    }
  }, [])

  const setTheme = useCallback((value) => setThemeState(value === 'dark' ? 'dark' : 'light'), [])
  const setSidebarMode = useCallback((value) => setSidebarModeState(value === 'full' ? 'full' : 'icon'), [])
  const setSidebarTone = useCallback((value) => setSidebarToneState(['pearl', 'warm', 'dark'].includes(value) ? value : 'pearl'), [])

  const setDensity = useCallback((value) => setDensityState(value === 'compact' ? 'compact' : 'comfortable'), [])
  const setMotion = useCallback((value) => setMotionState(value === 'reduced' ? 'reduced' : 'standard'), [])

  const setAccentTheme = useCallback((value) => setAccentThemeState(value === 'yellow' ? 'yellow' : 'green'), [])

  return { theme, setTheme, sidebarMode, setSidebarMode, sidebarTone, setSidebarTone, density, setDensity, motion, setMotion, accentTheme, setAccentTheme }
}
