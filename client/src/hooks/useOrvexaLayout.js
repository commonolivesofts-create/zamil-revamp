import { useCallback, useEffect, useState } from 'react'

const KEYS = {
  theme: 'orvexa-theme-v16',
  mode: 'orvexa-sidebar-mode',
  tone: 'orvexa-sidebar-tone',
  language: 'orvexa-language-v14',
  direction: 'orvexa-direction-v16',
  density: 'orvexa-density-v16',
  motion: 'orvexa-motion-v1',
  accent: 'zamil-orvexa-accent-v1',
}

export const orvexaLanguages = Object.freeze({
  en: { label: 'English', flag: 'us', direction: 'ltr' },
  fr: { label: 'Français', flag: 'fr', direction: 'ltr' },
  de: { label: 'Deutsch', flag: 'de', direction: 'ltr' },
  it: { label: 'Italiano', flag: 'it', direction: 'ltr' },
  ar: { label: 'العربية', flag: 'sa', direction: 'rtl' },
})

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
  const [language, setLanguageState] = useState(() => readPreference('language', 'en', Object.keys(orvexaLanguages)))
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
    root.lang = language
    root.dir = orvexaLanguages[language].direction
    persist('theme', theme)
    persist('mode', sidebarMode)
    persist('tone', sidebarTone)
    persist('language', language)
    persist('direction', root.dir)
    persist('density', density)
    persist('motion', motion)
    persist('accent', accentTheme)
  }, [theme, sidebarMode, sidebarTone, language, density, motion, accentTheme])

  const setTheme = useCallback((value) => setThemeState(value === 'dark' ? 'dark' : 'light'), [])
  const setSidebarMode = useCallback((value) => setSidebarModeState(value === 'full' ? 'full' : 'icon'), [])
  const setSidebarTone = useCallback((value) => setSidebarToneState(['pearl', 'warm', 'dark'].includes(value) ? value : 'pearl'), [])
  const setLanguage = useCallback((value) => setLanguageState(orvexaLanguages[value] ? value : 'en'), [])

  const setDensity = useCallback((value) => setDensityState(value === 'compact' ? 'compact' : 'comfortable'), [])
  const setMotion = useCallback((value) => setMotionState(value === 'reduced' ? 'reduced' : 'standard'), [])

  const setAccentTheme = useCallback((value) => setAccentThemeState(value === 'yellow' ? 'yellow' : 'green'), [])

  return { theme, setTheme, sidebarMode, setSidebarMode, sidebarTone, setSidebarTone, language, setLanguage, density, setDensity, motion, setMotion, accentTheme, setAccentTheme }
}
