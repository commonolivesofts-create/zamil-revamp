import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// The app stores its motion choice on <html data-motion>. Respect both that
// explicit preference and the operating-system setting for every animation the
// dashboard starts itself (the CSS does the same for purely visual effects).
export function shouldReduceMotion() {
  if (typeof window === 'undefined') return true
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
    document.documentElement.dataset.motion === 'reduced'
  )
}

export function scrollToSection(id, behavior) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({
    behavior: behavior ?? (shouldReduceMotion() ? 'auto' : 'smooth'),
    block: 'start',
  })
}

// Mark dashboard panels visible before the first paint. Intersection-based
// hiding made loaded content appear in a delayed sequence and reanimated it
// while scrolling. Keep motionEnabled for the scroll progress indicator.
export function useRevealOnScroll(rootRef, refreshKey = null) {
  const [enabled] = useState(
    () => !shouldReduceMotion() && typeof IntersectionObserver !== 'undefined',
  )

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const nodes = Array.from(
      root.querySelectorAll(
        [
          '.quick-shell',
          '.section-intelligence',
          '.employee-spotlight',
          '.attention-announcement',
          '.attention-section-line',
          '.attention-queue',
          '.habit-shell',
          '.feature-grid > *',
          '.domain-grid > .domain-card',
          '.stat-strip > *',
          '.module-grid > .module-tile',
        ].join(', '),
      ),
    )
    root.classList.toggle('motion-enabled', enabled)
    nodes.forEach((node) => {
      node.classList.add('reveal', 'is-visible')
      node.style.removeProperty('--reveal-delay')
    })
    return () => {
      root.classList.remove('motion-enabled')
    }
  }, [enabled, refreshKey, rootRef])

  return enabled
}

// Keeps a fixed progress rail in sync without re-rendering on every scroll
// event. The shell scrolls the document, so the whole page is the viewport.
export function useScrollProgress(enabled, refreshKey = null) {
  const railRef = useRef(null)
  useEffect(() => {
    if (!enabled) return undefined
    let frame = 0
    const paint = () => {
      frame = 0
      const rail = railRef.current
      if (!rail) return
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const value = Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4)
      rail.style.setProperty('--zrv-zd-progress', value)
      rail.style.setProperty('--scroll-progress', value)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(paint)
    }
    paint()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [enabled, refreshKey])
  return railRef
}
