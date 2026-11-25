import { Component } from 'react'
import GlobalErrorScreen from '@/components/feedback/GlobalErrorScreen.jsx'

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
      return <GlobalErrorScreen onRetry={this.props.onRetry} inline={this.props.inline} />
    }

    return this.props.children
  }
}
