import { useEffect, useRef, useState } from 'react'
import './HorizontalTableScroll.css'

export default function HorizontalTableScroll({ children, className = '' }) {
  const scrollRef = useRef(null)

  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateButtons = () => {
    const el = scrollRef.current
    if (!el) return

    const maxScroll = el.scrollWidth - el.clientWidth

    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft < maxScroll - 1)
  }

  const scrollTable = (direction) => {
    const el = scrollRef.current
    if (!el) return

    el.scrollBy({
      left: direction * 250,
      behavior: 'smooth',
    })
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined

    const handleWheel = (event) => {
      const maxScroll = el.scrollWidth - el.clientWidth

      // No horizontal overflow: preserve normal page scroll.
      if (maxScroll <= 1) return

      // Preserve browser zoom and modified wheel actions.
      if (event.ctrlKey || event.metaKey) return

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY

      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientWidth : 1

      const movement = delta * factor

      // When at the edge, allow vertical page scrolling.
      if (
        (movement < 0 && el.scrollLeft <= 0) ||
        (movement > 0 && el.scrollLeft >= maxScroll - 1)
      ) {
        return
      }

      event.preventDefault()

      el.scrollLeft += movement
      updateButtons()
    }

    const observer = new ResizeObserver(updateButtons)

    observer.observe(el)

    if (el.firstElementChild) {
      observer.observe(el.firstElementChild)
    }

    el.addEventListener('wheel', handleWheel, {
      passive: false,
    })

    el.addEventListener('scroll', updateButtons, {
      passive: true,
    })

    updateButtons()

    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('scroll', updateButtons)
      observer.disconnect()
    }
  }, [])

  return (
    <div className={`zrv-horizontal-table ${className}`}>
      <div
        ref={scrollRef}
        className="zrv-horizontal-table__viewport"
        tabIndex={0}
        aria-label="Horizontally scrollable table"
      >
        {children}
      </div>

      <div className="zrv-horizontal-table__controls">
        <button
          type="button"
          className="zrv-horizontal-table__arrow"
          aria-label="Scroll table left"
          disabled={!canScrollLeft}
          onClick={() => scrollTable(-1)}
        >
          ‹
        </button>

        <div className="zrv-horizontal-table__hint">
          <span>Scroll horizontally</span>
        </div>

        <button
          type="button"
          className="zrv-horizontal-table__arrow"
          aria-label="Scroll table right"
          disabled={!canScrollRight}
          onClick={() => scrollTable(1)}
        >
          ›
        </button>
      </div>
    </div>
  )
}
