import { Routes, Route } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { YarnStash } from './pages/YarnStash'
import { Projects } from './pages/Projects'
import { ProjectDetail } from './pages/ProjectDetail'
import { PatternDetail } from './pages/PatternDetail'
import { Profile } from './pages/Profile'

export default function App() {
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
