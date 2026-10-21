// Applies saved layout preferences before the stylesheets paint, avoiding a
// theme flash. Loaded as a same-origin, render-blocking script (not inline) so
// the Content-Security-Policy can forbid inline scripts.
// The interface is English-only: language and direction are fixed.
(() => {
  try {
    const root = document.documentElement
    root.lang = 'en'
    root.dir = 'ltr'
    const theme = localStorage.getItem('orvexa-theme-v16')
    root.classList.toggle('dark', theme === 'dark')
    root.dataset.accentTheme = localStorage.getItem('zamil-orvexa-accent-v1') === 'yellow' ? 'yellow' : 'green'

    const density = localStorage.getItem('orvexa-density-v16')
    root.dataset.density = density === 'compact' ? 'compact' : 'comfortable'
    root.dataset.motion = localStorage.getItem('orvexa-motion-v1') === 'reduced' ? 'reduced' : 'standard'

    const sidebarMode = localStorage.getItem('orvexa-sidebar-mode')
    root.dataset.sidebarMode = sidebarMode === 'full' ? 'full' : 'icon'

    const sidebarTone = localStorage.getItem('orvexa-sidebar-tone')
    root.dataset.sidebarTone = ['pearl', 'warm', 'dark'].includes(sidebarTone) ? sidebarTone : 'pearl'
  } catch {
    // The layout works with CSS defaults when browser storage is unavailable.
  }
})()
