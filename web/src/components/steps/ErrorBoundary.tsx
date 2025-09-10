import React from 'react'

type State = { hasError: boolean; error?: unknown }
export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false }
  static getDerivedStateFromError(error: unknown) { return { hasError: true, error } }
  componentDidCatch(error: unknown, info: unknown) { console.error('ReviewStep crash', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 12, background: '#fff0f0' }}>
          <strong>Something went wrong in ReviewStep.</strong>
          <div style={{ marginTop: 8, fontSize: 12, color: '#a33' }}>
            Check the console for details. You can continue using the app.
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
