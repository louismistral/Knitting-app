import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import './styles.css'

// Surface otherwise-silent crashes (e.g. during module init) instead of a blank page.
window.addEventListener('error', (e) => console.error('window error:', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => console.error('unhandled rejection:', e.reason))

// HashRouter keeps deep links working on GitHub Pages (no server-side rewrites).
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
