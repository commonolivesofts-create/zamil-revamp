import { Navigate, useLocation, useParams } from 'react-router'

export function LegacyEmployeeServicesRedirect({ to, param }) {
  const params = useParams()
  const location = useLocation()
  const pathname = param ? `${to}/${encodeURIComponent(params[param] ?? '')}` : to

  return <Navigate to={`${pathname}${location.search}${location.hash}`} replace />
}
