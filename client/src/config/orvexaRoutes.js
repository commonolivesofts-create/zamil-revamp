import { orvexaNavigation } from './orvexaNavigation.js'

// The purchased template's hrefs remain unchanged in orvexaNavigation.
// Demo paths live in their own namespace until real business modules are defined.
export const DASHBOARD_ROUTE = '/dashboard'

export function getOrvexaRoute(item) {
  if (item?.id === 'command-center') return DASHBOARD_ROUTE
  if (typeof item?.href !== 'string') return null
  const match = /^pages\/([a-z0-9-]+)\.html$/.exec(item.href)
  return match ? `/demo/${match[1]}` : null
}

export const orvexaDemoRoutes = orvexaNavigation.flatMap((section) =>
  (section.items || []).flatMap((item) =>
    (item.children?.length ? item.children : [item]).map((leaf) => ({
      ...leaf,
      sectionId: section.id,
      path: getOrvexaRoute(leaf),
    })),
  ),
).filter((item) => item.path)

export function getOrvexaSection(pathname) {
  return orvexaDemoRoutes.find((item) => item.path === pathname.replace(/\/+$/, ''))?.sectionId || null
}
