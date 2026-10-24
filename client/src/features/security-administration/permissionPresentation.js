// Presentation helpers for effective-permission data. They live with Security
// Administration because the effective-access panel and its tests are their
// only consumers; the dashboard no longer renders a permission summary.

// `SECURITY_ADMINISTRATION` → `Security administration`.
export function humanizeCode(code) {
  if (typeof code !== 'string' || !code) return ''
  const text = code.toLowerCase().replace(/_+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Effective permissions grouped by module, then resource, in a stable order.
export function groupPermissions(permissions = []) {
  const modules = new Map()
  for (const permission of permissions) {
    if (!modules.has(permission.moduleCode)) modules.set(permission.moduleCode, new Map())
    const resources = modules.get(permission.moduleCode)
    if (!resources.has(permission.resourceCode)) resources.set(permission.resourceCode, [])
    resources.get(permission.resourceCode).push(permission)
  }
  const byCode = (a, b) => a.localeCompare(b)
  return [...modules.keys()].sort(byCode).map((moduleCode) => ({
    moduleCode,
    label: humanizeCode(moduleCode),
    resources: [...modules.get(moduleCode).keys()].sort(byCode).map((resourceCode) => ({
      resourceCode,
      label: humanizeCode(resourceCode),
      actions: modules.get(moduleCode).get(resourceCode).slice().sort((a, b) => byCode(a.actionCode, b.actionCode)),
    })),
  }))
}

// Local date and time for an ISO 8601 instant; null when absent or invalid.
export function formatDateTime(value, { dateOnly = false } = {}) {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, dateOnly ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
