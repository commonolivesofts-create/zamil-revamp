import { useLocation } from 'react-router'
import { findAppRoute } from '@/config/appNavigation.js'
import ContentSkeleton from './ContentSkeleton.jsx'
import './RouteLoading.css'

export default function RouteLoading() {
  const { pathname } = useLocation()
  const route = findAppRoute(pathname)
  const report = /report|requests|responses/.test(route?.id || '')
  const form = pathname.startsWith('/hr/') && !report && !pathname.endsWith('/dashboard')

  return (
    <div className="zrv-route-loading">
      <ContentSkeleton
        variant={report ? 'table' : form ? 'form' : 'content'}
        label="Loading page"
      />
    </div>
  )
}
