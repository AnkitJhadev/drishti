import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional label so we know which area failed */
  area?: string
  /** Optional compact fallback (for panels/modals vs full screen) */
  compact?: boolean
}
interface State {
  hasError: boolean
  message: string
}

// Catches render/runtime errors so a single broken component never
// white-screens the whole app — important for hardened field deployments.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.area ? ' · ' + this.props.area : ''}]`, error, info.componentStack)
  }

  reset = (): void => this.setState({ hasError: false, message: '' })

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    const wrapStyle = this.props.compact
      ? 'h-full flex items-center justify-center p-4'
      : 'h-screen flex items-center justify-center p-4'

    return (
      <div className={wrapStyle} style={{ background: '#0a0f1e' }}>
        <div className="dr-panel max-w-sm w-full p-5 text-center">
          <div style={{ fontSize: 28 }}>⚠</div>
          <h2 className="text-sm font-semibold mt-2" style={{ color: '#f9fafb' }}>
            {this.props.area ? `${this.props.area} failed to render` : 'Something went wrong'}
          </h2>
          <p className="text-xs mt-1 mb-4" style={{ color: '#9ca3af' }}>
            {this.state.message || 'An unexpected error occurred.'}
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={this.reset} className="dr-btn-accent px-4 py-2 text-sm">Try again</button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded text-sm"
              style={{ background: '#1a2235', color: '#9ca3af', border: '1px solid #1f2937' }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
