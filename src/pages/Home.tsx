import { Link } from 'react-router-dom'
import { useStore, gramsToMeters } from '../store'
import { Thumb } from '../components/FileView'
import { useAuth } from '../auth'

export function Home() {
  const projects = useStore((s) => s.projects)
  const yarns = useStore((s) => s.yarns)
  const { session } = useAuth()
  const name = ((session?.user.user_metadata?.full_name as string) ?? '').trim()

  const completed = projects.filter((p) => p.endDate)
  const active = projects.filter((p) => !p.endDate)

  const yarnById = new Map(yarns.map((y) => [y.id, y]))

  // Aggregate yarn used across completed projects.
  let gramsUsed = 0
  let skeinsUsed = 0
  let metersUsed = 0
  for (const p of completed) {
    for (const a of p.yarns) {
      const y = yarnById.get(a.yarnId)
      gramsUsed += a.gramsUsed
      if (y) {
        skeinsUsed += y.gramsPerSkein ? a.gramsUsed / y.gramsPerSkein : 0
        metersUsed += gramsToMeters(y, a.gramsUsed)
      }
    }
  }

  return (
    <div className="screen">
      <div className="screen-title">Bonjour{name ? ` ${name}` : ''} 👋</div>
      <p className="subtitle">Voici un résumé de ton tricot.</p>

      <div className="section-label">Statistiques</div>
      <div className="stats-grid">
        <Stat value={completed.length} label="Projets terminés" />
        <Stat value={Math.round(skeinsUsed * 10) / 10} label="Pelotes utilisées" />
        <Stat value={Math.round(gramsUsed)} label="Grammes utilisés" />
        <Stat value={Math.round(metersUsed)} label="Mètres tricotés" />
      </div>

      <div className="section-label">Projets en cours</div>
      {active.length === 0 ? (
        <div className="empty">
          <div className="emoji">🧵</div>
          <p>Aucun projet en cours.</p>
          <Link className="btn" to="/projects">
            Démarrer un projet
          </Link>
        </div>
      ) : (
        active.map((p) => (
          <Link key={p.id} className="list-item" to={`/projects/${p.id}`}>
            <Thumb file={p.photos[0]} fallback="🧵" />
            <div className="li-main">
              <div className="li-title">{p.name || 'Projet sans nom'}</div>
              <div className="li-sub">
                {p.startDate ? `Commencé le ${formatDate(p.startDate)}` : 'Pas encore commencé'}
              </div>
            </div>
            <span className="chip active">En cours</span>
          </Link>
        ))
      )}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  )
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}
