import { createElement } from 'react'

// Render the original Lucide 0.468.0 icon definitions declaratively.
// The purchased UMD vendor asset is loaded before React in index.html.
// We deliberately never call lucide.createIcons(): it mutates React-owned DOM.
const camelCaseAttribute = (key) => key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())

function renderNode(definition, index) {
  if (!Array.isArray(definition)) return null
  const [tag, rawAttributes = {}, children = []] = definition
  const attributes = Object.fromEntries(
    Object.entries(rawAttributes).map(([key, value]) => [key === 'class' ? 'className' : camelCaseAttribute(key), value]),
  )

  return createElement(tag, { ...attributes, key: `${tag}-${index}` },
    ...(Array.isArray(children) ? children.map(renderNode) : []))
}

export default function OrvexaIcon({ name, className, size, ...props }) {
  const iconKey = name.split('-').map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join('')
  const iconDefinitions = typeof window === 'undefined' ? null : window.lucide?.icons
  const definition = iconDefinitions?.[iconKey] || iconDefinitions?.Circle

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {definition?.[2]?.map(renderNode)}
    </svg>
  )
}
