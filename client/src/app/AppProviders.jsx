import { Suspense } from 'react'
import AppErrorBoundary from './AppErrorBoundary.jsx'
import StartupLoading from '@/components/feedback/StartupLoading.jsx'
import AuthProvider from '@/features/auth/AuthProvider.jsx'
import PermissionProvider from '@/features/access/PermissionProvider.jsx'

// Additional application providers will be added here only when their phases need them.
export default function AppProviders({ children }) {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <PermissionProvider>
          {/* Providers stay mounted even when the first route suspends. */}
          <Suspense fallback={<StartupLoading />}>{children}</Suspense>
        </PermissionProvider>
      </AuthProvider>
    </AppErrorBoundary>
  )
}
