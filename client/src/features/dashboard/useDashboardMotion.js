import { useEffect, useRef, useState } from 'react'

// The app stores its motion choice on <html data-motion>. Respect both that
// explicit preference and the operating-system setting for every animation the
// dashboard starts itself (the CSS does the same for purely visual effects).
export function shouldReduceMotion() {
  if (typeof window === 'undefined') return true
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
    document.documentElement.dataset.motion === 'reduced'
}

export function scrollToSection(id, behavior) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ behavior: behavior ?? (shouldReduceMotion() ? 'auto' : 'smooth'), block: 'start' })
}

// Reveal section blocks once they approach the viewport, and let them settle
// back when they leave. The observer is disconnected on unmount and while the
// reduced-motion preference is active.
export function useRevealOnScroll(rootRef, refreshKey = null) {
  const [enabled] = useState(() => !shouldReduceMotion() && typeof IntersectionObserver !== 'undefined')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    // Match the HTML dashboard's reveal targets at card level so each item
    // enters as it reaches the viewport, rather than animating a whole row.
    const nodes = Array.from(root.querySelectorAll([
      '.quick-shell',
      '.habit-shell',
      '.feature-grid > *',
      '.domain-grid > .domain-card',
      '.stat-strip > *',
      '.module-grid > .module-tile',
    ].join(', ')))
    if (!enabled) {
      root.classList.remove('motion-enabled')
      nodes.forEach((node) => node.classList.add('is-visible'))
      return undefined
    }

    root.classList.add('motion-enabled')
    nodes.forEach((node, index) => {
      node.classList.add('reveal')
      node.style.setProperty('--reveal-delay', `${(index % 4) * 50}ms`)
    })
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting))
    }, { threshold: 0.08, rootMargin: '-12px 0px -46px 0px' })
    nodes.forEach((node) => observer.observe(node))
    return () => {
      observer.disconnect()
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
