import { useEffect, useState } from 'react'
import { mountDashboardCharts } from '@/features/dashboard/mountDashboardCharts.js'

// One controller manages all seven original chart instances. The imported
// dependency is lazy and remains out of the login/authentication bundles.
export default function DashboardCharts() {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let disposed = false
    let destroyCharts = null

    import('apexcharts')
      .then((module) => {
        if (disposed) return
        const dashboard = document.querySelector('.cc25-dashboard')
        if (!dashboard) return
        destroyCharts = mountDashboardCharts(module.default, dashboard)
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })

    return () => {
      disposed = true
      destroyCharts?.()
    }
  }, [])

  return failed
    ? <p role="alert" className="text-xs" style={{ color: 'var(--danger-text)' }}>Dashboard charts are temporarily unavailable.</p>
    : null
}
