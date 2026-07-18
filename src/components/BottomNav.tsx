import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', ico: '🏠', label: 'Accueil', end: true },
  { to: '/library', ico: '📚', label: 'Biblio' },
  { to: '/stash', ico: '🧶', label: 'Stash' },
  { to: '/projects', ico: '🧵', label: 'Projets' },
  { to: '/profile', ico: '👤', label: 'Profil' },
]

export function BottomNav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <span className="ico">{t.ico}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
