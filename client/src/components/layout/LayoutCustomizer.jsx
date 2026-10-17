import { useEffect, useRef } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'

export default function LayoutCustomizer({ open, onClose, sidebarMode, setSidebarMode, sidebarTone, setSidebarTone, density, setDensity, motion, setMotion, accentTheme, setAccentTheme }) {
  const closeButton = useRef(null)
  const panelRef = useRef(null)
  useEffect(() => {
    if (open) closeButton.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll('button:not([disabled])'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [open])

  return (
    <>
      <div
        id="layout-settings-backdrop"
        className={`layout-settings-backdrop ${open ? 'is-open' : ''}`}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        id="layout-settings-panel"
        ref={panelRef}
        className={`layout-settings-panel ${open ? 'is-open' : ''}`}
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-hidden={!open}
        aria-labelledby="layout-settings-title"
        inert={!open}
      >
        <div className="layout-settings-head">
          <div>
            <h2 id="layout-settings-title">Layout settings</h2>
            <p>Choose how the navigation looks and behaves.</p>
          </div>
          <button type="button" ref={closeButton} id="layout-settings-close" className="icon-button" aria-label="Close layout settings" onClick={onClose}>
            <OrvexaIcon name="x" />
          </button>
        </div>
        <div className="layout-settings-body">
          <section className="layout-settings-section">
            <div className="layout-settings-section-head">
              <h3>Sidebar layout</h3>
              <p>Use the compact icon rail or keep the full navigation visible.</p>
            </div>
            <div className="sidebar-layout-options">
              {[['icon', 'Icon + hover', 'Compact by default; expands on hover.'], ['full', 'Full sidebar', 'Navigation stays open and content shifts right.']].map(([mode, label, description]) => (
                <button key={mode} type="button" className="sidebar-layout-option" data-sidebar-mode-option={mode} aria-pressed={sidebarMode === mode} onClick={() => setSidebarMode(mode)}>
                  <span className="sidebar-layout-preview"><span className="rail" /><span className="canvas"><span /><span /><span /></span></span>
                  <span className="sidebar-layout-copy"><b>{label}</b><small>{description}</small></span>
                </button>
              ))}
            </div>
            <div className="layout-settings-note">
              <OrvexaIcon name="mouse-pointer-click" />
              <span>Menu groups open only when clicked. Hover expands the icon rail but does not open a submenu.</span>
            </div>
          </section>
          <section className="layout-settings-section">
            <div className="layout-settings-section-head">
              <h3>Accent theme</h3>
              <p>Compare the green testing palette with Orvexa's original yellow theme.</p>
            </div>
            <div className="zrv-accent-options" role="group" aria-label="Accent color theme">
              {[
                ['green', 'Green', 'Testing theme'],
                ['yellow', 'Original yellow', 'Original Orvexa colors'],
              ].map(([value, label, description]) => (
                <button
                  key={value}
                  type="button"
                  className="zrv-accent-option"
                  data-accent-option={value}
                  aria-pressed={accentTheme === value}
                  onClick={() => setAccentTheme(value)}
                >
                  <span className={`zrv-accent-swatch zrv-accent-swatch--${value}`} aria-hidden="true" />
                  <span className="zrv-accent-copy"><b>{label}</b><small>{description}</small></span>
                  {accentTheme === value && <OrvexaIcon name="check" className="zrv-accent-check" />}
                </button>
              ))}
            </div>
            <div className="layout-settings-note">
              <OrvexaIcon name="palette" />
              <span>Green is the default for testing. Original yellow remains available here at any time.</span>
            </div>
          </section>
          <section className="layout-settings-section">
            <div className="layout-settings-section-head">
              <h3>Sidebar color</h3>
              <p>Switch the navigation surface without changing page content.</p>
            </div>
            <div className="sidebar-tone-options">
              {['pearl', 'warm', 'dark'].map((tone) => (
                <button key={tone} className="sidebar-tone-option" data-sidebar-tone-option={tone} type="button" aria-pressed={sidebarTone === tone} onClick={() => setSidebarTone(tone)}>
                  <span className={`sidebar-tone-swatch ${tone}`} />
                  <span>{tone.charAt(0).toUpperCase() + tone.slice(1)}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="layout-settings-section">
            <div className="layout-settings-section-head">
              <h3>Display density</h3>
              <p>Use the original Orvexa comfortable or compact spacing.</p>
            </div>
            <div className="sidebar-layout-options">
              {[
                ['comfortable', 'Comfortable', 'Default spacing and readable controls.'],
                ['compact', 'Compact', 'Denser navigation and content tables.'],
              ].map(([value, label, description]) => (
                <button key={value} type="button" className="sidebar-layout-option" data-density-option={value}
                  aria-pressed={density === value} onClick={() => setDensity(value)}>
                  <span className="sidebar-layout-copy"><b>{label}</b><small>{description}</small></span>
                </button>
              ))}
            </div>
          </section>
          <section className="layout-settings-section">
            <div className="layout-settings-section-head">
              <h3>Motion</h3>
              <p>Reduce decorative animations in the dashboard.</p>
            </div>
            <div className="sidebar-layout-options">
              {[
                ['standard', 'Standard', 'Use the template animations.'],
                ['reduced', 'Reduced motion', 'Keep animations and movement minimal.'],
              ].map(([value, label, description]) => (
                <button key={value} type="button" className="sidebar-layout-option" data-motion-option={value}
                  aria-pressed={motion === value} onClick={() => setMotion(value)}>
                  <span className="sidebar-layout-copy"><b>{label}</b><small>{description}</small></span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <div className="layout-settings-footer">
          <button type="button" className="layout-reset-button" data-reset-layout-settings onClick={() => { setSidebarMode('icon'); setSidebarTone('pearl'); setDensity('comfortable'); setMotion('standard') }}>
            <OrvexaIcon name="rotate-ccw" /><span>Reset layout settings</span>
          </button>
        </div>
      </aside>
    </>
  )
}
