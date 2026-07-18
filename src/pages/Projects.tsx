import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Thumb } from '../components/FileView'
import { Modal } from '../components/Modal'
import { formatDate } from './Home'

export function Projects() {
  const projects = useStore((s) => s.projects)
  const addProject = useStore((s) => s.addProject)
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const active = projects.filter((p) => !p.endDate)
  const done = projects.filter((p) => p.endDate)

  return (
    <div className="screen">
      <div className="screen-title">Projets</div>
      <p className="subtitle">Gère tes tricots en cours et terminés.</p>

      {active.length > 0 && <div className="section-label">En cours</div>}
      {active.map((p) => (
        <ProjectRow key={p.id} p={p} />
      ))}

      {done.length > 0 && <div className="section-label">Terminés</div>}
      {done.map((p) => (
        <ProjectRow key={p.id} p={p} />
      ))}

      {projects.length === 0 && (
        <div className="empty">
          <div className="emoji">🧵</div>
          <p>Aucun projet pour l'instant.</p>
        </div>
      )}

      <div className="fab-row">
        <button className="btn block" onClick={() => setAdding(true)}>
          + Nouveau projet
        </button>
      </div>

      {adding && (
        <Modal title="Nouveau projet" onClose={() => setAdding(false)}>
          <div className="field">
            <label>Nom du projet</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pull d'hiver"
            />
          </div>
          <button
            className="btn block"
            disabled={!name.trim()}
            style={{ opacity: name.trim() ? 1 : 0.5 }}
            onClick={async () => {
              const id = await addProject(name.trim())
              setAdding(false)
              setName('')
              nav(`/projects/${id}`)
            }}
          >
            Créer
          </button>
        </Modal>
      )}
    </div>
  )
}

function ProjectRow({ p }: { p: ReturnType<typeof useStore.getState>['projects'][number] }) {
  return (
    <Link className="list-item" to={`/projects/${p.id}`}>
      <Thumb file={p.photos[0]} fallback="🧵" />
      <div className="li-main">
        <div className="li-title">{p.name || 'Projet sans nom'}</div>
        <div className="li-sub">
          {p.endDate
            ? `Terminé le ${formatDate(p.endDate)}`
            : p.startDate
              ? `Commencé le ${formatDate(p.startDate)}`
              : 'Brouillon'}
        </div>
      </div>
      <span className={`chip ${p.endDate ? 'done' : 'active'}`}>
        {p.endDate ? 'Terminé' : 'En cours'}
      </span>
    </Link>
  )
}
