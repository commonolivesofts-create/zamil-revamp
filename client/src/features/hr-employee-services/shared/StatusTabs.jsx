import { useEffect, useRef, useState } from 'react'
import { ES_COMMON_TEXT } from '../hrEmployeeServicesText.js'

const T = ES_COMMON_TEXT.list

// Status tabs of a report list (role="tab"; arrow keys, Home and End move
// between them). `items`: [[code, label, count?]]; `tabId(code)` names each tab
// and `panelId` is the list they control.
export function StatusTabs({ items, value, onChange, tabId, panelId }) {
  const tabs = useRef([])
  const [focusTab, setFocusTab] = useState(null)

  useEffect(() => {
    if (focusTab !== null) tabs.current[focusTab]?.focus()
  }, [focusTab])

  const onTabKey = (event, index) => {
    const last = items.length - 1
    const target = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : null
    if (target === null) return
    event.preventDefault()
    onChange(items[target][0])
    setFocusTab(target)
  }

  return (
    <div className="zrv-hr-es-tabs" role="tablist" aria-label={T.statusLabel}>
      {items.map(([code, label, count], index) => (
        <button key={code} ref={(node) => { tabs.current[index] = node }} id={tabId(code)} type="button" role="tab"
          aria-selected={value === code} aria-controls={panelId} tabIndex={value === code ? 0 : -1}
          onClick={() => onChange(code)} onKeyDown={(event) => onTabKey(event, index)}>
          {label}{count !== undefined && <b>{count}</b>}
        </button>
      ))}
    </div>
  )
}
