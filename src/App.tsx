import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { useStore } from './store'
import { BottomNav } from './components/BottomNav'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { YarnStash } from './pages/YarnStash'
import { Projects } from './pages/Projects'
import { ProjectDetail } from './pages/ProjectDetail'
import { PatternDetail } from './pages/PatternDetail'
import { Profile } from './pages/Profile'

function Shell() {
  const { session, loading, error } = useAuth()
  const load = useStore((s) => s.load)
  const reset = useStore((s) => s.reset)

  useEffect(() => {
    if (session) load().catch((err) => console.error('Failed to load data:', err))
    else reset()
  }, [session?.user.id])

  if (loading) {
    return (
      <div className="app">
        <div className="empty" style={{ marginTop: 80 }}>
          <div className="emoji">🧶</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app">
        <div className="screen">
          <div className="empty" style={{ marginTop: 60 }}>
            <div className="emoji">⚠️</div>
            <p>Impossible de contacter le serveur.</p>
            <p className="hint">{error}</p>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => location.reload()}>
              Réessayer
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app">
        <Login />
      </div>
    )
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/library/:id" element={<PatternDetail />} />
        <Route path="/stash" element={<YarnStash />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
