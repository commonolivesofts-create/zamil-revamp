import { Component } from 'react'
import PageState from '@/components/feedback/PageState.jsx'

// React error boundaries currently require a class component without an added dependency.
export default class AppErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) {
      console.error('Unexpected application rendering error:', error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <PageState
          kind="error"
          title="Something went wrong"
          description="This part of the application could not be displayed. Reload to try again."
          actionLabel="Reload application"
          onAction={() => window.location.reload()}
        />
      )
    }

    return this.props.children
  }
}
