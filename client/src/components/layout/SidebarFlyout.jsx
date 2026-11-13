
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { NavLink } from 'react-router'

import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'

// A subgroup of an existing sidebar section.
//
// The subgroup and its authorized navigation items come from
// the existing navigation registry.
//
// No HR-specific routes or duplicate form lists are defined here.
export function SidebarSubgroupButton({
  subgroup,
  items,
  current,
  open,
  onToggle,
}) {
  return (
    <button
      type="button"
      className={`zrv-sidebar-subgroup${
        open ? ' is-open' : ''
      }${current ? ' is-current' : ''}`}
      aria-expanded={open}
      aria-controls={`sidebar-flyout-${subgroup.id}`}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' && !open) {
          onToggle(event.currentTarget)
        }
      }}
      onClick={(event) => {
        if (event.nativeEvent.pointerType === 'mouse' && open) return
        onToggle(event.currentTarget)
      }}
    >
      <span className="zrv-sidebar-subgroup__icon">
        <OrvexaIcon name={subgroup.icon} />
      </span>

      <span className="zrv-sidebar-subgroup__label">
        <b>{subgroup.label}</b>

        {current && (
          <small>{current.label}</small>
        )}
      </span>

      <span
        className="zrv-sidebar-subgroup__count"
        aria-label={`${items.length} pages`}
      >
        {items.length}
      </span>

      <OrvexaIcon
        name="chevron-right"
        className="zrv-sidebar-subgroup__arrow"
      />
    </button>
  )
}

// Existing sidebar flyout with dashboard reveal support.
//
// Desktop:
// - Positioned beside the corresponding subgroup.
// - Keeps the existing sidebar navigation visible.
//
// Mobile:
// - Displays the existing overlay panel.
// - Preserves the Back button and keyboard controls.
//
// Dashboard reveal:
// - Highlights the requested authorized navigation item.
// - Focuses that item for keyboard accessibility.
// - Does not change the current route.
// - Does not interfere with real active-route styling.
export function SidebarFlyout({
  subgroup,
  items,
  anchor,
  mobile,
  revealedRouteId = null,
  onClose,
  onNavigate,
}) {
  const ref = useRef(null)

  const [top, setTop] = useState(0)

  // Preserve existing desktop flyout positioning.
  useLayoutEffect(() => {
    if (mobile || !anchor) {
      return undefined
    }

    const place = () => {
      const host = ref.current?.offsetParent

      if (!host) return

      const box = anchor.getBoundingClientRect()

      const hostTop = host.getBoundingClientRect().top

      const height = ref.current.offsetHeight

      const viewTop = Math.max(
        box.top - 10,
        12,
      )

      setTop(
        Math.min(
          viewTop,
          window.innerHeight - height - 12,
        ) - hostTop,
      )
    }

    place()

    window.addEventListener('resize', place)

    return () => {
      window.removeEventListener('resize', place)
    }
  }, [anchor, mobile, items.length])

  // Preserve existing keyboard navigation and outside-click behavior.
  //
  // NEW: When the dashboard reveals an item, move keyboard focus
  // to the requested navigation link.
  useEffect(() => {
    const node = ref.current

    if (!node) {
      return undefined
    }

    const links = () =>
      Array.from(
        node.querySelectorAll(
          '.zrv-sidebar-flyout__link',
        ),
      )

    const revealedLink = links().find(
      (link) =>
        link.getAttribute('data-revealed-route') ===
        revealedRouteId,
    )

    const activeLink = node.querySelector(
      '[aria-current="page"]',
    )

    const initialLink =
      revealedLink ||
      activeLink ||
      links()[0]

    initialLink?.focus({
      preventScroll: true,
    })

    if (revealedLink) {
      revealedLink.scrollIntoView({
        block: 'nearest',
        behavior: 'auto',
      })
    }

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()

        onClose(true)

        return
      }

      if (
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowUp'
      ) {
        return
      }

      const list = links()

      if (!list.length) return

      const index = list.indexOf(
        document.activeElement,
      )

      if (index < 0) return

      event.preventDefault()

      const nextIndex =
        (
          index +
          (event.key === 'ArrowDown'
            ? 1
            : list.length - 1)
        ) % list.length

      list[nextIndex].focus()
    }

    const onPointer = (event) => {
      const clickedInsideFlyout =
        node.contains(event.target)

      const clickedSubgroup =
        anchor?.contains(event.target)

      if (
        !clickedInsideFlyout &&
        !clickedSubgroup
      ) {
        onClose(false)
      }
    }

    node.addEventListener(
      'keydown',
      onKey,
    )

    document.addEventListener(
      'pointerdown',
      onPointer,
    )

    return () => {
      node.removeEventListener(
        'keydown',
        onKey,
      )

      document.removeEventListener(
        'pointerdown',
        onPointer,
      )
    }
  }, [
    anchor,
    onClose,
    revealedRouteId,
  ])

  return (
    <nav
      ref={ref}
      id={`sidebar-flyout-${subgroup.id}`}
      className={`zrv-sidebar-flyout${
        mobile ? ' is-mobile' : ''
      }`}
      aria-label={subgroup.label}
      style={
        mobile
          ? undefined
          : { top }
      }
    >
      {/* Preserve existing flyout heading. */}
      <div className="zrv-sidebar-flyout__head">
        {mobile && (
          <button
            type="button"
            className="icon-button"
            aria-label="Back"
            onClick={() => onClose(true)}
          >
            <OrvexaIcon
              name="arrow-left"
              className="size-4"
            />
          </button>
        )}

        <span className="zrv-sidebar-flyout__icon">
          <OrvexaIcon name={subgroup.icon} />
        </span>

        <div>
          <b>{subgroup.label}</b>

          <small>
            {subgroup.description}
          </small>
        </div>
      </div>

      {/* Existing authorized navigation items. */}
      <ul className="zrv-sidebar-flyout__list">
        {items.map((item, index) => {
          const isRevealed =
            revealedRouteId === item.id

          return (
            <li
              key={item.id}
              style={{
                '--i': index,
              }}
            >
              <NavLink to={item.path}
                end={false}
                data-revealed-route={
                  isRevealed
                    ? item.id
                    : undefined
                }
                className={({ isActive }) =>
                  [
                    'zrv-sidebar-flyout__link',
                    isActive ? 'active' : '',
                    isRevealed
                      ? 'is-revealed-target'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
                onClick={onNavigate}
              >
                <span className="zrv-sidebar-flyout__n">
                  {String(index + 1).padStart(
                    2,
                    '0',
                  )}
                </span>

                <OrvexaIcon
                  name={item.icon || 'circle'}
                  className="zrv-sidebar-flyout__item-icon"
                />

                <span className="zrv-sidebar-flyout__label">
                  {item.label}
                </span>

                <OrvexaIcon
                  name="chevron-right"
                  className="zrv-sidebar-flyout__go"
                />
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
