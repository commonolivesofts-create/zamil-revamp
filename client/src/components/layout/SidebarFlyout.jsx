import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'

// A sub-group of a sidebar section (navigationGroups.js `subgroups`): one
// button with the number of pages the user may open and, while one of them is
// the current page, its name. The pages open in a flyout beside the sidebar
// (a sub-panel over the sidebar on small screens).
export function SidebarSubgroupButton({ subgroup, items, current, open, onToggle }) {
  return (
    <button
      type="button"
      className={`zrv-sidebar-subgroup${open ? ' is-open' : ''}${current ? ' is-current' : ''}`}
      aria-expanded={open}
      aria-controls={`sidebar-flyout-${subgroup.id}`}
      onClick={(event) => onToggle(event.currentTarget)}
    >
      <span className="zrv-sidebar-subgroup__icon"><OrvexaIcon name={subgroup.icon} /></span>
      <span className="zrv-sidebar-subgroup__label">
        <b>{subgroup.label}</b>
        {current && <small>{current.label}</small>}
      </span>
      <span className="zrv-sidebar-subgroup__count" aria-label={`${items.length} pages`}>{items.length}</span>
      <OrvexaIcon name="chevron-right" className="zrv-sidebar-subgroup__arrow" />
    </button>
  )
}

// The pages of one sub-group. Desktop: positioned beside its button, inside
// #sidebar so the icon sidebar stays expanded while the pointer or focus is in
// it. Mobile: covers the sidebar with a back button. Escape (or Back) closes it
// and returns focus to the button; arrow keys move between the pages; a click
// outside closes it.
export function SidebarFlyout({ subgroup, items, anchor, mobile, onClose, onNavigate }) {
  const ref = useRef(null)
  const [top, setTop] = useState(0)

  useLayoutEffect(() => {
    if (mobile || !anchor) return undefined
    const place = () => {
      const host = ref.current?.offsetParent
      if (!host) return
      const box = anchor.getBoundingClientRect()
      const hostTop = host.getBoundingClientRect().top
      const height = ref.current.offsetHeight
      const viewTop = Math.max(box.top - 10, 12)
      setTop(Math.min(viewTop, window.innerHeight - height - 12) - hostTop)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, mobile, items.length])

  useEffect(() => {
    const node = ref.current
    const links = () => [...node.querySelectorAll('.zrv-sidebar-flyout__link')]
    ;(node.querySelector('[aria-current="page"]') || links()[0])?.focus({ preventScroll: true })
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose(true)
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const list = links()
      const index = list.indexOf(document.activeElement)
      if (index < 0) return
      event.preventDefault()
      list[(index + (event.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus()
    }
    const onPointer = (event) => {
      if (!node.contains(event.target) && !anchor?.contains(event.target)) onClose(false)
    }
    node.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      node.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [anchor, onClose])

  return (
    <nav
      ref={ref}
      id={`sidebar-flyout-${subgroup.id}`}
      className={`zrv-sidebar-flyout${mobile ? ' is-mobile' : ''}`}
      aria-label={subgroup.label}
      style={mobile ? undefined : { top }}
    >
      <div className="zrv-sidebar-flyout__head">
        {mobile && (
          <button type="button" className="icon-button" aria-label="Back" onClick={() => onClose(true)}>
            <OrvexaIcon name="arrow-left" className="size-4" />
          </button>
        )}
        <span className="zrv-sidebar-flyout__icon"><OrvexaIcon name={subgroup.icon} /></span>
        <div><b>{subgroup.label}</b><small>{subgroup.description}</small></div>
      </div>
      <ul className="zrv-sidebar-flyout__list">
        {items.map((item, index) => (
          <li key={item.id} style={{ '--i': index }}>
            <NavLink to={item.path} end={false} className="zrv-sidebar-flyout__link" onClick={onNavigate}>
              <span className="zrv-sidebar-flyout__n">{String(index + 1).padStart(2, '0')}</span>
              <OrvexaIcon name={item.icon || 'circle'} className="zrv-sidebar-flyout__item-icon" />
              <span className="zrv-sidebar-flyout__label">{item.label}</span>
              <OrvexaIcon name="chevron-right" className="zrv-sidebar-flyout__go" />
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
