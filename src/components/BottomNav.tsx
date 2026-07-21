import { NavLink, useNavigate } from 'react-router-dom'
import { runNavGuard } from '../navGuard'

const tabs = [
  { to: '/', ico: '🏠', label: 'Accueil', end: true },
  { to: '/library', ico: '📚', label: 'Biblio' },
  { to: '/stash', ico: '🧶', label: 'Stash' },
  { to: '/projects', ico: '🧵', label: 'Projets' },
  { to: '/profile', ico: '👤', label: 'Profil' },
]

export function BottomNav() {
  const nav = useNavigate()

  async function go(e: React.MouseEvent, to: string) {
    e.preventDefault()
    if (await runNavGuard()) nav(to)
  }

  return (
    <nav className="nav">
      <div className="nav-inner">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} onClick={(e) => go(e, t.to)}>
            <span className="ico">{t.ico}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
