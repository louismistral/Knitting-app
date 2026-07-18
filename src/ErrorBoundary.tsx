import { Component } from 'react'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Catches render errors so the app shows a message instead of a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('App crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#33292b' }}>
          <h1 style={{ fontSize: 20 }}>🧶 Un problème est survenu</h1>
          <p>L'application n'a pas pu démarrer. Détail technique :</p>
          <pre
            style={{
              background: '#f3ece6',
              padding: 12,
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              fontSize: 13,
              overflowX: 'auto',
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            onClick={() => location.reload()}
            style={{
              marginTop: 12,
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#b56576',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            Recharger
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
