import { Suspense } from 'react'
import AppErrorBoundary from './AppErrorBoundary.jsx'
import PageState from '@/components/feedback/PageState.jsx'
import AuthProvider from '@/features/auth/AuthProvider.jsx'

// Additional application providers will be added here only when their phases need them.
export default function AppProviders({ children }) {
  return (
    <AppErrorBoundary>
      <Suspense
        fallback={
          <PageState
            kind="loading"
            title="Loading workspace"
            description="Preparing the application."
          />
        }
      >
        <AuthProvider>{children}</AuthProvider>
      </Suspense>
    </AppErrorBoundary>
  )
}
